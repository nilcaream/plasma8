import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1' },
  build: {
    target: 'es2022',
    // the graph pages ship at /beats/ and /harmonics/, linked from nowhere
    rolldownOptions: { input: { main: 'index.html', beats: 'beats/index.html', harmonics: 'harmonics/index.html' } },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
