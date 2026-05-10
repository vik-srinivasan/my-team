import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, writeFile, readdir, copyFile, cp, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { simpleGit } from 'simple-git';

import type { SessionMeta, SessionState } from '@viktown/shared';
import { NotAGitRepoError, WorktreeError } from '@viktown/shared';

const SESSIONS_DIR = join(homedir(), 'team', 'sessions');
const ARCHIVES_DIR = join(homedir(), 'team', 'archives');
const GLOBAL_AGENTS_DIR = join(homedir(), '.claude', 'agents');

export async function resolveRepoRoot(path: string): Promise<string> {
  const resolved = await realpath(path);
  const git = simpleGit(resolved);
  try {
    const root = await git.revparse(['--show-toplevel']);
    return (await realpath(root.trim()));
  } catch {
    throw new NotAGitRepoError(path);
  }
}

export async function getDefaultBranch(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  try {
    const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    // e.g. "refs/remotes/origin/main" → "main"
    return ref.trim().replace('refs/remotes/origin/', '');
  } catch {
    // Fallback: try common defaults
    try {
      await git.raw(['rev-parse', '--verify', 'main']);
      return 'main';
    } catch {
      return 'master';
    }
  }
}

export function getWorktreePath(sessionId: string): string {
  return join(SESSIONS_DIR, sessionId);
}

export async function createWorktree(
  sourceRepo: string,
  sessionId: string,
  title: string,
): Promise<{ worktreePath: string; meta: SessionMeta }> {
  const repoRoot = await resolveRepoRoot(sourceRepo);
  const defaultBranch = await getDefaultBranch(repoRoot);
  const worktreePath = getWorktreePath(sessionId);
  const sessionBranch = `viktown/${sessionId}`;

  // Ensure sessions directory exists
  await mkdir(SESSIONS_DIR, { recursive: true });

  // Create worktree
  const git = simpleGit(repoRoot);
  try {
    await git.raw([
      'worktree', 'add',
      worktreePath,
      '-b', sessionBranch,
      defaultBranch,
    ]);
  } catch (err) {
    throw new WorktreeError(
      `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Initialize .team/ directory
  const teamDir = join(worktreePath, '.team');
  await mkdir(teamDir, { recursive: true });

  const meta: SessionMeta = {
    id: sessionId,
    title,
    source_repo: repoRoot,
    source_branch: defaultBranch,
    session_branch: sessionBranch,
    created_at: new Date().toISOString(),
  };

  const initialState: SessionState = {
    phase: 'created',
    active_specialist: null,
    review_iterations: 0,
    max_review_iterations: 8,
    last_checkpoint: new Date().toISOString(),
    blockers: [],
    must_ask_pending: [],
  };

  await Promise.all([
    writeFile(join(teamDir, 'meta.json'), JSON.stringify(meta, null, 2)),
    writeFile(join(teamDir, 'state.json'), JSON.stringify(initialState, null, 2)),
    writeFile(join(teamDir, 'plan.md'), ''),
    writeFile(join(teamDir, 'context.md'), ''),
    writeFile(join(teamDir, 'tasks.md'), ''),
    writeFile(join(teamDir, 'journal.md'), ''),
    writeFile(join(teamDir, 'review.md'), ''),
    writeFile(join(teamDir, 'decisions.md'), ''),
  ]);

  // Copy agent prompts into worktree
  await copyAgentPrompts(worktreePath, repoRoot);

  return { worktreePath, meta };
}

async function copyAgentPrompts(
  worktreePath: string,
  sourceRepo: string,
): Promise<void> {
  const destDir = join(worktreePath, '.claude', 'agents');
  await mkdir(destDir, { recursive: true });

  // Copy global agents first
  if (existsSync(GLOBAL_AGENTS_DIR)) {
    try {
      const files = await readdir(GLOBAL_AGENTS_DIR);
      for (const file of files) {
        if (file.endsWith('.md')) {
          await copyFile(join(GLOBAL_AGENTS_DIR, file), join(destDir, file));
        }
      }
    } catch {
      // Global agents dir might not exist or be unreadable — that's fine
    }
  }

  // Override with source repo agents
  const repoAgentsDir = join(sourceRepo, '.claude', 'agents');
  if (existsSync(repoAgentsDir)) {
    try {
      const files = await readdir(repoAgentsDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          await copyFile(join(repoAgentsDir, file), join(destDir, file));
        }
      }
    } catch {
      // Repo agents dir might not exist or be unreadable — that's fine
    }
  }
}

export async function removeWorktree(
  sourceRepo: string,
  sessionId: string,
): Promise<void> {
  const repoRoot = await resolveRepoRoot(sourceRepo);
  const worktreePath = getWorktreePath(sessionId);
  const sessionBranch = `viktown/${sessionId}`;
  const git = simpleGit(repoRoot);

  try {
    await git.raw(['worktree', 'remove', worktreePath, '--force']);
  } catch (err) {
    throw new WorktreeError(
      `Failed to remove worktree: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Clean up branch
  try {
    await git.raw(['branch', '-D', sessionBranch]);
  } catch {
    // Branch might already be gone
  }
}

export async function archiveSession(sessionId: string): Promise<string> {
  const worktreePath = getWorktreePath(sessionId);
  const teamDir = join(worktreePath, '.team');
  const archiveDir = join(ARCHIVES_DIR, sessionId);

  if (!existsSync(teamDir)) {
    throw new WorktreeError(`No .team/ directory found at ${teamDir}`);
  }

  await mkdir(archiveDir, { recursive: true });
  await cp(teamDir, archiveDir, { recursive: true });

  return archiveDir;
}
