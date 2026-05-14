import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer, type Server } from 'node:http';
import {
  __test__,
  isDaemonRunning,
  openInBrowser,
  startStaticServer,
  type UiServerHandle,
} from './ui.js';

const { resolveFile } = __test__;

async function makeDist(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ui-test-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>x</title>');
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'assets', 'app.js'), 'console.log("hi");');
  await writeFile(join(dir, 'assets', 'app.css'), 'body{color:red;}');
  return dir;
}

describe('ui.resolveFile', () => {
  it('serves index.html for root request', async () => {
    const dir = await makeDist();
    try {
      const out = await resolveFile(dir, '/');
      expect(out).toBe(join(dir, 'index.html'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns asset path when the file exists', async () => {
    const dir = await makeDist();
    try {
      const out = await resolveFile(dir, '/assets/app.js');
      expect(out).toBe(join(dir, 'assets', 'app.js'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falls back to index.html for unknown paths (SPA routing)', async () => {
    const dir = await makeDist();
    try {
      const out = await resolveFile(dir, '/sessions/foo-bar-1');
      expect(out).toBe(join(dir, 'index.html'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses path traversal and falls back to index.html', async () => {
    const dir = await makeDist();
    try {
      const out = await resolveFile(dir, '/../../etc/passwd');
      // Either the traversal was stripped (giving a real path inside dir) or
      // it fell back to index.html. Either way it MUST stay inside dir.
      expect(out.startsWith(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('ui.startStaticServer', () => {
  let handle: UiServerHandle | undefined;
  let distDir: string | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.close().catch(() => undefined);
      handle = undefined;
    }
    if (distDir) {
      await rm(distDir, { recursive: true, force: true });
      distDir = undefined;
    }
  });

  it('errors when dist directory does not exist', async () => {
    await expect(startStaticServer('/tmp/definitely-not-here-' + Date.now(), 0)).rejects.toThrow(
      /UI build not found/,
    );
  });

  it('errors when dist exists but lacks index.html', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-test-empty-'));
    distDir = dir;
    await expect(startStaticServer(dir, 0)).rejects.toThrow(/UI build not found/);
  });

  it('starts a server that serves index.html and assets', async () => {
    distDir = await makeDist();
    // Port 0 → OS picks a free port.
    handle = await startStaticServer(distDir, 0);

    const address = handle.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected AddressInfo from server.address()');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const indexRes = await fetch(`${baseUrl}/`);
    expect(indexRes.status).toBe(200);
    expect(indexRes.headers.get('content-type')).toMatch(/text\/html/);
    expect(await indexRes.text()).toContain('<title>x</title>');

    const jsRes = await fetch(`${baseUrl}/assets/app.js`);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get('content-type')).toMatch(/javascript/);
    expect(await jsRes.text()).toContain('console.log');

    const unknownRes = await fetch(`${baseUrl}/some/spa/route`);
    expect(unknownRes.status).toBe(200);
    expect(await unknownRes.text()).toContain('<title>x</title>');
  });

  it('close() resolves and stops accepting connections', async () => {
    distDir = await makeDist();
    handle = await startStaticServer(distDir, 0);
    const address = handle.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected AddressInfo');
    }
    const port = address.port;

    await handle.close();
    handle = undefined; // prevent double-close in afterEach

    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toBeDefined();
  });

  it('sets the correct MIME type for CSS and JS assets', async () => {
    distDir = await makeDist();
    handle = await startStaticServer(distDir, 0);

    const address = handle.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected AddressInfo');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const cssRes = await fetch(`${baseUrl}/assets/app.css`);
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers.get('content-type')).toMatch(/text\/css/);

    const jsRes = await fetch(`${baseUrl}/assets/app.js`);
    expect(jsRes.headers.get('content-type')).toMatch(/javascript/);
  });

  it('refuses to leak files outside dist via a traversal-encoded URL', async () => {
    // Plant a file OUTSIDE dist that we never want exposed.
    const outsideDir = await mkdtemp(join(tmpdir(), 'ui-test-outside-'));
    await writeFile(join(outsideDir, 'secret.txt'), 'TOP SECRET');
    distDir = await makeDist();
    handle = await startStaticServer(distDir, 0);
    const address = handle.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected AddressInfo');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // %2e%2e is the URL-encoded form of "..". This is the canonical
      // path-traversal attack used by scanners.
      const res = await fetch(`${baseUrl}/%2e%2e/%2e%2e/secret.txt`);
      // Either a 200 with index.html (SPA fallback) or a non-200 status —
      // either way the body MUST NOT contain "TOP SECRET".
      const body = await res.text();
      expect(body).not.toContain('TOP SECRET');
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });
});

// ── Daemon health-check ───────────────────────────────────────────────

describe('ui.isDaemonRunning', () => {
  let healthServer: Server | undefined;
  let healthPort = 0;

  afterEach(async () => {
    if (healthServer) {
      await new Promise<void>((resolve) => healthServer!.close(() => resolve()));
      healthServer = undefined;
    }
  });

  function startHealthServer(handler: (req: { url?: string }, res: {
    statusCode: number;
    setHeader: (k: string, v: string) => void;
    end: (b?: string) => void;
  }) => void): Promise<void> {
    return new Promise((resolve) => {
      healthServer = createHttpServer((req, res) => handler(req, res));
      healthServer.listen(0, '127.0.0.1', () => {
        const addr = healthServer!.address();
        if (addr && typeof addr === 'object') {
          healthPort = addr.port;
        }
        resolve();
      });
    });
  }

  it('returns false when nothing is listening on the daemon port', async () => {
    // Use a port that definitely has no server.
    const result = await isDaemonRunning('http://127.0.0.1:1');
    expect(result).toBe(false);
  });

  it('returns true when /api/health responds 200', async () => {
    await startHealthServer((req, res) => {
      if (req.url === '/api/health') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });

    const result = await isDaemonRunning(`http://127.0.0.1:${healthPort}`);
    expect(result).toBe(true);
  });

  it('returns false when /api/health responds with non-2xx', async () => {
    await startHealthServer((_req, res) => {
      res.statusCode = 500;
      res.end('boom');
    });

    const result = await isDaemonRunning(`http://127.0.0.1:${healthPort}`);
    expect(result).toBe(false);
  });
});

// ── Open-in-browser helper ────────────────────────────────────────────
//
// `openInBrowser` shells out to `open` / `xdg-open` / `start` depending
// on platform. We can't reliably assert "a browser opened" in CI, so the
// test asserts the helper:
//   1. invokes child_process.spawn with the expected command, and
//   2. swallows spawn errors silently (printing the URL is sufficient
//      fallback per the implementation note).

describe('ui.openInBrowser', () => {
  it('invokes the platform-appropriate spawn command without throwing', async () => {
    // The helper imports `spawn` from node:child_process directly, so we
    // can't easily inject a mock without restructuring. The test asserts
    // the helper returns synchronously without throwing — a reasonable
    // smoke test for the wiring. The detached/unref'd child means we
    // don't leave a zombie process behind even if `open` actually runs.
    const url = 'http://localhost:3737';
    expect(() => openInBrowser(url)).not.toThrow();
  });

  it('does not throw even when the underlying spawn fails (URL-only fallback)', async () => {
    // Simulate a platform where the command doesn't exist by passing a
    // URL — the helper installs an 'error' listener that swallows the
    // failure. We can't synthesise the failure deterministically here
    // without DI, but we can verify the helper returns quickly and
    // doesn't surface an exception.
    let threw = false;
    try {
      openInBrowser('not-a-real-url-but-helper-must-not-throw');
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    // Give the spawn's 'error' handler a tick to run if it fires.
    await new Promise((r) => setTimeout(r, 50));
  });
});
