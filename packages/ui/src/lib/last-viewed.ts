/**
 * localStorage persistence for the per-session "last viewed" timestamps the
 * dashboard uses to decide whether a session has fresh output since the user
 * last looked.
 *
 * Pulled out of `store.ts` so the load/save helpers can be unit-tested without
 * hauling the whole zustand store into a jsdom environment.
 */

export const LAST_VIEWED_KEY = 'my-team.lastViewed.v1';

/**
 * Reads the persisted lastViewed map. Returns `{}` if:
 *   - we're rendering server-side (no `window`)
 *   - the key is missing
 *   - the stored value is malformed JSON
 *   - the parsed value isn't a plain object
 *
 * Non-string entries in the parsed object are filtered out so callers can trust
 * `Record<string, string>` without re-validating.
 */
export function loadLastViewed(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LAST_VIEWED_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') result[k] = v;
      }
      return result;
    }
    return {};
  } catch {
    // Private mode, quota exceeded, malformed JSON — start clean.
    return {};
  }
}

/**
 * Best-effort write. Silently swallows quota / private-mode errors because the
 * dashboard still works without the persistence — the next reload just shows
 * everything as unread again.
 */
export function persistLastViewed(value: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_VIEWED_KEY, JSON.stringify(value));
  } catch {
    // Best effort — ignore quota / private-mode errors.
  }
}
