import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { RecentReposResponse } from '@my-team/shared/types';

import { NewSessionModal } from './NewSessionModal.js';
import * as api from '../lib/api.js';

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function recents(repos: RecentReposResponse['repos']): RecentReposResponse {
  return { repos };
}

describe('NewSessionModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('recents query — success path', () => {
    beforeEach(() => {
      vi.spyOn(api, 'getRecents').mockResolvedValue(
        recents([
          {
            path: '/Users/x/code/foo',
            basename: 'foo',
            last_used: new Date().toISOString(),
            session_count: 3,
          },
          {
            path: '/Users/x/code/bar',
            basename: 'bar',
            last_used: new Date().toISOString(),
            session_count: 1,
          },
        ]),
      );
    });

    it('defaults the repo select to the most-recently-used repo', async () => {
      render(
        <Providers>
          <NewSessionModal onClose={vi.fn()} onCreated={vi.fn()} />
        </Providers>,
      );

      const select = (await screen.findByTestId('repo-select')) as HTMLSelectElement;
      await waitFor(() => {
        expect(select.value).toBe('/Users/x/code/foo');
      });
      expect(select).toHaveAttribute('data-recents-state', 'ready');
    });

    it('lists every recent repo plus the "paste path" option', async () => {
      render(
        <Providers>
          <NewSessionModal onClose={vi.fn()} onCreated={vi.fn()} />
        </Providers>,
      );

      const select = (await screen.findByTestId('repo-select')) as HTMLSelectElement;
      await waitFor(() => {
        const values = Array.from(select.options).map((o) => o.value);
        expect(values).toContain('/Users/x/code/foo');
        expect(values).toContain('/Users/x/code/bar');
        expect(values).toContain('__custom__');
      });
    });
  });

  describe('recents query — error path', () => {
    beforeEach(() => {
      vi.spyOn(api, 'getRecents').mockRejectedValue(new Error('daemon down'));
    });

    it('auto-flips the select to "Paste path…" and surfaces a disabled fallback option', async () => {
      render(
        <Providers>
          <NewSessionModal onClose={vi.fn()} onCreated={vi.fn()} />
        </Providers>,
      );

      const select = (await screen.findByTestId('repo-select')) as HTMLSelectElement;
      await waitFor(() => {
        expect(select).toHaveAttribute('data-recents-state', 'error');
      });
      // Auto-flipped to the custom path option.
      await waitFor(() => {
        expect(select.value).toBe('__custom__');
      });
      // Disabled fallback option is rendered alongside.
      expect(
        screen.getByRole('option', {
          name: /Recents unavailable — paste a path below/i,
        }),
      ).toBeDisabled();
      // Caption explains the fallback to the user.
      expect(screen.getByTestId('recents-error')).toBeInTheDocument();
    });

    it('focuses the path-override input so the user can type immediately', async () => {
      render(
        <Providers>
          <NewSessionModal onClose={vi.fn()} onCreated={vi.fn()} />
        </Providers>,
      );

      const input = await screen.findByTestId('repo-override-input');
      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
    });
  });

});
