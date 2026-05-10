import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readRegistry, writeRegistry, recordSessionStart, resolveShortcut } from './repo-registry.js';
import { RepoRegistryError } from './errors.js';
import type { SessionMeta } from './types.js';

function makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: 'bold-bear-12',
    title: 'Test session',
    source_repo: '/tmp/example/foo',
    source_branch: 'main',
    session_branch: 'my-team/bold-bear-12',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('repo-registry', () => {
  let tmpDir: string;
  let registryPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'my-team-registry-'));
    registryPath = join(tmpDir, 'recents.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('readRegistry', () => {
    it('returns empty registry when file missing', async () => {
      const reg = await readRegistry(registryPath);
      expect(reg).toEqual({ version: 1, repos: [] });
    });

    it('throws RepoRegistryError on malformed JSON', async () => {
      await writeFile(registryPath, '{ this is not valid json');
      await expect(readRegistry(registryPath)).rejects.toBeInstanceOf(RepoRegistryError);
    });

    it('throws RepoRegistryError when required fields missing', async () => {
      await writeFile(registryPath, JSON.stringify({ foo: 'bar' }));
      await expect(readRegistry(registryPath)).rejects.toBeInstanceOf(RepoRegistryError);
    });

    it('reads a valid registry', async () => {
      const data = {
        version: 1,
        repos: [
          {
            path: '/foo/bar',
            basename: 'bar',
            first_used: '2026-01-01T00:00:00.000Z',
            last_used: '2026-01-01T00:00:00.000Z',
            session_count: 1,
            last_session_id: 'a-b-1',
          },
        ],
      };
      await writeFile(registryPath, JSON.stringify(data));
      const reg = await readRegistry(registryPath);
      expect(reg.repos.length).toBe(1);
      expect(reg.repos[0]?.basename).toBe('bar');
    });
  });

  describe('writeRegistry', () => {
    it('creates parent dir if missing and writes pretty JSON', async () => {
      const nested = join(tmpDir, 'nested', 'deeper', 'recents.json');
      await writeRegistry(
        {
          version: 1,
          repos: [
            {
              path: '/a',
              basename: 'a',
              first_used: '2026-01-01T00:00:00.000Z',
              last_used: '2026-01-01T00:00:00.000Z',
              session_count: 1,
              last_session_id: 's1',
            },
          ],
        },
        nested,
      );
      const raw = await readFile(nested, 'utf-8');
      expect(raw).toContain('\n');
      const parsed = JSON.parse(raw);
      expect(parsed.repos[0].path).toBe('/a');
    });

    it('sorts repos by last_used desc on write', async () => {
      await writeRegistry(
        {
          version: 1,
          repos: [
            {
              path: '/old',
              basename: 'old',
              first_used: '2026-01-01T00:00:00.000Z',
              last_used: '2026-01-01T00:00:00.000Z',
              session_count: 1,
              last_session_id: 's1',
            },
            {
              path: '/new',
              basename: 'new',
              first_used: '2026-02-01T00:00:00.000Z',
              last_used: '2026-02-01T00:00:00.000Z',
              session_count: 1,
              last_session_id: 's2',
            },
          ],
        },
        registryPath,
      );
      const reg = await readRegistry(registryPath);
      expect(reg.repos[0]?.path).toBe('/new');
      expect(reg.repos[1]?.path).toBe('/old');
    });
  });

  describe('recordSessionStart', () => {
    it('appends a new repo when not present', async () => {
      await recordSessionStart(makeMeta({ source_repo: '/repo/alpha', id: 'sess-1' }), registryPath);
      const reg = await readRegistry(registryPath);
      expect(reg.repos.length).toBe(1);
      expect(reg.repos[0]?.path).toBe('/repo/alpha');
      expect(reg.repos[0]?.basename).toBe('alpha');
      expect(reg.repos[0]?.session_count).toBe(1);
      expect(reg.repos[0]?.last_session_id).toBe('sess-1');
      expect(reg.repos[0]?.first_used).toBe(reg.repos[0]?.last_used);
    });

    it('bumps existing repo session_count and last_used', async () => {
      await recordSessionStart(makeMeta({ source_repo: '/repo/beta', id: 'sess-1' }), registryPath);
      const before = await readRegistry(registryPath);
      const firstUsed = before.repos[0]?.first_used;

      // Wait a tick so timestamps differ
      await new Promise((r) => setTimeout(r, 5));

      await recordSessionStart(makeMeta({ source_repo: '/repo/beta', id: 'sess-2' }), registryPath);
      const after = await readRegistry(registryPath);
      expect(after.repos.length).toBe(1);
      expect(after.repos[0]?.session_count).toBe(2);
      expect(after.repos[0]?.last_session_id).toBe('sess-2');
      expect(after.repos[0]?.first_used).toBe(firstUsed);
      expect(
        new Date(after.repos[0]?.last_used ?? '').getTime(),
      ).toBeGreaterThan(new Date(firstUsed ?? '').getTime());
    });

    it('handles multiple distinct repos and re-sorts by last_used', async () => {
      await recordSessionStart(makeMeta({ source_repo: '/repo/one', id: 's1' }), registryPath);
      await new Promise((r) => setTimeout(r, 5));
      await recordSessionStart(makeMeta({ source_repo: '/repo/two', id: 's2' }), registryPath);
      const reg = await readRegistry(registryPath);
      expect(reg.repos.length).toBe(2);
      expect(reg.repos[0]?.path).toBe('/repo/two');
      expect(reg.repos[1]?.path).toBe('/repo/one');
    });
  });

  describe('resolveShortcut', () => {
    it('returns none on no match', async () => {
      await recordSessionStart(makeMeta({ source_repo: '/repo/alpha' }), registryPath);
      const res = await resolveShortcut('does-not-exist', registryPath);
      expect(res).toEqual({ kind: 'none' });
    });

    it('returns one on a single match', async () => {
      await recordSessionStart(makeMeta({ source_repo: '/repo/alpha' }), registryPath);
      const res = await resolveShortcut('alpha', registryPath);
      expect(res).toEqual({ kind: 'one', path: '/repo/alpha' });
    });

    it('returns ambiguous when multiple repos share basename', async () => {
      await recordSessionStart(makeMeta({ source_repo: '/work/proj' }), registryPath);
      await recordSessionStart(makeMeta({ source_repo: '/personal/proj' }), registryPath);
      const res = await resolveShortcut('proj', registryPath);
      expect(res.kind).toBe('ambiguous');
      if (res.kind === 'ambiguous') {
        expect(res.candidates.sort()).toEqual(['/personal/proj', '/work/proj']);
      }
    });

    it('returns none on missing registry file', async () => {
      const missing = join(tmpDir, 'never-exists', 'recents.json');
      await mkdir(join(tmpDir, 'never-exists'), { recursive: true });
      const res = await resolveShortcut('whatever', missing);
      expect(res).toEqual({ kind: 'none' });
    });
  });
});
