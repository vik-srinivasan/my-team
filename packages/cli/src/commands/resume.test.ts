import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SessionSummary } from '@my-team/shared';

// Mock the api-client so the CLI command never hits a real daemon.
vi.mock('../api-client.js', () => ({
  api: {
    resumeSession: vi.fn(),
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

import { resumeCommand } from './resume.js';

describe('resumeCommand', () => {
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

  it('parses <id> argument and dispatches to api.resumeSession', async () => {
    const { api } = await import('../api-client.js');
    const mockSummary: SessionSummary = {
      id: 'orphan-foo-42',
      title: 'Orphan Foo',
      source_repo: '/tmp/repo',
      phase: 'reviewing',
      active_specialist: null,
      created_at: '2026-05-12T10:00:00.000Z',
      last_checkpoint: '2026-05-12T10:30:00.000Z',
      must_ask_count: 0,
    };
    vi.mocked(api.resumeSession).mockResolvedValueOnce(mockSummary);

    const cmd = resumeCommand();
    await cmd.parseAsync(['node', 'team', 'orphan-foo-42']);

    expect(vi.mocked(api.resumeSession)).toHaveBeenCalledOnce();
    expect(vi.mocked(api.resumeSession)).toHaveBeenCalledWith('orphan-foo-42');
    expect(vi.mocked(console.log)).toHaveBeenCalledTimes(2);
    // First line: "Resumed <id>" (chalk-wrapped, check the plain text).
    const firstLine = (vi.mocked(console.log).mock.calls[0]?.[0] as string)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '');
    expect(firstLine).toContain('Resumed orphan-foo-42');
    // Second line: hint about team open.
    const secondLine = (vi.mocked(console.log).mock.calls[1]?.[0] as string)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '');
    expect(secondLine).toContain('team open orphan-foo-42');
    expect(vi.mocked(process.exit)).not.toHaveBeenCalled();
  });

  it('prints a clear "already running" message and exits 1 on SESSION_ACTIVE', async () => {
    const { api, ApiError } = await import('../api-client.js');
    vi.mocked(api.resumeSession).mockRejectedValueOnce(
      new ApiError(409, 'Session is still active: orphan-bar-1. Kill it first.', 'SESSION_ACTIVE'),
    );

    const cmd = resumeCommand();
    await expect(cmd.parseAsync(['node', 'team', 'orphan-bar-1'])).rejects.toBeInstanceOf(
      ProcessExitError,
    );

    const errCalls = vi.mocked(console.error).mock.calls;
    expect(errCalls.length).toBeGreaterThanOrEqual(1);
    const errMsg = (errCalls[0]?.[0] as string)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '');
    expect(errMsg).toContain('already running');
    expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
  });

  it('prints the error message and exits 1 on SESSION_NOT_FOUND', async () => {
    const { api, ApiError } = await import('../api-client.js');
    vi.mocked(api.resumeSession).mockRejectedValueOnce(
      new ApiError(404, "Session not found. Run 'team list' to see active sessions.", 'SESSION_NOT_FOUND'),
    );

    const cmd = resumeCommand();
    await expect(cmd.parseAsync(['node', 'team', 'no-such-id-99'])).rejects.toBeInstanceOf(
      ProcessExitError,
    );

    const errCalls = vi.mocked(console.error).mock.calls;
    expect(errCalls.length).toBeGreaterThanOrEqual(1);
    const errMsg = (errCalls[0]?.[0] as string)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '');
    expect(errMsg).toContain('not found');
    expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
  });

  it('exits 1 on SESSION_CORRUPT and surfaces the daemon message', async () => {
    const { api, ApiError } = await import('../api-client.js');
    vi.mocked(api.resumeSession).mockRejectedValueOnce(
      new ApiError(
        422,
        "Session 'corrupt-id-7' worktree is corrupt or not resumable. Consider 'team purge corrupt-id-7'.",
        'SESSION_CORRUPT',
      ),
    );

    const cmd = resumeCommand();
    await expect(cmd.parseAsync(['node', 'team', 'corrupt-id-7'])).rejects.toBeInstanceOf(
      ProcessExitError,
    );

    const errCalls = vi.mocked(console.error).mock.calls;
    expect(errCalls.length).toBeGreaterThanOrEqual(1);
    const errMsg = (errCalls[0]?.[0] as string)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '');
    // The daemon-side message (includes purge suggestion) must be surfaced.
    expect(errMsg).toContain('corrupt');
    expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
  });
});
