import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

/** Base directory where the wrapper stores session worktrees. */
export const SESSIONS_DIR = join(homedir(), 'team', 'sessions');

/** Resolve the absolute worktree directory for a session id. */
export function resolveSessionDir(id: string): string {
  return join(SESSIONS_DIR, id);
}

/** Resolve a path inside the session's `.team/` directory. */
export function resolveTeamFile(id: string, relpath: string): string {
  return join(resolveSessionDir(id), '.team', relpath);
}

/**
 * Read a file from the session worktree. Returns `null` if the file does
 * not exist; rethrows other errors. Path is resolved relative to the
 * session worktree root (NOT `.team/`).
 */
export async function readSessionFile(id: string, relpath: string): Promise<string | null> {
  const filePath = join(resolveSessionDir(id), relpath);
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Read a file from the session's `.team/` directory, or `null` if missing. */
export async function readTeamFile(id: string, relpath: string): Promise<string | null> {
  return readSessionFile(id, join('.team', relpath));
}
