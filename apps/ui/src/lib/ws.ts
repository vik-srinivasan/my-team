import type { WsClientEvent, WsServerEvent } from '@my-team/shared/types';

/**
 * Base WebSocket URL for the wrapper daemon. Sibling to `API_BASE` in
 * `./api.ts` — the wrapper exposes `ws://127.0.0.1:3001/ws/sessions/:id`
 * for both Tauri and the web fallback.
 */
export const WS_BASE = 'ws://127.0.0.1:3001';

/**
 * Typed callbacks for every variant of `WsServerEvent`. All are optional so
 * tabs can subscribe to just the events they care about.
 */
export interface SessionSocketHandlers {
  onOutput?: (text: string) => void;
  onState?: (state: import('@my-team/shared/types').SessionState) => void;
  onTeamFile?: (
    name: import('@my-team/shared/types').TeamFileName,
    content: string,
  ) => void;
  onDiff?: (diff: string) => void;
  onSpecialist?: (event: import('@my-team/shared/types').WsSpecialistEvent) => void;
  onRemoteUrl?: (url: string) => void;
  /**
   * Fired whenever the underlying socket transitions: `connecting`,
   * `open`, `closed`. Reconnect timing is the helper's responsibility;
   * callers just observe state.
   */
  onStatus?: (status: SessionSocketStatus) => void;
  /** Fired on a clean unmount-style close; reconnect will NOT be attempted. */
  onClose?: () => void;
  /** Fired when the socket errors out or when malformed JSON is received. */
  onError?: (err: Error) => void;
}

export type SessionSocketStatus = 'connecting' | 'open' | 'closed';

/**
 * Public shape returned by `connectSessionSocket`. The underlying
 * `WebSocket` is intentionally hidden so callers can't accidentally
 * `close()` it without going through the helper (which would clobber
 * reconnect bookkeeping).
 */
export interface SessionSocket {
  /** Send a typed client → server event. Buffers silently if not yet open. */
  send(event: WsClientEvent): void;
  /** Permanently close the socket and cancel any pending reconnect. */
  close(): void;
  /** Snapshot of the current connection status. */
  readonly status: SessionSocketStatus;
}

interface ReconnectConfig {
  initialDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RECONNECT: ReconnectConfig = {
  initialDelayMs: 250,
  maxDelayMs: 4000,
};

/**
 * Opens a WebSocket against `ws://127.0.0.1:3001/ws/sessions/:id`,
 * decoding each frame into a typed `WsServerEvent` and dispatching to the
 * matching `handlers.on*` callback.
 *
 * Reconnect policy: on any close that wasn't initiated by `close()`, retry
 * with exponential backoff capped at 4s (250ms → 500ms → 1s → 2s → 4s →
 * 4s …). Each successful open resets the backoff.
 *
 * Callers should hold the returned `SessionSocket` for the lifetime of the
 * component that owns the session view and call `close()` on unmount.
 */
export function connectSessionSocket(
  id: string,
  handlers: SessionSocketHandlers,
  config: ReconnectConfig = DEFAULT_RECONNECT,
): SessionSocket {
  let socket: WebSocket | null = null;
  let status: SessionSocketStatus = 'connecting';
  let closedByCaller = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Frames queued while the socket isn't yet open. */
  const sendQueue: string[] = [];

  function setStatus(next: SessionSocketStatus): void {
    status = next;
    handlers.onStatus?.(next);
  }

  function scheduleReconnect(): void {
    if (closedByCaller) return;
    const exp = Math.min(reconnectAttempts, 4); // cap doubling at 2^4 = 16x
    const delay = Math.min(config.initialDelayMs * 2 ** exp, config.maxDelayMs);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  function dispatch(event: WsServerEvent): void {
    switch (event.type) {
      case 'output':
        handlers.onOutput?.(event.text);
        break;
      case 'state':
        handlers.onState?.(event.state);
        break;
      case 'team_file':
        handlers.onTeamFile?.(event.name, event.content);
        break;
      case 'diff':
        handlers.onDiff?.(event.diff);
        break;
      case 'specialist':
        handlers.onSpecialist?.(event);
        break;
      case 'remote_url':
        handlers.onRemoteUrl?.(event.url);
        break;
    }
  }

  function open(): void {
    if (closedByCaller) return;
    setStatus('connecting');
    const ws = new WebSocket(`${WS_BASE}/ws/sessions/${id}`);
    socket = ws;

    ws.addEventListener('open', () => {
      reconnectAttempts = 0;
      setStatus('open');
      // Flush anything that was queued before connect.
      while (sendQueue.length > 0) {
        const frame = sendQueue.shift();
        if (frame !== undefined) ws.send(frame);
      }
    });

    ws.addEventListener('message', (evt: MessageEvent) => {
      let parsed: WsServerEvent;
      try {
        parsed = JSON.parse(String(evt.data)) as WsServerEvent;
      } catch (err) {
        handlers.onError?.(
          err instanceof Error ? err : new Error('Malformed WebSocket frame'),
        );
        return;
      }
      dispatch(parsed);
    });

    ws.addEventListener('error', () => {
      handlers.onError?.(new Error(`WebSocket error for session ${id}`));
    });

    ws.addEventListener('close', () => {
      setStatus('closed');
      socket = null;
      if (closedByCaller) {
        handlers.onClose?.();
        return;
      }
      scheduleReconnect();
    });
  }

  open();

  return {
    send(event: WsClientEvent): void {
      const frame = JSON.stringify(event);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
      } else {
        sendQueue.push(frame);
      }
    },
    close(): void {
      closedByCaller = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        socket.close();
        socket = null;
      }
      setStatus('closed');
    },
    get status() {
      return status;
    },
  };
}
