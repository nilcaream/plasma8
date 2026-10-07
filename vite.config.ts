import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1' },
  build: {
    target: 'es2022',
    // the graph pages ship at /beats/, /harmonics/, /crossfader/ and /random-walk/, linked from nowhere
    rolldownOptions: {
      input: {
        main: 'index.html',
        beats: 'beats/index.html',
        harmonics: 'harmonics/index.html',
        crossfader: 'crossfader/index.html',
        randomWalk: 'random-walk/index.html',
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
