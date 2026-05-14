import { useQuery } from '@tanstack/react-query';
import { compareByAttention, type SessionSummary } from '@my-team/shared';

import { listSessions } from '../lib/api.js';

/** Cache key tuple used by both reads and invalidations. */
export const SESSIONS_QUERY_KEY = ['sessions'] as const;

/**
 * TanStack Query hook for the session list. Polls every 2s so the sidebar
 * picks up new sessions and phase transitions without explicit invalidation.
 * Returns the raw query result plus a stable `attentionSorted` array (uses
 * the shared `compareByAttention` comparator so the sidebar order matches
 * `team list`).
 */
export function useSessions(): {
  data: SessionSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  attentionSorted: SessionSummary[];
} {
  const query = useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: listSessions,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });

  const attentionSorted = query.data
    ? [...query.data].sort(compareByAttention)
    : [];

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    attentionSorted,
  };
}
