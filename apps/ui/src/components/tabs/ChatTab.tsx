import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import stripAnsi from 'strip-ansi';

import { useSessionSocket } from '../SessionContext.js';
import { useUiStore } from '../../store.js';
import { sendInput } from '../../lib/api.js';
import { markdownComponents } from '../../lib/markdown.js';

/**
 * If the captain emits another chunk within this many milliseconds of
 * the previous chunk, we treat it as the same turn and extend the last
 * captain message. Crosses the boundary above into a new captain
 * message. The PTY's idle-flush is 50ms so anything above ~1s is safely
 * a new turn.
 */
const TURN_MERGE_MS = 2000;

/**
 * Distance from the bottom (in pixels) at which we still consider the
 * user "pinned to latest" — within this slack autoscroll keeps the view
 * stuck to the bottom on new content. Beyond it, we leave the viewport
 * alone and show the "jump to latest" affordance instead so the user can
 * read history without the captain yanking them down.
 */
const STICK_TO_BOTTOM_SLACK_PX = 100;

type Role = 'user' | 'captain';

interface ChatMessage {
  role: Role;
  text: string;
  /** Last time this message was extended (ms since epoch). Used by the
   *  merge-within-2s heuristic for captain turns. */
  ts: number;
}

/**
 * Captain Chat tab — the primary conversational surface for talking to
 * the session captain. Reads the WS output stream, ANSI-strips it,
 * stitches consecutive chunks within `TURN_MERGE_MS` into a single
 * captain turn, and renders the transcript through `react-markdown`.
 *
 * User messages are echoed locally on send (no wrapper round-trip).
 * Sending goes through the existing `POST /api/sessions/:id/input`
 * endpoint — no new wrapper surface needed.
 *
 * Visual style: same monospace family for both roles, separated by a
 * faint horizontal rule + small muted role label. No bubbles; the
 * transcript feels like a clean log.
 */
export function ChatTab(): ReactElement {
  const socket = useSessionSocket();
  const selectedSessionId = useUiStore((s) => s.selectedSessionId);

  // Whole-session transcript. The captain side is built from PTY output;
  // the user side is purely local-echo.
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Input model for the bottom-pinned textarea.
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Track the highest index in `recentOutput` we've already consumed so
  // a re-render doesn't reapply the same chunks. The ring buffer is
  // append-only until it caps; we still keep a defensive cursor here.
  const consumedOutputCount = useRef(0);

  // Remember which session this transcript belongs to so we can wipe it
  // on a true session change without clobbering the initial mount-time
  // ingest.
  const transcriptSessionId = useRef<string | null>(selectedSessionId);

  // ── Output ingest: snapshot on mount + every new chunk ────────────
  //
  // We drive everything off `recentOutput` (a ring buffer in the WS
  // hook), not `output` alone. On first mount we replay the entire
  // buffer so a tab switched into mid-session shows recent context;
  // afterwards we only consume the tail. We also detect "session
  // changed" here (instead of via a separate reset effect) so we don't
  // race with the ingest effect and wipe its newly-appended messages.
  useEffect(() => {
    if (transcriptSessionId.current !== selectedSessionId) {
      consumedOutputCount.current = 0;
      transcriptSessionId.current = selectedSessionId;
      setMessages([]);
    }

    const buffer = socket.recentOutput;
    if (buffer.length === 0) return;
    if (consumedOutputCount.current >= buffer.length) return;

    const fresh = buffer.slice(consumedOutputCount.current);
    consumedOutputCount.current = buffer.length;

    setMessages((prev) => {
      let next = prev;
      for (const raw of fresh) {
        const stripped = stripAnsi(raw);
        if (stripped.length === 0) continue;
        next = appendCaptainChunk(next, stripped);
      }
      return next;
    });
  }, [socket.recentOutput, selectedSessionId]);

  // ── Autoscroll bookkeeping ────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  const handleScroll = useCallback((): void => {
    const node = scrollRef.current;
    if (node === null) return;
    const fromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setStickToBottom(fromBottom <= STICK_TO_BOTTOM_SLACK_PX);
  }, []);

  useEffect(() => {
    if (!stickToBottom) return;
    const node = scrollRef.current;
    if (node === null) return;
    const id = requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, stickToBottom]);

  const jumpToLatest = useCallback((): void => {
    const node = scrollRef.current;
    if (node === null) return;
    node.scrollTop = node.scrollHeight;
    setStickToBottom(true);
  }, []);

  // ── Send handler ──────────────────────────────────────────────────
  const canSend = useMemo(() => {
    if (selectedSessionId === null) return false;
    if (socket.status !== 'open') return false;
    if (sending) return false;
    return draft.trim().length > 0;
  }, [selectedSessionId, socket.status, sending, draft]);

  const send = useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (selectedSessionId === null) return;
    if (socket.status !== 'open') return;
    if (sending) return;

    setSending(true);
    setSendError(null);
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: trimmed, ts: Date.now() },
    ]);
    setDraft('');

    try {
      const body = trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`;
      await sendInput(selectedSessionId, body);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send.');
    } finally {
      setSending(false);
    }
  }, [draft, selectedSessionId, socket.status, sending]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-full flex-col bg-neutral-950">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="chat-scroll"
        className="flex-1 overflow-auto px-6 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center font-sans text-sm text-neutral-500">
              No messages yet — type below to talk to the captain.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 font-mono">
            {messages.map((msg, idx) => (
              <ChatMessageView
                key={`${msg.ts}-${idx}`}
                message={msg}
                isFirst={idx === 0}
              />
            ))}
          </div>
        )}
      </div>

      {!stickToBottom ? (
        <button
          type="button"
          onClick={jumpToLatest}
          data-testid="chat-jump-latest"
          className="pointer-events-auto absolute bottom-28 right-6 rounded-full bg-neutral-800/90 px-3 py-1 text-xs text-neutral-200 shadow ring-1 ring-neutral-700 hover:bg-neutral-700"
        >
          ↓ jump to latest
        </button>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="border-t border-neutral-800 bg-neutral-950 px-4 py-3"
        aria-label="Send message to captain"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              socket.status === 'open'
                ? 'Message the captain… (Shift+Enter for newline)'
                : 'Disconnected — reconnecting…'
            }
            disabled={socket.status !== 'open' || selectedSessionId === null}
            data-testid="chat-input"
            rows={1}
            className="min-h-[2.25rem] max-h-40 flex-1 resize-y rounded-sm border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSend}
            data-testid="chat-send"
            className="rounded-sm bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {sendError !== null ? (
          <p
            className="mx-auto mt-2 max-w-3xl text-[11px] text-red-400"
            role="alert"
          >
            {sendError}
          </p>
        ) : null}
      </form>
    </div>
  );
}

/**
 * Append a freshly-arrived captain output chunk to the transcript,
 * applying the "merge within `TURN_MERGE_MS`" heuristic so a streamed
 * reply doesn't fragment into one message per write.
 */
function appendCaptainChunk(prev: ChatMessage[], text: string): ChatMessage[] {
  const now = Date.now();
  const last = prev[prev.length - 1];
  if (last && last.role === 'captain' && now - last.ts <= TURN_MERGE_MS) {
    const next = prev.slice(0, -1);
    next.push({ role: 'captain', text: last.text + text, ts: now });
    return next;
  }
  return [...prev, { role: 'captain', text, ts: now }];
}

/**
 * Single message turn. A faint horizontal rule + small muted role label
 * does the visual separation work — no bubbles; both roles share the
 * monospace family so the transcript reads like a clean log.
 *
 * `isFirst` suppresses the divider on the very first message so we don't
 * render an orphaned rule against empty space at the top of the transcript.
 * User labels are a touch brighter than captain labels so the eye can scan
 * "who said what" at a glance without re-reading the text.
 */
function ChatMessageView({
  message,
  isFirst,
}: {
  message: ChatMessage;
  isFirst: boolean;
}): ReactElement {
  const labelColor =
    message.role === 'user' ? 'text-neutral-400' : 'text-neutral-500';
  return (
    <div data-testid={`chat-message-${message.role}`}>
      <div
        className={`mb-1 flex items-center gap-2 pt-2${
          isFirst ? '' : ' border-t border-zinc-800/60'
        }`}
      >
        <span
          className={`text-[10px] uppercase tracking-wider ${labelColor}`}
        >
          {message.role === 'user' ? 'you' : 'captain'}
        </span>
      </div>
      <div className="font-mono text-sm leading-relaxed text-neutral-200 whitespace-pre-wrap">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
