import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { AgentPromptResponse } from '@my-team/shared/types';

import { getAgent, putAgent } from '../lib/api.js';

/**
 * Cache-key builder. Used by both the read hook and the mutation hook so
 * invalidation lines up cleanly. Also exported so tests can build the same
 * tuple without inlining string literals.
 */
export function agentPromptQueryKey(
  sessionId: string,
  name: string,
): readonly ['agent', string, string] {
  return ['agent', sessionId, name] as const;
}

/**
 * TanStack Query hook for `GET /api/sessions/:id/agents/:name`. Skips
 * entirely when either id or name is `null` (e.g. nothing selected in
 * the Workflow tab specialist list).
 *
 * Prompts are immutable behind the user's back — we set `staleTime` to
 * `Infinity` so opening + re-opening a session doesn't refetch unless the
 * mutation explicitly invalidates the cache after a save.
 */
export function useAgentPrompt(
  sessionId: string | null,
  name: string | null,
): UseQueryResult<AgentPromptResponse, unknown> {
  return useQuery<AgentPromptResponse, unknown>({
    queryKey: agentPromptQueryKey(sessionId ?? '__none__', name ?? '__none__'),
    queryFn: () => {
      if (sessionId === null || name === null) {
        throw new Error('useAgentPrompt called without sessionId or name');
      }
      return getAgent(sessionId, name);
    },
    enabled: sessionId !== null && name !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * Mutation hook for `PUT /api/sessions/:id/agents/:name`. On success, the
 * mutation seeds the cache with the new body so the editor doesn't flash
 * stale content while the read query refetches, and also invalidates the
 * agent list query so the source chip on the left flips to `session`.
 */
export function useAgentPromptMutation(
  sessionId: string | null,
  name: string | null,
): UseMutationResult<AgentPromptResponse, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation<AgentPromptResponse, unknown, string>({
    mutationFn: (content: string) => {
      if (sessionId === null || name === null) {
        throw new Error('useAgentPromptMutation called without sessionId or name');
      }
      return putAgent(sessionId, name, content);
    },
    onSuccess: (data) => {
      if (sessionId === null || name === null) return;
      queryClient.setQueryData(agentPromptQueryKey(sessionId, name), data);
      void queryClient.invalidateQueries({
        queryKey: ['agents', sessionId],
      });
    },
  });
}
