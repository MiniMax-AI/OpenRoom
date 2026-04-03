import { UserConfigExport, ConfigEnv, loadEnv } from 'vite';
import type { PluginOption, Plugin } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react-swc';
import { resolve, sep } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import autoprefixer from 'autoprefixer';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import { generateLogFileName, createLogMiddleware } from './src/lib/logPlugin';
import { appGeneratorPlugin } from './src/lib/appGeneratorPlugin';

const LLM_CONFIG_FILE = resolve(os.homedir(), '.openroom', 'config.json');
const SESSIONS_DIR = resolve(os.homedir(), '.openroom', 'sessions');
const CHARACTERS_FILE = resolve(os.homedir(), '.openroom', 'characters.json');
const MODS_FILE = resolve(os.homedir(), '.openroom', 'mods.json');

type ServerConfigSection = Record<string, unknown>;
interface ServerPersistedConfig {
  llm: ServerConfigSection;
  imageGen?: ServerConfigSection;
}
type ProxyProvider = 'openai' | 'anthropic' | 'minimax' | 'gemini' | 'unknown';
type ConfigScope = 'llm' | 'imageGen';

let cachedServerConfig: {
  mtimeMs: number;
  value: ServerPersistedConfig | null;
} | null = null;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeServerConfig(raw: unknown): ServerPersistedConfig | null {
  if (isObjectRecord(raw) && isObjectRecord(raw.llm)) {
    const normalized: ServerPersistedConfig = { llm: { ...raw.llm } };
    if (isObjectRecord(raw.imageGen)) {
      normalized.imageGen = { ...raw.imageGen };
    }
    return normalized;
  }

  if (isObjectRecord(raw) && 'provider' in raw) {
    return { llm: { ...raw } };
  }

  return null;
}

function getStoredApiKey(section?: ServerConfigSection): string | null {
  return typeof section?.apiKey === 'string' && section.apiKey.trim() ? section.apiKey : null;
}

function redactConfigSection(section?: ServerConfigSection): ServerConfigSection | undefined {
  if (!section) return undefined;
  return {
    ...section,
    apiKey: '',
    hasApiKey: !!getStoredApiKey(section),
  };
}

export function redactServerConfig(config: ServerPersistedConfig | null): Record<string, unknown> {
  if (!config) return {};

  const redacted: Record<string, unknown> = {
    llm: redactConfigSection(config.llm),
  };
  const imageGen = redactConfigSection(config.imageGen);
  if (imageGen) {
    redacted.imageGen = imageGen;
  }
  return redacted;
}

function mergeConfigSection(
  existing: ServerConfigSection | undefined,
  incoming: ServerConfigSection,
): ServerConfigSection {
  const merged: ServerConfigSection = { ...(existing || {}), ...incoming };
  if (!Object.hasOwn(incoming, 'apiKey') && typeof existing?.apiKey === 'string') {
    merged.apiKey = existing.apiKey;
  }
  delete merged.hasApiKey;
  return merged;
}

/** LLM config persistence plugin — reads/writes config to ~/.openroom/config.json */
function llmConfigPlugin(): Plugin {
  return {
    name: 'llm-config',
    configureServer(server) {
      server.middlewares.use('/api/llm-config', (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET') {
          try {
            res.writeHead(200);
            res.end(JSON.stringify(redactServerConfig(loadServerConfig())));
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString();
              const parsed = JSON.parse(body);
              const nextConfig = normalizeServerConfig(parsed);
              if (!nextConfig) {
                throw new Error('Invalid config payload');
              }

              const existingConfig = loadServerConfig();
              const mergedConfig: ServerPersistedConfig = {
                llm: mergeConfigSection(existingConfig?.llm, nextConfig.llm),
              };

              if (isObjectRecord(parsed) && Object.hasOwn(parsed, 'imageGen')) {
                if (parsed.imageGen !== null) {
                  if (!isObjectRecord(parsed.imageGen)) {
                    throw new Error('Invalid imageGen config payload');
                  }
                  mergedConfig.imageGen = mergeConfigSection(
                    existingConfig?.imageGen,
                    parsed.imageGen,
                  );
                }
              } else if (existingConfig?.imageGen) {
                mergedConfig.imageGen = { ...existingConfig.imageGen };
              }

              fs.mkdirSync(resolve(os.homedir(), '.openroom'), { recursive: true });
              fs.writeFileSync(LLM_CONFIG_FILE, JSON.stringify(mergedConfig), 'utf-8');
              const stat = fs.statSync(LLM_CONFIG_FILE);
              cachedServerConfig = { mtimeMs: stat.mtimeMs, value: mergedConfig };
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });
    },
  };
}

/**
 * Sanitize a relative path to prevent directory traversal.
 * Resolves any ../ sequences and ensures the result stays within the expected base.
 * Returns null if the path would escape the base directory.
 */
function sanitizeRelativePath(relPath: string, baseDir: string): string | null {
  // Strip null bytes and normalize
  const cleaned = relPath.replace(/\0/g, '');
  // Only allow safe characters: alphanumeric, underscore, hyphen, dot, forward slash
  const safe = cleaned.replace(/[^a-zA-Z0-9_\-./]/g, '_');
  // Resolve to absolute and verify it stays within baseDir
  const resolved = resolve(baseDir, safe);
  // Normalize both paths for comparison (resolve handles .. and symlinks)
  const normalizedBase = resolve(baseDir);
  if (!resolved.startsWith(normalizedBase + sep) && resolved !== normalizedBase) {
    return null;
  }
  // Return the relative portion (stripped of base) for use with join()
  return resolved.slice(normalizedBase.length + 1) || '';
}

/**
 * Session data plugin — reads/writes files under ~/.openroom/sessions/
 * API: /api/session-data?path={charId}/{modId}/chat/history.json
 * Supports GET, POST, DELETE.
 */
function sessionDataPlugin(): Plugin {
  return {
    name: 'session-data',
    configureServer(server) {
      server.middlewares.use('/api/session-data', (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        const url = new URL(req.url || '', 'http://localhost');
        const relPath = url.searchParams.get('path') || '';
        const action = url.searchParams.get('action') || '';

        if (!relPath) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }

        // Sanitize: resolve path and ensure it stays within SESSIONS_DIR
        const safePath = sanitizeRelativePath(relPath, SESSIONS_DIR);
        if (safePath === null) {
          res.writeHead(403);
          res.end(JSON.stringify({ error: 'Invalid path' }));
          return;
        }
        const filePath = join(SESSIONS_DIR, safePath);

        // Directory listing: ?action=list&path=...
        if (action === 'list' && req.method === 'GET') {
          try {
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isDirectory()) {
              res.writeHead(200);
              res.end(JSON.stringify({ files: [], not_exists: !fs.existsSync(filePath) }));
              return;
            }
            const entries = fs.readdirSync(filePath, { withFileTypes: true });
            const files = entries.map((e) => ({
              path: safePath === '' || safePath === '/' ? e.name : `${safePath}/${e.name}`,
              type: e.isDirectory() ? 1 : 0,
              size: e.isDirectory() ? 0 : fs.statSync(join(filePath, e.name)).size,
            }));
            res.writeHead(200);
            res.end(JSON.stringify({ files, not_exists: false }));
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(filePath)) {
              const ext = filePath.split('.').pop()?.toLowerCase() || '';
              const binaryMimes: Record<string, string> = {
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                gif: 'image/gif',
                webp: 'image/webp',
                svg: 'image/svg+xml',
                mp4: 'video/mp4',
                webm: 'video/webm',
              };
              const mime = binaryMimes[ext];
              if (mime) {
                res.setHeader('Content-Type', mime);
                res.writeHead(200);
                res.end(fs.readFileSync(filePath));
              } else {
                res.writeHead(200);
                res.end(fs.readFileSync(filePath, 'utf-8'));
              }
            } else {
              res.writeHead(200);
              res.end('{}');
            }
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const buf = Buffer.concat(chunks);
              const dir = filePath.substring(0, filePath.lastIndexOf('/'));
              fs.mkdirSync(dir, { recursive: true });
              const ct = (req.headers['content-type'] || '').toLowerCase();
              if (
                ct.startsWith('image/') ||
                ct.startsWith('video/') ||
                ct === 'application/octet-stream'
              ) {
                fs.writeFileSync(filePath, buf);
              } else {
                fs.writeFileSync(filePath, buf.toString(), 'utf-8');
              }
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        if (req.method === 'DELETE') {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });

      // Session reset: DELETE /api/session-data?action=reset&path={charId}/{modId}
      // Recursively removes the entire session directory
      server.middlewares.use('/api/session-reset', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'DELETE') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const url = new URL(req.url || '', 'http://localhost');
        const relPath = url.searchParams.get('path') || '';
        if (!relPath) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }

        const safePath = sanitizeRelativePath(relPath, SESSIONS_DIR);
        if (safePath === null) {
          res.writeHead(403);
          res.end(JSON.stringify({ error: 'Invalid path' }));
          return;
        }
        const targetDir = join(SESSIONS_DIR, safePath);

        try {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

/** Debug log plugin — writes browser logs to logs/debug-*.log */
function logServerPlugin(): Plugin {
  return {
    name: 'log-server',
    configureServer(server) {
      const logDir = join(__dirname, 'logs');
      const logFile = join(logDir, generateLogFileName());
      const middleware = createLogMiddleware(logFile, fs);

      server.middlewares.use('/api/log', middleware);

      server.httpServer?.once('listening', () => {
        console.log(`\n  [DebugLog] Writing to: ${logFile}\n`);
      });
    },
  };
}

/** Load server-side LLM config for API key injection */
function loadServerConfig(): ServerPersistedConfig | null {
  try {
    if (!fs.existsSync(LLM_CONFIG_FILE)) {
      cachedServerConfig = null;
      return null;
    }

    const stat = fs.statSync(LLM_CONFIG_FILE);
    if (cachedServerConfig && cachedServerConfig.mtimeMs === stat.mtimeMs) {
      return cachedServerConfig.value;
    }

    const parsed = normalizeServerConfig(JSON.parse(fs.readFileSync(LLM_CONFIG_FILE, 'utf-8')));
    cachedServerConfig = { mtimeMs: stat.mtimeMs, value: parsed };
    return parsed;
  } catch {
    // Config file missing or malformed
    cachedServerConfig = null;
  }
  return null;
}

/** Determine provider type from target URL or X-LLM-Provider hint header */
export function inferProvider(targetUrl: URL | string, hint?: string): ProxyProvider {
  const normalizedHint = hint?.trim().toLowerCase();
  if (normalizedHint) {
    if (
      normalizedHint === 'openai' ||
      normalizedHint === 'anthropic' ||
      normalizedHint === 'minimax' ||
      normalizedHint === 'gemini'
    ) {
      return normalizedHint;
    }
    return 'unknown';
  }

  try {
    const parsed = targetUrl instanceof URL ? targetUrl : new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('anthropic')) return 'anthropic';
    if (host.includes('minimax')) return 'minimax';
    if (host.includes('google') || host.includes('generativelanguage')) return 'gemini';
    return 'openai'; // default: OpenAI-compatible
  } catch {
    return 'unknown';
  }
}

export function parseProxyTargetUrl(targetUrl: string): URL | null {
  try {
    const parsed = new URL(targetUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Known LLM/image-gen provider hostnames that the proxy may forward to. */
const ALLOWED_PROVIDER_HOSTS = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'api.minimax.io',
  'api.z.ai',
  'api.moonshot.cn',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
]);

/** Local development hosts — only allowed when ALLOW_LOCAL_LLM=true. */
const LOCAL_LLM_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/** Validate that a parsed target URL points to an allowed provider host. */
export function isAllowedTarget(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_PROVIDER_HOSTS.has(host)) return true;
  if (LOCAL_LLM_HOSTS.has(host) && process.env.ALLOW_LOCAL_LLM === 'true') return true;
  return false;
}

function normalizeConfigScope(scope?: string): ConfigScope | undefined {
  return scope === 'imageGen' || scope === 'llm' ? scope : undefined;
}

export function selectServerApiKey(
  config: ServerPersistedConfig | null,
  scope: ConfigScope | undefined,
  provider: ProxyProvider,
): string | null {
  if (!config) return null;

  const llmApiKey = getStoredApiKey(config.llm);
  const imageGenApiKey = getStoredApiKey(config.imageGen);

  if (scope === 'llm') return llmApiKey;
  if (scope === 'imageGen') return imageGenApiKey;
  if (provider === 'gemini') return imageGenApiKey || llmApiKey;
  return llmApiKey || imageGenApiKey;
}

function isBlockedPassthroughHeader(headerName: string): boolean {
  return (
    headerName.startsWith('x-llm-') ||
    [
      'authorization',
      'cookie',
      'host',
      'connection',
      'proxy-authorization',
      'x-api-key',
      'x-goog-api-key',
    ].includes(headerName)
  );
}

/** Inject API key from server-side config into proxy request headers */
function injectServerApiKey(
  headers: Record<string, string>,
  targetUrl: URL,
  providerHint?: string,
  configScope?: string,
): void {
  const config = loadServerConfig();
  const provider = inferProvider(targetUrl, providerHint);
  const apiKey = selectServerApiKey(config, normalizeConfigScope(configScope), provider);

  if (!apiKey) return;

  if (provider === 'anthropic' || provider === 'minimax') {
    headers['x-api-key'] = apiKey;
  } else if (provider === 'gemini') {
    headers['x-goog-api-key'] = apiKey;
  } else {
    headers['authorization'] = `Bearer ${apiKey}`;
  }
}

/** LLM API proxy plugin — resolves browser CORS restrictions
 *  API keys are now injected server-side from ~/.openroom/config.json.
 *  The browser never sends or sees API keys. */
function llmProxyPlugin(): Plugin {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/llm-proxy', async (req, res) => {
        const targetUrl = req.headers['x-llm-target-url'] as string;
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing X-LLM-Target-URL header' }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks).toString();
            const parsedTargetUrl = parseProxyTargetUrl(targetUrl);
            if (!parsedTargetUrl) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid target URL' }));
              return;
            }

            // Strict SSRF: validate target host BEFORE injecting keys
            if (!isAllowedTarget(parsedTargetUrl)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error: 'Target host not allowed',
                  host: parsedTargetUrl.hostname,
                }),
              );
              return;
            }
            const headers: Record<string, string> = {};
            // Only forward safe, non-sensitive headers from the browser.
            // API keys are NO LONGER accepted from the client — they come from server config.
            const allowKeys = new Set([
              'content-type',
              'anthropic-version', // Anthropic API version (not a secret)
            ]);
            for (const [key, val] of Object.entries(req.headers)) {
              if (typeof val !== 'string') continue;
              if (allowKeys.has(key)) {
                headers[key] = val;
              } else if (key.startsWith('x-custom-')) {
                // Only forward x-custom- headers that map to safe, non-sensitive names
                const strippedKey = key.slice('x-custom-'.length);
                // Block headers that could inject auth or override internal routing
                if (strippedKey && !isBlockedPassthroughHeader(strippedKey)) {
                  headers[strippedKey] = val;
                }
              }
              // All other headers (including authorization and x-api-key) are dropped
            }

            // Inject API key from server-side config
            injectServerApiKey(
              headers,
              parsedTargetUrl,
              req.headers['x-llm-provider'] as string,
              req.headers['x-llm-config-scope'] as string,
            );

            const fetchRes = await fetch(parsedTargetUrl.toString(), {
              method: req.method || 'POST',
              headers,
              body,
            });

            res.writeHead(fetchRes.status, {
              'Content-Type': fetchRes.headers.get('Content-Type') || 'application/json',
              'Transfer-Encoding': 'chunked',
            });

            if (fetchRes.body) {
              const reader = (fetchRes.body as ReadableStream<Uint8Array>).getReader();
              const pump = async () => {
                let done = false;
                while (!done) {
                  const result = await reader.read();
                  done = result.done;
                  if (!done) res.write(result.value);
                }
                res.end();
              };
              pump().catch(() => res.end());
            } else {
              const text = await fetchRes.text();
              res.end(text);
            }
          } catch (err: unknown) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
      });
    },
  };
}

/** Generic JSON file persistence plugin factory */
function jsonFilePlugin(name: string, apiPath: string, filePath: string): Plugin {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(apiPath, (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(filePath)) {
              res.writeHead(200);
              res.end(fs.readFileSync(filePath, 'utf-8'));
            } else {
              res.writeHead(200);
              res.end('{}');
            }
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString();
              JSON.parse(body);
              fs.mkdirSync(resolve(os.homedir(), '.openroom'), { recursive: true });
              fs.writeFileSync(filePath, body, 'utf-8');
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(500);
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });
    },
  };
}

const config = ({ mode }: ConfigEnv): UserConfigExport => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = env.NODE_ENV === 'production';
  const isTest = env.NODE_ENV === 'test';
  const isAnalyze = env.ANALYZE === 'analyze';
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN;
  const bizProjectName = env.BIZ_PROJECT_NAME || '';

  // Calculate asset base path
  // - Production: CDN address
  // - Test: sub-path /webuiapps/
  // - Development: /
  const getBase = () => {
    if (isProd && env.CDN_PREFIX) {
      return env.CDN_PREFIX + '/' + bizProjectName;
    }
    if ((isTest || isProd) && bizProjectName) {
      return '/' + bizProjectName + '/';
    }
    return '/';
  };
  const skipLegacy = env.VITE_SKIP_LEGACY === 'true';
  const plugins: PluginOption[] = [
    llmConfigPlugin(),
    sessionDataPlugin(),
    logServerPlugin(),
    llmProxyPlugin(),
    jsonFilePlugin('characters', '/api/characters', CHARACTERS_FILE),
    jsonFilePlugin('mods', '/api/mods', MODS_FILE),
    appGeneratorPlugin({
      llmConfigFile: LLM_CONFIG_FILE,
      projectRoot: resolve(__dirname, '../..'),
      srcDir: resolve(__dirname, 'src'),
    }),
    react(),
    ...(skipLegacy
      ? []
      : [
          legacy({
            targets: ['defaults', 'not ie <= 11', 'chrome 80'],
            additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
            renderLegacyChunks: true,
            modernPolyfills: true,
          }),
        ]),
  ];

  /** Only import when running in analyze mode */
  if (isAnalyze) {
    plugins.push(
      visualizer({
        gzipSize: true,
        open: true,
        filename: `${env.APP_NAME}-chunk.html`,
      }),
    );
  }

  if (isProd && sentryAuthToken) {
    plugins.push(
      sentryVitePlugin({
        authToken: sentryAuthToken,
        org: env.SENTRY_ORG || '',
        project: env.SENTRY_PROJECT || '',
        url: env.SENTRY_URL || undefined,
        sourcemaps: {
          filesToDeleteAfterUpload: ['dist/**/*.js.map'],
        },
      }),
    );
  }

  return {
    plugins,
    css: {
      postcss: {
        plugins: [autoprefixer({})],
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        '@gui/vibe-container': resolve(__dirname, './src/lib/vibeContainerMock.ts'),
      },
    },
    base: getBase(),
    server: {
      host: true,
      port: 3000,
    },
    define: {
      __APP__: JSON.stringify(env.APP_ENVIRONMENT),
      __ROUTER_BASE__: JSON.stringify(bizProjectName ? '/' + bizProjectName : ''),
      __ENV__: JSON.stringify(env.NODE_ENV),
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'assets/styles/[name]-[hash][extname]'; // Output to /dist/assets/styles directory
            }
            if (/\.(png|jpe?g|gif|svg)$/.test(assetInfo.name || '')) {
              return 'assets/images/[name]-[hash][extname]'; // Output to /dist/assets/images directory
            }

            if (/\.(ttf)$/.test(assetInfo.name || '')) {
              return 'assets/fonts/[name]-[hash][extname]'; // Output to /dist/assets/fonts directory
            }

            return '[name]-[hash][extname]'; // Default output for other assets
          },
        },
      },
      minify: true,
      chunkSizeWarningLimit: 1500,
      cssTarget: 'chrome61',
      sourcemap: isProd, // Source map generation must be turned on
      manifest: true,
    },
  };
};

export default config;
