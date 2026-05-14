import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AgentListResponse } from '@my-team/shared/types';

import { listAgents } from '../lib/api.js';

/** Cache-key builder for the per-session agent list. */
export function agentListQueryKey(
  sessionId: string,
): readonly ['agents', string] {
  return ['agents', sessionId] as const;
}

/**
 * TanStack Query hook for `GET /api/sessions/:id/agents`. Drives the
 * Workflow tab's specialist list (the column on the left). The list is
 * refetched after every successful `putAgent` mutation so the source
 * chip on the row flips to `session` as soon as the edit lands.
 */
export function useAgentList(
  sessionId: string | null,
): UseQueryResult<AgentListResponse, unknown> {
  return useQuery<AgentListResponse, unknown>({
    queryKey: agentListQueryKey(sessionId ?? '__none__'),
    queryFn: () => {
      if (sessionId === null) {
        throw new Error('useAgentList called without sessionId');
      }
      return listAgents(sessionId);
    },
    enabled: sessionId !== null,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
