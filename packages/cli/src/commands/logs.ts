import { Command } from 'commander';
import chalk from 'chalk';
import { access, stat, open } from 'node:fs/promises';
import { createReadStream, watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { resolveTeamFile } from '../session-paths.js';

interface LogsOptions {
  number?: string;
  follow?: boolean;
}

const DEFAULT_LINES = 50;

/**
 * Candidate paths for the wrapper's per-session pino log file, in order.
 * (See .team/decisions.md — the wrapper currently logs to stdout only;
 * this command is forward-compatible with either of these destinations.)
 */
function candidatePaths(id: string): string[] {
  return [resolveTeamFile(id, 'wrapper.log'), join(homedir(), 'team', 'logs', `${id}.log`)];
}

export function logsCommand(): Command {
  return new Command('logs')
    .description("Tail the wrapper's pino log for a session")
    .argument('<id>', 'Session ID')
    .option('-n, --number <count>', 'Number of trailing lines to show', String(DEFAULT_LINES))
    .option('-f, --follow', 'Follow the log and print new lines as they are written')
    .action(async (id: string, options: LogsOptions) => {
      const path = await firstExisting(candidatePaths(id));
      if (path === null) {
        console.log(chalk.dim(`no logs yet for ${id}`));
        return;
      }

      const n = Math.max(1, Number.parseInt(options.number ?? String(DEFAULT_LINES), 10) || DEFAULT_LINES);
      await printTail(path, n);

      if (options.follow) {
        await followFile(path);
      }
    });
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await access(p);
      return p;
    } catch {
      // try next
    }
  }
  return null;
}

async function printTail(path: string, n: number): Promise<void> {
  // Read all lines and emit the last n. Wrapper log files are line-oriented
  // and small enough for this to be acceptable; if they grow huge we can
  // switch to reverse-chunked reads.
  const lines: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(path, 'utf8') });
    rl.on('line', (line) => {
      lines.push(line);
      if (lines.length > n * 4) lines.splice(0, lines.length - n * 2);
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
  const tail = lines.slice(-n);
  for (const line of tail) console.log(line);
}

async function followFile(path: string): Promise<void> {
  let offset = (await stat(path)).size;
  console.log(chalk.dim(`-- following ${path} (Ctrl-C to stop) --`));

  const watcher = watch(path, { persistent: true }, async (eventType) => {
    if (eventType !== 'change' && eventType !== 'rename') return;
    try {
      const st = await stat(path);
      if (st.size < offset) offset = 0;
      if (st.size === offset) return;
      const fd = await open(path, 'r');
      try {
        const length = st.size - offset;
        const buf = Buffer.alloc(length);
        await fd.read(buf, 0, length, offset);
        process.stdout.write(buf.toString('utf8'));
        offset = st.size;
      } finally {
        await fd.close();
      }
    } catch {
      // ignore transient errors
    }
  });

  await new Promise<void>((resolve) => {
    const onSig = (): void => {
      watcher.close();
      console.log();
      resolve();
    };
    process.once('SIGINT', onSig);
    process.once('SIGTERM', onSig);
  });
}
