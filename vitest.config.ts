import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/app/**/*.test.ts'],
    globals: false,
    passWithNoTests: true,
  },
});
