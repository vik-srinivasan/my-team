import { describe, it, expect } from 'vitest';
import { __test__ } from './journal.js';

const { parseEntries, sliceEntries } = __test__;

const SAMPLE = `## 2026-05-12T09:17:00Z — captain
First entry.

## 2026-05-12T09:19:00Z — scout
Second entry line 1
Second entry line 2

## 2026-05-12T09:25:00Z — captain
Third entry.
`;

describe('parseEntries', () => {
  it('splits on ## headers', () => {
    const entries = parseEntries(SAMPLE);
    expect(entries).toHaveLength(3);
    expect(entries[0].header).toMatch(/captain/);
    expect(entries[1].header).toMatch(/scout/);
    expect(entries[1].body).toContain('Second entry line 2');
  });

  it('returns empty array on no headers', () => {
    expect(parseEntries('just prose, no headers')).toEqual([]);
  });
});

describe('sliceEntries', () => {
  const entries = parseEntries(SAMPLE);

  it('returns last 5 by default', () => {
    const out = sliceEntries(entries, {});
    expect(out).toHaveLength(3);
  });

  it('respects -n', () => {
    const out = sliceEntries(entries, { number: '2' });
    expect(out).toHaveLength(2);
    expect(out[0].header).toMatch(/scout/);
    expect(out[1].header).toMatch(/captain/);
  });

  it('--all returns everything', () => {
    const out = sliceEntries(entries, { all: true });
    expect(out).toHaveLength(3);
  });

  it('falls back to default on bad -n', () => {
    const out = sliceEntries(entries, { number: 'banana' });
    expect(out).toHaveLength(3); // sample has 3 < default of 5
  });
});
