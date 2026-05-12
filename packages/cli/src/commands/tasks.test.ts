import { describe, it, expect } from 'vitest';
import { stripAnsi } from '../format.js';
import { __test__ } from './tasks.js';

const { renderTasks } = __test__;

describe('renderTasks', () => {
  it('preserves overall structure (stripped)', () => {
    const md = `# Tasks

## Engineering

- [x] @engineer one
- [ ] @engineer two
`;
    const out = renderTasks(md);
    expect(stripAnsi(out)).toBe(md);
  });

  it('preserves checkbox glyphs in output', () => {
    const md = `- [x] done
- [ ] pending
`;
    const out = renderTasks(md);
    // Whether or not chalk emits colors (depends on TTY), the bracket
    // glyphs themselves must survive rendering.
    expect(stripAnsi(out)).toContain('[x] done');
    expect(stripAnsi(out)).toContain('[ ] pending');
  });

  it('passes through non-task non-header lines verbatim', () => {
    const line = 'just some prose, not a task.';
    expect(renderTasks(line)).toBe(line);
  });

  it('handles caps-X checkbox', () => {
    // Renderer normalizes to lowercase [x] when colouring.
    const out = renderTasks('- [X] caps');
    expect(stripAnsi(out)).toContain('[x]');
  });
});
