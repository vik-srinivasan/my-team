import { join, basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { watch } from 'chokidar';

import type { SessionMeta, SessionState, TeamFiles } from '@my-team/shared';

const TEAM_DIR = '.team';

const TEAM_FILE_NAMES = [
  'meta.json',
  'state.json',
  'plan.md',
  'context.md',
  'tasks.md',
  'journal.md',
  'review.md',
  'decisions.md',
] as const;

export function teamDir(worktreePath: string): string {
  return join(worktreePath, TEAM_DIR);
}

export async function readTeamFile(worktreePath: string, filename: string): Promise<string> {
  const filePath = join(teamDir(worktreePath), filename);
  return readFile(filePath, 'utf-8');
}

export async function readTeamState(worktreePath: string): Promise<SessionState> {
  const content = await readTeamFile(worktreePath, 'state.json');
  return JSON.parse(content) as SessionState;
}

export async function readTeamMeta(worktreePath: string): Promise<SessionMeta> {
  const content = await readTeamFile(worktreePath, 'meta.json');
  return JSON.parse(content) as SessionMeta;
}

export async function readAllTeamFiles(worktreePath: string): Promise<TeamFiles> {
  const [meta, state, plan, context, tasks, journal, review, decisions] = await Promise.all([
    readTeamFile(worktreePath, 'meta.json').then((c) => JSON.parse(c) as SessionMeta),
    readTeamFile(worktreePath, 'state.json').then((c) => JSON.parse(c) as SessionState),
    readTeamFile(worktreePath, 'plan.md'),
    readTeamFile(worktreePath, 'context.md'),
    readTeamFile(worktreePath, 'tasks.md'),
    readTeamFile(worktreePath, 'journal.md'),
    readTeamFile(worktreePath, 'review.md'),
    readTeamFile(worktreePath, 'decisions.md'),
  ]);

  return { meta, state, plan, context, tasks, journal, review, decisions };
}

export interface TeamFileWatcher {
  close: () => Promise<void>;
}

export function watchTeamFiles(
  worktreePath: string,
  onChange: (filename: string, content: string) => void,
  debounceMs: number = 200,
): TeamFileWatcher {
  const dir = teamDir(worktreePath);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const watcher = watch(dir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: debounceMs,
      pollInterval: 50,
    },
  });

  watcher.on('change', (filePath) => {
    const filename = basename(filePath);
    if (!TEAM_FILE_NAMES.includes(filename as typeof TEAM_FILE_NAMES[number])) {
      return;
    }

    // Debounce per-file
    const existing = timers.get(filename);
    if (existing) {
      clearTimeout(existing);
    }

    timers.set(
      filename,
      setTimeout(async () => {
        timers.delete(filename);
        try {
          const content = await readFile(filePath, 'utf-8');
          onChange(filename, content);
        } catch {
          // File might be mid-write — ignore
        }
      }, debounceMs),
    );
  });

  return {
    close: async () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      await watcher.close();
    },
  };
}
