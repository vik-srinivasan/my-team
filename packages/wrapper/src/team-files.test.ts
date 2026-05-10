import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readTeamFile, readTeamState, readTeamMeta, readAllTeamFiles, teamDir } from './team-files.js';
import type { SessionMeta, SessionState } from '@my-team/shared';

describe('team-files', () => {
  let worktreePath: string;

  const testMeta: SessionMeta = {
    id: 'test-session-42',
    title: 'Test Session',
    source_repo: '/tmp/repo',
    source_branch: 'main',
    session_branch: 'viktown/test-session-42',
    created_at: '2026-05-09T10:00:00Z',
  };

  const testState: SessionState = {
    phase: 'created',
    active_specialist: null,
    review_iterations: 0,
    max_review_iterations: 8,
    last_checkpoint: '2026-05-09T10:00:00Z',
    blockers: [],
    must_ask_pending: [],
  };

  beforeEach(async () => {
    worktreePath = await mkdtemp(join(tmpdir(), 'viktown-teamfiles-'));
    const dir = teamDir(worktreePath);
    await mkdir(dir, { recursive: true });
    await Promise.all([
      writeFile(join(dir, 'meta.json'), JSON.stringify(testMeta)),
      writeFile(join(dir, 'state.json'), JSON.stringify(testState)),
      writeFile(join(dir, 'plan.md'), '# Plan\nDo the thing'),
      writeFile(join(dir, 'context.md'), '# Context'),
      writeFile(join(dir, 'tasks.md'), '- [ ] Task 1'),
      writeFile(join(dir, 'journal.md'), ''),
      writeFile(join(dir, 'review.md'), ''),
      writeFile(join(dir, 'decisions.md'), ''),
    ]);
  });

  afterEach(async () => {
    await rm(worktreePath, { recursive: true, force: true });
  });

  it('reads a single team file', async () => {
    const content = await readTeamFile(worktreePath, 'plan.md');
    expect(content).toBe('# Plan\nDo the thing');
  });

  it('reads team state', async () => {
    const state = await readTeamState(worktreePath);
    expect(state.phase).toBe('created');
    expect(state.max_review_iterations).toBe(8);
  });

  it('reads team meta', async () => {
    const meta = await readTeamMeta(worktreePath);
    expect(meta.id).toBe('test-session-42');
    expect(meta.title).toBe('Test Session');
  });

  it('reads all team files', async () => {
    const files = await readAllTeamFiles(worktreePath);
    expect(files.meta.id).toBe('test-session-42');
    expect(files.state.phase).toBe('created');
    expect(files.plan).toBe('# Plan\nDo the thing');
    expect(files.tasks).toBe('- [ ] Task 1');
    expect(files.journal).toBe('');
  });
});
