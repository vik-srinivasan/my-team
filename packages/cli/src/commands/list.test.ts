import { describe, it, expect } from 'vitest';
import type { SessionSummary } from '@my-team/shared';
import { __test__ } from './list.js';

const { compareByAttention } = __test__;

function makeSession(over: Partial<SessionSummary>): SessionSummary {
  return {
    id: 'sample-session-1',
    title: 't',
    source_repo: '/tmp/repo',
    phase: 'executing',
    active_specialist: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    last_checkpoint: new Date().toISOString(),
    must_ask_count: 0,
    ...over,
  };
}

describe('list compareByAttention', () => {
  it('puts blocked first, then must_ask, then idle (incl. awaiting_approval), then done', () => {
    // awaiting_approval is no longer its own critical bucket — bare
    // awaiting_approval ranks with idle/running. Pair it with must_ask if
    // user input is genuinely pending.
    const ses = [
      makeSession({ id: 'idle', phase: 'executing' }),
      makeSession({ id: 'done', phase: 'done' }),
      makeSession({ id: 'ask', phase: 'executing', must_ask_count: 2 }),
      makeSession({ id: 'block', phase: 'blocked' }),
      makeSession({ id: 'approve', phase: 'awaiting_approval' }),
    ];

    const sorted = [...ses].sort(compareByAttention).map((s) => s.id);
    expect(sorted).toEqual(['block', 'ask', 'idle', 'approve', 'done']);
  });

  it('within same priority bucket, newer sessions come first', () => {
    const newer = makeSession({ id: 'newer', phase: 'executing', created_at: new Date(Date.now() - 60_000).toISOString() });
    const older = makeSession({ id: 'older', phase: 'executing', created_at: new Date(Date.now() - 3_600_000).toISOString() });
    const sorted = [older, newer].sort(compareByAttention).map((s) => s.id);
    expect(sorted).toEqual(['newer', 'older']);
  });

  it('awaiting_approval folds into the must_ask bucket when must_ask_count > 0', () => {
    // Both sessions land in rank 2 (must_ask); tie-break by created_at.
    const a = makeSession({
      id: 'a',
      phase: 'awaiting_approval',
      must_ask_count: 1,
      created_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const b = makeSession({
      id: 'b',
      phase: 'executing',
      must_ask_count: 1,
      created_at: new Date(Date.now() - 3_600_000).toISOString(),
    });
    const sorted = [b, a].sort(compareByAttention).map((s) => s.id);
    expect(sorted).toEqual(['a', 'b']);
  });
});
