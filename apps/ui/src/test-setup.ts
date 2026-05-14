/**
 * Global test setup. Extends Vitest's `expect` with the matchers from
 * `@testing-library/jest-dom` (toBeInTheDocument, toHaveAttribute, …)
 * and runs `cleanup()` after every test so previously-rendered
 * components don't bleed into later tests' DOM queries.
 *
 * Vitest doesn't enable RTL's auto-cleanup by default — vitest sets
 * `globals: false`, which the RTL package uses to decide whether to
 * register `afterEach(cleanup)` automatically. Doing it here keeps
 * tests isolated.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
