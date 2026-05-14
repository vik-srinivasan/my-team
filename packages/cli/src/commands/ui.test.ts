import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __test__, startStaticServer, type UiServerHandle } from './ui.js';

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
});
