import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import pino from 'pino';
import type { WsServerEvent } from '@my-team/shared';

import { SessionManager } from './session-manager.js';
import { createServer } from './server.js';
import { getWorktreePath } from './worktree.js';

// Mock claude process so tests don't actually spawn claude.
// The factory is async + dynamic-imports `node:events` because `vi.mock` is
// hoisted above the file's top-level imports, so a static `import { EventEmitter }`
// is not yet initialised when the factory runs.
vi.mock('./claude-process.js', async () => {
  const { EventEmitter } = await import('node:events');

  class MockCaptainProcess extends EventEmitter {
    pid = 99999;
    running = true;

    write = vi.fn();
    kill = vi.fn(() => {
      this.running = false;
    });
    resize = vi.fn();
  }

  return {
    CaptainProcess: MockCaptainProcess,
    spawnCaptain: vi.fn(async () => new MockCaptainProcess()),
  };
});

describe('HTTP API integration', () => {
  let tempRepo: string;
  let sessionManager: SessionManager;
  let app: ReturnType<typeof createServer>['app'];
  let captainPromptPath: string;
  let clearMustAskHookPath: string;
  let stopHookPath: string;
  let askQuestionHookPath: string;
  let registryPath: string;
  let registryDir: string;
  let sessionsRootDir: string;

  beforeAll(async () => {
    // Create a temp git repo
    tempRepo = await realpath(await mkdtemp(join(tmpdir(), 'my-team-e2e-')));
    execSync('git init', { cwd: tempRepo });
    execSync('git checkout -b main', { cwd: tempRepo });
    execSync('echo "hello" > test.txt', { cwd: tempRepo });
    execSync('git add .', { cwd: tempRepo });
    execSync('git commit -m "init"', { cwd: tempRepo });

    // Use a temp captain prompt
    captainPromptPath = join(tempRepo, 'captain.md');
    execSync(`echo "# Captain" > "${captainPromptPath}"`, { cwd: tempRepo });

    // Stub hook scripts — content doesn't matter for these tests, only the paths.
    clearMustAskHookPath = join(tempRepo, 'clear-must-ask.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${clearMustAskHookPath}"`, { cwd: tempRepo });
    stopHookPath = join(tempRepo, 'mark-must-ask.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${stopHookPath}"`, { cwd: tempRepo });
    askQuestionHookPath = join(tempRepo, 'mark-must-ask-on-question.sh');
    execSync(`echo "#!/usr/bin/env bash" > "${askQuestionHookPath}"`, { cwd: tempRepo });

    // Isolate the recents registry so tests don't touch the real ~/team/recents.json
    registryDir = await mkdtemp(join(tmpdir(), 'my-team-registry-'));
    registryPath = join(registryDir, 'recents.json');
    process.env['MY_TEAM_REGISTRY_PATH'] = registryPath;

    // Isolate the sessions root so the disk-merge in listSessions doesn't
    // pick up the user's real ~/team/sessions/. Set BEFORE every call that
    // resolves it (createSession / listSessions / getWorktreePath).
    sessionsRootDir = await mkdtemp(join(tmpdir(), 'my-team-sessions-'));
    process.env['MY_TEAM_SESSIONS_DIR'] = sessionsRootDir;
  });

  afterAll(async () => {
    await rm(tempRepo, { recursive: true, force: true });
    await rm(registryDir, { recursive: true, force: true });
    await rm(sessionsRootDir, { recursive: true, force: true });
    delete process.env['MY_TEAM_REGISTRY_PATH'];
    delete process.env['MY_TEAM_SESSIONS_DIR'];
  });

  beforeEach(() => {
    const log = pino({ level: 'silent' });
    sessionManager = new SessionManager(
      log,
      captainPromptPath,
      clearMustAskHookPath,
      stopHookPath,
      askQuestionHookPath,
    );
    const server = createServer({ sessionManager, log });
    app = server.app;
  });

  afterEach(async () => {
    // Clean up sessions
    await sessionManager.shutdownAll();
  });

  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/sessions returns empty list initially', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/sessions creates a session with correct structure', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Test Feature' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe('Test Feature');
    expect(res.body.worktree_path).toBeTruthy();
    expect(res.body.phase).toBe('created');

    // Verify worktree was created
    const worktreePath = res.body.worktree_path;
    expect(existsSync(worktreePath)).toBe(true);

    // Verify .team/ structure
    const teamDir = join(worktreePath, '.team');
    const teamFiles = await readdir(teamDir);
    expect(teamFiles.sort()).toEqual([
      'context.md', 'decisions.md', 'journal.md',
      'meta.json', 'plan.md', 'review.md', 'srd.md', 'state.json', 'tasks.md',
    ]);

    // Verify meta.json content
    const meta = JSON.parse(await readFile(join(teamDir, 'meta.json'), 'utf-8'));
    expect(meta.title).toBe('Test Feature');
    expect(meta.source_repo).toBe(tempRepo);

    // Verify .claude/settings.json was written with all three captain
    // hooks (UserPromptSubmit, Stop, PreToolUse) pointing at the
    // (absolute) hook script paths the wrapper was configured with.
    const settingsPath = join(worktreePath, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(settings).toEqual({
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [{ type: 'command', command: clearMustAskHookPath }],
          },
        ],
        Stop: [
          {
            matcher: '',
            hooks: [{ type: 'command', command: stopHookPath }],
          },
        ],
        PreToolUse: [
          {
            matcher: 'AskUserQuestion',
            hooks: [{ type: 'command', command: askQuestionHookPath }],
          },
        ],
      },
    });

    // Clean up the worktree
    const sessionId = res.body.id;
    await sessionManager.killSession(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });

  it('POST /api/sessions records the source repo in the recents registry', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Registry Test' });

    expect(res.status).toBe(201);
    const sessionId = res.body.id;
    const worktreePath = res.body.worktree_path;

    // Give the best-effort write a chance to settle (it's awaited in createSession,
    // but the response is sent right after — re-read the registry from disk).
    expect(existsSync(registryPath)).toBe(true);
    const registry = JSON.parse(await readFile(registryPath, 'utf-8'));
    expect(registry.version).toBe(1);
    expect(Array.isArray(registry.repos)).toBe(true);
    const entry = registry.repos.find((r: { path: string }) => r.path === tempRepo);
    expect(entry).toBeTruthy();
    expect(entry.session_count).toBeGreaterThanOrEqual(1);
    expect(entry.last_session_id).toBe(sessionId);

    // Clean up
    await sessionManager.killSession(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });

  it('POST /api/sessions validates request body', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ title: 'Missing repo' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/sessions/:id returns 404 for unknown session', async () => {
    const res = await request(app).get('/api/sessions/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('POST /api/sessions/:id/kill returns 404 for unknown session', async () => {
    const res = await request(app).post('/api/sessions/nonexistent/kill');
    expect(res.status).toBe(404);
  });

  it('emits specialist events when active_specialist changes in state.json', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Specialist Event Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;
    const worktreePath = createRes.body.worktree_path;

    // Collect emitted events
    const events: WsServerEvent[] = [];
    sessionManager.on('event', (_id, event) => {
      events.push(event);
    });

    // Simulate state.json change with active_specialist
    const stateWithSpecialist = {
      phase: 'executing',
      active_specialist: 'engineer',
      review_iterations: 0,
      max_review_iterations: 8,
      last_checkpoint: new Date().toISOString(),
      blockers: [],
      must_ask_pending: [],
    };
    await writeFile(
      join(worktreePath, '.team', 'state.json'),
      JSON.stringify(stateWithSpecialist, null, 2),
    );

    // Wait for chokidar debounce + diff debounce
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should have specialist started + state event
    const specialistEvents = events.filter((e) => e.type === 'specialist');
    expect(specialistEvents.length).toBeGreaterThanOrEqual(1);
    expect(specialistEvents[0]).toEqual({
      type: 'specialist',
      name: 'engineer',
      status: 'started',
    });

    // Clean up
    await sessionManager.killSession(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });

  it('writes notification file when session enters blocked state', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Blocked Notification Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;
    const worktreePath = createRes.body.worktree_path;

    // Simulate state.json change to blocked
    const blockedState = {
      phase: 'blocked',
      active_specialist: null,
      review_iterations: 8,
      max_review_iterations: 8,
      last_checkpoint: new Date().toISOString(),
      blockers: ['Max review iterations reached'],
      must_ask_pending: [],
    };
    await writeFile(
      join(worktreePath, '.team', 'state.json'),
      JSON.stringify(blockedState, null, 2),
    );

    // Wait for chokidar debounce + notification write
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Check notification file was created
    const notificationPath = join(homedir(), 'team', 'notifications', `${sessionId}.json`);
    expect(existsSync(notificationPath)).toBe(true);

    const notification = JSON.parse(await readFile(notificationPath, 'utf-8'));
    expect(notification.session_id).toBe(sessionId);
    expect(notification.title).toBe('Blocked Notification Test');
    expect(notification.reason).toContain('Max review iterations');

    // Clean up notification
    await rm(notificationPath, { force: true });

    // Clean up session
    await sessionManager.killSession(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });

  it('emitInitialTeamFiles emits one team_file event per broadcast file', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Team File Hydration Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;
    const worktreePath = createRes.body.worktree_path;

    // Seed each of the four broadcast files with distinguishable content
    const teamDir = join(worktreePath, '.team');
    await Promise.all([
      writeFile(join(teamDir, 'plan.md'), 'PLAN_BODY'),
      writeFile(join(teamDir, 'tasks.md'), 'TASKS_BODY'),
      writeFile(join(teamDir, 'journal.md'), 'JOURNAL_BODY'),
      writeFile(join(teamDir, 'review.md'), 'REVIEW_BODY'),
    ]);

    const events: WsServerEvent[] = [];
    sessionManager.on('event', (_id, event) => {
      events.push(event);
    });

    await sessionManager.emitInitialTeamFiles(sessionId);

    const teamFileEvents = events.filter((e) => e.type === 'team_file');
    expect(teamFileEvents).toHaveLength(4);

    const byName = new Map(
      teamFileEvents.map((e) => {
        if (e.type !== 'team_file') throw new Error('unreachable');
        return [e.name, e.content];
      }),
    );
    expect(byName.get('plan')).toBe('PLAN_BODY');
    expect(byName.get('tasks')).toBe('TASKS_BODY');
    expect(byName.get('journal')).toBe('JOURNAL_BODY');
    expect(byName.get('review')).toBe('REVIEW_BODY');

    // Clean up
    await sessionManager.killSession(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });

  it('emitInitialTeamFiles emits empty content for missing files', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Missing Team Files Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;
    const worktreePath = createRes.body.worktree_path;

    // Delete review.md to simulate the "not created yet" case
    await rm(join(worktreePath, '.team', 'review.md'), { force: true });

    const events: WsServerEvent[] = [];
    sessionManager.on('event', (_id, event) => {
      events.push(event);
    });

    await sessionManager.emitInitialTeamFiles(sessionId);

    const reviewEvent = events.find(
      (e) => e.type === 'team_file' && e.name === 'review',
    );
    expect(reviewEvent).toBeTruthy();
    if (reviewEvent?.type === 'team_file') {
      expect(reviewEvent.content).toBe('');
    }

    // Clean up
    await sessionManager.killSession(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });

  it('emits team_file event with canonical name when watched markdown file changes', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Team File Change Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;
    const worktreePath = createRes.body.worktree_path;

    const events: WsServerEvent[] = [];
    sessionManager.on('event', (_id, event) => {
      events.push(event);
    });

    // Mutate plan.md and wait for the chokidar debounce
    await writeFile(join(worktreePath, '.team', 'plan.md'), 'updated plan body');
    await new Promise((resolve) => setTimeout(resolve, 800));

    const planEvents = events.filter(
      (e) => e.type === 'team_file' && e.name === 'plan',
    );
    expect(planEvents.length).toBeGreaterThanOrEqual(1);
    const last = planEvents[planEvents.length - 1];
    if (last?.type === 'team_file') {
      expect(last.content).toBe('updated plan body');
    }

    // No team_file event should be emitted for non-broadcast files like
    // context.md, even though the watcher tracks them. We capture the count
    // before the mutation and assert it doesn't grow.
    const teamFileCountBefore = events.filter((e) => e.type === 'team_file').length;
    await writeFile(join(worktreePath, '.team', 'context.md'), 'context change');
    await new Promise((resolve) => setTimeout(resolve, 800));
    const teamFileCountAfter = events.filter((e) => e.type === 'team_file').length;
    expect(teamFileCountAfter).toBe(teamFileCountBefore);

    // Clean up
    await sessionManager.killSession(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });

  it('GET /api/sessions reflects out-of-band state.json edits even if chokidar misses them', async () => {
    // Regression for stale-state bug: chokidar on macOS sometimes drops
    // file-system events, leaving the in-memory state Map out of sync with
    // disk. listSessions() must re-read state.json so `team list` and
    // `team watch` always show the truth.
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Stale State Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;
    const worktreePath = createRes.body.worktree_path;

    // Sanity: initial phase visible in list.
    const initialList = await request(app).get('/api/sessions');
    const initialRow = initialList.body.find((s: { id: string }) => s.id === sessionId);
    expect(initialRow.phase).toBe('created');

    // Write state.json directly with a new phase. chokidar's awaitWriteFinish
    // debounce is 200ms, so the very next GET happens before it fires —
    // proving the response came from a fresh disk read, not in-memory state.
    const checkpoint = '2099-01-01T00:00:00.000Z';
    await writeFile(
      join(worktreePath, '.team', 'state.json'),
      JSON.stringify(
        {
          phase: 'executing',
          active_specialist: 'engineer',
          review_iterations: 0,
          max_review_iterations: 8,
          last_checkpoint: checkpoint,
          blockers: [],
          must_ask_pending: ['Does this work?'],
        },
        null,
        2,
      ),
    );

    // No sleep — request immediately, before chokidar can debounce.
    const listAfterWrite = await request(app).get('/api/sessions');
    const row = listAfterWrite.body.find((s: { id: string }) => s.id === sessionId);
    expect(row.phase).toBe('executing');
    expect(row.active_specialist).toBe('engineer');
    expect(row.last_checkpoint).toBe(checkpoint);
    expect(row.must_ask_count).toBe(1);

    // Clean up
    await sessionManager.killSession(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });

  it('transitioning to phase: done does NOT auto-clean the session', async () => {
    // Regression for "keep session alive after PR": the wrapper used to
    // schedule a 30s timer on the done transition that wiped the worktree
    // and dropped the session from the in-memory registry. That timer is
    // gone — sessions sit at `done` indefinitely so the user can
    // re-engage and have the captain run a follow-up round.
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Done No-Cleanup Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;
    const worktreePath = createRes.body.worktree_path;

    // Flip phase to done directly via state.json (mimics what the captain does).
    const doneState = {
      phase: 'done',
      active_specialist: null,
      review_iterations: 1,
      max_review_iterations: 8,
      last_checkpoint: new Date().toISOString(),
      blockers: [],
      must_ask_pending: [],
    };
    await writeFile(
      join(worktreePath, '.team', 'state.json'),
      JSON.stringify(doneState, null, 2),
    );

    // Wait long enough that the old 30s grace-period timer would have
    // fired if it still existed. Vitest test timeout is 5s by default —
    // we don't sit through 30s of real time. Instead we wait a tick for
    // chokidar to propagate, then assert: (1) session still in list,
    // (2) worktree still on disk, (3) phase is `done`.
    await new Promise((resolve) => setTimeout(resolve, 800));

    const listAfterDone = await request(app).get('/api/sessions');
    const row = listAfterDone.body.find((s: { id: string }) => s.id === sessionId);
    expect(row).toBeTruthy();
    expect(row.phase).toBe('done');
    expect(existsSync(worktreePath)).toBe(true);

    // cleanSession (the explicit user-driven path) still works.
    // Kill captain first so cleanSession isn't blocked by SessionActiveError.
    await sessionManager.killSession(sessionId);
    await sessionManager.cleanSession(sessionId);
    expect(existsSync(worktreePath)).toBe(false);
    const listAfterClean = await request(app).get('/api/sessions');
    expect(listAfterClean.body.find((s: { id: string }) => s.id === sessionId)).toBeUndefined();
  });

  it('DELETE /api/sessions/:id on a done session removes worktree and evicts from registry', async () => {
    // Exercises the HTTP route end-to-end (cleanSession called via DELETE, not directly).
    // Complements the existing direct-call test above.
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'DELETE Route Teardown Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;
    const worktreePath = createRes.body.worktree_path;
    expect(existsSync(worktreePath)).toBe(true);

    // Flip to done (mimics captain completing the PR flow).
    const doneState = {
      phase: 'done',
      active_specialist: null,
      review_iterations: 1,
      max_review_iterations: 8,
      last_checkpoint: new Date().toISOString(),
      blockers: [],
      must_ask_pending: [],
    };
    await writeFile(
      join(worktreePath, '.team', 'state.json'),
      JSON.stringify(doneState, null, 2),
    );

    // Kill captain process first (DELETE calls cleanSession which requires captain stopped).
    const killRes = await request(app).post(`/api/sessions/${sessionId}/kill`);
    expect(killRes.status).toBe(202);

    // DELETE should succeed (200 ok).
    const deleteRes = await request(app).delete(`/api/sessions/${sessionId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);

    // Worktree must be gone from disk.
    expect(existsSync(worktreePath)).toBe(false);

    // Session must be evicted from the registry — list returns empty, detail returns 404.
    const listAfterDelete = await request(app).get('/api/sessions');
    expect(listAfterDelete.body.find((s: { id: string }) => s.id === sessionId)).toBeUndefined();

    const detailAfterDelete = await request(app).get(`/api/sessions/${sessionId}`);
    expect(detailAfterDelete.status).toBe(404);
    expect(detailAfterDelete.body.code).toBe('SESSION_NOT_FOUND');
  });

  // ---------------------------------------------------------------------------
  // POST /api/sessions/:id/resume integration tests
  // ---------------------------------------------------------------------------

  describe('POST /api/sessions/:id/resume', () => {
    // Track every orphan directory created in this block so we can clean up
    // after each test. Without cleanup the orphan directories persist in
    // sessionsRootDir and pollute the disk-scan for tests that run later
    // (e.g. the "full lifecycle" test that expects list.length === 1).
    const createdOrphans: string[] = [];

    afterEach(async () => {
      // Remove all orphan directories written by this block's tests.
      await Promise.all(
        createdOrphans.splice(0).map((p) => rm(p, { recursive: true, force: true })),
      );
    });

    /**
     * Writes a minimal orphan session directly into the temp sessions root so
     * the resume endpoint has something to act on without needing a real git
     * worktree. The helper mirrors the writeOrphan pattern used in
     * session-manager.test.ts.
     */
    async function writeOrphanSession(
      id: string,
      opts: { phase?: string; includeMetaJson?: boolean } = {},
    ): Promise<string> {
      const worktreePath = join(sessionsRootDir, id);
      createdOrphans.push(worktreePath);
      const teamDir = join(worktreePath, '.team');
      await mkdir(teamDir, { recursive: true });

      if (opts.includeMetaJson !== false) {
        await writeFile(
          join(teamDir, 'meta.json'),
          JSON.stringify(
            {
              id,
              title: `Orphan ${id}`,
              source_repo: tempRepo,
              source_branch: 'main',
              session_branch: `my-team/${id}`,
              created_at: '2026-05-12T10:00:00.000Z',
            },
            null,
            2,
          ),
        );
      }

      await writeFile(
        join(teamDir, 'state.json'),
        JSON.stringify(
          {
            phase: opts.phase ?? 'executing',
            active_specialist: null,
            review_iterations: 0,
            max_review_iterations: 8,
            last_checkpoint: '2026-05-12T10:30:00.000Z',
            blockers: [],
            must_ask_pending: [],
          },
          null,
          2,
        ),
      );

      await writeFile(join(teamDir, 'journal.md'), '');
      return worktreePath;
    }

    it('happy path: disk-only orphan session gets resumed and returns 200 + SessionSummary shape', async () => {
      const sessionId = 'orphan-http-resume-1';
      await writeOrphanSession(sessionId, { phase: 'reviewing' });

      const res = await request(app).post(`/api/sessions/${sessionId}/resume`);

      expect(res.status).toBe(200);
      // Verify the full SessionSummary shape is present.
      expect(res.body.id).toBe(sessionId);
      expect(res.body.title).toBe(`Orphan ${sessionId}`);
      expect(res.body.source_repo).toBe(tempRepo);
      expect(res.body.phase).toBe('reviewing');
      expect(typeof res.body.created_at).toBe('string');
      expect(typeof res.body.last_checkpoint).toBe('string');
      expect(typeof res.body.must_ask_count).toBe('number');
      // active_specialist field is present (may be null).
      expect('active_specialist' in res.body).toBe(true);

      // The session must now appear in GET /api/sessions.
      const listRes = await request(app).get('/api/sessions');
      const row = listRes.body.find((s: { id: string }) => s.id === sessionId);
      expect(row).toBeTruthy();
      expect(row.phase).toBe('reviewing');

      // Clean up — kill the mock captain so shutdownAll is clean.
      await sessionManager.killSession(sessionId);
    });

    it('already-running: resuming a session with a live captain returns 409 SESSION_ACTIVE', async () => {
      // Create a live session via POST /api/sessions — the mocked spawnCaptain
      // returns a captain with running=true so the session is "active".
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ source_repo: tempRepo, title: 'Active Session Resume Test' });
      expect(createRes.status).toBe(201);
      const sessionId = createRes.body.id;
      const worktreePath = createRes.body.worktree_path;

      // Attempt to resume the still-running session.
      const resumeRes = await request(app).post(`/api/sessions/${sessionId}/resume`);

      expect(resumeRes.status).toBe(409);
      expect(resumeRes.body.code).toBe('SESSION_ACTIVE');

      // Clean up.
      await sessionManager.killSession(sessionId);
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
        execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
      } catch {
        // Best effort
      }
    });

    it('missing session: returns 404 SESSION_NOT_FOUND for an unknown id', async () => {
      const res = await request(app).post('/api/sessions/unknown-id-that-does-not-exist/resume');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('corrupt worktree: directory exists but meta.json is missing returns 422 SESSION_CORRUPT', async () => {
      const sessionId = 'corrupt-no-meta-http-2';
      // Write a worktree with state.json but no meta.json.
      await writeOrphanSession(sessionId, { includeMetaJson: false });

      const res = await request(app).post(`/api/sessions/${sessionId}/resume`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('SESSION_CORRUPT');
    });
  });

  it('full lifecycle: create → list → status → kill', async () => {
    // Create
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ source_repo: tempRepo, title: 'Lifecycle Test' });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;

    // List
    const listRes = await request(app).get('/api/sessions');
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].id).toBe(sessionId);
    // Summary should include the new fields
    expect(typeof listRes.body[0].last_checkpoint).toBe('string');
    expect(listRes.body[0].last_checkpoint.length).toBeGreaterThan(0);
    expect(listRes.body[0].must_ask_count).toBe(0);

    // Status
    const statusRes = await request(app).get(`/api/sessions/${sessionId}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.meta.title).toBe('Lifecycle Test');

    // Kill
    const killRes = await request(app).post(`/api/sessions/${sessionId}/kill`);
    expect(killRes.status).toBe(202);

    // Verify killed state
    const afterKill = await request(app).get(`/api/sessions/${sessionId}`);
    expect(afterKill.body.state.phase).toBe('killed');

    // Clean up worktree
    const worktreePath = getWorktreePath(sessionId);
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
      execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
    } catch {
      // Best effort
    }
  });
});
