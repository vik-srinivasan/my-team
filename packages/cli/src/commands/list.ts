import { Command } from 'commander';
import chalk from 'chalk';
import { basename } from 'node:path';
import type { SessionSummary } from '@my-team/shared';
import { api, ApiError } from '../api-client.js';
import {
  padEndVisible,
  truncate,
  humanizeAgo,
  phaseColor,
  getAttention,
  colorAttnGlyph,
  compareByAttention,
  LIST_COL_WIDTHS,
  type AttentionInfo,
} from '../format.js';

interface ListOptions {
  json?: boolean;
  needsAttention?: boolean;
}

// Column widths (visible characters). Shared with `watch` via format.ts.
const W_ATTN = LIST_COL_WIDTHS.attn;
const W_ID = LIST_COL_WIDTHS.id;
const W_PHASE = LIST_COL_WIDTHS.phase;
const W_REPO = LIST_COL_WIDTHS.repo;
const W_AGE = LIST_COL_WIDTHS.age;

interface RenderedRow {
  attn: AttentionInfo;
  id: string;
  title: string;
  phase: string;
  repo: string;
  age: string;
}

export function listCommand(): Command {
  return new Command('list')
    .description('List active sessions with an attention-first overview')
    .option('--json', 'Output as JSON instead of a table')
    .option('-a, --needs-attention', 'Show only sessions that need attention')
    .action(async (options: ListOptions) => {
      try {
        const sessions = await api.listSessions();
        const filtered = options.needsAttention
          ? sessions.filter((s) => getAttention(s).critical)
          : sessions;

        if (options.json) {
          const payload = filtered.map((s) => {
            const attn = getAttention(s);
            return {
              ...s,
              attention: {
                glyph: attn.glyph,
                label: attn.label,
                critical: attn.critical,
              },
            };
          });
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        if (filtered.length === 0) {
          if (options.needsAttention) {
            console.log(chalk.dim('No sessions need attention.'));
          } else {
            console.log(chalk.dim('No active sessions.'));
          }
          return;
        }

        const cols = process.stdout.columns ?? 80;
        const showRepo = cols >= 80;

        // Attention sort: critical first (in priority order), then done, then idle, then by age.
        const sorted = [...filtered].sort(compareByAttention);

        renderTable(sorted, { cols, showRepo });
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red('Failed to list sessions'));
        }
        process.exit(1);
      }
    });
}

function renderTable(
  sessions: SessionSummary[],
  ctx: { cols: number; showRepo: boolean },
): void {
  const { cols, showRepo } = ctx;

  // Fixed widths summed, plus single-space separators.
  // Layout: ATTN ID TITLE PHASE [REPO] AGE
  const separatorCount = showRepo ? 5 : 4;
  const fixed = W_ATTN + W_ID + W_PHASE + (showRepo ? W_REPO : 0) + W_AGE + separatorCount;
  const titleWidth = Math.max(10, cols - fixed);

  const rows: RenderedRow[] = sessions.map((s) => ({
    attn: getAttention(s),
    id: truncate(s.id, W_ID),
    title: truncate(s.title, titleWidth),
    phase: s.phase,
    repo: truncate(basename(s.source_repo), W_REPO),
    age: humanizeAgo(s.created_at),
  }));

  // Header
  const headerParts: string[] = [
    padEndVisible(chalk.dim('AT'), W_ATTN),
    padEndVisible(chalk.bold('ID'), W_ID),
    padEndVisible(chalk.bold('TITLE'), titleWidth),
    padEndVisible(chalk.bold('PHASE'), W_PHASE),
  ];
  if (showRepo) headerParts.push(padEndVisible(chalk.bold('REPO'), W_REPO));
  headerParts.push(padEndVisible(chalk.bold('AGE'), W_AGE));
  console.log(headerParts.join(' '));

  // Rows
  for (const row of rows) {
    const parts: string[] = [
      padEndVisible(colorAttnGlyph(row.attn), W_ATTN),
      padEndVisible(row.id, W_ID),
      padEndVisible(row.title, titleWidth),
      padEndVisible(phaseColor(row.phase), W_PHASE),
    ];
    if (showRepo) parts.push(padEndVisible(chalk.dim(row.repo), W_REPO));
    parts.push(padEndVisible(row.age, W_AGE));
    console.log(parts.join(' '));
  }

  // Footer
  const critical = sessions.filter((s) => getAttention(s).critical).length;
  const footer =
    critical > 0
      ? `${sessions.length} sessions · ${chalk.red(`${critical} need attention`)}`
      : `${sessions.length} sessions · 0 need attention`;
  console.log();
  console.log(chalk.dim(footer));
}

// ── Exports for testing ────────────────────────────────────────────────

export const __test__ = {
  compareByAttention,
};
