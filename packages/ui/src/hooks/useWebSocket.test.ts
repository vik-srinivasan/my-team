import { describe, expect, it, vi } from 'vitest';

import type {
  SessionState,
  TeamFileName,
  WsServerEvent,
} from '@my-team/shared';

import { routeServerEvent, type WsEventHandlers } from './useWebSocket.js';

function makeHandlers(): WsEventHandlers & {
  writeOutput: ReturnType<typeof vi.fn>;
  setTeamFile: ReturnType<typeof vi.fn>;
  setSessionState: ReturnType<typeof vi.fn>;
  setRemoteUrl: ReturnType<typeof vi.fn>;
} {
  return {
    writeOutput: vi.fn(),
    setTeamFile: vi.fn(),
    setSessionState: vi.fn(),
    setRemoteUrl: vi.fn(),
  };
}

describe('routeServerEvent', () => {
  it('routes team_file events to setTeamFile with the discriminator name', () => {
    const handlers = makeHandlers();
    const event: WsServerEvent = {
      type: 'team_file',
      name: 'plan',
      content: '# Plan\nstep one\n',
    };

    routeServerEvent(event, handlers);

    expect(handlers.setTeamFile).toHaveBeenCalledTimes(1);
    expect(handlers.setTeamFile).toHaveBeenCalledWith(
      'plan',
      '# Plan\nstep one\n',
    );
    expect(handlers.writeOutput).not.toHaveBeenCalled();
    expect(handlers.setSessionState).not.toHaveBeenCalled();
    expect(handlers.setRemoteUrl).not.toHaveBeenCalled();
  });

  it('routes each of the four TeamFileName values independently', () => {
    const handlers = makeHandlers();
    const samples: Record<TeamFileName, string> = {
      plan: 'plan body',
      tasks: '- [ ] do thing',
      journal: '## entry',
      review: 'lgtm',
    };

    for (const [name, content] of Object.entries(samples) as Array<
      [TeamFileName, string]
    >) {
      routeServerEvent({ type: 'team_file', name, content }, handlers);
    }

    expect(handlers.setTeamFile).toHaveBeenCalledTimes(4);
    expect(handlers.setTeamFile.mock.calls).toEqual([
      ['plan', samples.plan],
      ['tasks', samples.tasks],
      ['journal', samples.journal],
      ['review', samples.review],
    ]);
  });

  it('forwards output bytes verbatim — no ANSI stripping', () => {
    const handlers = makeHandlers();
    // ANSI SGR + CR + LF: every byte must reach the terminal callback.
    const raw = '\x1b[31mhello\x1b[0m\rworld\n';

    routeServerEvent({ type: 'output', text: raw }, handlers);

    expect(handlers.writeOutput).toHaveBeenCalledTimes(1);
    expect(handlers.writeOutput).toHaveBeenCalledWith(raw);
  });

  it('routes state events to setSessionState', () => {
    const handlers = makeHandlers();
    const state: SessionState = {
      phase: 'executing',
      active_specialist: 'engineer',
      review_iterations: 0,
      max_review_iterations: 3,
      last_checkpoint: '2026-05-11T00:00:00.000Z',
      blockers: [],
      must_ask_pending: [],
    };

    routeServerEvent({ type: 'state', state }, handlers);

    expect(handlers.setSessionState).toHaveBeenCalledWith(state);
  });

  it('routes remote_url events to setRemoteUrl', () => {
    const handlers = makeHandlers();
    routeServerEvent(
      { type: 'remote_url', url: 'https://example.test/r/abc' },
      handlers,
    );
    expect(handlers.setRemoteUrl).toHaveBeenCalledWith(
      'https://example.test/r/abc',
    );
  });

  it('ignores unhandled event types (specialist, diff) without throwing', () => {
    const handlers = makeHandlers();
    routeServerEvent(
      { type: 'specialist', name: 'engineer', status: 'started' },
      handlers,
    );
    routeServerEvent({ type: 'diff', diff: '' }, handlers);

    expect(handlers.writeOutput).not.toHaveBeenCalled();
    expect(handlers.setTeamFile).not.toHaveBeenCalled();
    expect(handlers.setSessionState).not.toHaveBeenCalled();
    expect(handlers.setRemoteUrl).not.toHaveBeenCalled();
  });
});
