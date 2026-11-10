import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Node 25+ ships a built-in global localStorage that shadows happy-dom's; turn it off in workers
    pool: 'forks',
    poolOptions: {
      forks: { execArgv: ['--no-experimental-webstorage'] },
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/lib/llmClient.ts',
        'src/lib/tts.ts',
        'src/lib/userName.ts',
        'src/lib/imageGenClient.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 85,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@gui/vibe-container': resolve(__dirname, './src/lib/vibeContainerMock.ts'),
    },
  },
});
