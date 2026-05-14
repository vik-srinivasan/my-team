import parseDiffLib from 'parse-diff';

/**
 * Per-file diff slice consumed by `DiffTab`. Exported so unit tests can
 * exercise the parser without dragging React in.
 */
export interface ParsedDiffFile {
  /** File path, post-rename. Falls back to `from` when missing (deletions). */
  path: string;
  /** Original path; surfaced separately when a rename occurred. */
  from: string;
  /** Destination path; identical to `path` for additions/deletions. */
  to: string;
  /** Total `+` lines across all hunks. */
  additions: number;
  /** Total `-` lines across all hunks. */
  deletions: number;
  /** Reconstructed "old" file body — `-` + ` ` (context) lines. */
  oldValue: string;
  /** Reconstructed "new" file body — `+` + ` ` (context) lines. */
  newValue: string;
  /** Total visible-line count (max of old/new) — used for truncation cap. */
  totalLines: number;
  /** `true` when `parse-diff` reported `deleted: true`. */
  deleted: boolean;
  /** `true` when `parse-diff` reported `new: true`. */
  added: boolean;
}

/**
 * Reconstruct unified-diff text into per-file old/new bodies.
 *
 * `react-diff-viewer-continued` wants two strings (`oldValue` / `newValue`)
 * per file rather than a hunk model, so we collapse each file's hunks into
 * a synthetic full-file view: `-` and ` ` lines feed `oldValue`; `+` and ` `
 * feed `newValue`. This is good enough for visual review since the viewer
 * re-diffs the two strings internally and word-highlights differences. We
 * lose any unchanged context that wasn't in the hunk window, which is
 * exactly the same trade-off the underlying `diff --unified` output makes.
 */
export function parseUnifiedDiff(raw: string): ParsedDiffFile[] {
  if (raw.trim() === '') return [];

  const files = parseDiffLib(raw);
  const result: ParsedDiffFile[] = [];

  for (const file of files) {
    const oldLines: string[] = [];
    const newLines: string[] = [];
    let additions = 0;
    let deletions = 0;

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        // `change.content` is prefixed with `+`, `-`, or ` ` from the unified
        // diff. Strip the prefix when reconstructing the file body — readers
        // shouldn't see literal +/- in the viewer panes (the viewer adds its
        // own gutter glyphs).
        const text = change.content.replace(/^[+\- ]/, '');
        switch (change.type) {
          case 'add':
            newLines.push(text);
            additions += 1;
            break;
          case 'del':
            oldLines.push(text);
            deletions += 1;
            break;
          case 'normal':
            oldLines.push(text);
            newLines.push(text);
            break;
        }
      }
    }

    const from = file.from ?? '';
    const to = file.to ?? '';
    const path =
      file.deleted === true ? from : to !== '' && to !== '/dev/null' ? to : from;

    result.push({
      path: stripGitPrefix(path),
      from: stripGitPrefix(from),
      to: stripGitPrefix(to),
      additions,
      deletions,
      oldValue: oldLines.join('\n'),
      newValue: newLines.join('\n'),
      totalLines: Math.max(oldLines.length, newLines.length),
      deleted: file.deleted === true,
      added: file.new === true,
    });
  }

  return result;
}

/** Drop the leading `a/` or `b/` prefix `git diff` adds to paths. */
function stripGitPrefix(path: string): string {
  if (path.startsWith('a/') || path.startsWith('b/')) {
    return path.slice(2);
  }
  return path;
}

/**
 * Map a file path to a Prism language id. Returns `null` when no Prism
 * grammar covers the file — the diff renderer falls back to plain text in
 * that case so we never block the viewer on missing highlighting.
 */
export function prismLanguageForPath(path: string): string | null {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return null;
  const ext = lower.slice(dot + 1);
  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'rs':
      return 'rust';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    default:
      return null;
  }
}

/**
 * Truncate a reconstructed file body to `maxLines` lines, appending a
 * sentinel so the viewer makes it obvious the rest was hidden.
 */
export function truncateLines(value: string, maxLines: number): string {
  const lines = value.split('\n');
  if (lines.length <= maxLines) return value;
  const truncated = lines.slice(0, maxLines);
  truncated.push(`… (${lines.length - maxLines} more lines hidden)`);
  return truncated.join('\n');
}
