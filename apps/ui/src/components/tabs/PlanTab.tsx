import type { ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useSessionSocket } from '../SessionContext.js';
import { EmptyState, MarkdownSkeleton, markdownComponents } from '../../lib/markdown.js';

/**
 * Live view of `.team/plan.md`.
 *
 * Decision (see `.team/decisions.md`): plan code fences are rendered with
 * `markdownComponents`'s styled `<pre><code>` block — no syntax-highlighter
 * dependency. The plan is mostly file-tree blocks and short snippets;
 * highlighting them adds bundle weight (~30 kB for `react-syntax-highlighter`'s
 * lightweight build, ~600 kB for `refractor`'s common set) without much
 * payoff. The Diff tab has its own Prism-backed highlighting for actual
 * source code, which is where it matters.
 */
export function PlanTab(): ReactElement {
  const { teamFiles, status } = useSessionSocket();
  const content = teamFiles.plan ?? '';

  if (content === '' && status === 'connecting') {
    return <MarkdownSkeleton />;
  }

  if (content.trim() === '') {
    return (
      <EmptyState>
        No plan yet — captain writes `.team/plan.md` during the planning phase.
      </EmptyState>
    );
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
