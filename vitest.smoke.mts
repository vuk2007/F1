import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Smoke tests that hit the real OpenF1 API. Kept out of `pnpm test` so the unit
 * suite stays offline and fast. Run with `pnpm smoke`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['scripts/**/*.smoke.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    /*
     * One file at a time, in one worker. The rate-limited queue is per module
     * instance, so parallel workers each believe they own the whole 3 req/s and
     * 30 req/min budget — together they breach it and OpenF1 returns 429. This
     * is only a concern for the test runner: a browser tab has a single queue.
     */
    fileParallelism: false,
    maxWorkers: 1,
  },
});
