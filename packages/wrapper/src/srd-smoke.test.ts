/**
 * Smoke test for the new SRD planning step.
 *
 * Simulates what happens when captain produces .team/srd.md during the
 * planning phase WITHOUT actually dispatching Claude. Verifies the
 * wrapper-side reader (readAllTeamFiles + readTeamFile) picks up the
 * file correctly, and that the empty-→-populated transition the captain
 * walks during planning works as expected.
 *
 * CLI-side readers are covered by packages/cli/src/commands/srd.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

import { readAllTeamFiles, readTeamFile, teamDir } from './team-files.js';
import type { SessionMeta, SessionState } from '@my-team/shared';

describe('SRD planning-step smoke', () => {
  let sessionsRoot: string;
  let worktreePath: string;
  const sessionId = 'srd-smoke-1';

  const sampleSrd = `# Session Requirements Doc — smoke test

**Status:** draft — awaiting user approval
**Effort level:** standard
**Authored:** 2026-05-13 — captain (srd-smoke)

## 1. Problem
Validate that .team/srd.md is wired through the wrapper readers.

## 2. Users
The captain agent during planning, plus the user reading \`team srd <id>\`.

## 3. Goals
1. readTeamFile picks up srd.md
2. readAllTeamFiles returns the srd field

## 4. Non-goals
- Dispatching a real Claude run.
`;

  const sampleMeta: SessionMeta = {
    id: sessionId,
    title: 'srd smoke test',
    source_repo: '/tmp/repo',
    source_branch: 'main',
    session_branch: `my-team/${sessionId}`,
    created_at: '2026-05-13T00:00:00Z',
  };

  const sampleState: SessionState = {
    phase: 'planning',
    active_specialist: null,
    review_iterations: 0,
    max_review_iterations: 8,
    last_checkpoint: '2026-05-13T00:00:00Z',
    blockers: [],
    must_ask_pending: [],
  };

  beforeEach(async () => {
    sessionsRoot = await mkdtemp(join(tmpdir(), 'team-srd-smoke-'));
    worktreePath = join(sessionsRoot, sessionId);
    const dir = teamDir(worktreePath);
    await mkdir(dir, { recursive: true });

    // Lay down the full set of .team/ files captain would maintain post-planning.
    await Promise.all([
      writeFile(join(dir, 'meta.json'), JSON.stringify(sampleMeta, null, 2)),
      writeFile(join(dir, 'state.json'), JSON.stringify(sampleState, null, 2)),
      writeFile(join(dir, 'srd.md'), sampleSrd),
      writeFile(join(dir, 'plan.md'), '# Plan\nDraft plan.'),
      writeFile(join(dir, 'context.md'), '# Context'),
      writeFile(join(dir, 'tasks.md'), '- [ ] @engineer placeholder'),
      writeFile(join(dir, 'journal.md'), ''),
      writeFile(join(dir, 'review.md'), ''),
      writeFile(join(dir, 'decisions.md'), ''),
    ]);
  });

  afterEach(async () => {
    await rm(sessionsRoot, { recursive: true, force: true });
  });

  it('readTeamFile picks up the SRD from a temp .team/ directory', async () => {
    const content = await readTeamFile(worktreePath, 'srd.md');
    expect(content).toBe(sampleSrd);
  });

  it('readAllTeamFiles returns the SRD field with full content', async () => {
    const files = await readAllTeamFiles(worktreePath);
    expect(files.srd).toBe(sampleSrd);
    expect(files.srd).toContain('## 1. Problem');
    expect(files.srd).toContain('## 4. Non-goals');
  });

  it('captain workflow: empty SRD at session start, populated post-planning', async () => {
    // Mimic the captain.md flow: srd.md is initialised empty on session
    // create (worktree.ts:103), then captain fills it during planning.
    const dir = teamDir(worktreePath);
    await writeFile(join(dir, 'srd.md'), ''); // session-create state

    const fresh = await readAllTeamFiles(worktreePath);
    expect(fresh.srd).toBe('');

    // Captain writes the SRD after chatting with user.
    await writeFile(join(dir, 'srd.md'), sampleSrd);

    const populated = await readAllTeamFiles(worktreePath);
    expect(populated.srd).toBe(sampleSrd);
  });

  it('cleanup removes the entire session root including srd.md', async () => {
    expect(existsSync(join(worktreePath, '.team', 'srd.md'))).toBe(true);

    await rm(sessionsRoot, { recursive: true, force: true });

    expect(existsSync(join(worktreePath, '.team', 'srd.md'))).toBe(false);
    // Recreate so the afterEach cleanup doesn't error.
    sessionsRoot = await mkdtemp(join(tmpdir(), 'team-srd-smoke-cleanup-'));
  });
});
