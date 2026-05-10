import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  LAST_VIEWED_KEY,
  loadLastViewed,
  persistLastViewed,
} from './last-viewed.js';

/**
 * Map-backed mock of `Storage` — covers the subset of the API our helpers use.
 * Vitest defaults to the node environment, which has no `window` / `localStorage`,
 * so we stub a minimal `window` global before each test.
 */
function createMockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('last-viewed', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMockStorage();
    vi.stubGlobal('window', { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('loadLastViewed', () => {
    it('returns {} when the key is missing', () => {
      expect(loadLastViewed()).toEqual({});
    });

    it('returns {} when stored value is malformed JSON', () => {
      storage.setItem(LAST_VIEWED_KEY, '{not valid json');
      expect(loadLastViewed()).toEqual({});
    });

    it('returns {} when stored value is a JSON array', () => {
      storage.setItem(LAST_VIEWED_KEY, JSON.stringify(['a', 'b']));
      expect(loadLastViewed()).toEqual({});
    });

    it('returns {} when stored value is a JSON primitive (null)', () => {
      storage.setItem(LAST_VIEWED_KEY, 'null');
      expect(loadLastViewed()).toEqual({});
    });

    it('filters out non-string values from a parsed object', () => {
      storage.setItem(
        LAST_VIEWED_KEY,
        JSON.stringify({
          ok: '2026-05-10T10:00:00Z',
          numeric: 123,
          nested: { foo: 'bar' },
          nully: null,
          listy: ['x'],
          alsoOk: '2026-05-10T11:00:00Z',
        }),
      );
      expect(loadLastViewed()).toEqual({
        ok: '2026-05-10T10:00:00Z',
        alsoOk: '2026-05-10T11:00:00Z',
      });
    });

    it('returns {} when window is undefined (SSR guard)', () => {
      vi.stubGlobal('window', undefined);
      expect(loadLastViewed()).toEqual({});
    });

    it('returns {} if localStorage.getItem throws', () => {
      const throwing: Storage = {
        ...storage,
        getItem() {
          throw new Error('boom');
        },
      };
      vi.stubGlobal('window', { localStorage: throwing });
      expect(loadLastViewed()).toEqual({});
    });
  });

  describe('persistLastViewed', () => {
    it('writes JSON-serialized value under the canonical key', () => {
      const value = { 'sess-1': '2026-05-10T10:00:00Z' };
      persistLastViewed(value);

      expect(storage.getItem(LAST_VIEWED_KEY)).toBe(JSON.stringify(value));
    });

    it('overwrites any previously persisted value', () => {
      persistLastViewed({ 'sess-1': '2026-05-10T10:00:00Z' });
      persistLastViewed({ 'sess-2': '2026-05-10T11:00:00Z' });

      expect(JSON.parse(storage.getItem(LAST_VIEWED_KEY) ?? '{}')).toEqual({
        'sess-2': '2026-05-10T11:00:00Z',
      });
    });

    it('is a no-op when window is undefined (SSR guard)', () => {
      vi.stubGlobal('window', undefined);
      // Should not throw. Nothing to assert beyond that.
      expect(() => persistLastViewed({ 'sess-1': 'now' })).not.toThrow();
    });

    it('swallows quota / private-mode errors', () => {
      const throwing: Storage = {
        ...storage,
        setItem() {
          throw new Error('QuotaExceeded');
        },
      };
      vi.stubGlobal('window', { localStorage: throwing });

      expect(() => persistLastViewed({ 'sess-1': 'now' })).not.toThrow();
    });
  });

  describe('round-trip', () => {
    it('persistLastViewed -> loadLastViewed returns the same map', () => {
      const value = {
        'amber-fox-12': '2026-05-10T10:00:00Z',
        'blocked-bear-44': '2026-05-10T11:30:00Z',
        'curious-cat-08': '2026-05-10T12:45:00Z',
      };

      persistLastViewed(value);
      expect(loadLastViewed()).toEqual(value);
    });

    it('round-trips an empty object', () => {
      persistLastViewed({});
      expect(loadLastViewed()).toEqual({});
    });
  });
});
