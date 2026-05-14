import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { AgentPromptResponse } from '@my-team/shared/types';

import {
  agentPromptQueryKey,
  useAgentPrompt,
  useAgentPromptMutation,
} from './useAgentPrompt.js';
import * as api from '../lib/api.js';

function makeWrapper(): {
  wrapper: (props: { children: ReactNode }) => ReturnType<typeof createElement>;
  client: QueryClient;
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { wrapper, client };
}

describe('useAgentPrompt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the named agent prompt when id + name are provided', async () => {
    const spy = vi.spyOn(api, 'getAgent').mockResolvedValue({
      name: 'engineer',
      content: '# Engineer\n',
      source: 'default',
    } satisfies AgentPromptResponse);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useAgentPrompt('s1', 'engineer'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(spy).toHaveBeenCalledWith('s1', 'engineer');
    expect(result.current.data?.content).toBe('# Engineer\n');
  });

  it('is disabled when sessionId is null', () => {
    const spy = vi.spyOn(api, 'getAgent').mockResolvedValue({
      name: 'engineer',
      content: '',
      source: 'default',
    });
    const { wrapper } = makeWrapper();

    renderHook(() => useAgentPrompt(null, 'engineer'), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('is disabled when name is null', () => {
    const spy = vi.spyOn(api, 'getAgent').mockResolvedValue({
      name: 'engineer',
      content: '',
      source: 'default',
    });
    const { wrapper } = makeWrapper();

    renderHook(() => useAgentPrompt('s1', null), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('exports a stable query-key builder', () => {
    expect(agentPromptQueryKey('s1', 'engineer')).toEqual(['agent', 's1', 'engineer']);
  });
});

describe('useAgentPromptMutation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls putAgent and seeds the prompt cache on success', async () => {
    const putSpy = vi.spyOn(api, 'putAgent').mockResolvedValue({
      name: 'engineer',
      content: '# Edited\n',
      source: 'session',
    });
    const { wrapper, client } = makeWrapper();

    const { result } = renderHook(() => useAgentPromptMutation('s1', 'engineer'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('# Edited\n');
    });

    expect(putSpy).toHaveBeenCalledWith('s1', 'engineer', '# Edited\n');

    const cached = client.getQueryData<AgentPromptResponse>(
      agentPromptQueryKey('s1', 'engineer'),
    );
    expect(cached?.content).toBe('# Edited\n');
    expect(cached?.source).toBe('session');
  });

  it('surfaces a failure via isError without seeding the cache', async () => {
    vi.spyOn(api, 'putAgent').mockRejectedValue(new Error('boom'));
    const { wrapper, client } = makeWrapper();

    const { result } = renderHook(() => useAgentPromptMutation('s1', 'engineer'), {
      wrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync('# Edited\n');
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      client.getQueryData(agentPromptQueryKey('s1', 'engineer')),
    ).toBeUndefined();
  });

  it('throws when called without sessionId or name', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentPromptMutation(null, null), {
      wrapper,
    });
    await expect(result.current.mutateAsync('# x')).rejects.toThrow(
      /without sessionId or name/,
    );
  });
});
