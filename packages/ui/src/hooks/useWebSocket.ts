import { useEffect, useRef, useCallback } from 'react';

import type { WsServerEvent, WsClientEvent } from '@viktown/shared';
import { useSessionStore } from '../store.js';

const RECONNECT_DELAY = 2000;

export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addMessage = useSessionStore((s) => s.addMessage);
  const setSessionState = useSessionStore((s) => s.setSessionState);
  const setTeamFile = useSessionStore((s) => s.setTeamFile);
  const setDiff = useSessionStore((s) => s.setDiff);

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/sessions/${sessionId}`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      const event = JSON.parse(evt.data as string) as WsServerEvent;

      switch (event.type) {
        case 'output':
          addMessage({
            id: crypto.randomUUID(),
            role: 'captain',
            text: event.text,
            timestamp: new Date().toISOString(),
          });
          break;

        case 'state':
          setSessionState(event.state);
          break;

        case 'team_file':
          setTeamFile(event.file, event.content);
          break;

        case 'diff':
          setDiff(event.diff);
          break;

        case 'specialist':
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            text: `${event.name} ${event.status}`,
            timestamp: new Date().toISOString(),
          });
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId, addMessage, setSessionState, setTeamFile, setDiff]);

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
