import { Command } from 'commander';
import chalk from 'chalk';
import { basename } from 'node:path';
import type { SessionSummary } from '@my-team/shared';
import {
  padEndVisible,
  truncate,
  humanizeAgo,
  phaseColor,
  effectivePhase,
  getAttention,
  colorAttnGlyph,
  compareByAttention,
  LIST_COL_WIDTHS,
} from '@my-team/shared';
import { api, ApiError } from '../api-client.js';

interface WatchOptions {
  interval?: string;
}

const DEFAULT_INTERVAL_S = 2;
// Shared column widths with `list` — see format.ts.
const W_ATTN = LIST_COL_WIDTHS.attn;
const W_ID = LIST_COL_WIDTHS.id;
const W_PHASE = LIST_COL_WIDTHS.phase;
const W_REPO = LIST_COL_WIDTHS.repo;
const W_AGE = LIST_COL_WIDTHS.age;

// ANSI: clear screen + move cursor home.
const CLEAR = '\x1b[2J\x1b[H';

export function watchCommand(): Command {
  return new Command('watch')
    .description('Re-render team list on an interval (top-like view of sessions)')
    .option('--interval <seconds>', 'Refresh interval in seconds', String(DEFAULT_INTERVAL_S))
    .action(async (options: WatchOptions) => {
      const intervalSec = Math.max(1, Number.parseInt(options.interval ?? String(DEFAULT_INTERVAL_S), 10) || DEFAULT_INTERVAL_S);
      let stopped = false;

      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        // Restore cursor to a sane position and exit.
        process.stdout.write('\n');
        process.exit(0);
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);

      // Optional: react to 'q' to quit when stdin is a tty.
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(true);
        } catch {
          // setRawMode may fail in some environments; that's fine.
        }
        process.stdin.resume();
        process.stdin.on('data', (chunk: Buffer) => {
          const key = chunk.toString('utf8');
          // Ctrl-C is also delivered here in raw mode.
          if (key === 'q' || key === 'Q' || key === '') stop();
        });
      }

      while (!stopped) {
        await drawOnce(intervalSec);
        await sleep(intervalSec * 1000);
      }
    });
}

async function drawOnce(intervalSec: number): Promise<void> {
  let sessions: SessionSummary[];
  try {
    sessions = await api.listSessions();
  } catch (err) {
    process.stdout.write(CLEAR);
    if (err instanceof ApiError) {
      console.log(chalk.red(err.message));
    } else {
      console.log(chalk.red('Failed to list sessions'));
    }
    return;
  }

  process.stdout.write(CLEAR);
  const cols = process.stdout.columns ?? 80;
  const showRepo = cols >= 80;

  const sorted = [...sessions].sort(compareByAttention);
  const critical = sorted.filter((s) => getAttention(s).critical).length;

  // Header line: "team watch · HH:MM:SS · refresh 2s"
  const now = new Date();
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  console.log(
    `${chalk.bold('team watch')}  ${chalk.dim(time)}  ${chalk.dim(`refresh ${intervalSec}s`)}  ${chalk.dim('(q to quit)')}`,
  );

  // Render table (same shape as list).
  const separatorCount = showRepo ? 5 : 4;
  const fixed = W_ATTN + W_ID + W_PHASE + (showRepo ? W_REPO : 0) + W_AGE + separatorCount;
  const titleWidth = Math.max(10, cols - fixed);

  const headerParts: string[] = [
    padEndVisible(chalk.dim('AT'), W_ATTN),
    padEndVisible(chalk.bold('ID'), W_ID),
    padEndVisible(chalk.bold('TITLE'), titleWidth),
    padEndVisible(chalk.bold('PHASE'), W_PHASE),
  ];
  if (showRepo) headerParts.push(padEndVisible(chalk.bold('REPO'), W_REPO));
  headerParts.push(padEndVisible(chalk.bold('AGE'), W_AGE));
  console.log(headerParts.join(' '));

  if (sorted.length === 0) {
    console.log(chalk.dim('No active sessions.'));
    return;
  }

  for (const s of sorted) {
    const att = getAttention(s);
    const parts: string[] = [
      padEndVisible(colorAttnGlyph(att), W_ATTN),
      padEndVisible(truncate(s.id, W_ID), W_ID),
      padEndVisible(truncate(s.title, titleWidth), titleWidth),
      // PHASE derived from active_specialist when one is running, so the
      // column stays accurate even if state.json's `phase` is stale.
      padEndVisible(phaseColor(effectivePhase(s)), W_PHASE),
    ];
    if (showRepo) parts.push(padEndVisible(chalk.dim(truncate(basename(s.source_repo), W_REPO)), W_REPO));
    parts.push(padEndVisible(humanizeAgo(s.created_at), W_AGE));
    console.log(parts.join(' '));
  }

  console.log();
  const footer =
    critical > 0
      ? `${sorted.length} sessions · ${chalk.red(`${critical} need attention`)}`
      : `${sorted.length} sessions · 0 need attention`;
  console.log(chalk.dim(footer));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
