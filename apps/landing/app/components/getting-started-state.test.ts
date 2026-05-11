import { describe, it, expect } from 'vitest';
import { TABS, DEFAULT_TAB, isValidTab } from './getting-started-state';

describe('TABS', () => {
  it('has exactly 6 entries in the expected order', () => {
    expect(TABS).toHaveLength(6);
    expect(TABS.map((tab) => tab.id)).toEqual([
      'setup',
      'repo',
      'cli',
      'remote',
      'worktree',
      'agent',
    ]);
  });

  it('every tab has a non-empty label, eyebrow, and title', () => {
    for (const tab of TABS) {
      expect(tab.label.length).toBeGreaterThan(0);
      expect(tab.eyebrow.length).toBeGreaterThan(0);
      expect(tab.title.length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_TAB', () => {
  it('is a valid tab id', () => {
    expect(isValidTab(DEFAULT_TAB)).toBe(true);
  });
});

describe('isValidTab', () => {
  it('returns true for the setup tab id', () => {
    expect(isValidTab('setup')).toBe(true);
  });

  it('returns true for the agent tab id', () => {
    expect(isValidTab('agent')).toBe(true);
  });

  it('returns false for an unknown tab id', () => {
    expect(isValidTab('nope')).toBe(false);
  });
});
