import { useMemo, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useSessionSocket } from '../SessionContext.js';
import { EmptyState, markdownComponents } from '../../lib/markdown.js';

/**
 * Live view of `.team/review.md`.
 *
 * The reviewer writes each pass under a top-level `# Review pass <N>`
 * heading. We split the markdown on those headers so older passes can be
 * collapsed (a stale `Review pass 1` shouldn't dominate the viewport once
 * `Review pass 5` lands). The latest pass is expanded by default.
 *
 * If no `# Review pass` headings are present (e.g. legacy review.md or an
 * incremental write where the header hasn't landed yet) we fall back to a
 * single un-split article so nothing is hidden.
 */
interface ReviewSection {
  /** Human label shown in the toggle (`Review pass 3`, or `(intro)` for
   *  any pre-header preamble). */
  title: string;
  /** Body of this section *including* its `#` heading, so heading anchors
   *  and `react-markdown`'s heading rules apply uniformly. */
  body: string;
  /** Pass number parsed from the heading. `null` for the preamble. */
  passNumber: number | null;
}

/**
 * Split `review.md` into `## Review pass N` sections. Exported for
 * unit testing. Sections retain their leading heading; the preamble (text
 * before the first pass header) becomes a `null`-numbered section.
 */
export function splitReviewPasses(content: string): ReviewSection[] {
  const lines = content.split('\n');
  const sections: ReviewSection[] = [];
  let current: ReviewSection | null = null;

  const flush = (): void => {
    if (current !== null) {
      // Trim the trailing newline a header-only section accumulates.
      current.body = current.body.replace(/\n+$/, '');
      sections.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    const match = /^#\s+Review pass\s+(\d+)\b(.*)$/i.exec(line);
    if (match !== null) {
      flush();
      current = {
        title: `Review pass ${match[1]}`,
        body: `${line}\n`,
        passNumber: Number.parseInt(match[1], 10),
      };
      continue;
    }
    if (current === null) {
      current = { title: '(intro)', body: `${line}\n`, passNumber: null };
    } else {
      current.body += `${line}\n`;
    }
  }
  flush();

  // Drop the preamble entirely if it's only whitespace.
  return sections.filter(
    (s, idx) => idx === 0 || s.body.trim().length > 0,
  ).filter((s) => s.body.trim().length > 0);
}

function ReviewSectionView({
  section,
  expanded,
}: {
  section: ReviewSection;
  expanded: boolean;
}): ReactElement {
  // Uncontrolled <details> with `open` as the initial-only attribute means
  // the user can toggle freely without React fighting them.
  return (
    <details
      data-testid={`review-section-${section.passNumber ?? 'intro'}`}
      open={expanded}
      className="my-3 rounded-sm border border-neutral-800 bg-neutral-950"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-200">
        {section.title}
      </summary>
      <div className="border-t border-neutral-800 px-4 py-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {section.body}
        </ReactMarkdown>
      </div>
    </details>
  );
}

export function ReviewTab(): ReactElement {
  const { teamFiles } = useSessionSocket();
  const content = teamFiles.review ?? '';

  const sections = useMemo(() => splitReviewPasses(content), [content]);
  const latestPassNumber = useMemo(() => {
    let max = -Infinity;
    for (const s of sections) {
      if (s.passNumber !== null && s.passNumber > max) max = s.passNumber;
    }
    return Number.isFinite(max) ? max : null;
  }, [sections]);

  if (content.trim() === '') {
    return <EmptyState>No review yet.</EmptyState>;
  }

  // No `# Review pass` headers detected — render whole document as one.
  const hasPasses = sections.some((s) => s.passNumber !== null);
  if (!hasPasses) {
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

  return (
    <div className="h-full overflow-auto px-6 py-4">
      <article className="mx-auto max-w-3xl">
        {sections.map((section, idx) => (
          <ReviewSectionView
            key={`${section.title}-${idx}`}
            section={section}
            expanded={
              section.passNumber === null ||
              section.passNumber === latestPassNumber
            }
          />
        ))}
      </article>
    </div>
  );
}
