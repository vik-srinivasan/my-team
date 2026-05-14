import { useCallback, useEffect, useRef, type ReactElement } from 'react';

import { useSessionSocket } from '../SessionContext.js';
import { Terminal, type TerminalHandle } from '../Terminal.js';

/**
 * Trailing window for batching xterm resize WS sends. xterm's FitAddon
 * + ResizeObserver can fire `onResize` dozens of times during a single
 * window drag, and each one would otherwise become an independent WS
 * frame to the wrapper. 16ms ≈ one animation frame — long enough to
 * collapse a drag into a single message, short enough to feel instant.
 */
const RESIZE_DEBOUNCE_MS = 16;

const STATUS_LABEL: Record<'connecting' | 'open' | 'closed', string> = {
  connecting: 'Connecting',
  open: 'Connected',
  closed: 'Disconnected',
};

const STATUS_DOT_CLASS: Record<'connecting' | 'open' | 'closed', string> = {
  connecting: 'bg-amber-400',
  open: 'bg-green-500',
  closed: 'bg-red-500',
};

/**
 * Terminal tab — bidirectional bridge between the xterm.js view and the
 * wrapper's `ws://127.0.0.1:3001/ws/sessions/:id` socket.
 *
 * Data flow:
 *   wrapper → `output` event → `terminalRef.write(text)` (xterm renders ANSI)
 *   user keystroke → `onData` → `socket.send({ type: 'input', text })`
 *   grid resize → `onResize` → `socket.send({ type: 'resize', cols, rows })`
 *
 * The status dot in the top-right mirrors the socket status: amber while
 * connecting / reconnecting, green when open, red after the helper has
 * given up (which today never happens — the helper retries forever).
 */
export function TerminalTab(): ReactElement {
  const socket = useSessionSocket();
  const terminalRef = useRef<TerminalHandle | null>(null);
  /**
   * We track the latest output frame the terminal has already written so a
   * mid-mount re-render (e.g. status flip) doesn't re-write the same chunk
   * twice. The reducer hands out the same string identity until the next
   * frame, so a strict-reference compare is enough.
   */
  const lastWrittenOutput = useRef<string | null>(null);

  const handleData = useCallback(
    (text: string): void => {
      socket.send({ type: 'input', text });
    },
    [socket],
  );

  // Trailing-debounced resize: a single window drag fires onResize dozens
  // of times via FitAddon + ResizeObserver. We collapse them into one WS
  // frame per ~16ms window so the wrapper isn't flooded with no-op resizes.
  // The last (cols, rows) wins, which is what we want — only the final
  // dimensions matter.
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const handleResize = useCallback(
    (cols: number, rows: number): void => {
      pendingResizeRef.current = { cols, rows };
      if (resizeTimerRef.current !== null) return;
      resizeTimerRef.current = setTimeout(() => {
        resizeTimerRef.current = null;
        const pending = pendingResizeRef.current;
        pendingResizeRef.current = null;
        if (pending === null) return;
        socket.send({ type: 'resize', cols: pending.cols, rows: pending.rows });
      }, RESIZE_DEBOUNCE_MS);
    },
    [socket],
  );

  // Clear any pending resize on unmount so we don't fire into a dead socket.
  useEffect(() => {
    return () => {
      if (resizeTimerRef.current !== null) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      pendingResizeRef.current = null;
    };
  }, []);

  // Pipe new `output` frames into xterm. The reducer in
  // `useSessionWebSocket` exposes only the latest chunk; that's fine for
  // the terminal because every chunk is written exactly once and xterm
  // owns the full backlog from there.
  useEffect(() => {
    const next = socket.output;
    if (next === null) return;
    if (next === lastWrittenOutput.current) return;
    lastWrittenOutput.current = next;
    terminalRef.current?.write(next);
  }, [socket.output]);

  // When the socket reconnects (status: closed → connecting → open), the
  // wrapper re-emits its initial `team_file`/`state` events but does NOT
  // replay the historical PTY backlog. Clear the terminal so the user sees
  // a clean slate rather than the pre-disconnect frame frozen on screen.
  const lastStatus = useRef(socket.status);
  useEffect(() => {
    const prev = lastStatus.current;
    lastStatus.current = socket.status;
    if (prev === 'closed' && socket.status === 'connecting') {
      terminalRef.current?.clear();
      lastWrittenOutput.current = null;
    }
  }, [socket.status]);

  return (
    <div className="relative w-full h-full bg-[#0a0a0a]">
      <Terminal ref={terminalRef} onData={handleData} onResize={handleResize} />

      <div
        data-testid="terminal-status"
        data-status={socket.status}
        aria-live="polite"
        title={STATUS_LABEL[socket.status]}
        className="absolute top-2 right-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-neutral-400 bg-neutral-900/80 backdrop-blur px-1.5 py-0.5 rounded-sm border border-neutral-800 pointer-events-none"
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT_CLASS[socket.status]}`}
        />
        {STATUS_LABEL[socket.status]}
      </div>

      {socket.status === 'connecting' && socket.output === null ? (
        <div
          data-testid="terminal-empty"
          className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm pointer-events-none"
        >
          Connecting to session…
        </div>
      ) : null}
    </div>
  );
}
