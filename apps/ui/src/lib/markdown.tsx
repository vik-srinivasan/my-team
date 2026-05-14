import type { ReactElement, ReactNode } from 'react';
import type { Components } from 'react-markdown';

/**
 * Shared `react-markdown` component overrides used by every read-only tab
 * (Journal/Tasks/Plan/SRD/Review). Centralised so a single change updates
 * every surface and we don't ship five slightly-different markdown looks.
 *
 * Conventions:
 * - Dark background (sits inside `bg-neutral-950` tab panels).
 * - Headings: tight tracking, neutral-100, monospaced if `## ISO timestamp`
 *   patterns are common (we keep sans-serif here; per-tab overrides handle
 *   the journal timestamp font).
 * - Code blocks: `bg-neutral-900` with a mono font, no syntax highlighting
 *   for plain markdown bodies — the diff tab handles its own highlighting.
 * - Links: cyan, with underline-on-hover for affordance.
 *
 * Per-tab overrides (e.g. the custom checkbox renderer in `TasksTab`) are
 * composed on top of these defaults via `{...markdownComponents, input: …}`.
 */
export const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 text-2xl font-semibold tracking-tight text-neutral-100 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2 text-lg font-semibold tracking-tight text-neutral-100 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 text-base font-semibold tracking-tight text-neutral-200 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-1.5 text-sm font-semibold tracking-tight text-neutral-200 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="my-2 text-sm leading-relaxed text-neutral-300">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 ml-5 list-disc space-y-1 text-sm text-neutral-300 marker:text-neutral-600">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 ml-5 list-decimal space-y-1 text-sm text-neutral-300 marker:text-neutral-600">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-cyan-400 hover:underline"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-neutral-700 pl-3 text-sm italic text-neutral-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-neutral-800" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-sm border border-neutral-800">
      <table className="min-w-full text-left text-sm text-neutral-300">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-400">
      {children}
    </thead>
  ),
  th: ({ children }) => <th className="px-3 py-1.5">{children}</th>,
  td: ({ children }) => (
    <td className="border-t border-neutral-800 px-3 py-1.5">{children}</td>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-sm bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-200">
      {children}
    </pre>
  ),
  code: ({ className, children, ...rest }) => {
    // Inline `code` has no className; fenced code does (e.g. `language-ts`).
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded-sm bg-neutral-900 px-1 py-0.5 font-mono text-[0.85em] text-neutral-200"
          {...rest}
        >
          {children}
        </code>
      );
    }
    // Fenced; let <pre> handle the surrounding chrome.
    return (
      <code className={`font-mono ${className ?? ''}`} {...rest}>
        {children}
      </code>
    );
  },
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-neutral-200">{children}</em>,
  del: ({ children }) => (
    <del className="text-neutral-500 line-through">{children}</del>
  ),
};

/** Convenience helper used in empty-state stubs across tabs. */
export function EmptyState({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}

/**
 * Single-block shimmer used while a markdown-style tab is fetching its
 * first body. Matches the rough layout the real content lands into
 * (heading + a few paragraph rows + a small list) so the page doesn't
 * shift much on first paint.
 */
export function MarkdownSkeleton(): ReactElement {
  return (
    <div
      data-testid="markdown-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading content"
      className="h-full overflow-hidden px-6 py-4"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="h-6 w-1/3 animate-pulse rounded bg-zinc-800/50" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800/50" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-zinc-800/50" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-zinc-800/50" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800/50" />
        <div className="mt-6 h-5 w-1/4 animate-pulse rounded bg-zinc-800/50" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800/50" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800/50" />
      </div>
    </div>
  );
}
