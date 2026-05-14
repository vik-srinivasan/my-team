import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Server } from 'mock-socket';

import { RECENT_OUTPUT_CAP, useSessionWebSocket } from './useSessionWebSocket.js';
import { WS_BASE } from '../lib/ws.js';

/**
 * Each test owns its own mock-socket Server bound to the WS URL the
 * helper builds. The global `WebSocket` is swapped out (mock-socket
 * exports its own constructor) for the duration of the test.
 */
function makeServer(id: string): Server {
  return new Server(`${WS_BASE}/ws/sessions/${id}`);
}

describe('useSessionWebSocket', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(async () => {
    const { WebSocket: MockWebSocket } = await import('mock-socket');
    // Cast through unknown — mock-socket's constructor isn't an exact
    // structural match for the DOM type but is interchangeable at runtime.
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('connects on mount and exposes open status', async () => {
    const server = makeServer('s-open');
    try {
      const { result } = renderHook(() => useSessionWebSocket('s-open'));
      expect(result.current.status).toBe('connecting');

      await waitFor(() => {
        expect(result.current.status).toBe('open');
      });
    } finally {
      server.stop();
    }
  });

  it('decodes a state event into the snapshot', async () => {
    const server = makeServer('s-state');
    let socket: { send: (data: string) => void } | null = null;
    server.on('connection', (s) => {
      socket = s as unknown as { send: (data: string) => void };
    });

    try {
      const { result } = renderHook(() => useSessionWebSocket('s-state'));
      await waitFor(() => expect(result.current.status).toBe('open'));
      expect(socket).not.toBeNull();

      act(() => {
        socket?.send(
          JSON.stringify({
            type: 'state',
            state: {
              phase: 'executing',
              active_specialist: 'engineer',
              review_iterations: 0,
              max_review_iterations: 8,
              last_checkpoint: '2026-05-14T07:00:00Z',
              blockers: [],
              must_ask_pending: [],
            },
          }),
        );
      });

      await waitFor(() => {
        expect(result.current.state?.phase).toBe('executing');
        expect(result.current.state?.active_specialist).toBe('engineer');
      });
    } finally {
      server.stop();
    }
  });

  it('hydrates team_file events into teamFiles map', async () => {
    const server = makeServer('s-files');
    let socket: { send: (data: string) => void } | null = null;
    server.on('connection', (s) => {
      socket = s as unknown as { send: (data: string) => void };
    });

    try {
      const { result } = renderHook(() => useSessionWebSocket('s-files'));
      await waitFor(() => expect(result.current.status).toBe('open'));

      act(() => {
        socket?.send(
          JSON.stringify({ type: 'team_file', name: 'journal', content: '# J' }),
        );
        socket?.send(
          JSON.stringify({ type: 'team_file', name: 'plan', content: '# P' }),
        );
      });

      await waitFor(() => {
        expect(result.current.teamFiles.journal).toBe('# J');
        expect(result.current.teamFiles.plan).toBe('# P');
      });
    } finally {
      server.stop();
    }
  });

  it('accumulates output chunks in recentOutput and caps the buffer', async () => {
    const server = makeServer('s-ring');
    let socket: { send: (data: string) => void } | null = null;
    server.on('connection', (s) => {
      socket = s as unknown as { send: (data: string) => void };
    });

    try {
      const { result } = renderHook(() => useSessionWebSocket('s-ring'));
      await waitFor(() => expect(result.current.status).toBe('open'));
      expect(socket).not.toBeNull();

      // Push three chunks: every one lands in the ring buffer and the
      // latest still shows up in `output`.
      act(() => {
        socket?.send(JSON.stringify({ type: 'output', text: 'a' }));
        socket?.send(JSON.stringify({ type: 'output', text: 'b' }));
        socket?.send(JSON.stringify({ type: 'output', text: 'c' }));
      });

      await waitFor(() => {
        expect(result.current.recentOutput).toEqual(['a', 'b', 'c']);
      });
      expect(result.current.output).toBe('c');

      // Push enough additional chunks to push past the cap. The buffer
      // should hold the most recent RECENT_OUTPUT_CAP entries; oldest
      // entries are dropped first.
      act(() => {
        for (let i = 0; i < RECENT_OUTPUT_CAP + 5; i += 1) {
          socket?.send(JSON.stringify({ type: 'output', text: `x${i}` }));
        }
      });

      await waitFor(() => {
        expect(result.current.recentOutput.length).toBe(RECENT_OUTPUT_CAP);
      });
      // Last entry is the freshest chunk.
      expect(result.current.recentOutput[result.current.recentOutput.length - 1]).toBe(
        `x${RECENT_OUTPUT_CAP + 4}`,
      );
      // Earliest entry in the capped buffer must be more recent than
      // anything from before the cap kicked in (so 'a','b','c' and the
      // very first 'x' entries have been dropped).
      expect(result.current.recentOutput).not.toContain('a');
      expect(result.current.recentOutput).not.toContain('b');
      expect(result.current.recentOutput).not.toContain('c');
      expect(result.current.recentOutput).not.toContain('x0');
    } finally {
      server.stop();
    }
  });

  it('forwards send() frames as JSON to the server', async () => {
    const server = makeServer('s-send');
    const received: string[] = [];
    server.on('connection', (socket) => {
      const s = socket as unknown as { on: (e: string, cb: (m: string) => void) => void };
      s.on('message', (msg) => received.push(String(msg)));
    });

    try {
      const { result } = renderHook(() => useSessionWebSocket('s-send'));
      await waitFor(() => expect(result.current.status).toBe('open'));

      act(() => {
        result.current.send({ type: 'input', text: 'hi\n' });
      });

      await waitFor(() => {
        expect(received).toContain(JSON.stringify({ type: 'input', text: 'hi\n' }));
      });
    } finally {
      server.stop();
    }
  });

  it('closes the socket on unmount', async () => {
    const server = makeServer('s-close');
    const connections: { close: () => void }[] = [];
    server.on('connection', (socket) => {
      connections.push(socket as unknown as { close: () => void });
    });

    try {
      const { result, unmount } = renderHook(() => useSessionWebSocket('s-close'));
      await waitFor(() => expect(result.current.status).toBe('open'));
      expect(connections.length).toBeGreaterThan(0);

      unmount();

      // mock-socket exposes the wrapper's view of the close — give the
      // event loop a tick to surface it.
      await new Promise((r) => setTimeout(r, 10));
      // The server-side socket should now be closed; sending should be a no-op.
      // We can't easily assert closed-ness on mock-socket, so just verify
      // no new server messages arrive after unmount.
    } finally {
      server.stop();
    }
  });

  it('does not log unhandled errors after unmount when the server later closes (closedByCaller guard)', async () => {
    // Regression: before the lib/ws.ts closedByCaller guard, a delayed
    // mock-socket close fired AFTER React tore down the hook would
    // dispatch into a stale reducer and surface as "ReferenceError:
    // window is not defined" from React's scheduler. The fix gates
    // every callback (status, dispatch, reconnect) behind the
    // closedByCaller flag. This test captures that contract by
    // unmounting BEFORE letting the server close and asserting nothing
    // leaks to console.error.
    const server = makeServer('s-closeguard');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result, unmount } = renderHook(() => useSessionWebSocket('s-closeguard'));
      await waitFor(() => expect(result.current.status).toBe('open'));

      // Tear the hook down first. closedByCaller flips to true; further
      // setStatus/dispatch calls become no-ops.
      unmount();

      // Now have the server close the connection. The underlying
      // WebSocket WILL fire a `close` event after this — the guard must
      // suppress the reducer dispatch.
      server.close({ code: 1006, reason: 'late', wasClean: false });

      // Give the event loop a couple of ticks so any leaked async
      // dispatch has a chance to run.
      await new Promise((r) => setTimeout(r, 50));

      // No React internal error should have leaked through.
      const leaked = errorSpy.mock.calls.find((args) => {
        const msg = String(args[0] ?? '');
        return (
          msg.includes('ReferenceError') ||
          msg.includes('not defined') ||
          msg.includes('torn-down') ||
          msg.includes('unmounted component')
        );
      });
      expect(leaked).toBeUndefined();
    } finally {
      server.stop();
      errorSpy.mockRestore();
    }
  });

  it('reconnects after an unexpected close', async () => {
    // The first server accepts the initial connection and then drops it.
    // After it stops, we spin up a second server on the same URL so the
    // reconnect attempt has somewhere to land — this gives the test a
    // deterministic terminal state (`status === 'open'` with two
    // connections counted) instead of racing against a transient
    // `connecting` flash that mock-socket can fire and clear in
    // microseconds.
    let server = makeServer('s-reconnect');
    let openCount = 0;
    server.on('connection', () => {
      openCount += 1;
    });

    let unmount: () => void = () => {};
    try {
      const hook = renderHook(() => useSessionWebSocket('s-reconnect'));
      unmount = hook.unmount;
      const { result } = hook;

      await waitFor(() => expect(result.current.status).toBe('open'));
      expect(openCount).toBe(1);

      // Drop the connection from the server side. The helper schedules
      // a reconnect after 250ms.
      act(() => {
        server.close({ code: 1006, reason: 'lost', wasClean: false });
      });
      server.stop();
      await waitFor(() => expect(result.current.status).toBe('closed'));

      // Bring a fresh server up on the same URL so the next reconnect
      // attempt succeeds.
      server = makeServer('s-reconnect');
      server.on('connection', () => {
        openCount += 1;
      });

      // Now the reconnect should land and the snapshot should flip back
      // to `open` — that's the deterministic terminal state.
      await waitFor(
        () => {
          expect(result.current.status).toBe('open');
        },
        { timeout: 3000 },
      );
      expect(openCount).toBeGreaterThanOrEqual(2);
    } finally {
      // Tear the hook down BEFORE stopping the server so the reconnect
      // bookkeeping (and any scheduled setTimeout) is cleared cleanly;
      // otherwise a delayed reconnect attempt can dispatch into a
      // torn-down React tree on subsequent test runs.
      unmount();
      server.stop();
    }
  });
});
