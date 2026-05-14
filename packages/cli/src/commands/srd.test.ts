import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripAnsi } from '@my-team/shared';
import { __test__, srdCommand } from './srd.js';

const { renderSrd } = __test__;

// ── Pure-render unit tests (mirror plan.test.ts) ─────────────────────

describe('renderSrd', () => {
  it('passes content through with stripped output matching input', () => {
    const md = `# SRD
problem statement
## Goals
- ship the thing
- keep the user happy
### Detail
text
`;
    const out = renderSrd(md);
    expect(stripAnsi(out)).toBe(md);
  });

  it('returns empty string for empty input', () => {
    expect(renderSrd('')).toBe('');
  });

  it('does not mangle code-style lines', () => {
    const line = '    const x = 1;';
    expect(renderSrd(line)).toBe(line);
  });

  it('round-trips through stripAnsi for h1/h2/h3/h4 headers', () => {
    // In CI / non-TTY environments chalk often disables color output, so
    // asserting that ANSI escapes are present is environment-dependent.
    // Instead, assert the strip(rendered) === original invariant — it
    // holds whether colors are emitted or not.
    const md = '# h1\n## h2\n### h3\n#### h4\nbody';
    const out = renderSrd(md);
    expect(stripAnsi(out)).toBe(md);
  });

  it('preserves blank lines and trailing newlines', () => {
    const md = '# title\n\n\nbody\n';
    expect(stripAnsi(renderSrd(md))).toBe(md);
  });
});

// ── End-to-end CLI tests via filesystem mock (mirror jump.test.ts) ───

// Mock the session-paths module so we can point at a temp directory.
let mockSessionsRoot = '';

vi.mock('../session-paths.js', async () => {
  const actual = await vi.importActual<typeof import('../session-paths.js')>(
    '../session-paths.js',
  );
  return {
    ...actual,
    SESSIONS_DIR: '',
    resolveSessionDir: (id: string) => join(mockSessionsRoot, id),
    resolveTeamFile: (id: string, relpath: string) =>
      join(mockSessionsRoot, id, '.team', relpath),
    readSessionFile: async (id: string, relpath: string) => {
      const { readFile } = await import('node:fs/promises');
      const fp = join(mockSessionsRoot, id, relpath);
      try {
        return await readFile(fp, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    readTeamFile: async (id: string, relpath: string) => {
      const { readFile } = await import('node:fs/promises');
      const fp = join(mockSessionsRoot, id, '.team', relpath);
      try {
        return await readFile(fp, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
  };
});

class ProcessExitError extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code ?? ''})`);
  }
}

describe('srdCommand (filesystem integration)', () => {
  beforeEach(async () => {
    mockSessionsRoot = await mkdtemp(join(tmpdir(), 'team-srd-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExitError(code);
    }) as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(mockSessionsRoot, { recursive: true, force: true });
  });

  it('prints rendered SRD content on the happy path', async () => {
    const id = 'happy-srd-1';
    const teamDir = join(mockSessionsRoot, id, '.team');
    await mkdir(teamDir, { recursive: true });
    const body = '# Session Requirements\n\n## Problem\nDo the thing.';
    await writeFile(join(teamDir, 'srd.md'), body);

    const cmd = srdCommand();
    await cmd.parseAsync(['node', 'team', id]);

    const logMock = vi.mocked(console.log);
    expect(logMock).toHaveBeenCalledTimes(1);
    const out = logMock.mock.calls[0]?.[0] as string;
    expect(stripAnsi(out)).toBe(body);
  });

  it('prints a dim "No SRD file" message when srd.md is missing', async () => {
    const id = 'missing-srd-2';
    // create session dir but no .team/srd.md
    await mkdir(join(mockSessionsRoot, id, '.team'), { recursive: true });

    const cmd = srdCommand();
    await cmd.parseAsync(['node', 'team', id]);

    const logMock = vi.mocked(console.log);
    const errMock = vi.mocked(console.error);
    const exitMock = vi.mocked(process.exit);

    expect(logMock).toHaveBeenCalledTimes(1);
    const out = logMock.mock.calls[0]?.[0] as string;
    expect(stripAnsi(out)).toContain('No SRD file for missing-srd-2.');
    expect(errMock).not.toHaveBeenCalled();
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('prints a dim "SRD file is empty" message when srd.md is zero-length', async () => {
    const id = 'empty-srd-3';
    const teamDir = join(mockSessionsRoot, id, '.team');
    await mkdir(teamDir, { recursive: true });
    await writeFile(join(teamDir, 'srd.md'), '');

    const cmd = srdCommand();
    await cmd.parseAsync(['node', 'team', id]);

    const logMock = vi.mocked(console.log);
    const errMock = vi.mocked(console.error);
    const exitMock = vi.mocked(process.exit);

    expect(logMock).toHaveBeenCalledTimes(1);
    const out = logMock.mock.calls[0]?.[0] as string;
    expect(stripAnsi(out)).toContain('SRD file is empty.');
    expect(errMock).not.toHaveBeenCalled();
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('treats whitespace-only files as empty', async () => {
    const id = 'whitespace-srd-4';
    const teamDir = join(mockSessionsRoot, id, '.team');
    await mkdir(teamDir, { recursive: true });
    await writeFile(join(teamDir, 'srd.md'), '   \n\n\t\n');

    const cmd = srdCommand();
    await cmd.parseAsync(['node', 'team', id]);

    const logMock = vi.mocked(console.log);
    const out = logMock.mock.calls[0]?.[0] as string;
    expect(stripAnsi(out)).toContain('SRD file is empty.');
  });

  it('command metadata is registered correctly', () => {
    const cmd = srdCommand();
    expect(cmd.name()).toBe('srd');
    // commander stores the description here:
    expect(cmd.description()).toMatch(/srd\.md/i);
    // Argument must be a required <id>.
    const args = cmd.registeredArguments;
    expect(args.length).toBe(1);
    expect(args[0]?.name()).toBe('id');
    expect(args[0]?.required).toBe(true);
  });
});
