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

// Mock claude process so tests don't actually spawn claude
vi.mock('./claude-process.js', () => {
  const { EventEmitter } = require('node:events');

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
    sessionManager = new SessionManager(log, captainPromptPath);
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
      'meta.json', 'plan.md', 'review.md', 'state.json', 'tasks.md',
    ]);

    // Verify meta.json content
    const meta = JSON.parse(await readFile(join(teamDir, 'meta.json'), 'utf-8'));
    expect(meta.title).toBe('Test Feature');
    expect(meta.source_repo).toBe(tempRepo);

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
    // Summary should include the new fields used by the dashboard
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
