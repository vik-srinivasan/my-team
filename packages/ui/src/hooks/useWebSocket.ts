import { useEffect, useRef, useCallback } from 'react';

import type {
  WsServerEvent,
  WsClientEvent,
  SessionState,
  TeamFileName,
} from '@my-team/shared';
import { useSessionStore } from '../store.js';

const RECONNECT_DELAY = 2000;

/**
 * Handlers fired by {@link routeServerEvent}. Kept as a small, pure
 * interface so the routing logic is unit-testable without React.
 */
export interface WsEventHandlers {
  writeOutput: (text: string) => void;
  setTeamFile: (name: TeamFileName, content: string) => void;
  setSessionState: (state: SessionState) => void;
  setRemoteUrl: (url: string) => void;
}

/**
 * Pure dispatch over the discriminated server-event union. Extracted from
 * the hook so the routing rules can be tested without spinning up React.
 */
export function routeServerEvent(
  event: WsServerEvent,
  handlers: WsEventHandlers,
): void {
  switch (event.type) {
    case 'output':
      handlers.writeOutput(event.text);
      return;
    case 'team_file':
      handlers.setTeamFile(event.name, event.content);
      return;
    case 'state':
      handlers.setSessionState(event.state);
      return;
    case 'remote_url':
      handlers.setRemoteUrl(event.url);
      return;
    // `specialist` and `diff` events are not surfaced in the UI yet.
    default:
      return;
  }
}

/**
 * Subscribes to the session WebSocket for `sessionId`.
 *
 * - `output` events stream raw PTY bytes straight into the provided
 *   terminal `write` callback. No ANSI stripping, no per-line filtering —
 *   xterm.js handles cursor movement, CR, SGR, etc. natively.
 * - `team_file` events update the live artifact panes in the store.
 * - `state` and `remote_url` events update session metadata.
 */
export function useWebSocket(
  sessionId: string | null,
  writeToTerminal: (text: string) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the write callback in a ref so reconnects don't fire when the
  // parent re-renders with a new function identity.
  const writeRef = useRef(writeToTerminal);
  writeRef.current = writeToTerminal;

  const setSessionState = useSessionStore((s) => s.setSessionState);
  const setRemoteUrl = useSessionStore((s) => s.setRemoteUrl);
  const setTeamFile = useSessionStore((s) => s.setTeamFile);

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/sessions/${sessionId}`,
    );
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      const event = JSON.parse(evt.data as string) as WsServerEvent;
      routeServerEvent(event, {
        writeOutput: (text) => writeRef.current(text),
        setTeamFile,
        setSessionState,
        setRemoteUrl,
      });
    };

    ws.onclose = () => {
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId, setSessionState, setRemoteUrl, setTeamFile]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((event: WsClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  return { send };
}
