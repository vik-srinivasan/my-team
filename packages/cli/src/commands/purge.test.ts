import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the api-client so the CLI command never hits a real daemon.
vi.mock('../api-client.js', () => ({
  api: {
    killSession: vi.fn(),
    cleanSession: vi.fn(),
    purgeOrphans: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, message: string, code: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  },
}));

// Helper that converts a process.exit() call into a thrown error so the
// action handler stops executing and the test can assert the exit code.
class ProcessExitError extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code ?? ''})`);
  }
}

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

import { purgeCommand, currentSessionIdFromCwd } from './purge.js';

describe('currentSessionIdFromCwd', () => {
  it('extracts the session id when cwd is inside a session worktree', () => {
    expect(currentSessionIdFromCwd('/Users/foo/team/sessions/some-id-42/sub/dir')).toBe('some-id-42');
  });

  it('returns the session id when cwd IS the worktree root', () => {
    expect(currentSessionIdFromCwd('/Users/foo/team/sessions/some-id-42')).toBe('some-id-42');
  });

  it('returns null when cwd is outside a my-team worktree', () => {
    expect(currentSessionIdFromCwd('/Users/foo/Documents/my-project')).toBeNull();
  });

  it('returns null for the filesystem root', () => {
    expect(currentSessionIdFromCwd('/')).toBeNull();
  });

  it('returns null when the parent is sessions but grandparent is not team', () => {
    expect(currentSessionIdFromCwd('/Users/foo/other/sessions/some-id-42')).toBeNull();
  });
});

describe('purgeCommand', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExitError(code);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('single-session purge', () => {
    it('succeeds when no live captain (kills then cleans, prints green log)', async () => {
      const { api } = await import('../api-client.js');
      vi.mocked(api.killSession).mockResolvedValueOnce({ ok: true });
      vi.mocked(api.cleanSession).mockResolvedValueOnce({ ok: true });

      const cmd = purgeCommand();
      await cmd.parseAsync(['node', 'team', 'orphan-foo-42']);

      expect(vi.mocked(api.killSession)).toHaveBeenCalledOnce();
      expect(vi.mocked(api.killSession)).toHaveBeenCalledWith('orphan-foo-42');
      expect(vi.mocked(api.cleanSession)).toHaveBeenCalledOnce();
      expect(vi.mocked(api.cleanSession)).toHaveBeenCalledWith('orphan-foo-42');

      // Should print a green success message containing the session id.
      expect(vi.mocked(console.log)).toHaveBeenCalledOnce();
      const msg = stripAnsi(vi.mocked(console.log).mock.calls[0]?.[0] as string);
      expect(msg).toContain('orphan-foo-42');
      expect(msg).toContain('killed');

      // Should NOT have called process.exit.
      expect(vi.mocked(process.exit)).not.toHaveBeenCalled();
    });

    it('exits 1 when killSession throws an ApiError', async () => {
      const { api, ApiError } = await import('../api-client.js');
      vi.mocked(api.killSession).mockRejectedValueOnce(
        new ApiError(404, 'Session not found.', 'SESSION_NOT_FOUND'),
      );

      const cmd = purgeCommand();
      await expect(cmd.parseAsync(['node', 'team', 'no-such-id'])).rejects.toBeInstanceOf(
        ProcessExitError,
      );

      expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
      const errMsg = stripAnsi(vi.mocked(console.error).mock.calls[0]?.[0] as string);
      expect(errMsg).toContain('Session not found.');
    });
  });

  describe('--orphans flag', () => {
    it('prints summary in the expected shape (Purged N, skipped M (live: A, current: B, errors: C))', async () => {
      const { api } = await import('../api-client.js');
      vi.mocked(api.purgeOrphans).mockResolvedValueOnce({
        purged: ['orphan-1', 'orphan-2', 'orphan-3'],
        skipped: [
          { id: 'live-session-7', reason: 'live captain' },
          { id: 'current-session', reason: 'current session' },
          { id: 'broken-orphan', reason: 'error: meta.json corrupt' },
        ],
      });

      const cmd = purgeCommand();
      await cmd.parseAsync(['node', 'team', '--orphans']);

      expect(vi.mocked(api.purgeOrphans)).toHaveBeenCalledOnce();

      const logCalls = vi.mocked(console.log).mock.calls;
      // First log line should contain the summary.
      const summaryLine = stripAnsi(logCalls[0]?.[0] as string);
      expect(summaryLine).toContain('Purged 3');
      expect(summaryLine).toContain('skipped 3');
      expect(summaryLine).toContain('live: 1');
      expect(summaryLine).toContain('current: 1');
      expect(summaryLine).toContain('errors: 1');
    });

    it('prints error details when there are per-session errors', async () => {
      const { api } = await import('../api-client.js');
      vi.mocked(api.purgeOrphans).mockResolvedValueOnce({
        purged: ['orphan-ok'],
        skipped: [{ id: 'broken-orphan', reason: 'error: meta.json corrupt' }],
      });

      const cmd = purgeCommand();
      await cmd.parseAsync(['node', 'team', '--orphans']);

      const logOutput = vi.mocked(console.log).mock.calls.map(
        (c) => stripAnsi(c[0] as string),
      ).join('\n');
      expect(logOutput).toContain('broken-orphan');
      expect(logOutput).toContain('meta.json corrupt');
    });

    it('prints summary with all-zero counts when nothing to purge', async () => {
      const { api } = await import('../api-client.js');
      vi.mocked(api.purgeOrphans).mockResolvedValueOnce({ purged: [], skipped: [] });

      const cmd = purgeCommand();
      await cmd.parseAsync(['node', 'team', '--orphans']);

      const summaryLine = stripAnsi(vi.mocked(console.log).mock.calls[0]?.[0] as string);
      expect(summaryLine).toContain('Purged 0');
      expect(summaryLine).toContain('skipped 0');
      expect(summaryLine).toContain('live: 0');
      expect(summaryLine).toContain('current: 0');
      expect(summaryLine).toContain('errors: 0');
    });

    it('exits 1 on ApiError from purgeOrphans', async () => {
      const { api, ApiError } = await import('../api-client.js');
      vi.mocked(api.purgeOrphans).mockRejectedValueOnce(
        new ApiError(500, 'Internal error', 'INTERNAL_ERROR'),
      );

      const cmd = purgeCommand();
      await expect(cmd.parseAsync(['node', 'team', '--orphans'])).rejects.toBeInstanceOf(
        ProcessExitError,
      );

      expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
    });
  });

  describe('argument validation', () => {
    it('errors and exits 1 when neither <id> nor --orphans is provided', async () => {
      const cmd = purgeCommand();
      await expect(cmd.parseAsync(['node', 'team'])).rejects.toBeInstanceOf(ProcessExitError);

      expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
      const errMsg = stripAnsi(vi.mocked(console.error).mock.calls[0]?.[0] as string);
      expect(errMsg).toContain('--orphans');
    });
  });
});
