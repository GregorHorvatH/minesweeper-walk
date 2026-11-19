import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Відносні шляхи: на itch.io гра відкривається з підкаталогу, абсолютні /assets/... не працювали б.
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
});
