import { UserConfigExport, ConfigEnv, loadEnv } from 'vite';
import type { PluginOption, Plugin } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import autoprefixer from 'autoprefixer';
import { sentryVitePlugin } from '@sentry/vite-plugin';

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
    llmProxyPlugin(),
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
