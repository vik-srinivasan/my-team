import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SessionDetail } from '@my-team/shared';

import { getSession } from '../lib/api.js';

/**
 * Cache-key builder so callers (and tests) can invalidate the entry for a
 * specific session without inlining the array.
 */
export function sessionDetailQueryKey(id: string): readonly ['session', string] {
  return ['session', id] as const;
}

/**
 * TanStack Query hook for a single session's detail. Polls every 2s and
 * skips entirely when `id` is `null` (e.g. nothing selected in the sidebar).
 */
export function useSessionDetail(id: string | null): UseQueryResult<SessionDetail, unknown> {
  return useQuery<SessionDetail, unknown>({
    queryKey: id !== null ? sessionDetailQueryKey(id) : ['session', '__none__'],
    queryFn: () => {
      if (id === null) {
        throw new Error('useSessionDetail called without an id');
      }
      return getSession(id);
    },
    enabled: id !== null,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });
}
