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
  },
});
