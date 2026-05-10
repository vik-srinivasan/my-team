import { useEffect, useRef, useCallback } from 'react';

import type { WsServerEvent, WsClientEvent } from '@viktown/shared';
import { useSessionStore } from '../store.js';

const RECONNECT_DELAY = 2000;
const STREAM_FINALIZE_DELAY = 2000;

// Strip ANSI escape sequences from PTY output for browser display
// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingMessageId = useRef<string | null>(null);
  const streamFinalizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addMessage = useSessionStore((s) => s.addMessage);
  const appendToMessage = useSessionStore((s) => s.appendToMessage);
  const setSessionState = useSessionStore((s) => s.setSessionState);
  const setTeamFile = useSessionStore((s) => s.setTeamFile);
  const setDiff = useSessionStore((s) => s.setDiff);
  const setRightTab = useSessionStore((s) => s.setRightTab);
  const setRemoteUrl = useSessionStore((s) => s.setRemoteUrl);

  const finalizeStream = useCallback(() => {
    streamingMessageId.current = null;
    if (streamFinalizeTimer.current) {
      clearTimeout(streamFinalizeTimer.current);
      streamFinalizeTimer.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/sessions/${sessionId}`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      const event = JSON.parse(evt.data as string) as WsServerEvent;

      switch (event.type) {
        case 'output': {
          // Strip ANSI escape sequences for browser display
          const cleaned = stripAnsi(event.text);
          if (!cleaned) break; // skip empty chunks (pure escape sequences)

          // Reset the finalize timer on each output chunk
          if (streamFinalizeTimer.current) clearTimeout(streamFinalizeTimer.current);

          if (streamingMessageId.current) {
            // Append to existing streaming message
            appendToMessage(streamingMessageId.current, cleaned);
          } else {
            // Start a new streaming message
            const id = crypto.randomUUID();
            streamingMessageId.current = id;
            addMessage({
              id,
              role: 'captain',
              text: cleaned,
              timestamp: new Date().toISOString(),
            });
          }

          // Finalize after 2s of silence
          streamFinalizeTimer.current = setTimeout(finalizeStream, STREAM_FINALIZE_DELAY);
          break;
        }

        case 'state':
          finalizeStream();
          setSessionState(event.state);
          // Auto-switch right tab based on phase
          if (event.state.phase === 'planning' || event.state.phase === 'awaiting_approval') {
            setRightTab('plan');
          } else if (event.state.phase === 'executing' || event.state.phase === 'reviewing') {
            setRightTab('diff');
          }
          break;

        case 'team_file':
          setTeamFile(event.file, event.content);
          break;

        case 'diff':
          setDiff(event.diff);
          break;

        case 'remote_url':
          setRemoteUrl(event.url);
          break;

        case 'specialist': {
          finalizeStream();
          const label = event.name.charAt(0).toUpperCase() + event.name.slice(1);
          const verb = event.status === 'started' ? 'started working' : 'finished';
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            text: `${label} ${verb}`,
            timestamp: new Date().toISOString(),
          });
          break;
        }
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId, addMessage, appendToMessage, setSessionState, setTeamFile, setDiff, setRightTab, setRemoteUrl, finalizeStream]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (streamFinalizeTimer.current) clearTimeout(streamFinalizeTimer.current);
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
