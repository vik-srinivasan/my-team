import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdir, mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
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

  describe('CORS', () => {
    it('allows cross-origin GET from http://localhost:3737 (web fallback)', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3737');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3737');
    });

    it('allows cross-origin GET from tauri://localhost (desktop shell)', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'tauri://localhost');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('tauri://localhost');
    });

    it('does NOT set CORS allow header for disallowed origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://evil.example.com');
      // Request still completes (no preflight blocked it), but the
      // allow-origin header is absent — browsers will reject the response.
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('omits CORS headers when no Origin header is present (same-origin / curl)', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      // No Origin header sent, no allow-origin header echoed back.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('responds to OPTIONS preflight for an allowed origin with the matching allow header', async () => {
      const res = await request(app)
        .options('/api/sessions')
        .set('Origin', 'http://localhost:3737')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3737');
    });
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

  describe('Agent prompt endpoints', () => {
    async function createTestSession(title: string): Promise<{ id: string; worktreePath: string }> {
      const res = await request(app)
        .post('/api/sessions')
        .send({ source_repo: tempRepo, title });
      expect(res.status).toBe(201);
      return { id: res.body.id as string, worktreePath: res.body.worktree_path as string };
    }

    async function cleanupSession(id: string, worktreePath: string): Promise<void> {
      await sessionManager.killSession(id);
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
        execSync(`git branch -D my-team/${id}`, { cwd: tempRepo });
      } catch {
        // best effort
      }
    }

    it('GET /api/sessions/:id/agents returns alphabetical list including defaults', async () => {
      const { id, worktreePath } = await createTestSession('Agent List Test');
      try {
        const res = await request(app).get(`/api/sessions/${id}/agents`);
        expect(res.status).toBe(200);
        const names = (res.body.agents as Array<{ name: string }>).map((a) => a.name);
        for (const required of ['captain', 'engineer', 'reviewer', 'scout', 'tester']) {
          expect(names).toContain(required);
        }
        expect(names).toEqual([...names].sort());
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('GET /api/sessions/:id/agents returns 404 for unknown session', async () => {
      const res = await request(app).get('/api/sessions/unknown-session/agents');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('GET /api/sessions/:id/agents/:name reads from session layer when present', async () => {
      const { id, worktreePath } = await createTestSession('Agent Get Test');
      try {
        const agentsDir = join(worktreePath, '.claude', 'agents');
        await writeFile(join(agentsDir, 'engineer.md'), 'CUSTOM_ENGINEER_BODY');
        const res = await request(app).get(`/api/sessions/${id}/agents/engineer`);
        expect(res.status).toBe(200);
        expect(res.body.source).toBe('session');
        expect(res.body.content).toBe('CUSTOM_ENGINEER_BODY');
        expect(res.body.name).toBe('engineer');
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('GET /api/sessions/:id/agents/:name 404s for an agent with no body in any layer', async () => {
      const { id, worktreePath } = await createTestSession('Agent 404 Test');
      try {
        const res = await request(app).get(`/api/sessions/${id}/agents/never-shipped-zzz`);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('AGENT_NOT_FOUND');
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('GET /api/sessions/:id/agents/:name 400s on invalid name', async () => {
      const { id, worktreePath } = await createTestSession('Agent Invalid Test');
      try {
        const res = await request(app).get(`/api/sessions/${id}/agents/Engineer`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_AGENT_NAME');
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT /api/sessions/:id/agents/:name writes the body to the session worktree', async () => {
      const { id, worktreePath } = await createTestSession('Agent Put Test');
      try {
        const body = 'BRAND NEW ENGINEER OVERRIDE';
        const res = await request(app)
          .put(`/api/sessions/${id}/agents/engineer`)
          .send({ content: body });
        expect(res.status).toBe(200);
        expect(res.body.source).toBe('session');
        expect(res.body.content).toBe(body);

        // Verify on disk
        const onDisk = await readFile(
          join(worktreePath, '.claude', 'agents', 'engineer.md'),
          'utf-8',
        );
        expect(onDisk).toBe(body);
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT /api/sessions/:id/agents/:name 400s on missing content', async () => {
      const { id, worktreePath } = await createTestSession('Agent Put Validate Test');
      try {
        const res = await request(app).put(`/api/sessions/${id}/agents/engineer`).send({});
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    // ── Fallback-chain integration coverage ──────────────────────────
    //
    // The agent-prompts module reads layers in order
    // (session → repo → user → default). The unit tests in
    // agent-prompts.test.ts cover the module-level dispatch; these tests
    // exercise the chain end-to-end through the HTTP route so we know the
    // layer is reported correctly in the API response and the file paths
    // line up with a real git-backed worktree.
    //
    // NOTE: the wrapper pre-copies packaged-default agent prompts into
    // `<worktree>/.claude/agents/` at session creation (see
    // worktree.ts → copyAgentPrompts). That means a freshly-created
    // session ALWAYS reports `source: 'session'` for the 10 default
    // agents — the only way to surface the lower layers via the HTTP
    // route is to remove the seeded session-layer file first.

    it('GET /api/sessions/:id/agents/:name falls through to repo layer when session-layer file is removed', async () => {
      const { id, worktreePath } = await createTestSession('Agent Repo Layer Test');
      try {
        // Plant a repo-layer override on the source repo (NOT the
        // worktree).
        const repoAgentsDir = join(tempRepo, '.claude', 'agents');
        await mkdir(repoAgentsDir, { recursive: true });
        await writeFile(join(repoAgentsDir, 'engineer.md'), 'REPO_LAYER_BODY');

        // Remove the pre-seeded session-layer copy so the module has to
        // fall through.
        await rm(join(worktreePath, '.claude', 'agents', 'engineer.md'), { force: true });

        try {
          const res = await request(app).get(`/api/sessions/${id}/agents/engineer`);
          expect(res.status).toBe(200);
          expect(res.body.source).toBe('repo');
          expect(res.body.content).toBe('REPO_LAYER_BODY');

          // The list endpoint should also report source=repo for engineer
          // and the entry must exist.
          const listRes = await request(app).get(`/api/sessions/${id}/agents`);
          const engineer = (listRes.body.agents as Array<{ name: string; source: string }>)
            .find((a) => a.name === 'engineer');
          expect(engineer?.source).toBe('repo');
          expect(engineer?.source).not.toBe('session');
        } finally {
          // Remove the repo-layer file so other tests don't see it.
          await rm(join(repoAgentsDir, 'engineer.md'), { force: true });
        }
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('GET /api/sessions/:id/agents/:name falls through past repo to default when no override exists', async () => {
      const { id, worktreePath } = await createTestSession('Agent Default Layer Test');
      try {
        // Remove the pre-seeded session-layer copy. With no repo-layer
        // file planted and (typically) no user-layer file either, the
        // module should resolve to `default`.
        await rm(join(worktreePath, '.claude', 'agents', 'engineer.md'), { force: true });

        const res = await request(app).get(`/api/sessions/${id}/agents/engineer`);
        expect(res.status).toBe(200);
        // The user layer (~/.claude/agents/engineer.md) may exist on the
        // developer's machine; we treat user OR default as acceptable
        // (but explicitly NOT session, since we removed that).
        expect(['user', 'default']).toContain(res.body.source);
        expect(typeof res.body.content).toBe('string');
        expect(res.body.content.length).toBeGreaterThan(0);
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT writes to session layer and subsequent GET reads it (round-trip via HTTP)', async () => {
      const { id, worktreePath } = await createTestSession('Agent PUT Wins Test');
      try {
        // Plant a repo-layer override first. The pre-seeded session
        // layer should still win, but we want to confirm PUT lands in
        // the session layer (overwriting the wrapper's seeded copy) and
        // never touches the repo layer.
        const repoAgentsDir = join(tempRepo, '.claude', 'agents');
        await mkdir(repoAgentsDir, { recursive: true });
        await writeFile(join(repoAgentsDir, 'engineer.md'), 'REPO_BODY');

        try {
          // PUT a session-layer override.
          const putRes = await request(app)
            .put(`/api/sessions/${id}/agents/engineer`)
            .send({ content: 'SESSION_BODY' });
          expect(putRes.status).toBe(200);
          expect(putRes.body.source).toBe('session');

          // Subsequent GET must read the session layer (which now holds
          // the user-edited body).
          const getRes = await request(app).get(`/api/sessions/${id}/agents/engineer`);
          expect(getRes.status).toBe(200);
          expect(getRes.body.source).toBe('session');
          expect(getRes.body.content).toBe('SESSION_BODY');

          // The PUT writes to <worktree>/.claude/agents/engineer.md.
          const sessionOnDisk = await readFile(
            join(worktreePath, '.claude', 'agents', 'engineer.md'),
            'utf-8',
          );
          expect(sessionOnDisk).toBe('SESSION_BODY');

          // Repo layer must remain untouched on disk.
          const repoOnDisk = await readFile(
            join(repoAgentsDir, 'engineer.md'),
            'utf-8',
          );
          expect(repoOnDisk).toBe('REPO_BODY');
        } finally {
          await rm(join(repoAgentsDir, 'engineer.md'), { force: true });
        }
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT /api/sessions/:id/agents/:name 400s on invalid name without writing the uppercase filename', async () => {
      const { id, worktreePath } = await createTestSession('Agent Invalid Name PUT Test');
      try {
        // Uppercase fails the [a-z][a-z0-9-]* regex.
        const res = await request(app)
          .put(`/api/sessions/${id}/agents/Engineer`)
          .send({ content: 'NEFARIOUS_CONTENT' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_AGENT_NAME');

        // The directory must not contain a literal `Engineer.md` entry.
        // (macOS HFS+ is case-insensitive, so a same-case-as-disk
        // existsSync check would be misleading — read the directory
        // entries directly and look for the exact name.)
        const agentsDir = join(worktreePath, '.claude', 'agents');
        if (existsSync(agentsDir)) {
          const entries = await readdir(agentsDir);
          expect(entries).not.toContain('Engineer.md');
        }

        // And the pre-seeded engineer.md (lowercase) must not have been
        // clobbered with NEFARIOUS_CONTENT (i.e. the case-insensitive FS
        // didn't redirect the write to engineer.md).
        const lowerPath = join(worktreePath, '.claude', 'agents', 'engineer.md');
        if (existsSync(lowerPath)) {
          const body = await readFile(lowerPath, 'utf-8');
          expect(body).not.toContain('NEFARIOUS_CONTENT');
        }
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });
  });

  describe('Workflow config endpoints', () => {
    async function createTestSession(title: string): Promise<{ id: string; worktreePath: string }> {
      const res = await request(app)
        .post('/api/sessions')
        .send({ source_repo: tempRepo, title });
      expect(res.status).toBe(201);
      return { id: res.body.id as string, worktreePath: res.body.worktree_path as string };
    }

    async function cleanupSession(id: string, worktreePath: string): Promise<void> {
      await sessionManager.killSession(id);
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
        execSync(`git branch -D my-team/${id}`, { cwd: tempRepo });
      } catch {
        // best effort
      }
    }

    it('GET /api/sessions/:id/workflow returns defaults when file absent', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Defaults Test');
      try {
        const res = await request(app).get(`/api/sessions/${id}/workflow`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          disabled_specialists: [],
          forced_specialists: [],
        });
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT /api/sessions/:id/workflow writes the file and a follow-up GET reads it back', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Round Trip Test');
      try {
        const putRes = await request(app)
          .put(`/api/sessions/${id}/workflow`)
          .send({
            disabled_specialists: ['designer'],
            forced_specialists: ['auditor'],
            effort_override: 'thorough',
          });
        expect(putRes.status).toBe(200);
        expect(putRes.body.disabled_specialists).toEqual(['designer']);
        expect(putRes.body.forced_specialists).toEqual(['auditor']);
        expect(putRes.body.effort_override).toBe('thorough');

        const onDisk = await readFile(join(worktreePath, '.team', 'workflow.json'), 'utf-8');
        const parsed = JSON.parse(onDisk);
        expect(parsed.disabled_specialists).toEqual(['designer']);
        expect(parsed.forced_specialists).toEqual(['auditor']);

        const getRes = await request(app).get(`/api/sessions/${id}/workflow`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.disabled_specialists).toEqual(['designer']);
        expect(getRes.body.effort_override).toBe('thorough');
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT /api/sessions/:id/workflow 400s on invalid specialist name', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Invalid Test');
      try {
        const res = await request(app)
          .put(`/api/sessions/${id}/workflow`)
          .send({
            disabled_specialists: ['engineer'],
            forced_specialists: [],
          });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_WORKFLOW_CONFIG');
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT /api/sessions/:id/workflow 400s on invalid effort_override', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Effort Test');
      try {
        const res = await request(app)
          .put(`/api/sessions/${id}/workflow`)
          .send({
            disabled_specialists: [],
            forced_specialists: [],
            effort_override: 'medium',
          });
        expect(res.status).toBe(400);
        // zod gates this first → VALIDATION_ERROR (from the schema enum).
        // Either error code is acceptable; both are 400.
        expect(['VALIDATION_ERROR', 'INVALID_WORKFLOW_CONFIG']).toContain(res.body.code);
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('GET /api/sessions/:id/workflow returns 404 for unknown session', async () => {
      const res = await request(app).get('/api/sessions/unknown/workflow');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('PUT /api/sessions/:id/workflow 400s with INVALID_WORKFLOW_CONFIG when the same specialist is both disabled and forced', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Overlap Test');
      try {
        const res = await request(app)
          .put(`/api/sessions/${id}/workflow`)
          .send({
            disabled_specialists: ['designer'],
            forced_specialists: ['designer'],
          });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_WORKFLOW_CONFIG');
        // The error message should call out the conflicting name so the
        // UI can surface a useful hint.
        expect(String(res.body.error)).toContain('designer');

        // Confirm nothing was written to disk.
        const fileExists = existsSync(join(worktreePath, '.team', 'workflow.json'));
        expect(fileExists).toBe(false);
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('GET /api/sessions/:id/workflow returns 400 INVALID_WORKFLOW_CONFIG when workflow.json on disk is malformed JSON', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Malformed Test');
      try {
        // Write garbage where workflow.json should be.
        await mkdir(join(worktreePath, '.team'), { recursive: true });
        await writeFile(
          join(worktreePath, '.team', 'workflow.json'),
          '{not valid json:::',
          'utf-8',
        );
        const res = await request(app).get(`/api/sessions/${id}/workflow`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_WORKFLOW_CONFIG');
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('GET /api/sessions/:id/workflow returns 400 INVALID_WORKFLOW_CONFIG when workflow.json on disk has unknown specialist', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Stale Schema Test');
      try {
        // Write a config that points at a specialist we no longer
        // recognise — simulates a user hand-editing the file with a typo.
        await mkdir(join(worktreePath, '.team'), { recursive: true });
        await writeFile(
          join(worktreePath, '.team', 'workflow.json'),
          JSON.stringify({
            disabled_specialists: ['frobnicator'],
            forced_specialists: [],
          }),
          'utf-8',
        );
        const res = await request(app).get(`/api/sessions/${id}/workflow`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_WORKFLOW_CONFIG');
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT /api/sessions/:id/workflow with empty arrays + no effort_override matches the defaults shape', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Empty Test');
      try {
        const res = await request(app)
          .put(`/api/sessions/${id}/workflow`)
          .send({
            disabled_specialists: [],
            forced_specialists: [],
          });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          disabled_specialists: [],
          forced_specialists: [],
        });

        // A subsequent GET returns the same shape — round-trip
        // self-consistency, even when the response is just the defaults.
        const getRes = await request(app).get(`/api/sessions/${id}/workflow`);
        expect(getRes.status).toBe(200);
        expect(getRes.body).toEqual({
          disabled_specialists: [],
          forced_specialists: [],
        });
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });

    it('PUT /api/sessions/:id/workflow accepts each effort_override enum value', async () => {
      const { id, worktreePath } = await createTestSession('Workflow Effort Enum Test');
      try {
        for (const level of ['light', 'standard', 'thorough'] as const) {
          const res = await request(app)
            .put(`/api/sessions/${id}/workflow`)
            .send({
              disabled_specialists: [],
              forced_specialists: [],
              effort_override: level,
            });
          expect(res.status).toBe(200);
          expect(res.body.effort_override).toBe(level);
        }
      } finally {
        await cleanupSession(id, worktreePath);
      }
    });
  });

  describe('Recents endpoint', () => {
    it('GET /api/repos/recents returns the registry as { repos: [...] }', async () => {
      // Seed the registry with one entry so we have something to assert on.
      // The shared beforeAll set MY_TEAM_REGISTRY_PATH to a temp file; we
      // just need to ensure POST /api/sessions has been called at least
      // once. Other tests in this file already do that, but this test
      // can't rely on ordering, so issue an extra create.
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ source_repo: tempRepo, title: 'Recents Seed' });
      const sessionId = createRes.body.id;
      const worktreePath = createRes.body.worktree_path;

      const res = await request(app).get('/api/repos/recents');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.repos)).toBe(true);
      // tempRepo is the realpath of the temp dir — that's how the wrapper
      // records it.
      const matching = (res.body.repos as Array<{ path: string }>).find((r) => r.path === tempRepo);
      expect(matching).toBeTruthy();

      // Cleanup
      await sessionManager.killSession(sessionId);
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
        execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
      } catch {
        // best effort
      }
    });

    it('GET /api/repos/recents reads from MY_TEAM_REGISTRY_PATH so the real ~/team/recents.json is never touched in tests', async () => {
      // Sanity-check the env override is in effect (beforeAll sets it).
      expect(process.env['MY_TEAM_REGISTRY_PATH']).toBe(registryPath);
      // Seed an entry, then verify the file lives at the override path,
      // NOT at the real $HOME/team/recents.json. This is the key guarantee
      // for test isolation across machines.
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ source_repo: tempRepo, title: 'Registry Isolation Test' });
      expect(createRes.status).toBe(201);
      const sessionId = createRes.body.id;
      const worktreePath = createRes.body.worktree_path;

      // The override path must exist on disk.
      expect(existsSync(registryPath)).toBe(true);

      const res = await request(app).get('/api/repos/recents');
      expect(res.status).toBe(200);
      const repos = res.body.repos as Array<{ path: string; basename: string; last_used: string; session_count: number }>;
      const entry = repos.find((r) => r.path === tempRepo);
      expect(entry).toBeTruthy();
      // The compact RecentRepo shape should expose just these 4 fields
      // (basename + path + last_used + session_count) — the registry's
      // internal first_used / last_session_id fields are intentionally
      // dropped (see api/repos.ts toRecentRepo).
      expect(entry).toEqual({
        path: tempRepo,
        basename: expect.any(String),
        last_used: expect.any(String),
        session_count: expect.any(Number),
      });
      expect(entry!.session_count).toBeGreaterThanOrEqual(1);

      // Cleanup
      await sessionManager.killSession(sessionId);
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: tempRepo });
        execSync(`git branch -D my-team/${sessionId}`, { cwd: tempRepo });
      } catch {
        // best effort
      }
    });

    it('GET /api/repos/recents returns { repos: [] } when the registry file does not yet exist', async () => {
      // Temporarily point MY_TEAM_REGISTRY_PATH at a path that doesn't
      // exist. The shared registry will be restored after this test.
      const originalOverride = process.env['MY_TEAM_REGISTRY_PATH'];
      const missingPath = join(registryDir, 'definitely-not-here.json');
      expect(existsSync(missingPath)).toBe(false);
      process.env['MY_TEAM_REGISTRY_PATH'] = missingPath;
      try {
        const res = await request(app).get('/api/repos/recents');
        expect(res.status).toBe(200);
        // Empty registry → empty repos array (NOT 404, NOT 500).
        expect(res.body.repos).toEqual([]);
      } finally {
        process.env['MY_TEAM_REGISTRY_PATH'] = originalOverride;
      }
    });
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

  // ── purge-orphans + disk-only kill/clean regression coverage ────────────
  //
  // These tests cover the HTTP-route layer for the features added in
  // commits 63e793a (kill/clean on disk-only sessions) and 6b445b3
  // (purge-orphans endpoint). They write sessions directly to disk (no
  // real git worktree) and verify the routes return 200/202 where they
  // previously returned 404.

  /**
   * Creates a disk-only fake session (no real git worktree) directly in the
   * sessionsRootDir. Returns the orphan session id.
   * When `deletedSourceRepo` is true, the source_repo path referenced in
   * meta.json is a temp git repo that is immediately deleted so that
   * cleanSession uses the NotAGitRepoError → fs.rm fallback path.
   */
  async function writeFakeOrphan(id: string, opts: { deletedSourceRepo?: boolean } = {}): Promise<void> {
    let sourceRepo = tempRepo;
    if (opts.deletedSourceRepo) {
      const throwaway = await realpath(await mkdtemp(join(tmpdir(), 'srv-throwaway-')));
      execSync('git init', { cwd: throwaway });
      execSync('git checkout -b main', { cwd: throwaway });
      execSync('echo "x" > x.txt', { cwd: throwaway });
      execSync('git add .', { cwd: throwaway });
      execSync('git commit -m "init"', { cwd: throwaway });
      sourceRepo = throwaway;
      await rm(throwaway, { recursive: true, force: true });
    }

    const worktreePath = join(sessionsRootDir, id);
    const teamDir = join(worktreePath, '.team');
    await mkdir(teamDir, { recursive: true });
    await writeFile(
      join(teamDir, 'meta.json'),
      JSON.stringify({
        id,
        title: `Fake Orphan ${id}`,
        source_repo: sourceRepo,
        source_branch: 'main',
        session_branch: `my-team/${id}`,
        created_at: '2026-05-12T10:00:00.000Z',
      }, null, 2),
    );
    await writeFile(
      join(teamDir, 'state.json'),
      JSON.stringify({
        phase: 'killed',
        active_specialist: null,
        review_iterations: 0,
        max_review_iterations: 8,
        last_checkpoint: '2026-05-12T10:30:00.000Z',
        blockers: [],
        must_ask_pending: [],
      }, null, 2),
    );
    await writeFile(join(teamDir, 'journal.md'), '');
  }

  describe('POST /api/sessions/purge-orphans', () => {
    it('returns 200 with { purged: string[], skipped: [...] } summary', async () => {
      // No orphans on disk → empty purge (no error).
      const res = await request(app)
        .post('/api/sessions/purge-orphans')
        .send({});
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.purged)).toBe(true);
      expect(Array.isArray(res.body.skipped)).toBe(true);
    });

    it('returns 200 with purged ids after clearing disk-only orphans', async () => {
      // Write two disk-only orphans with deleted source repos so cleanSession
      // can proceed via the NotAGitRepoError → fs.rm fallback.
      await writeFakeOrphan('purge-route-orphan-1', { deletedSourceRepo: true });
      await writeFakeOrphan('purge-route-orphan-2', { deletedSourceRepo: true });

      const res = await request(app)
        .post('/api/sessions/purge-orphans')
        .send({ exclude: [] });
      expect(res.status).toBe(200);
      expect(res.body.purged).toContain('purge-route-orphan-1');
      expect(res.body.purged).toContain('purge-route-orphan-2');
    });

    it('respects the exclude list — does not purge the excluded id', async () => {
      await writeFakeOrphan('purge-route-exclude-1', { deletedSourceRepo: true });
      await writeFakeOrphan('purge-route-exclude-2', { deletedSourceRepo: true });

      const res = await request(app)
        .post('/api/sessions/purge-orphans')
        .send({ exclude: ['purge-route-exclude-1'] });
      expect(res.status).toBe(200);
      expect(res.body.purged).toContain('purge-route-exclude-2');
      expect(res.body.purged).not.toContain('purge-route-exclude-1');
      expect(res.body.skipped.some((s: { id: string; reason: string }) => s.id === 'purge-route-exclude-1' && s.reason === 'current session')).toBe(true);
    });

    it('returns 400 on invalid body (exclude must be array of strings)', async () => {
      const res = await request(app)
        .post('/api/sessions/purge-orphans')
        .send({ exclude: 'not-an-array' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/sessions/:id/kill on disk-only orphan (regression)', () => {
    it('returns 202 instead of 404 for a disk-only session (regression coverage)', async () => {
      // Previously killSession threw SessionNotFoundError for disk-only sessions,
      // which the route mapped to HTTP 404.
      const id = 'disk-only-kill-route-1';
      await writeFakeOrphan(id);

      const res = await request(app).post(`/api/sessions/${id}/kill`);
      expect(res.status).toBe(202);
      expect(res.body.ok).toBe(true);

      // state.json on disk must now show phase='killed'.
      const state = JSON.parse(
        await readFile(join(sessionsRootDir, id, '.team', 'state.json'), 'utf-8'),
      ) as { phase: string };
      expect(state.phase).toBe('killed');
    });
  });

  describe('DELETE /api/sessions/:id on disk-only orphan (regression)', () => {
    it('returns 200 instead of 404 for a disk-only session (regression coverage)', async () => {
      // Previously cleanSession threw SessionNotFoundError for disk-only sessions,
      // which the route mapped to HTTP 404.
      const id = 'disk-only-clean-route-2';
      await writeFakeOrphan(id, { deletedSourceRepo: true });
      const worktreePath = join(sessionsRootDir, id);

      const res = await request(app).delete(`/api/sessions/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Worktree dir must be gone.
      expect(existsSync(worktreePath)).toBe(false);
    });
  });
});
