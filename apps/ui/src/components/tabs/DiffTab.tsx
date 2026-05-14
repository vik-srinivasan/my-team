import { useEffect, useMemo, useState, type ReactElement } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import Prism from 'prismjs';
// Order matters: typescript before tsx (tsx extends typescript), jsx before tsx
// (tsx also extends jsx). Bash + others are independent. These bring in their
// own grammars at module load.
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-bash.js';

import { useSessionSocket } from '../SessionContext.js';
import { useUiStore } from '../../store.js';
import { EmptyState, MarkdownSkeleton } from '../../lib/markdown.js';
import { getDiff } from '../../lib/api.js';
import {
  parseUnifiedDiff,
  prismLanguageForPath,
  truncateLines,
  type ParsedDiffFile,
} from '../../lib/diff.js';

const DEFAULT_LINE_CAP = 1000;

/**
 * The wrapper streams unified-diff text over the WS as
 * `WsDiffEvent { type: 'diff', diff: string }` (debounced server-side).
 * We keep `useSessionSocket().lastDiff` as the live source and bootstrap
 * with a one-shot `GET /api/sessions/:id/diff` on mount so the first paint
 * isn't blank for sessions where no write has happened since the socket
 * opened.
 *
 * The diff is parsed into per-file slices and rendered with
 * `react-diff-viewer-continued`. Each file collapses independently; large
 * files (> 1000 reconstructed lines) are truncated by default behind a
 * "show full diff" button so an accidental binary diff doesn't lock up
 * the renderer.
 */
export function DiffTab(): ReactElement {
  const sessionId = useUiStore((s) => s.selectedSessionId);
  const { lastDiff } = useSessionSocket();

  // Bootstrap one-shot. If the WS hasn't pushed a diff yet, fetch the
  // current state once on mount; subsequent updates arrive via the WS.
  const [bootstrap, setBootstrap] = useState<string | null>(null);
  const [bootstrapErr, setBootstrapErr] = useState<Error | null>(null);

  useEffect(() => {
    if (sessionId === null) return;
    if (lastDiff !== null) return; // WS already populated; no need to fetch.
    let cancelled = false;
    setBootstrapErr(null);
    getDiff(sessionId)
      .then((res) => {
        if (!cancelled) setBootstrap(res.diff);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBootstrapErr(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, lastDiff]);

  // Reset bootstrap if session id changes so we don't show stale text.
  useEffect(() => {
    setBootstrap(null);
    setBootstrapErr(null);
  }, [sessionId]);

  const rawDiff = lastDiff ?? bootstrap ?? '';
  const files = useMemo(() => parseUnifiedDiff(rawDiff), [rawDiff]);

  const [splitView, setSplitView] = useState(false);

  if (sessionId === null) {
    return <EmptyState>Select a session to view its diff.</EmptyState>;
  }

  if (bootstrapErr !== null && rawDiff === '') {
    return (
      <EmptyState>
        Failed to load diff.
        <br />
        <span className="text-neutral-600">{bootstrapErr.message}</span>
      </EmptyState>
    );
  }

  // While the one-shot bootstrap is in flight (no WS push yet, no fetch
  // result yet), render a shimmer so we don't flash the "no diff" empty
  // state for sessions that DO have changes. `lastDiff === null` means the
  // WS hasn't emitted a `diff` event yet; `lastDiff === ''` is a genuine
  // "no changes" response and falls through to the empty state below.
  if (lastDiff === null && bootstrap === null && bootstrapErr === null) {
    return <MarkdownSkeleton />;
  }

  if (rawDiff.trim() === '' || files.length === 0) {
    return (
      <EmptyState>
        No diff yet — session branch matches base. Changes appear here as the
        captain commits.
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2 text-xs text-neutral-400">
        <span data-testid="diff-file-count">
          {files.length} file{files.length === 1 ? '' : 's'} changed
        </span>
        <div className="inline-flex rounded-sm border border-neutral-800 bg-neutral-900 p-0.5 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setSplitView(false)}
            data-testid="diff-view-unified"
            aria-pressed={!splitView}
            className={`rounded-sm px-2 py-0.5 transition-colors ${
              !splitView
                ? 'bg-neutral-700 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Unified
          </button>
          <button
            type="button"
            onClick={() => setSplitView(true)}
            data-testid="diff-view-split"
            aria-pressed={splitView}
            className={`rounded-sm px-2 py-0.5 transition-colors ${
              splitView
                ? 'bg-neutral-700 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Side-by-side
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {files.map((file) => (
          <FileDiff key={`${file.from}::${file.to}`} file={file} splitView={splitView} />
        ))}
      </div>
    </div>
  );
}

interface FileDiffProps {
  file: ParsedDiffFile;
  splitView: boolean;
}

function FileDiff({ file, splitView }: FileDiffProps): ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const isTruncatable = file.totalLines > DEFAULT_LINE_CAP;
  const effectiveOld = useMemo(
    () => (isTruncatable && !showFull ? truncateLines(file.oldValue, DEFAULT_LINE_CAP) : file.oldValue),
    [file.oldValue, isTruncatable, showFull],
  );
  const effectiveNew = useMemo(
    () => (isTruncatable && !showFull ? truncateLines(file.newValue, DEFAULT_LINE_CAP) : file.newValue),
    [file.newValue, isTruncatable, showFull],
  );

  const language = prismLanguageForPath(file.path);

  const renderContent = useMemo(() => {
    if (language === null) return undefined;
    const grammar = Prism.languages[language];
    if (grammar === undefined) return undefined;
    return (source: string): ReactElement => (
      <span
        // Prism returns HTML for token <span> wrapping; using
        // dangerouslySetInnerHTML on a per-line basis is the standard
        // pattern in react-diff-viewer-continued docs.
        dangerouslySetInnerHTML={{ __html: Prism.highlight(source, grammar, language) }}
      />
    );
  }, [language]);

  return (
    <div
      data-testid={`diff-file-${file.path}`}
      className="border-b border-neutral-800 bg-neutral-950"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-neutral-900/60"
      >
        <span
          aria-hidden
          className={`inline-block w-3 text-neutral-500 transition-transform ${
            collapsed ? '' : 'rotate-90'
          }`}
        >
          ›
        </span>
        <span className="font-mono text-neutral-200">{file.path}</span>
        {file.added ? (
          <span className="rounded-sm bg-green-500/15 px-1.5 text-[10px] font-medium uppercase tracking-wide text-green-400">
            new
          </span>
        ) : null}
        {file.deleted ? (
          <span className="rounded-sm bg-red-500/15 px-1.5 text-[10px] font-medium uppercase tracking-wide text-red-400">
            deleted
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px]">
          <span className="text-green-400">+{file.additions}</span>
          <span className="text-red-400">-{file.deletions}</span>
        </span>
      </button>

      {!collapsed ? (
        <div className="bg-neutral-950">
          {isTruncatable && !showFull ? (
            <div className="flex items-center justify-between border-y border-neutral-800 bg-neutral-900 px-4 py-1.5 text-[11px] text-neutral-400">
              <span>
                Truncated at {DEFAULT_LINE_CAP} lines (full size: {file.totalLines}).
              </span>
              <button
                type="button"
                onClick={() => setShowFull(true)}
                data-testid={`diff-show-full-${file.path}`}
                className="rounded-sm border border-neutral-700 px-2 py-0.5 text-neutral-200 hover:bg-neutral-800"
              >
                Show full diff
              </button>
            </div>
          ) : null}
          <div className="diff-viewer-wrapper text-xs">
            <ReactDiffViewer
              oldValue={effectiveOld}
              newValue={effectiveNew}
              splitView={splitView}
              useDarkTheme
              hideSummary
              renderContent={renderContent}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
