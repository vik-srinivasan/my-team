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
  // Claude Code spinner verb vocabulary. Stems chosen so that PTY
  // corruptions (dropped letters, joined glyphs) still match. These
  // appear as a rotating list with a spinner glyph prefix, e.g.
  // "✲ Billowing…" / "✺ Pondering…". Match the stem rather than the
  // exact word so we cover -ing / -ed / -es variants.
  /\b(?:billow|ponder|cogitat|ruminat|deliberat|simmer|osmos|musing|mulling)\w*/i,
  // Spinner verbs that share a prefix with common English need a tighter
  // pattern. "muse"/"mull" only as the spinner status form ("…muse"
  // following an ellipsis or a spinner glyph) — never inline.
  /thinking\s+with\s+x?high\s+effort/,
  /thinking\s+on\s+\d/i,
  /\bthought\s+for\s+\d+\s*s?\b/,
  // Token counters: "↓ 12 tokens", "↑ 1.4k tokens", "12k tokens"
  /[↑↓]\s*\d[\d.,]*\s*k?\s*tokens/,
  /\b\d[\d.,]*\s*k?\s+tokens\b/,
  // Status footer line: "(24s ↑ 1.4k tokens · thought for 1s)" — match
  // the leading "(Ns " block which always precedes a spinner status footer.
  /\(\s*\d+\s*s\s*[↑↓·]/,
  // "N active" / "N Cactive" counters (PTY occasionally glues a glyph
  // onto the digit, producing things like "1 Cactive").
  /^\s*\d+\s*c?active\b/i,
  // Unicode spinner glyph lines: lines dominated by spinner glyphs and
  // digits/tiny tokens (no real words). Triggers only when the line is
  // mostly these glyphs — won't strip a normal sentence that happens to
  // contain one.
  /^[\s✲✺✣↳◆►·⏵▸▶●○◯◌◍◎⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+(?:\s*\d+\s*)*[\s✲✺✣↳◆►·⏵▸▶●○◯◌◍◎⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]*$/u,
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
    // C0 control chars (except \n, \t, \r — \r handled below)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Simulate terminal CR-overwrite: within each physical line, a `\r`
    // returns the cursor to column 0 and subsequent text overwrites
    // whatever came before. After all overwrites only the last segment
    // would still be visible — so keep only that. Critical for spinner
    // status lines like "thinking…\r30s thinking…\rreal content" which
    // otherwise concatenate into garbled gibberish.
    .split('\n')
    .map((line) => {
      const segments = line.split('\r');
      return segments[segments.length - 1] ?? '';
    })
    .join('\n')
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

/**
 * Decide how to join a streaming chunk onto the existing in-progress
 * captain message. PTY chunks frequently arrive word-by-word; if every
 * chunk gets a leading `\n` we end up with markdown that renders as a
 * vertical fragment list. Instead:
 *   - if `prev` already ends with a newline, append `cleaned` directly
 *   - if `cleaned` opens a markdown-structural line (heading, fenced
 *     code, list item, blockquote, hr), force a newline boundary
 *   - if `prev` ends with whitespace, append `cleaned` directly
 *   - otherwise insert a single space so words don't run together
 */
function joinChunks(prev: string, cleaned: string): string {
  if (cleaned.length === 0) return prev;
  const prevEndsBlock = endsMarkdownBlock(prev);
  if (startsMarkdownBlock(cleaned) || prevEndsBlock) {
    if (prev.endsWith('\n\n')) return prev + cleaned;
    if (prev.endsWith('\n')) return prev + '\n' + cleaned;
    if (prev.length === 0) return cleaned;
    return prev + '\n\n' + cleaned;
  }
  if (prev.length === 0) return cleaned;
  const lastChar = prev[prev.length - 1] ?? '';
  if (lastChar === '\n' || lastChar === ' ' || lastChar === '\t') return prev + cleaned;
  const firstChar = cleaned[0] ?? '';
  if (firstChar === '\n' || firstChar === ' ' || firstChar === '\t' || /[.,;:!?)\]}]/.test(firstChar)) {
    return prev + cleaned;
  }
  return prev + ' ' + cleaned;
}

/** True if a cleaned chunk opens with a markdown block element. */
function startsMarkdownBlock(text: string): boolean {
  const trimStart = text.replace(/^[ \t]+/, '');
  if (/^#{1,6}\s+\S/.test(trimStart)) return true; // heading
  if (trimStart.startsWith('```')) return true; // fenced code
  if (/^[-*+]\s+\S/.test(trimStart)) return true; // bullet list
  if (/^\d+\.\s+\S/.test(trimStart)) return true; // ordered list
  if (trimStart.startsWith('> ')) return true; // blockquote
  if (/^-{3,}\s*$/.test(trimStart)) return true; // hr
  if (/^={3,}\s*$/.test(trimStart)) return true; // setext underline
  return false;
}

/**
 * True if the *last line* of `text` is a markdown block that should not
 * have follow-on text glued to it (headings, fenced code openers/closers,
 * list items, blockquotes). When prev ends with one of these, the next
 * chunk must start on a new paragraph.
 */
function endsMarkdownBlock(text: string): boolean {
  if (text.length === 0) return false;
  // Already paragraph-terminated; no need to detect further.
  if (text.endsWith('\n\n')) return false;
  // Find the last logical line.
  const lastNewline = text.lastIndexOf('\n');
  const lastLine = lastNewline === -1 ? text : text.slice(lastNewline + 1);
  return startsMarkdownBlock(lastLine);
}

// Exported for unit tests; the hook itself remains the primary export.
export { stripAnsi, cleanCaptainOutput, isMeaningfulText, joinChunks };

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
            // Append to existing streaming message. Compute the
            // separator from the prior text so word-sized PTY chunks
            // don't become a vertical fragment list in markdown.
            const id = streamingMessageId.current;
            const prev = useSessionStore.getState().messages.find((m) => m.id === id)?.text ?? '';
            const merged = joinChunks(prev, cleaned);
            // appendToMessage concatenates raw, so pass just the delta.
            const delta = merged.slice(prev.length);
            if (delta.length > 0) appendToMessage(id, delta);
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
