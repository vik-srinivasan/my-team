import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
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
  });

  afterAll(async () => {
    await rm(tempRepo, { recursive: true, force: true });
    await rm(registryDir, { recursive: true, force: true });
    delete process.env['MY_TEAM_REGISTRY_PATH'];
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
  });

  describe.skip('Workflow config endpoints', () => {
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
  });

  describe.skip('Recents endpoint', () => {
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
