import { defineConfig } from 'vitest/config';

// Local-time maths (week boundaries, raid windows) depend on TZ; pin it so fixtures match.
process.env.TZ = 'UTC';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
    env: { TZ: 'UTC' },
  },
});
