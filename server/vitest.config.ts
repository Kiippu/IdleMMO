import { defineConfig } from 'vitest/config';

// Plain Node unit tests of the pure router. To test the full Worker runtime later, add
// @cloudflare/vitest-pool-workers (needs a machine where workerd runs).
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
