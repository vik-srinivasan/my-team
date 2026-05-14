import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { WorkflowConfig } from '@my-team/shared/types';

import { getWorkflow, putWorkflow } from '../lib/api.js';

/** Cache-key builder for the per-session workflow config. */
export function workflowConfigQueryKey(
  sessionId: string,
): readonly ['workflow', string] {
  return ['workflow', sessionId] as const;
}

/** All-default workflow config — matches what the wrapper returns when
 *  `.team/workflow.json` is absent. */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  disabled_specialists: [],
  forced_specialists: [],
};

/**
 * TanStack Query hook for `GET /api/sessions/:id/workflow`. Returns the
 * full config; the wrapper substitutes defaults for missing fields so
 * callers can render the toggle/effort UI without nullchecks.
 */
export function useWorkflowConfig(
  sessionId: string | null,
): UseQueryResult<WorkflowConfig, unknown> {
  return useQuery<WorkflowConfig, unknown>({
    queryKey: workflowConfigQueryKey(sessionId ?? '__none__'),
    queryFn: () => {
      if (sessionId === null) {
        throw new Error('useWorkflowConfig called without sessionId');
      }
      return getWorkflow(sessionId);
    },
    enabled: sessionId !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

interface MutationCtx {
  previous: WorkflowConfig | undefined;
}

/**
 * Mutation hook for `PUT /api/sessions/:id/workflow`. Performs an
 * optimistic update on the cache so the toggle UI reflects the change
 * instantly; on failure the previous value is restored.
 */
export function useWorkflowConfigMutation(
  sessionId: string | null,
): UseMutationResult<WorkflowConfig, unknown, WorkflowConfig, MutationCtx> {
  const queryClient = useQueryClient();
  return useMutation<WorkflowConfig, unknown, WorkflowConfig, MutationCtx>({
    mutationFn: (config: WorkflowConfig) => {
      if (sessionId === null) {
        throw new Error('useWorkflowConfigMutation called without sessionId');
      }
      return putWorkflow(sessionId, config);
    },
    onMutate: async (next) => {
      if (sessionId === null) return { previous: undefined };
      const key = workflowConfigQueryKey(sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WorkflowConfig>(key);
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (sessionId === null) return;
      if (context?.previous !== undefined) {
        queryClient.setQueryData(workflowConfigQueryKey(sessionId), context.previous);
      }
    },
    onSuccess: (data) => {
      if (sessionId === null) return;
      queryClient.setQueryData(workflowConfigQueryKey(sessionId), data);
    },
  });
}
