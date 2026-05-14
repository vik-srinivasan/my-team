import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest config for `@my-team/ui`. The root `vitest.config.ts` includes
 * `packages/*\/src/**\/*.test.ts` and `apps/*\/app/**\/*.test.ts` —
 * this file adds the `apps/ui/src/**` patterns and switches to a jsdom
 * environment so React components can render.
 *
 * Run via `pnpm --filter @my-team/ui test`. The root-level `pnpm test`
 * sees these tests through pnpm workspace fan-out.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
  },
});
