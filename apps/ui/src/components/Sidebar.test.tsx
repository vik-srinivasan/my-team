import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SessionSummary } from '@my-team/shared/types';

import { Sidebar } from './Sidebar.js';
import * as api from '../lib/api.js';
import { useUiStore } from '../store.js';

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'alpha-bay-01',
    title: 'baseline session',
    source_repo: '/Users/x/repo',
    phase: 'executing',
    active_specialist: null,
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    last_checkpoint: new Date().toISOString(),
    must_ask_count: 0,
    ...overrides,
  };
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('Sidebar', () => {
  beforeEach(() => {
    // Reset store between tests so the selected session leaks don't cross.
    useUiStore.setState({ selectedSessionId: null, activeTab: 'journal' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state when no sessions are returned', async () => {
    vi.spyOn(api, 'listSessions').mockResolvedValue([]);

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    expect(
      await screen.findByText(/No sessions yet\. Click \+ to create one\./i),
    ).toBeInTheDocument();
  });

  it('renders sessions sorted attention-first (blocked > must_ask > idle > done)', async () => {
    const sessions: SessionSummary[] = [
      makeSession({ id: 'idle-1', title: 'idle one', phase: 'executing' }),
      makeSession({
        id: 'done-1',
        title: 'finished',
        phase: 'done',
        active_specialist: null,
      }),
      makeSession({
        id: 'ask-1',
        title: 'needs input',
        phase: 'executing',
        must_ask_count: 2,
      }),
      makeSession({ id: 'blocked-1', title: 'oh no', phase: 'blocked' }),
    ];
    vi.spyOn(api, 'listSessions').mockResolvedValue(sessions);

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    const list = await screen.findByTestId('sidebar-list');
    await waitFor(() => {
      expect(within(list).getAllByRole('button').length).toBeGreaterThanOrEqual(4);
    });

    const buttons = within(list).getAllByRole('button');
    const ids = buttons.map((b) =>
      b.getAttribute('data-testid')?.replace('sidebar-item-', ''),
    );

    // Expected order: blocked → ask → idle/exec → done.
    expect(ids).toEqual(['blocked-1', 'ask-1', 'idle-1', 'done-1']);
  });

  it('renders phase color dots that reflect the effective phase', async () => {
    const sessions: SessionSummary[] = [
      makeSession({ id: 'p-exec', phase: 'executing', active_specialist: null }),
      makeSession({ id: 'p-done', phase: 'done', active_specialist: null }),
      makeSession({ id: 'p-block', phase: 'blocked', active_specialist: null }),
    ];
    vi.spyOn(api, 'listSessions').mockResolvedValue(sessions);

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    const list = await screen.findByTestId('sidebar-list');
    await waitFor(() => {
      expect(within(list).getAllByRole('button').length).toBeGreaterThanOrEqual(3);
    });

    const dots = within(list).getAllByTestId('phase-dot');
    const phases = dots.map((d) => d.getAttribute('data-phase'));
    expect(phases).toContain('executing');
    expect(phases).toContain('done');
    expect(phases).toContain('blocked');

    const execDot = dots.find((d) => d.getAttribute('data-phase') === 'executing');
    const doneDot = dots.find((d) => d.getAttribute('data-phase') === 'done');
    const blockDot = dots.find((d) => d.getAttribute('data-phase') === 'blocked');
    expect(execDot?.className).toContain('bg-yellow-400');
    expect(doneDot?.className).toContain('bg-green-500');
    expect(blockDot?.className).toContain('bg-red-500');
  });

  it('renders an ask badge when must_ask_count > 0', async () => {
    vi.spyOn(api, 'listSessions').mockResolvedValue([
      makeSession({ id: 'needsy', must_ask_count: 3 }),
    ]);

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    const badge = await screen.findByTestId('attention-badge');
    expect(badge).toHaveTextContent(/ask \(3\)/i);
  });

  it('filters the list as the user types in the search box', async () => {
    const sessions: SessionSummary[] = [
      makeSession({ id: 'alpha', title: 'first', source_repo: '/repos/foo' }),
      makeSession({ id: 'beta', title: 'second', source_repo: '/repos/bar' }),
      makeSession({ id: 'gamma', title: 'third login', source_repo: '/repos/baz' }),
    ];
    vi.spyOn(api, 'listSessions').mockResolvedValue(sessions);

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    // Wait for initial render.
    await screen.findByTestId('sidebar-item-alpha');

    const input = screen.getByLabelText(/search sessions/i);
    await userEvent.type(input, 'login');

    await waitFor(() => {
      expect(screen.queryByTestId('sidebar-item-alpha')).toBeNull();
      expect(screen.queryByTestId('sidebar-item-beta')).toBeNull();
      expect(screen.getByTestId('sidebar-item-gamma')).toBeInTheDocument();
    });
  });

  it('renders a red daemon-status row when the sessions query errors', async () => {
    vi.spyOn(api, 'listSessions').mockRejectedValue(new Error('boom'));

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    const status = await screen.findByTestId('daemon-status');
    await waitFor(() => {
      expect(status).toHaveAttribute('data-status', 'error');
    });
    expect(status).toHaveTextContent(/Wrapper daemon unreachable/i);
    // `team start` should render inside a <code> element, not as backtick body type.
    expect(within(status).getByText('team start').tagName).toBe('CODE');
  });

  it('still shows the empty-state hint when the daemon is down (no sessions to render)', async () => {
    vi.spyOn(api, 'listSessions').mockRejectedValue(new Error('boom'));

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    // The empty-state copy lives next to the error row now, not as a replacement.
    expect(
      await screen.findByText(/No sessions yet\. Click \+ to create one\./i),
    ).toBeInTheDocument();
  });

  it('renders a green daemon-status row when sessions load successfully', async () => {
    vi.spyOn(api, 'listSessions').mockResolvedValue([]);

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    const status = await screen.findByTestId('daemon-status');
    await waitFor(() => {
      expect(status).toHaveAttribute('data-status', 'connected');
    });
    expect(status).toHaveTextContent(/Daemon connected/i);
  });

  it('clicking a session item sets the global selected id', async () => {
    vi.spyOn(api, 'listSessions').mockResolvedValue([
      makeSession({ id: 'click-me', title: 'click target' }),
    ]);

    render(
      <Providers>
        <Sidebar />
      </Providers>,
    );

    const item = await screen.findByTestId('sidebar-item-click-me');
    await userEvent.click(item);

    expect(useUiStore.getState().selectedSessionId).toBe('click-me');
  });
});
