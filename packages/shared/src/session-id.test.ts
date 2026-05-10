import { describe, it, expect } from 'vitest';
import { generateSessionId } from './session-id.js';

describe('generateSessionId', () => {
  it('produces adjective-noun-number format', () => {
    const id = generateSessionId();
    const parts = id.split('-');
    expect(parts.length).toBe(2 + 1); // adjective, noun, number (noun could be multi-word but isn't)
    expect(parts[2]).toMatch(/^\d{2,3}$/);
  });

  it('avoids collisions with existing IDs', () => {
    const existing = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = generateSessionId(existing);
      expect(existing.has(id)).toBe(false);
      existing.add(id);
    }
  });

  it('generates unique IDs across many runs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateSessionId());
    }
    // With 64 adjectives * 80 nouns * 90 numbers = 460,800 combos,
    // 1000 samples should have very few (likely zero) collisions
    expect(ids.size).toBeGreaterThan(950);
  });
});
