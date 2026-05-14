import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import { resolveRepoRoot, getDefaultBranch, createWorktree, removeWorktree, archiveSession, getWorktreePath } from './worktree.js';

describe('worktree', () => {
  let tempRepo: string;
  let sessionsRootDir: string;

  beforeEach(async () => {
    // Create a real temp git repo for testing
    tempRepo = await realpath(await mkdtemp(join(tmpdir(), 'my-team-test-')));
    execSync('git init', { cwd: tempRepo });
    execSync('git checkout -b main', { cwd: tempRepo });
    execSync('echo "hello" > test.txt', { cwd: tempRepo });
    execSync('git add .', { cwd: tempRepo });
    execSync('git commit -m "init"', { cwd: tempRepo });

    // Isolate sessions root so worktrees go to a temp dir, not the user's
    // real ~/team/sessions/.
    sessionsRootDir = await mkdtemp(join(tmpdir(), 'my-team-sessions-'));
    process.env['MY_TEAM_SESSIONS_DIR'] = sessionsRootDir;
  });

  afterEach(async () => {
    // Clean up temp repo and any worktrees
    await rm(tempRepo, { recursive: true, force: true });
    await rm(sessionsRootDir, { recursive: true, force: true });
    delete process.env['MY_TEAM_SESSIONS_DIR'];
  });

  describe('resolveRepoRoot', () => {
    it('returns repo root for a valid git repo', async () => {
      const root = await resolveRepoRoot(tempRepo);
      expect(root).toBe(tempRepo);
    });

    it('throws NotAGitRepoError for non-repo', async () => {
      const nonRepo = await realpath(await mkdtemp(join(tmpdir(), 'my-team-nonrepo-')));
      await expect(resolveRepoRoot(nonRepo)).rejects.toThrow('Not a git repository');
      await rm(nonRepo, { recursive: true, force: true });
    });
  });

  describe('getDefaultBranch', () => {
    it('returns main when main branch exists', async () => {
      const branch = await getDefaultBranch(tempRepo);
      expect(branch).toBe('main');
    });
  });

  describe('createWorktree', () => {
    let sessionId: string;

    beforeEach(() => {
      sessionId = `test-${Date.now()}`;
    });

    afterEach(async () => {
      const worktreePath = getWorktreePath(sessionId);
      if (existsSync(worktreePath)) {
        try {
          execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
        } catch {
          // Best effort cleanup
        }
        try {
          execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
        } catch {
          // Best effort cleanup
        }
      }
    });

    it('creates worktree with correct .team/ structure', async () => {
      const { worktreePath, meta } = await createWorktree(tempRepo, sessionId, 'Test Session');

      // Worktree exists
      expect(existsSync(worktreePath)).toBe(true);

      // .team/ files exist
      const teamDir = join(worktreePath, '.team');
      const files = await readdir(teamDir);
      expect(files.sort()).toEqual([
        'context.md',
        'decisions.md',
        'journal.md',
        'meta.json',
        'plan.md',
        'review.md',
        'srd.md',
        'state.json',
        'tasks.md',
      ]);

      // meta.json is correct
      const metaContent = JSON.parse(await readFile(join(teamDir, 'meta.json'), 'utf-8'));
      expect(metaContent.id).toBe(sessionId);
      expect(metaContent.title).toBe('Test Session');
      expect(metaContent.source_repo).toBe(tempRepo);
      expect(metaContent.session_branch).toBe(`my-team/${sessionId}`);

      // state.json starts at 'created'
      const stateContent = JSON.parse(await readFile(join(teamDir, 'state.json'), 'utf-8'));
      expect(stateContent.phase).toBe('created');

      // Source file is present in worktree
      expect(existsSync(join(worktreePath, 'test.txt'))).toBe(true);

      // Return meta is correct
      expect(meta.id).toBe(sessionId);
    });
  });
});
