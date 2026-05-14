/**
 * Regression test for the `team attach` listener-cleanup bug.
 *
 * Previously, the `ws.on('close')` handler (server-initiated disconnect
 * path) did not remove the `process.stdin.on('data', onData)` and
 * `process.stdout.on('resize', onResize)` listeners installed by
 * `attachToSession`. Repeated calls in one process accumulated stale
 * listeners that fired against a closed socket.
 *
 * This test:
 *   1. Records baseline listener counts on `process.stdin` ('data') and
 *      `process.stdout` ('resize').
 *   2. Spins up a real WebSocket server on the CLI's hard-coded port
 *      (3001), accepts the CLI's connection, waits for the `hello`
 *      frame, then closes the socket from the server side.
 *   3. Awaits the CLI's promise and asserts that listener counts have
 *      returned to baseline — i.e. cleanup ran.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket as WsServer } from 'ws';
import { createServer, type Server as HttpServer } from 'node:http';

import { attachToSession } from './attach.js';

interface TestServer {
  http: HttpServer;
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}

/**
 * Boot an HTTP+WS server on an ephemeral port. The test sets
 * `MY_TEAM_WS_BASE` so `attachToSession` connects here instead of the
 * production daemon's fixed 3001 — that way the test never collides
 * with a running daemon on the dev machine.
 */
async function startTestServer(
  onConnection: (ws: WsServer) => void,
): Promise<TestServer> {
  const http = createServer();
  const wss = new WebSocketServer({ server: http });
  wss.on('connection', onConnection);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', () => {
      http.removeListener('error', reject);
      resolve();
    });
  });
  const port = (http.address() as { port: number }).port;

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };

  return { http, wss, port, close };
}

describe('attachToSession — listener cleanup on server-initiated close', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let server: TestServer | null = null;

  beforeEach(() => {
    // `attach.ts` logs detach/disconnect lines we don't want polluting
    // test output.
    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    delete process.env['MY_TEAM_WS_BASE'];
    consoleLogSpy.mockRestore();
    // Be defensive: keep vitest's own stdin handling unblocked.
    process.stdin.pause();
  });

  it('removes its process.stdin/data and process.stdout/resize listeners when the server closes the WS', async () => {
    const baselineStdin = process.stdin.listenerCount('data');
    const baselineResize = process.stdout.listenerCount('resize');

    server = await startTestServer((ws) => {
      // When the CLI sends its `hello` frame, close the socket from
      // the server side. This exercises the `ws.on('close')` path in
      // `attach.ts` (i.e. NOT a Ctrl+] / user-initiated detach).
      ws.once('message', () => {
        ws.close();
      });
    });
    process.env['MY_TEAM_WS_BASE'] = `ws://127.0.0.1:${server.port}`;

    // attachToSession resolves when the server-side close is observed.
    await attachToSession('regression-test-session');

    // The bug: stale listeners accumulate. The fix: cleanup() runs on
    // server-close and returns counts to baseline.
    expect(process.stdin.listenerCount('data')).toBe(baselineStdin);
    expect(process.stdout.listenerCount('resize')).toBe(baselineResize);
  });

  it('is safe to call twice in the same process without leaking listeners', async () => {
    const baselineStdin = process.stdin.listenerCount('data');
    const baselineResize = process.stdout.listenerCount('resize');

    server = await startTestServer((ws) => {
      ws.once('message', () => ws.close());
    });
    process.env['MY_TEAM_WS_BASE'] = `ws://127.0.0.1:${server.port}`;

    await attachToSession('first-call');
    await attachToSession('second-call');

    // Both calls' listeners must be cleaned up; baselines hold.
    expect(process.stdin.listenerCount('data')).toBe(baselineStdin);
    expect(process.stdout.listenerCount('resize')).toBe(baselineResize);
  });
});
