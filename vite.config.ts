import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1' },
  build: {
    target: 'es2022',
    // the beat graphs page ships at /beats/, linked from nowhere
    rolldownOptions: { input: { main: 'index.html', beats: 'beats/index.html' } },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
