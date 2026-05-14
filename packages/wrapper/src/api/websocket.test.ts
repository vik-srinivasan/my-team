/**
 * Integration tests for the CLI-priority resize authority in the
 * wrapper's WebSocket layer.
 *
 * These tests boot a real HTTP + WebSocket server, connect real `ws`
 * clients, identify themselves via the `hello` frame, send `resize`
 * frames, and assert that `sessionManager.resizeCaptain` is called
 * only when the wrapper's policy says it should:
 *
 *  (a) `web` + `cli` connected → only the `cli` client's resize is forwarded.
 *  (b) Only a `web` client → its resize is forwarded normally.
 *  (c) `cli` disconnects → the next `web` resize is forwarded again.
 *  (d) Two `web` resizes with the same dimensions → only the first reaches the PTY.
 *
 * Follows the boot-pattern from `packages/wrapper/src/websocket.test.ts`
 * (the broader integration suite).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { WebSocket } from 'ws';
import pino from 'pino';

import { SessionManager } from '../session-manager.js';
import { createServer } from '../server.js';
import { setupWebSocket } from './websocket.js';

// Mock claude-process so tests don't spawn a real Claude binary. Same
// pattern as `packages/wrapper/src/websocket.test.ts`.
vi.mock('../claude-process.js', async () => {
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

// ── Shared infrastructure ─────────────────────────────────────────────

let tempRepo: string;
let captainPromptPath: string;
let clearMustAskHookPath: string;
let stopHookPath: string;
let askQuestionHookPath: string;
let registryDir: string;

beforeAll(async () => {
  tempRepo = await realpath(await mkdtemp(join(tmpdir(), 'my-team-ws-api-')));
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
  askQuestionHookPath = join(tempRepo, 'mark-must-ask-on-question.sh');
  execSync(`echo "#!/usr/bin/env bash" > "${askQuestionHookPath}"`, { cwd: tempRepo });

  registryDir = await mkdtemp(join(tmpdir(), 'my-team-ws-api-registry-'));
  process.env['MY_TEAM_REGISTRY_PATH'] = join(registryDir, 'recents.json');
});

afterAll(async () => {
  await rm(tempRepo, { recursive: true, force: true });
  await rm(registryDir, { recursive: true, force: true });
  delete process.env['MY_TEAM_REGISTRY_PATH'];
});

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
    askQuestionHookPath,
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

/** Open a WS, optionally send a `hello`, and resolve when open. */
async function openClient(
  port: number,
  sessionId: string,
  role: 'web' | 'cli' | null,
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/sessions/${sessionId}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  if (role !== null) {
    ws.send(JSON.stringify({ type: 'hello', role }));
    // Give the wrapper a tick to process the hello before any later
    // frames in the test land on it.
    await new Promise((r) => setTimeout(r, 20));
  }
  return ws;
}

function closeClient(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', () => resolve());
    ws.close();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('WebSocket — CLI-priority resize authority', () => {
  let server: TestServer;

  afterEach(async () => {
    await server?.close();
  });

  it('drops web resizes while a CLI client is also attached', async () => {
    server = await startTestServer();
    const { sessionManager, port } = server;
    const session = await sessionManager.createSession(tempRepo, 'web vs cli');
    const sessionId = session.meta.id;

    const resizeSpy = vi
      .spyOn(sessionManager, 'resizeCaptain')
      .mockImplementation(() => {});

    const webWs = await openClient(port, sessionId, 'web');
    const cliWs = await openClient(port, sessionId, 'cli');

    try {
      // Both clients send resize frames. The wrapper should forward the
      // CLI's resize and drop the web one.
      webWs.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
      cliWs.send(JSON.stringify({ type: 'resize', cols: 140, rows: 50 }));

      await new Promise((r) => setTimeout(r, 100));

      expect(resizeSpy).toHaveBeenCalledTimes(1);
      expect(resizeSpy).toHaveBeenCalledWith(sessionId, 140, 50);
    } finally {
      await closeClient(webWs);
      await closeClient(cliWs);
    }
  });

  it('forwards a web client resize when no CLI is attached', async () => {
    server = await startTestServer();
    const { sessionManager, port } = server;
    const session = await sessionManager.createSession(tempRepo, 'web only');
    const sessionId = session.meta.id;

    const resizeSpy = vi
      .spyOn(sessionManager, 'resizeCaptain')
      .mockImplementation(() => {});

    const webWs = await openClient(port, sessionId, 'web');

    try {
      webWs.send(JSON.stringify({ type: 'resize', cols: 110, rows: 35 }));
      await new Promise((r) => setTimeout(r, 100));

      expect(resizeSpy).toHaveBeenCalledTimes(1);
      expect(resizeSpy).toHaveBeenCalledWith(sessionId, 110, 35);
    } finally {
      await closeClient(webWs);
    }
  });

  it('starts forwarding web resizes again after the CLI disconnects', async () => {
    server = await startTestServer();
    const { sessionManager, port } = server;
    const session = await sessionManager.createSession(tempRepo, 'cli leaves');
    const sessionId = session.meta.id;

    const resizeSpy = vi
      .spyOn(sessionManager, 'resizeCaptain')
      .mockImplementation(() => {});

    const webWs = await openClient(port, sessionId, 'web');
    const cliWs = await openClient(port, sessionId, 'cli');

    try {
      // While CLI is attached, the web client's resize is dropped.
      webWs.send(JSON.stringify({ type: 'resize', cols: 90, rows: 25 }));
      await new Promise((r) => setTimeout(r, 50));
      expect(resizeSpy).not.toHaveBeenCalled();

      // CLI disconnects.
      await closeClient(cliWs);
      // Give the wrapper a moment to process the close.
      await new Promise((r) => setTimeout(r, 50));

      // Now the web client's resize should be forwarded.
      webWs.send(JSON.stringify({ type: 'resize', cols: 130, rows: 45 }));
      await new Promise((r) => setTimeout(r, 50));

      expect(resizeSpy).toHaveBeenCalledTimes(1);
      expect(resizeSpy).toHaveBeenCalledWith(sessionId, 130, 45);
    } finally {
      await closeClient(webWs);
    }
  });

  it('dedupes identical-dimension resize frames', async () => {
    server = await startTestServer();
    const { sessionManager, port } = server;
    const session = await sessionManager.createSession(tempRepo, 'dedupe');
    const sessionId = session.meta.id;

    const resizeSpy = vi
      .spyOn(sessionManager, 'resizeCaptain')
      .mockImplementation(() => {});

    const webWs = await openClient(port, sessionId, 'web');

    try {
      // Three identical resizes in a row — only the first should be
      // forwarded to the PTY.
      webWs.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
      webWs.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
      webWs.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
      await new Promise((r) => setTimeout(r, 100));

      expect(resizeSpy).toHaveBeenCalledTimes(1);
      expect(resizeSpy).toHaveBeenCalledWith(sessionId, 120, 40);

      // A different size still goes through.
      webWs.send(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }));
      await new Promise((r) => setTimeout(r, 50));
      expect(resizeSpy).toHaveBeenCalledTimes(2);
      expect(resizeSpy).toHaveBeenLastCalledWith(sessionId, 80, 24);
    } finally {
      await closeClient(webWs);
    }
  });
});
