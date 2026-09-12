import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    /* The bridge is a separate package, but its pure helpers belong in one suite. */
    include: ['src/**/*.test.ts', 'bridge/src/**/*.test.ts'],
  },
});
