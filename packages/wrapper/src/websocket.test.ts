/**
 * Integration tests for the WebSocket layer.
 *
 * These tests spin up a real HTTP + WebSocket server, connect real WS clients,
 * and verify end-to-end event delivery — no mocks at the WebSocket boundary per
 * CLAUDE.md conventions.
 *
 * Coverage:
 *  1. ANSI byte survival: raw escape sequences emitted by SessionManager arrive
 *     at the WS client verbatim (not stripped or mangled by JSON serialisation).
 *  2. state.json change fires `state` / `specialist` events but NOT `team_file`.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { WebSocket } from 'ws';
import pino from 'pino';

import type { WsServerEvent } from '@my-team/shared';
import { SessionManager } from './session-manager.js';
import { createServer } from './server.js';
import { setupWebSocket } from './api/websocket.js';

// Mock claude-process so tests don't spawn a real process.
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

// ---------------------------------------------------------------------------
// Shared infrastructure
// ---------------------------------------------------------------------------

let tempRepo: string;
let captainPromptPath: string;
let clearMustAskHookPath: string;
let stopHookPath: string;
let registryDir: string;

beforeAll(async () => {
  tempRepo = await realpath(await mkdtemp(join(tmpdir(), 'my-team-ws-e2e-')));
  execSync('git init', { cwd: tempRepo });
  execSync('git checkout -b main', { cwd: tempRepo });
  execSync('echo "hello" > test.txt', { cwd: tempRepo });
  execSync('git add .', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });

  captainPromptPath = join(tempRepo, 'captain.md');
  execSync(`echo "# Captain" > "${captainPromptPath}"`, { cwd: tempRepo });

  clearMustAskHookPath = join(tempRepo, 'clear-must-ask.sh');
  execSync(`echo "#!/usr/bin/env bash" > "${clearMustAskHookPath}"`, { cwd: tempRepo });
  stopHookPath = join(tempRepo, 'mark-must-ask.sh');
  execSync(`echo "#!/usr/bin/env bash" > "${stopHookPath}"`, { cwd: tempRepo });

  registryDir = await mkdtemp(join(tmpdir(), 'my-team-ws-registry-'));
  process.env['MY_TEAM_REGISTRY_PATH'] = join(registryDir, 'recents.json');
});

afterAll(async () => {
  await rm(tempRepo, { recursive: true, force: true });
  await rm(registryDir, { recursive: true, force: true });
  delete process.env['MY_TEAM_REGISTRY_PATH'];
});

// ---------------------------------------------------------------------------
// Helper: boot a full HTTP+WS server and return a teardown function.
// ---------------------------------------------------------------------------

interface TestServer {
  sessionManager: SessionManager;
  port: number;
  close: () => Promise<void>;
}

async function startTestServer(): Promise<TestServer> {
  const log = pino({ level: 'silent' });
  const sessionManager = new SessionManager(
    log,
    captainPromptPath,
    clearMustAskHookPath,
    stopHookPath,
  );
  const { app } = createServer({ sessionManager, log });

  const httpServer = createHttpServer(app);
  setupWebSocket(httpServer, sessionManager, log);

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = (httpServer.address() as { port: number }).port;

  const close = async (): Promise<void> => {
    await sessionManager.shutdownAll();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((err) => (err ? reject(err) : resolve())),
    );
  };

  return { sessionManager, port, close };
}

// ---------------------------------------------------------------------------
// Helper: connect a WebSocket and collect typed messages.
// ---------------------------------------------------------------------------

function connectWs(
  port: number,
  sessionId: string,
): { ws: WebSocket; messages: WsServerEvent[]; waitForClose: () => Promise<void> } {
  const messages: WsServerEvent[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/sessions/${sessionId}`);
  ws.on('message', (data) => {
    messages.push(JSON.parse(data.toString()) as WsServerEvent);
  });
  const waitForClose = (): Promise<void> =>
    new Promise((resolve) => ws.on('close', resolve));
  return { ws, messages, waitForClose };
}

// ---------------------------------------------------------------------------
// Task 2 — ANSI byte survival end-to-end
// ---------------------------------------------------------------------------

describe('WebSocket — raw PTY byte survival', () => {
  let server: TestServer;

  afterEach(async () => {
    await server?.close();
  });

  it('ANSI escape sequences survive JSON serialisation and arrive verbatim at the WS client', async () => {
    server = await startTestServer();

    // Create a session so the WS upgrade is accepted.
    const { sessionManager, port } = server;
    const session = await sessionManager.createSession(tempRepo, 'ANSI Test');
    const sessionId = session.meta.id;

    // Connect a real WS client.
    const { ws, messages } = connectWs(port, sessionId);

    // Wait for the socket to open.
    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Synthetic ANSI payload: CSI SGR (colour), CR, LF, and 256-colour code.
    const ansiPayload =
      '\x1b[31mred\x1b[0m\r\n\x1b[38;5;200mpink\x1b[0m\r';

    // Drive the data-emit path directly — this is exactly what CaptainProcess
    // does in production when the PTY outputs bytes.
    sessionManager.emit('event', sessionId, { type: 'output', text: ansiPayload });

    // Allow one event-loop tick for the WS client to receive the message.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', resolve));

    // Filter to the output event (hydration team_file events may also arrive).
    const outputEvents = messages.filter((e): e is Extract<WsServerEvent, { type: 'output' }> =>
      e.type === 'output',
    );

    expect(outputEvents.length).toBeGreaterThanOrEqual(1);
    const received = outputEvents[outputEvents.length - 1].text;
    expect(received).toBe(ansiPayload);

    // Spot-check every byte class individually.
    expect(received).toContain('\x1b[');   // CSI introducer
    expect(received).toContain('\r');       // carriage return
    expect(received).toContain('\x1b[38;5;200m'); // 256-colour code
  });
});

// ---------------------------------------------------------------------------
// Task 1 addendum — state.json change must NOT emit team_file
// ---------------------------------------------------------------------------

describe('WebSocket — state.json write is not a team_file broadcast', () => {
  let server: TestServer;

  afterEach(async () => {
    await server?.close();
  });

  it('writing state.json fires state/specialist events but never a team_file event', async () => {
    server = await startTestServer();
    const { sessionManager, port } = server;
    const session = await sessionManager.createSession(tempRepo, 'state.json isolation test');
    const sessionId = session.meta.id;
    const worktreePath = session.worktree_path;

    const { ws, messages } = connectWs(port, sessionId);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Write a state.json change with a new active_specialist so we can verify
    // the state/specialist path fires.
    const newState = {
      phase: 'executing',
      active_specialist: 'tester',
      review_iterations: 0,
      max_review_iterations: 8,
      last_checkpoint: new Date().toISOString(),
      blockers: [],
      must_ask_pending: [],
    };
    await writeFile(
      join(worktreePath, '.team', 'state.json'),
      JSON.stringify(newState, null, 2),
    );

    // Wait for chokidar debounce to fire (team-files.ts uses 200 ms + awaitWriteFinish).
    await new Promise<void>((resolve) => setTimeout(resolve, 800));

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', resolve));

    const teamFileEvents = messages.filter((e) => e.type === 'team_file');
    const stateEvents = messages.filter((e) => e.type === 'state');
    const specialistEvents = messages.filter((e) => e.type === 'specialist');

    // Core assertion: no team_file event for state.json.
    expect(teamFileEvents.every((e) => {
      if (e.type !== 'team_file') return true;
      // Hydration events for the four broadcast files are expected on connect —
      // they must all be for the known broadcast names, never 'state'.
      return ['plan', 'tasks', 'journal', 'review'].includes(e.name);
    })).toBe(true);

    // The state change must have triggered at least one state event.
    expect(stateEvents.length).toBeGreaterThanOrEqual(1);

    // A specialist event should fire because active_specialist changed.
    expect(specialistEvents.length).toBeGreaterThanOrEqual(1);
    const startedEvent = specialistEvents.find(
      (e) => e.type === 'specialist' && e.name === 'tester' && e.status === 'started',
    );
    expect(startedEvent).toBeTruthy();
  });
});
