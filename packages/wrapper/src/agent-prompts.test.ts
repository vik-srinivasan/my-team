import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import type { SessionMeta } from '@my-team/shared';
import { AgentNotFoundError, InvalidAgentNameError, SessionNotFoundError } from '@my-team/shared';

import {
  listAgents,
  getAgent,
  putAgent,
  assertValidAgentName,
  type SessionLookup,
} from './agent-prompts.js';

// ── Test scaffolding ───────────────────────────────────────────────
//
// The module operates on four disk layers:
//   1. session   — <worktree>/.claude/agents/<name>.md
//   2. repo      — <source_repo>/.claude/agents/<name>.md
//   3. user      — ~/.claude/agents/<name>.md   (NOT mocked — we read
//      whatever happens to be there; tests for the user layer use a
//      throwaway name nobody else would have)
//   4. default   — <repo-root>/agent-prompts/<name>.md (the real
//      packaged defaults — tests assume `engineer.md` etc. exist there,
//      which is true in this monorepo)
//
// Each test builds a fresh worktree + source-repo pair in tmpdir, points
// a stub `SessionLookup` at them, and writes whichever layer it wants
// the helper to discover.

interface TestEnv {
  worktreePath: string;
  sourceRepo: string;
  sessions: SessionLookup;
  meta: SessionMeta;
}

async function makeEnv(): Promise<TestEnv> {
  const root = await mkdtemp(join(tmpdir(), 'my-team-agent-prompts-'));
  const worktreePath = join(root, 'worktree');
  const sourceRepo = join(root, 'repo');
  await mkdir(worktreePath, { recursive: true });
  await mkdir(sourceRepo, { recursive: true });

  const meta: SessionMeta = {
    id: 'test-session',
    title: 'test',
    source_repo: sourceRepo,
    source_branch: 'main',
    session_branch: 'my-team/test-session',
    created_at: new Date().toISOString(),
  };

  const sessions: SessionLookup = {
    getSession: (id: string): { meta: SessionMeta; worktree_path: string } => {
      if (id !== 'test-session') throw new SessionNotFoundError(id);
      return { meta, worktree_path: worktreePath };
    },
  };

  return { worktreePath, sourceRepo, sessions, meta };
}

const TMP_ROOTS: string[] = [];

async function freshEnv(): Promise<TestEnv> {
  const env = await makeEnv();
  TMP_ROOTS.push(env.worktreePath);
  TMP_ROOTS.push(env.sourceRepo);
  return env;
}

afterEach(async () => {
  for (const path of TMP_ROOTS.splice(0)) {
    await rm(path, { recursive: true, force: true }).catch(() => {});
  }
});

// ── assertValidAgentName ────────────────────────────────────────────

describe('assertValidAgentName', () => {
  it.each([
    ['engineer'],
    ['tester'],
    ['my-custom-agent'],
    ['a'],
    ['a1'],
    ['agent-1-2-3'],
  ])('accepts %s', (name) => {
    expect(() => assertValidAgentName(name)).not.toThrow();
  });

  it.each([
    ['Engineer'],          // uppercase
    ['1agent'],            // leading digit
    ['-agent'],            // leading hyphen
    ['../etc/passwd'],     // path traversal
    ['agent/sub'],         // contains slash
    [''],                  // empty
    ['agent.md'],          // contains dot
    ['agent name'],        // contains space
    ['agent_name'],        // underscore (we standardize on hyphen)
  ])('rejects %s', (name) => {
    expect(() => assertValidAgentName(name)).toThrow(InvalidAgentNameError);
  });
});

// ── getAgent layer fallback ─────────────────────────────────────────

describe('getAgent fallback order', () => {
  it('prefers session layer over repo / default', async () => {
    const env = await freshEnv();
    const sessionDir = join(env.worktreePath, '.claude', 'agents');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'engineer.md'), 'SESSION_BODY');

    // Also write a repo-layer override to confirm session wins.
    const repoDir = join(env.sourceRepo, '.claude', 'agents');
    await mkdir(repoDir, { recursive: true });
    await writeFile(join(repoDir, 'engineer.md'), 'REPO_BODY');

    const res = await getAgent(env.sessions, 'test-session', 'engineer');
    expect(res.source).toBe('session');
    expect(res.content).toBe('SESSION_BODY');
    expect(res.name).toBe('engineer');
  });

  it('falls through to repo layer when session is absent', async () => {
    const env = await freshEnv();
    const repoDir = join(env.sourceRepo, '.claude', 'agents');
    await mkdir(repoDir, { recursive: true });
    await writeFile(join(repoDir, 'engineer.md'), 'REPO_BODY');

    const res = await getAgent(env.sessions, 'test-session', 'engineer');
    expect(res.source).toBe('repo');
    expect(res.content).toBe('REPO_BODY');
  });

  it('falls through to default layer for a standard specialist when no override exists', async () => {
    const env = await freshEnv();
    // No session-layer, no repo-layer. User layer test below covers the
    // tail of the chain; here we lean on the real packaged defaults
    // shipping `engineer.md` at <repo>/agent-prompts/engineer.md.
    const res = await getAgent(env.sessions, 'test-session', 'engineer');
    // Could come from `user` if the dev has ~/.claude/agents/engineer.md,
    // but `default` is the canonical path. Accept either user/default.
    expect(res.source === 'user' || res.source === 'default').toBe(true);
    expect(res.content.length).toBeGreaterThan(0);
  });

  it('throws AgentNotFoundError when no layer has the prompt', async () => {
    const env = await freshEnv();
    // Use a name that definitely doesn't ship as a default and isn't
    // in the user's ~/.claude/agents.
    const ghost = 'definitely-not-a-real-agent-zzz';
    await expect(getAgent(env.sessions, 'test-session', ghost)).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
  });

  it('rejects invalid names with InvalidAgentNameError', async () => {
    const env = await freshEnv();
    await expect(getAgent(env.sessions, 'test-session', '../etc/passwd')).rejects.toBeInstanceOf(
      InvalidAgentNameError,
    );
    await expect(getAgent(env.sessions, 'test-session', 'Engineer')).rejects.toBeInstanceOf(
      InvalidAgentNameError,
    );
  });
});

// ── putAgent ────────────────────────────────────────────────────────

describe('putAgent', () => {
  it('writes to the session worktree and creates the directory', async () => {
    const env = await freshEnv();
    const dir = join(env.worktreePath, '.claude', 'agents');
    expect(existsSync(dir)).toBe(false);

    const res = await putAgent(env.sessions, 'test-session', 'engineer', 'CUSTOM');
    expect(res.source).toBe('session');
    expect(res.content).toBe('CUSTOM');
    expect(res.name).toBe('engineer');

    const filePath = join(dir, 'engineer.md');
    const fileInfo = await stat(filePath);
    expect(fileInfo.isFile()).toBe(true);
    const onDisk = await readFile(filePath, 'utf-8');
    expect(onDisk).toBe('CUSTOM');
  });

  it('overwrites an existing session-layer prompt without touching other layers', async () => {
    const env = await freshEnv();
    const sessionDir = join(env.worktreePath, '.claude', 'agents');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'engineer.md'), 'OLD');

    const repoDir = join(env.sourceRepo, '.claude', 'agents');
    await mkdir(repoDir, { recursive: true });
    await writeFile(join(repoDir, 'engineer.md'), 'REPO');

    await putAgent(env.sessions, 'test-session', 'engineer', 'NEW');

    expect(await readFile(join(sessionDir, 'engineer.md'), 'utf-8')).toBe('NEW');
    // Repo layer is untouched.
    expect(await readFile(join(repoDir, 'engineer.md'), 'utf-8')).toBe('REPO');
  });

  it('rejects invalid names before touching disk', async () => {
    const env = await freshEnv();
    await expect(
      putAgent(env.sessions, 'test-session', '../escaped', 'x'),
    ).rejects.toBeInstanceOf(InvalidAgentNameError);
    // Directory should not have been created.
    expect(existsSync(join(env.worktreePath, '.claude'))).toBe(false);
  });

  it('throws SessionNotFoundError for an unknown session', async () => {
    const env = await freshEnv();
    await expect(
      putAgent(env.sessions, 'unknown-session', 'engineer', 'x'),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

// ── listAgents ──────────────────────────────────────────────────────

describe('listAgents', () => {
  it('returns at least the 10 default agents in alphabetical order', async () => {
    const env = await freshEnv();
    const { agents } = await listAgents(env.sessions, 'test-session');
    const names = agents.map((a) => a.name);
    // Each of the 10 defaults must appear.
    for (const required of [
      'auditor',
      'captain',
      'debugger',
      'designer',
      'documenter',
      'engineer',
      'reviewer',
      'runner',
      'scout',
      'tester',
    ]) {
      expect(names).toContain(required);
    }
    // Alphabetically sorted.
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('marks an agent as exists=true with source=session when only the session layer has it', async () => {
    const env = await freshEnv();
    const sessionDir = join(env.worktreePath, '.claude', 'agents');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'engineer.md'), 'OVERRIDE');

    const { agents } = await listAgents(env.sessions, 'test-session');
    const eng = agents.find((a) => a.name === 'engineer');
    expect(eng?.exists).toBe(true);
    expect(eng?.source).toBe('session');
  });

  it('reports source=repo when only the repo layer overrides a default', async () => {
    const env = await freshEnv();
    const repoDir = join(env.sourceRepo, '.claude', 'agents');
    await mkdir(repoDir, { recursive: true });
    await writeFile(join(repoDir, 'engineer.md'), 'REPO_OVERRIDE');

    const { agents } = await listAgents(env.sessions, 'test-session');
    const eng = agents.find((a) => a.name === 'engineer');
    expect(eng?.exists).toBe(true);
    expect(eng?.source).toBe('repo');
  });

  it('includes extra .md files found in the session worktree dir', async () => {
    const env = await freshEnv();
    const sessionDir = join(env.worktreePath, '.claude', 'agents');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'my-bespoke-agent.md'), 'CUSTOM');

    const { agents } = await listAgents(env.sessions, 'test-session');
    const custom = agents.find((a) => a.name === 'my-bespoke-agent');
    expect(custom).toBeTruthy();
    expect(custom?.source).toBe('session');
    expect(custom?.exists).toBe(true);
  });

  it('throws SessionNotFoundError for an unknown session', async () => {
    const env = await freshEnv();
    await expect(listAgents(env.sessions, 'unknown')).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  it('skips weirdly-named files in the session dir', async () => {
    const env = await freshEnv();
    const sessionDir = join(env.worktreePath, '.claude', 'agents');
    await mkdir(sessionDir, { recursive: true });
    // These should NOT surface in the agent list — they fail the regex.
    await writeFile(join(sessionDir, '.hidden.md'), 'x');
    await writeFile(join(sessionDir, 'UPPER.md'), 'x');
    await writeFile(join(sessionDir, 'with space.md'), 'x');

    const { agents } = await listAgents(env.sessions, 'test-session');
    const names = agents.map((a) => a.name);
    expect(names).not.toContain('.hidden');
    expect(names).not.toContain('UPPER');
    expect(names).not.toContain('with space');
  });
});

// Avoid flaky leftovers across tests if anything failed mid-write.
afterEach(async () => {
  // Best-effort. Tracked roots are cleared by the earlier hook.
  await new Promise<void>((resolve) => setImmediate(resolve));
});

// homedir reference is intentional — the `user` layer test path is best
// covered by the integration suite (`packages/wrapper/src/server.test.ts`),
// where we can swap HOME via env. Here we content ourselves with verifying
// the rest of the chain.
void homedir;
