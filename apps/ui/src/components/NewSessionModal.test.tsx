import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  describe('chrome', () => {
    beforeEach(() => {
      vi.spyOn(api, 'getRecents').mockResolvedValue(recents([]));
    });

    it('Create button is the filled primary; Cancel is ghost/outline', async () => {
      render(
        <Providers>
          <NewSessionModal onClose={vi.fn()} onCreated={vi.fn()} />
        </Providers>,
      );

      const cancel = await screen.findByRole('button', { name: /^Cancel$/i });
      const create = await screen.findByRole('button', { name: /^Create$/i });

      // Create gets the filled visual treatment (white-on-dark).
      expect(create.className).toMatch(/bg-neutral-100/);
      expect(create.className).toMatch(/text-neutral-900/);
      // Cancel gets the outlined/ghost visual treatment (border + transparent).
      expect(cancel.className).toMatch(/border-neutral-7/);
      expect(cancel.className).toMatch(/bg-transparent/);
      expect(cancel.className).not.toMatch(/bg-neutral-100/);
    });

    it('renders a top-right × close button that fires onClose', async () => {
      const onClose = vi.fn();

      render(
        <Providers>
          <NewSessionModal onClose={onClose} onCreated={vi.fn()} />
        </Providers>,
      );

      const close = await screen.findByRole('button', { name: /Close/i });
      await userEvent.click(close);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('backdrop click still triggers onClose (regression on the close-affordance work)', async () => {
      const onClose = vi.fn();

      render(
        <Providers>
          <NewSessionModal onClose={onClose} onCreated={vi.fn()} />
        </Providers>,
      );

      // The outer dialog div is the backdrop layer.
      const backdrop = await screen.findByRole('dialog');
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
