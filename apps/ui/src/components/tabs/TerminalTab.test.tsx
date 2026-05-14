import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle, type ReactElement } from 'react';
import type {
  TeamFileName,
  WsClientEvent,
  WsSpecialistEvent,
} from '@my-team/shared/types';

import { TerminalTab } from './TerminalTab.js';
import { SessionSocketProvider } from '../SessionContext.js';
import type {
  SessionSocketSnapshot,
  UseSessionWebSocketResult,
} from '../../hooks/useSessionWebSocket.js';

// ── Mock the Terminal component so we can observe write/clear and fire
//    onData/onResize without dragging xterm.js into jsdom. ───────────────
interface MockTerminalApi {
  write: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  fireData: ((text: string) => void) | null;
  fireResize: ((cols: number, rows: number) => void) | null;
}
const mockTerm: MockTerminalApi = {
  write: vi.fn(),
  clear: vi.fn(),
  fireData: null,
  fireResize: null,
};

vi.mock('../Terminal.js', () => {
  const Terminal = forwardRef<
    unknown,
    {
      onData: (t: string) => void;
      onResize: (c: number, r: number) => void;
    }
  >(function MockTerminal(props, ref): ReactElement {
    mockTerm.fireData = props.onData;
    mockTerm.fireResize = props.onResize;
    useImperativeHandle(ref, () => ({
      write: mockTerm.write,
      clear: mockTerm.clear,
      size: () => ({ cols: 80, rows: 24 }),
    }));
    return <div data-testid="mock-xterm" />;
  });
  return { Terminal };
});

// ── Test fixtures ───────────────────────────────────────────────────────

function makeSnapshot(
  overrides: Partial<SessionSocketSnapshot> = {},
): SessionSocketSnapshot {
  return {
    state: null,
    output: null,
    teamFiles: {} as Partial<Record<TeamFileName, string>>,
    lastDiff: null,
    lastSpecialistEvent: null as WsSpecialistEvent | null,
    remoteUrl: null,
    status: 'open',
    ...overrides,
  };
}

function makeSocketValue(
  snapshot: SessionSocketSnapshot,
  send: (event: WsClientEvent) => void,
): UseSessionWebSocketResult {
  return { ...snapshot, send } as UseSessionWebSocketResult;
}

function Harness({
  snapshot,
  sendSpy,
}: {
  snapshot: SessionSocketSnapshot;
  sendSpy: (event: WsClientEvent) => void;
}): ReactElement {
  return (
    <SessionSocketProvider value={makeSocketValue(snapshot, sendSpy)}>
      <TerminalTab />
    </SessionSocketProvider>
  );
}

describe('TerminalTab', () => {
  beforeEach(() => {
    mockTerm.write.mockReset();
    mockTerm.clear.mockReset();
    mockTerm.fireData = null;
    mockTerm.fireResize = null;
  });

  it('renders the connection-status indicator with the correct color', () => {
    render(<Harness snapshot={makeSnapshot({ status: 'open' })} sendSpy={vi.fn()} />);
    const dot = screen.getByTestId('terminal-status');
    expect(dot.getAttribute('data-status')).toBe('open');
  });

  it('shows the empty state when status=connecting and no output yet', () => {
    render(
      <Harness
        snapshot={makeSnapshot({ status: 'connecting', output: null })}
        sendSpy={vi.fn()}
      />,
    );
    expect(screen.getByTestId('terminal-empty')).toBeInTheDocument();
  });

  it('writes new output frames into the terminal', () => {
    const sendSpy = vi.fn();
    const { rerender } = render(
      <Harness
        snapshot={makeSnapshot({ status: 'open', output: 'hello\n' })}
        sendSpy={sendSpy}
      />,
    );

    expect(mockTerm.write).toHaveBeenCalledWith('hello\n');

    // Same string identity → no double-write.
    rerender(
      <Harness
        snapshot={makeSnapshot({ status: 'open', output: 'hello\n' })}
        sendSpy={sendSpy}
      />,
    );
    expect(mockTerm.write).toHaveBeenCalledTimes(1);

    // New chunk → writes again.
    rerender(
      <Harness
        snapshot={makeSnapshot({ status: 'open', output: 'world\n' })}
        sendSpy={sendSpy}
      />,
    );
    expect(mockTerm.write).toHaveBeenCalledTimes(2);
    expect(mockTerm.write).toHaveBeenLastCalledWith('world\n');
  });

  it('forwards user input via socket.send({ type: "input" })', () => {
    const sendSpy = vi.fn();
    render(<Harness snapshot={makeSnapshot()} sendSpy={sendSpy} />);

    expect(mockTerm.fireData).not.toBeNull();
    mockTerm.fireData?.('a');
    expect(sendSpy).toHaveBeenCalledWith({ type: 'input', text: 'a' });
  });

  it('forwards grid resizes via socket.send({ type: "resize" })', () => {
    vi.useFakeTimers();
    try {
      const sendSpy = vi.fn();
      render(<Harness snapshot={makeSnapshot()} sendSpy={sendSpy} />);

      expect(mockTerm.fireResize).not.toBeNull();
      mockTerm.fireResize?.(120, 40);
      // Trailing debounce — advance past the window so the WS send fires.
      vi.advanceTimersByTime(20);
      expect(sendSpy).toHaveBeenCalledWith({ type: 'resize', cols: 120, rows: 40 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses a burst of resizes within 16ms into a single WS message', () => {
    vi.useFakeTimers();
    try {
      const sendSpy = vi.fn();
      render(<Harness snapshot={makeSnapshot()} sendSpy={sendSpy} />);
      expect(mockTerm.fireResize).not.toBeNull();

      // Three resizes inside the debounce window. The last one wins.
      mockTerm.fireResize?.(100, 30);
      vi.advanceTimersByTime(5);
      mockTerm.fireResize?.(110, 32);
      vi.advanceTimersByTime(5);
      mockTerm.fireResize?.(120, 40);

      // Within the trailing window: nothing has been sent yet.
      expect(sendSpy).not.toHaveBeenCalled();

      // After the trailing window elapses, exactly one send with the
      // final dimensions.
      vi.advanceTimersByTime(20);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith({ type: 'resize', cols: 120, rows: 40 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the terminal on closed → connecting transition', () => {
    const sendSpy = vi.fn();
    const { rerender } = render(
      <Harness snapshot={makeSnapshot({ status: 'closed' })} sendSpy={sendSpy} />,
    );
    expect(mockTerm.clear).not.toHaveBeenCalled();

    rerender(
      <Harness
        snapshot={makeSnapshot({ status: 'connecting' })}
        sendSpy={sendSpy}
      />,
    );
    expect(mockTerm.clear).toHaveBeenCalledTimes(1);
  });
});
