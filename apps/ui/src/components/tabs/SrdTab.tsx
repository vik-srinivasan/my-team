import type { ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useUiStore } from '../../store.js';
import { useTeamFile } from '../../hooks/useTeamFile.js';
import { EmptyState, markdownComponents } from '../../lib/markdown.js';

/**
 * Static view of `.team/srd.md`.
 *
 * `TeamFileName` in the wrapper's WS broadcast set is only
 * `plan | tasks | journal | review` — the SRD is authored once during
 * planning and is effectively locked after approval, so the wrapper
 * doesn't stream it. We fetch it via `useTeamFile`, which polls every
 * 30s by default (more than enough — the SRD almost never changes after
 * the planning phase). The `useTeamFile` hook returns `null` on 404, which
 * we map to the empty state.
 */
export function SrdTab(): ReactElement {
  const sessionId = useUiStore((s) => s.selectedSessionId);
  const query = useTeamFile(sessionId, 'srd.md');

  if (query.isLoading) {
    return <EmptyState>Loading SRD…</EmptyState>;
  }

  if (query.isError) {
    const message =
      query.error instanceof Error ? query.error.message : 'Unknown error.';
    return (
      <EmptyState>
        Failed to load SRD.
        <br />
        <span className="text-neutral-600">{message}</span>
      </EmptyState>
    );
  }

  const content = query.data ?? '';
  if (content.trim() === '') {
    return <EmptyState>No SRD yet — usually drafted during planning.</EmptyState>;
  }

  return (
    <div className="h-full overflow-auto px-6 py-4">
      <article className="mx-auto max-w-3xl">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
