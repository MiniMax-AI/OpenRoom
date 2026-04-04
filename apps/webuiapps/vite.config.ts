import { UserConfigExport, ConfigEnv, loadEnv } from 'vite';
import type { PluginOption, Plugin } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import autoprefixer from 'autoprefixer';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import { generateLogFileName, createLogMiddleware } from './src/lib/logPlugin';
import { appGeneratorPlugin } from './src/lib/appGeneratorPlugin';

const LLM_CONFIG_FILE = resolve(os.homedir(), '.openroom', 'config.json');
const SESSIONS_DIR = resolve(os.homedir(), '.openroom', 'sessions');
const CHARACTERS_FILE = resolve(os.homedir(), '.openroom', 'characters.json');
const MODS_FILE = resolve(os.homedir(), '.openroom', 'mods.json');
const MCP_SERVERS_FILE = resolve(os.homedir(), '.openroom', 'mcp-servers.json');
const MCP_REQUEST_TIMEOUT_MS = Number(process.env.OPENROOM_MCP_TIMEOUT_MS || 20000);

/** LLM config persistence plugin — reads/writes config to ~/.openroom/config.json */
function llmConfigPlugin(): Plugin {
  return {
    name: 'llm-config',
    configureServer(server) {
      server.middlewares.use('/api/llm-config', (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(LLM_CONFIG_FILE)) {
              const content = fs.readFileSync(LLM_CONFIG_FILE, 'utf-8');
              res.writeHead(200);
              res.end(content);
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
              // Validate JSON before writing
              JSON.parse(body);
              fs.mkdirSync(resolve(os.homedir(), '.openroom'), { recursive: true });
              fs.writeFileSync(LLM_CONFIG_FILE, body, 'utf-8');
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

        // Sanitize: only allow alphanumeric, underscore, hyphen, dot, forward slash
        const safePath = relPath.replace(/[^a-zA-Z0-9_\-./]/g, '_').replace(/\.\./g, '');
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

        const safePath = relPath.replace(/[^a-zA-Z0-9_\-./]/g, '_').replace(/\.\./g, '');
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

/** LLM API proxy plugin — resolves browser CORS restrictions */
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
            const headers: Record<string, string> = {};
            // Forward all headers except host/connection/internal ones
            const skipKeys = new Set(['host', 'connection', 'content-length', 'x-llm-target-url']);
            for (const [key, val] of Object.entries(req.headers)) {
              if (typeof val !== 'string') continue;
              if (skipKeys.has(key)) continue;
              if (key.startsWith('x-custom-')) {
                headers[key.replace('x-custom-', '')] = val;
              } else {
                headers[key] = val;
              }
            }

            const fetchRes = await fetch(targetUrl, {
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

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function collectRequestBody(req: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise((resolveBody, rejectBody) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', rejectBody);
  });
}

async function readJsonFileSafe<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = tryParseJson(raw);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

function normalizeMcpServer(input: unknown): McpServerConfig | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const name = String(obj.name || '').trim();
  const command = String(obj.command || '').trim();
  if (!name || !command) return null;

  const args = Array.isArray(obj.args)
    ? obj.args.map((value) => String(value)).filter((value) => value.length > 0)
    : [];

  const env: Record<string, string> = {};
  if (obj.env && typeof obj.env === 'object' && !Array.isArray(obj.env)) {
    for (const [key, value] of Object.entries(obj.env as Record<string, unknown>)) {
      const safeKey = String(key || '').trim();
      if (!safeKey) continue;
      env[safeKey] = String(value ?? '');
    }
  }

  return {
    name,
    command,
    args,
    env,
  };
}

async function loadMcpServers(): Promise<McpServerConfig[]> {
  const parsed = await readJsonFileSafe<unknown>(MCP_SERVERS_FILE, { servers: [] });
  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const rawServers = Array.isArray(obj.servers) ? obj.servers : [];
  return rawServers
    .map((item) => normalizeMcpServer(item))
    .filter((item): item is McpServerConfig => Boolean(item));
}

async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  await fs.promises.mkdir(resolve(os.homedir(), '.openroom'), { recursive: true });
  await fs.promises.writeFile(MCP_SERVERS_FILE, JSON.stringify({ servers }, null, 2), 'utf-8');
}

function mcpFrameEncode(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf-8');
  return Buffer.concat([header, body]);
}

function readMcpFrames(onMessage: (message: Record<string, unknown>) => void) {
  let buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const headerRaw = buffer.slice(0, headerEnd).toString('utf-8');
      const match = headerRaw.match(/content-length\s*:\s*(\d+)/i);
      if (!match) {
        buffer = Buffer.alloc(0);
        return;
      }
      const bodyLen = Number(match[1]);
      const frameEnd = headerEnd + 4 + bodyLen;
      if (buffer.length < frameEnd) return;

      const body = buffer.slice(headerEnd + 4, frameEnd).toString('utf-8');
      buffer = buffer.slice(frameEnd);
      const parsed = tryParseJson(body);
      if (parsed && typeof parsed === 'object') {
        onMessage(parsed as Record<string, unknown>);
      }
    }
  };
}

async function runMcpClient<T>(
  mcpServer: McpServerConfig,
  runner: (
    request: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
  ) => Promise<T>,
): Promise<T> {
  const child = spawn(mcpServer.command, mcpServer.args || [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(mcpServer.env || {}) },
  });

  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  let reqId = 1;
  let stderrBuffer = '';

  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString('utf-8');
    if (stderrBuffer.length > 4000) {
      stderrBuffer = stderrBuffer.slice(-4000);
    }
  });

  const onData = readMcpFrames((message) => {
    const idRaw = message.id;
    if (typeof idRaw !== 'number') return;
    const pendingReq = pending.get(idRaw);
    if (!pendingReq) return;

    clearTimeout(pendingReq.timer);
    pending.delete(idRaw);
    if (message.error) {
      pendingReq.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    pendingReq.resolve(message.result);
  });
  child.stdout.on('data', onData);

  const stop = () => {
    for (const [, item] of pending.entries()) {
      clearTimeout(item.timer);
      item.reject(new Error('mcp process terminated'));
    }
    pending.clear();
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  };

  child.on('exit', () => stop());

  const sendRequest = async (
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> => {
    const id = reqId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return await new Promise<unknown>((resolveReq, rejectReq) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectReq(new Error(`mcp timeout ${method}`));
      }, MCP_REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve: resolveReq, reject: rejectReq, timer });
      child.stdin.write(mcpFrameEncode(payload));
    });
  };

  try {
    await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'openroom-mcp-bridge', version: '0.1.0' },
    });
    child.stdin.write(
      mcpFrameEncode({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    );
    return await runner(sendRequest);
  } catch (err) {
    const extra = stderrBuffer.trim();
    const base = err instanceof Error ? err.message : String(err);
    throw new Error(extra ? `${base}; stderr=${extra}` : base);
  } finally {
    stop();
  }
}

async function listMcpToolsForServer(server: McpServerConfig): Promise<
  Array<{
    server: string;
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>
> {
  const result = await runMcpClient(server, async (request) => {
    const data = (await request('tools/list')) as Record<string, unknown>;
    const tools = Array.isArray(data?.tools) ? data.tools : [];
    return tools;
  });

  return result
    .map((tool) => {
      const obj = tool && typeof tool === 'object' ? (tool as Record<string, unknown>) : {};
      const name = String(obj.name || '').trim();
      if (!name) return null;
      const description = String(obj.description || '').trim() || undefined;
      const inputSchema =
        obj.inputSchema && typeof obj.inputSchema === 'object' && !Array.isArray(obj.inputSchema)
          ? (obj.inputSchema as Record<string, unknown>)
          : undefined;
      return {
        server: server.name,
        name,
        description,
        inputSchema,
      };
    })
    .filter(
      (
        item,
      ): item is {
        server: string;
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      } => Boolean(item),
    );
}

function mcpBridgePlugin(): Plugin {
  return {
    name: 'mcp-bridge',
    configureServer(server) {
      server.middlewares.use('/api/mcp-servers', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET') {
          const servers = await loadMcpServers();
          res.writeHead(200);
          res.end(JSON.stringify({ servers }));
          return;
        }

        if (req.method === 'POST') {
          try {
            const raw = await collectRequestBody(req);
            const parsed = (tryParseJson(raw) || {}) as Record<string, unknown>;
            const items = Array.isArray(parsed.servers) ? parsed.servers : [];
            const servers = items
              .map((item) => normalizeMcpServer(item))
              .filter((item): item is McpServerConfig => Boolean(item));
            await saveMcpServers(servers);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, servers }));
          } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
          return;
        }

        res.writeHead(405);
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      });

      server.middlewares.use('/api/mcp-tools', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
          return;
        }

        try {
          const servers = await loadMcpServers();
          const tools: Array<{
            server: string;
            name: string;
            description?: string;
            inputSchema?: Record<string, unknown>;
          }> = [];
          const errors: Array<{ server: string; error: string }> = [];
          for (const item of servers) {
            try {
              const listed = await listMcpToolsForServer(item);
              tools.push(...listed);
            } catch (err) {
              errors.push({
                server: item.name,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, tools, errors }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: String(err), tools: [], errors: [] }));
        }
      });

      server.middlewares.use('/api/mcp-call', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
          return;
        }

        try {
          const raw = await collectRequestBody(req);
          const parsed = (tryParseJson(raw) || {}) as Record<string, unknown>;
          const serverName = String(parsed.server || '').trim();
          const toolName = String(parsed.tool || '').trim();
          const args =
            parsed.arguments &&
            typeof parsed.arguments === 'object' &&
            !Array.isArray(parsed.arguments)
              ? (parsed.arguments as Record<string, unknown>)
              : {};

          if (!serverName || !toolName) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'server and tool are required' }));
            return;
          }

          const servers = await loadMcpServers();
          const target = servers.find((item) => item.name === serverName);
          if (!target) {
            res.writeHead(404);
            res.end(JSON.stringify({ ok: false, error: `MCP server not found: ${serverName}` }));
            return;
          }

          const result = await runMcpClient(target, async (request) => {
            return await request('tools/call', {
              name: toolName,
              arguments: args,
            });
          });
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, result }));
        } catch (err) {
          res.writeHead(500);
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
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
    mcpBridgePlugin(),
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
