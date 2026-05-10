import { useEffect, useRef, useCallback } from 'react';

import type { WsServerEvent, WsClientEvent } from '@viktown/shared';
import { useSessionStore } from '../store.js';

const RECONNECT_DELAY = 2000;
const STREAM_FINALIZE_DELAY = 3000;

/**
 * Aggressively strip all terminal control sequences from PTY output.
 * PTY output contains far more than simple SGR colors — cursor movement,
 * OSC window titles, alternate screen buffer, line clearing, etc.
 */
function stripAnsi(text: string): string {
  return text
    // OSC sequences: ESC ] ... (BEL | ST)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // CSI sequences: ESC [ (params) (intermediate) (final byte)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[A-Za-z~]/g, '')
    // ESC single-character sequences (e.g. ESC 7, ESC 8, ESC =, ESC >)
    .replace(/\x1b[()#][0-9A-Za-z]/g, '')
    .replace(/\x1b[7-8=<>]/g, '')
    // Any remaining ESC + one char
    .replace(/\x1b./g, '')
    // C0 control chars (except \n and \t)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Carriage return used for line overwriting (spinners etc)
    .replace(/\r/g, '')
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Returns true if the cleaned text is meaningful content worth showing
 * (not just fragments from spinners, progress bars, etc.)
 */
function isMeaningfulText(text: string): boolean {
  // Must have at least some word characters
  const words = text.replace(/[^a-zA-Z0-9]/g, '');
  return words.length >= 3;
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
          // Strip all terminal control sequences
          const cleaned = stripAnsi(event.text);
          // Skip empty or meaningless chunks (spinners, progress bars, control-only)
          if (!cleaned || !isMeaningfulText(cleaned)) break;

          // Reset the finalize timer on each output chunk
          if (streamFinalizeTimer.current) clearTimeout(streamFinalizeTimer.current);

          if (streamingMessageId.current) {
            // Append to existing streaming message
            appendToMessage(streamingMessageId.current, '\n' + cleaned);
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

          // Finalize after silence so next meaningful output starts a new message
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
