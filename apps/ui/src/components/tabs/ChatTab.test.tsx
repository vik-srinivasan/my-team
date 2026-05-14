import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { ChatTab } from './ChatTab.js';
import { SessionSocketProvider } from '../SessionContext.js';
import type { UseSessionWebSocketResult } from '../../hooks/useSessionWebSocket.js';
import { useUiStore } from '../../store.js';

// ── Mock `sendInput` so we can observe the wrapper call without HTTP. ──
const sendInputMock = vi.fn(async () => ({ ok: true }));
vi.mock('../../lib/api.js', () => ({
  sendInput: (...args: unknown[]) => sendInputMock(...args),
}));

function makeSocket(
  overrides: Partial<UseSessionWebSocketResult> = {},
): UseSessionWebSocketResult {
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

function wrap(
  socket: UseSessionWebSocketResult,
): (props: { children: ReactNode }) => ReactElement {
  return ({ children }) => (
    <SessionSocketProvider value={socket}>{children}</SessionSocketProvider>
  );
}

describe('ChatTab', () => {
  beforeEach(() => {
    sendInputMock.mockClear();
    // jsdom doesn't implement RAF — shim so autoscroll effect runs.
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown as number,
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    // Each test owns a clean store selection.
    useUiStore.setState({ selectedSessionId: 'sess-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    useUiStore.setState({ selectedSessionId: null, activeTab: 'chat' });
  });

  // ── (a) user message echoes locally on Send ──────────────────────────
  it('echoes the user message into history immediately on send', async () => {
    const Wrapper = wrap(makeSocket());
    render(
      <Wrapper>
        <ChatTab />
      </Wrapper>,
    );

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hello captain' } });

    const sendBtn = screen.getByTestId('chat-send');
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    expect(screen.getByText('hello captain')).toBeInTheDocument();
    expect(screen.getByTestId('chat-message-user')).toBeInTheDocument();
    expect(sendInputMock).toHaveBeenCalledTimes(1);
    expect(sendInputMock).toHaveBeenCalledWith('sess-1', 'hello captain\n');
    // The textarea clears after a successful submit.
    expect((screen.getByTestId('chat-input') as HTMLTextAreaElement).value).toBe('');
  });

  // ── (b) ANSI-stripped captain output appended to history ─────────────
  it('ANSI-strips captain output before rendering it', () => {
    const Wrapper = wrap(
      makeSocket({
        recentOutput: ['\x1b[31mred\x1b[0m hello'],
      }),
    );
    render(
      <Wrapper>
        <ChatTab />
      </Wrapper>,
    );

    expect(screen.getByText(/red hello/)).toBeInTheDocument();
    // Raw escape bytes must not survive.
    expect(screen.queryByText(/\x1b\[31m/)).toBeNull();
  });

  // ── (c) two output chunks within 2s are merged into one message ──────
  it('merges captain chunks that arrive within the 2s window into one message', () => {
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    const socket1 = makeSocket({ recentOutput: ['hello '] });
    const Wrapper1 = wrap(socket1);
    const view = render(
      <Wrapper1>
        <ChatTab />
      </Wrapper1>,
    );

    // Advance simulated clock by 500ms — well within the 2s merge window.
    now += 500;
    const socket2 = makeSocket({ recentOutput: ['hello ', 'world'] });
    const Wrapper2 = wrap(socket2);
    view.rerender(
      <Wrapper2>
        <ChatTab />
      </Wrapper2>,
    );

    expect(screen.getAllByTestId('chat-message-captain')).toHaveLength(1);
    expect(screen.getByTestId('chat-message-captain')).toHaveTextContent(
      'hello world',
    );

    spy.mockRestore();
  });

  // ── (d) two chunks separated by >2s create two messages ──────────────
  it('starts a new captain message when chunks are >2s apart', () => {
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    const view = render(
      <SessionSocketProvider value={makeSocket({ recentOutput: ['first turn'] })}>
        <ChatTab />
      </SessionSocketProvider>,
    );

    // Jump past the merge window so the next chunk forms a new turn.
    now += 3_000;

    view.rerender(
      <SessionSocketProvider
        value={makeSocket({ recentOutput: ['first turn', 'second turn'] })}
      >
        <ChatTab />
      </SessionSocketProvider>,
    );

    expect(screen.getAllByTestId('chat-message-captain')).toHaveLength(2);
    expect(screen.getAllByTestId('chat-message-captain')[0]).toHaveTextContent(
      'first turn',
    );
    expect(screen.getAllByTestId('chat-message-captain')[1]).toHaveTextContent(
      'second turn',
    );

    spy.mockRestore();
  });

  // ── (e) Send disabled when socket disconnected ───────────────────────
  it('disables the Send button when the socket is not open', () => {
    const Wrapper = wrap(makeSocket({ status: 'closed' }));
    render(
      <Wrapper>
        <ChatTab />
      </Wrapper>,
    );

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'will not go' } });

    const sendBtn = screen.getByTestId('chat-send') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  // ── (f) autoscroll behaviour ────────────────────────────────────────
  it('autoscrolls when the user is pinned to the bottom and skips when scrolled up', async () => {
    let scrollHeight = 1000;
    let clientHeight = 200;
    let scrollTop = 0;

    Object.defineProperty(HTMLDivElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeight;
      },
    });
    Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return clientHeight;
      },
    });
    Object.defineProperty(HTMLDivElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTop;
      },
      set(v: number) {
        scrollTop = v;
      },
    });

    // Start pinned to bottom: scrollTop + clientHeight === scrollHeight.
    scrollTop = scrollHeight - clientHeight; // 800

    const view = render(
      <SessionSocketProvider value={makeSocket({ recentOutput: ['first'] })}>
        <ChatTab />
      </SessionSocketProvider>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    // Pinned to bottom: effect pushed scrollTop to scrollHeight.
    expect(scrollTop).toBe(scrollHeight);

    // Now simulate user scrolling up well past the slack threshold.
    scrollTop = 100; // far from bottom (1000 - 100 - 200 = 700px from bottom)
    fireEvent.scroll(view.getByTestId('chat-scroll'));

    // A new captain chunk arrives — autoscroll should be suppressed.
    scrollHeight = 2000; // content grew
    view.rerender(
      <SessionSocketProvider
        value={makeSocket({ recentOutput: ['first', 'second'] })}
      >
        <ChatTab />
      </SessionSocketProvider>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    // scrollTop should NOT have been yanked to scrollHeight.
    expect(scrollTop).not.toBe(scrollHeight);
    expect(scrollTop).toBe(100);
    // The "jump to latest" affordance should be visible.
    expect(screen.getByTestId('chat-jump-latest')).toBeInTheDocument();

    // Clean up the prototype defineProperty stubs.
    await waitFor(() => {
      delete (HTMLDivElement.prototype as unknown as Record<string, unknown>)
        .scrollHeight;
      delete (HTMLDivElement.prototype as unknown as Record<string, unknown>)
        .clientHeight;
      delete (HTMLDivElement.prototype as unknown as Record<string, unknown>)
        .scrollTop;
    });
  });
});
