import { describe, it, expect } from 'vitest';
import { stripAnsi } from '@my-team/shared';
import { __test__ } from './plan.js';

const { renderPlan } = __test__;

describe('renderPlan', () => {
  it('passes content through with stripped output matching input', () => {
    const md = `# Plan
some body
## Goals
- a
- b
### Detail
text
`;
    const out = renderPlan(md);
    expect(stripAnsi(out)).toBe(md);
  });

  it('returns empty string for empty input', () => {
    expect(renderPlan('')).toBe('');
  });

  it('does not mangle code-style lines', () => {
    const line = '    const x = 1;';
    expect(renderPlan(line)).toBe(line);
  });
});
