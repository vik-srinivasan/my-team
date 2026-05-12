import { Command } from 'commander';
import chalk from 'chalk';
import { watch } from 'node:fs';
import { stat, open } from 'node:fs/promises';
import { resolveTeamFile, readTeamFile } from '../session-paths.js';

interface JournalOptions {
  number?: string;
  all?: boolean;
  follow?: boolean;
}

interface Entry {
  header: string;
  body: string;
}

const DEFAULT_COUNT = 5;

export function journalCommand(): Command {
  return new Command('journal')
    .description("Show entries from a session's .team/journal.md")
    .argument('<id>', 'Session ID')
    .option('-n, --number <count>', 'Number of entries to show', String(DEFAULT_COUNT))
    .option('--all', 'Show the full journal')
    .option('-f, --follow', 'Tail the journal and print new content as it is written')
    .action(async (id: string, options: JournalOptions) => {
      try {
        const journalPath = resolveTeamFile(id, 'journal.md');
        const raw = await readTeamFile(id, 'journal.md');

        if (raw === null) {
          console.log(chalk.dim(`No journal yet for ${id}.`));
          if (!options.follow) return;
        }

        if (raw && raw.trim().length > 0) {
          const entries = parseEntries(raw);
          const slice = sliceEntries(entries, options);
          printEntries(slice);
        }

        if (options.follow) {
          await followJournal(journalPath);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to read journal: ${message}`));
        process.exit(1);
      }
    });
}

export function parseEntries(raw: string): Entry[] {
  const out: Entry[] = [];
  const lines = raw.split('\n');
  let current: Entry | null = null;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) out.push(current);
      current = { header: line, body: '' };
      continue;
    }
    if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) out.push(current);
  return out;
}

function sliceEntries(entries: Entry[], opts: JournalOptions): Entry[] {
  if (opts.all) return entries;
  const n = Math.max(1, Number.parseInt(opts.number ?? String(DEFAULT_COUNT), 10) || DEFAULT_COUNT);
  return entries.slice(-n);
}

function printEntries(entries: Entry[]): void {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    console.log(chalk.bold.cyan(e.header));
    const body = e.body.replace(/\s+$/g, '');
    if (body) console.log(body);
    if (i < entries.length - 1) console.log();
  }
}

async function followJournal(path: string): Promise<void> {
  let offset = 0;
  try {
    const st = await stat(path);
    offset = st.size;
  } catch {
    // file doesn't exist yet; we'll catch it the first time it appears
  }

  console.log();
  console.log(chalk.dim(`-- following ${path} (Ctrl-C to stop) --`));

  const watcher = watch(path, { persistent: true }, async (eventType) => {
    if (eventType !== 'change' && eventType !== 'rename') return;
    try {
      const st = await stat(path);
      if (st.size < offset) {
        // File was truncated; restart from 0
        offset = 0;
      }
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
      // File may have disappeared briefly during rename
    }
  });

  // Keep alive until SIGINT
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

// ── Test exports ────────────────────────────────────────────────────────

export const __test__ = {
  parseEntries,
  sliceEntries,
};
