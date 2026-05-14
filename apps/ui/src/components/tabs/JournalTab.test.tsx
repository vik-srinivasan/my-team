import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { JournalTab } from './JournalTab.js';
import { SessionSocketProvider } from '../SessionContext.js';
import type { UseSessionWebSocketResult } from '../../hooks/useSessionWebSocket.js';

function makeSocket(overrides: Partial<UseSessionWebSocketResult> = {}): UseSessionWebSocketResult {
  return {
    state: null,
    output: null,
    recentOutput: [],
    teamFiles: {},
    lastDiff: null,
    lastSpecialistEvent: null,
    remoteUrl: null,
    status: 'open',
    send: () => {},
    ...overrides,
  };
}

function wrap(socket: UseSessionWebSocketResult): (props: { children: ReactNode }) => ReactElement {
  return ({ children }) => (
    <SessionSocketProvider value={socket}>{children}</SessionSocketProvider>
  );
}

describe('JournalTab', () => {
  beforeEach(() => {
    // jsdom doesn't implement RAF — shim so the auto-scroll effect runs.
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown as number,
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the empty state when no journal content has streamed yet', () => {
    const Wrapper = wrap(makeSocket());
    render(
      <Wrapper>
        <JournalTab />
      </Wrapper>,
    );

    expect(screen.getByText(/No journal entries yet/i)).toBeInTheDocument();
  });

  it('renders markdown content from teamFiles.journal', () => {
    const Wrapper = wrap(
      makeSocket({
        teamFiles: {
          journal: '## 2026-05-14T06:00:00Z — engineer\n\nCompleted: first thing.',
        },
      }),
    );

    render(
      <Wrapper>
        <JournalTab />
      </Wrapper>,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: /2026-05-14T06:00:00Z — engineer/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Completed: first thing\./)).toBeInTheDocument();
  });

  it('auto-scrolls the scroll container to the bottom when content updates', async () => {
    // Force scrollHeight via a getter override so jsdom returns a non-zero
    // value (it's normally 0). scrollTop is a plain field on HTMLElement so
    // we can read it back after the rAF fires.
    Object.defineProperty(HTMLDivElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 1234;
      },
    });

    const Wrapper = wrap(
      makeSocket({ teamFiles: { journal: '## entry one\n\nbody' } }),
    );

    const view = render(
      <Wrapper>
        <JournalTab />
      </Wrapper>,
    );

    // Wait for the rAF-deferred scrollTop assignment.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const scroll = view.getByTestId('journal-scroll');
    expect(scroll.scrollTop).toBe(1234);

    // Re-render with more content; scrollTop should pin to bottom again.
    Object.defineProperty(HTMLDivElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 9999;
      },
    });
    const Wrapper2 = wrap(
      makeSocket({
        teamFiles: { journal: '## entry one\n\nbody\n\n## entry two\n\nmore body' },
      }),
    );
    view.rerender(
      <Wrapper2>
        <JournalTab />
      </Wrapper2>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(view.getByTestId('journal-scroll').scrollTop).toBe(9999);
  });
});
