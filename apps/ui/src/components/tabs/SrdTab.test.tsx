import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

import { SrdTab } from './SrdTab.js';
import { useUiStore } from '../../store.js';

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}

function withQuery(children: ReactNode, client: QueryClient): ReactElement {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('SrdTab', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedSessionId: 'sess-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({ selectedSessionId: null });
  });

  it('renders the empty-state when the SRD is missing (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'not found', code: 'NOT_FOUND' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    render(withQuery(<SrdTab />, makeClient()));

    await waitFor(() => {
      expect(screen.getByText(/No SRD yet/i)).toBeInTheDocument();
    });
  });

  it('renders the SRD markdown body returned by the wrapper', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('# Session Requirements Doc\n\nbody text here', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          }),
      ),
    );

    render(withQuery(<SrdTab />, makeClient()));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Session Requirements Doc' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('body text here')).toBeInTheDocument();
  });
});
