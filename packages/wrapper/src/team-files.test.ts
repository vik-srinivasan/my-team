import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readTeamFile, readTeamState, readTeamMeta, readAllTeamFiles, teamDir, watchTeamFiles } from './team-files.js';
import type { SessionMeta, SessionState } from '@my-team/shared';

describe('team-files', () => {
  let worktreePath: string;

  const testMeta: SessionMeta = {
    id: 'test-session-42',
    title: 'Test Session',
    source_repo: '/tmp/repo',
    source_branch: 'main',
    session_branch: 'my-team/test-session-42',
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
    worktreePath = await mkdtemp(join(tmpdir(), 'my-team-teamfiles-'));
    const dir = teamDir(worktreePath);
    await mkdir(dir, { recursive: true });
    await Promise.all([
      writeFile(join(dir, 'meta.json'), JSON.stringify(testMeta)),
      writeFile(join(dir, 'state.json'), JSON.stringify(testState)),
      writeFile(join(dir, 'srd.md'), ''),
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

  // ── SRD (added during deep-field-47 session) ───────────────────────

  it('reads the srd.md file via readTeamFile', async () => {
    const dir = teamDir(worktreePath);
    const body = '# SRD\n## Problem\nUser story.';
    await writeFile(join(dir, 'srd.md'), body);
    const content = await readTeamFile(worktreePath, 'srd.md');
    expect(content).toBe(body);
  });

  it('readAllTeamFiles surfaces the srd field on the returned TeamFiles object', async () => {
    const dir = teamDir(worktreePath);
    const body = '# SRD\nbody';
    await writeFile(join(dir, 'srd.md'), body);
    const files = await readAllTeamFiles(worktreePath);
    expect(files.srd).toBe(body);
    expect(typeof files.srd).toBe('string');
  });

  it('readAllTeamFiles returns the srd field even when the file is empty', async () => {
    // The default beforeEach() writes an empty srd.md.
    const files = await readAllTeamFiles(worktreePath);
    expect(files.srd).toBe('');
    // Still a string, not undefined — the field is present.
    expect(typeof files.srd).toBe('string');
  });

  it('readAllTeamFiles rejects if srd.md is missing (parity with other required files)', async () => {
    // Remove the srd.md file written by beforeEach()
    const { unlink } = await import('node:fs/promises');
    await unlink(join(teamDir(worktreePath), 'srd.md'));
    await expect(readAllTeamFiles(worktreePath)).rejects.toThrow();
  });

  it('watchTeamFiles emits change events for srd.md (parity with plan.md / tasks.md)', async () => {
    const debounceMs = 100;
    const seen: Array<{ name: string; content: string }> = [];

    const watcher = watchTeamFiles(
      worktreePath,
      (filename, content) => {
        seen.push({ name: filename, content });
      },
      debounceMs,
    );

    // Give chokidar a moment to attach.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const srdPath = join(teamDir(worktreePath), 'srd.md');
    await writeFile(srdPath, '# Updated SRD\nfresh body');
    // Wait long enough for chokidar's awaitWriteFinish (debounceMs) + the
    // additional debounce timer in watchTeamFiles to fire.
    await new Promise((resolve) => setTimeout(resolve, debounceMs * 5 + 200));

    await watcher.close();

    const srdEvents = seen.filter((e) => e.name === 'srd.md');
    expect(srdEvents.length).toBeGreaterThan(0);
    expect(srdEvents[srdEvents.length - 1]?.content).toContain('Updated SRD');
  });
});
