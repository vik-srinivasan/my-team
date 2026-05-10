import { useEffect, useRef, useCallback } from 'react';

import type { WsServerEvent, WsClientEvent } from '@my-team/shared';
import { useSessionStore } from '../store.js';

const RECONNECT_DELAY = 2000;
const STREAM_FINALIZE_DELAY = 3000;

/**
 * Per-line noise patterns. A line that matches any of these (after
 * normalization to lower-case + ASCII fold) is dropped wholesale.
 *
 * The match is liberal because PTY output frequently mangles spaces and
 * occasionally truncates words (e.g. "Conplating", "Complating").
 */
const NOISE_LINE_PATTERNS: readonly RegExp[] = [
  // Permission prompt chrome
  /bypass\s*permissions\s*on/,
  /bypasspermissionson/,
  /shift\s*\+\s*tab\s+to\s+cycle/,
  /esc\s+to\s+interrupt/,
  /esctointerrupt/,
  /remote\s*control\s*active/,
  /remotecontrolactive/,
  // Status spinners — anchor on the contemplate-family stem so we
  // don't false-positive on words like "complete" / "completion".
  // Covers the real word plus PTY corruptions observed in practice:
  //   contemplating, contemplate, contemplator,
  //   conplating, conplate, complating, complate
  /\b(?:contempl|conplat|complat)(?:at)?(?:e|ing|es|ed|or|ion)?\b/i,
  /thinking\s+with\s+x?high\s+effort/,
  /thought\s+for\s+\d+\s*s?\b/,
  // Token counters: "↓ 12 tokens", "12 tokens", "12k tokens"
  /↓\s*\d[\d.,]*\s*k?\s*tokens/,
  /\b\d[\d.,]*\s*k?\s+tokens\b/,
  // Tool-call expansion chrome
  /\(\s*ctrl\s*\+\s*o\s+to\s+expand\s*\)/,
];

/** Lines that, *after stripping noise tokens from anywhere within them*,
 * become empty or only-punctuation should be dropped entirely. */
const PUNCT_ONLY = /^[\s\p{P}\p{S}]*$/u;

/** Box-drawing leftovers and ANSI fragments that survive stripping. */
function isBoxDrawingLeftover(line: string): boolean {
  const trimmed = line.trimStart();
  if (trimmed.length === 0) return false;
  const first = trimmed[0];
  // Single-leader box-drawing chars commonly left over from tool-call frames.
  if (first === '└' || first === '┃' || first === '│') return true;
  // Stray "[<digits>" fragments from cut-off SGR sequences (e.g. "[38;5;7m").
  if (/^\[\d/.test(trimmed)) return true;
  // Embedded raw escape sequences (literal ESC + '[') that survived stripAnsi.
  // We don't drop on bare '[' because that would kill markdown links.
  // eslint-disable-next-line no-control-regex
  if (/\x1b\[/.test(line)) return true;
  return false;
}

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
 * Filter PTY noise from cleaned text. Operates per-line so that legitimate
 * markdown (headings, code fences, sentences) flows through untouched.
 */
function cleanCaptainOutput(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (const raw of lines) {
    if (isBoxDrawingLeftover(raw)) continue;
    const probe = raw.toLowerCase();
    if (NOISE_LINE_PATTERNS.some((rx) => rx.test(probe))) continue;
    // Drop content-free punctuation-only lines (e.g. stray ".", "·").
    // Markdown structural punctuation (code fences, hr rules, list bullets)
    // is allowed through via isMarkdownStructural().
    const trimmed = raw.trim();
    if (trimmed.length > 0 && PUNCT_ONLY.test(trimmed) && !isMarkdownStructural(trimmed)) {
      continue;
    }
    kept.push(raw);
  }
  // Re-collapse runs of blank lines we may have created.
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Markdown structural lines that look punctuation-only but should pass. */
function isMarkdownStructural(trimmed: string): boolean {
  if (trimmed.startsWith('```')) return true; // fenced code blocks
  if (/^-{3,}$/.test(trimmed)) return true; // horizontal rules
  if (/^\*{3,}$/.test(trimmed)) return true; // horizontal rules
  if (/^={3,}$/.test(trimmed)) return true; // setext heading underlines
  return false;
}

/**
 * Returns true if the cleaned text is meaningful content worth showing
 * (not just fragments from spinners, progress bars, etc.)
 *
 * Allows short markdown structural lines (headings, code fences, list
 * bullets) to pass even when their word-character count is low.
 */
function isMeaningfulText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  // Markdown structural lines that should always pass.
  if (/^#{1,6}\s+\S/.test(trimmed)) return true; // headings
  if (trimmed.startsWith('```')) return true; // code fences
  // Otherwise require at least a handful of word characters somewhere.
  const words = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  return words.length >= 3;
}

// Exported for unit tests; the hook itself remains the primary export.
export { stripAnsi, cleanCaptainOutput, isMeaningfulText };

export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingMessageId = useRef<string | null>(null);
  const streamFinalizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addMessage = useSessionStore((s) => s.addMessage);
  const appendToMessage = useSessionStore((s) => s.appendToMessage);
  const setSessionState = useSessionStore((s) => s.setSessionState);
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
          // Strip ANSI then drop line-level PTY noise (permission chrome,
          // spinners, token counters, box-drawing leftovers).
          const cleaned = cleanCaptainOutput(stripAnsi(event.text));
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

        // team_file and diff events are no longer rendered — the right
        // panel was removed. Fall through silently.
        default:
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
  }, [sessionId, addMessage, appendToMessage, setSessionState, setRemoteUrl, finalizeStream]);

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
