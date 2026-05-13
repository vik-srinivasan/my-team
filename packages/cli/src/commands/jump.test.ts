import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock the session-paths module so we can point at a temp directory.
vi.mock('../session-paths.js', () => ({
  resolveSessionDir: (id: string) => join(mockSessionsRoot, id),
}));

let mockSessionsRoot = '';

// Helper that throws on process.exit so the action handler stops executing.
class ProcessExitError extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code ?? ''})`);
  }
}

import { jumpCommand } from './jump.js';

describe('jumpCommand', () => {
  beforeEach(async () => {
    mockSessionsRoot = await mkdtemp(join(tmpdir(), 'team-jump-test-'));
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

  it('prints the worktree path on stdout for an existing session', async () => {
    const id = 'happy-otter-7';
    const worktree = join(mockSessionsRoot, id);
    await mkdir(worktree);

    const cmd = jumpCommand();
    await cmd.parseAsync(['node', 'team', id]);

    const logMock = vi.mocked(console.log);
    const errMock = vi.mocked(console.error);
    const exitMock = vi.mocked(process.exit);

    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(worktree);
    expect(errMock).not.toHaveBeenCalled();
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('errors with a guidance message and exits 1 when the session is missing', async () => {
    const id = 'no-such-session-99';

    const cmd = jumpCommand();
    await expect(cmd.parseAsync(['node', 'team', id])).rejects.toBeInstanceOf(ProcessExitError);

    const logMock = vi.mocked(console.log);
    const errMock = vi.mocked(console.error);
    const exitMock = vi.mocked(process.exit);

    expect(logMock).not.toHaveBeenCalled();
    expect(errMock).toHaveBeenCalledTimes(1);
    const errArg = errMock.mock.calls[0]?.[0] as string;
    // strip ANSI codes so the assertion isn't tied to chalk's output format.
    // eslint-disable-next-line no-control-regex
    const plain = errArg.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toBe(`Session '${id}' not found. Run 'team list' to see active sessions.`);
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
