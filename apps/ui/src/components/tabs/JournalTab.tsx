import { useEffect, useRef, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useSessionSocket } from '../SessionContext.js';
import { EmptyState, MarkdownSkeleton, markdownComponents } from '../../lib/markdown.js';

/**
 * Live view of `.team/journal.md` streamed over the session WebSocket.
 *
 * The wrapper emits a `team_file` event with `name: 'journal'` on connect
 * and on every disk write — `useSessionWebSocket` lands them in
 * `teamFiles.journal`. We render through `react-markdown` + `remark-gfm`
 * (tables / strikethrough / task-list parity with GitHub) and auto-scroll
 * to the bottom whenever the content grows so new entries are always
 * visible without manual scrolling.
 *
 * The auto-scroll is intentionally unconditional on length change rather
 * than "only if user was already at the bottom" — journals are append-only
 * artifacts and the captain is the only writer, so jumping the viewport is
 * a feature, not a foot-gun. If a future change adds backfill or edits,
 * revisit this.
 */
export function JournalTab(): ReactElement {
  const { teamFiles, status } = useSessionSocket();
  const content = teamFiles.journal ?? '';

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node === null) return;
    // Defer one frame so react-markdown has finished mounting the new
    // entry before we measure scrollHeight. Without this, the scroll
    // can land short on the first render of a multi-paragraph entry.
    const id = requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [content]);

  // While the WS handshake is in flight and we haven't received the
  // initial-emit `team_file` payload yet, show a shimmer rather than
  // flashing "No journal entries yet." for sessions that DO have one.
  if (content === '' && status === 'connecting') {
    return <MarkdownSkeleton />;
  }

  if (content.trim() === '') {
    return (
      <EmptyState>
        No journal entries yet — they appear as the captain dispatches specialists.
      </EmptyState>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-testid="journal-scroll"
      className="h-full overflow-auto px-6 py-4"
    >
      <article className="journal-prose mx-auto max-w-3xl">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
