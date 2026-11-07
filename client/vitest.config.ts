import { defineConfig } from 'vitest/config';

// Save-layer tests run in Node (Blob + CompressionStream are globals in Node 22,
// which the repo's engines field already requires). No DOM needed yet; the UI and
// worker get smoke-tested through the dev server.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
