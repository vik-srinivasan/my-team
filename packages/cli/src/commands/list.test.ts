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
  it('puts awaiting_approval first, then blocked, then must_ask, then idle, then done', () => {
    const ses = [
      makeSession({ id: 'idle', phase: 'executing' }),
      makeSession({ id: 'done', phase: 'done' }),
      makeSession({ id: 'ask', phase: 'executing', must_ask_count: 2 }),
      makeSession({ id: 'block', phase: 'blocked' }),
      makeSession({ id: 'approve', phase: 'awaiting_approval' }),
    ];

    const sorted = [...ses].sort(compareByAttention).map((s) => s.id);
    expect(sorted).toEqual(['approve', 'block', 'ask', 'idle', 'done']);
  });

  it('within same priority bucket, newer sessions come first', () => {
    const newer = makeSession({ id: 'newer', phase: 'executing', created_at: new Date(Date.now() - 60_000).toISOString() });
    const older = makeSession({ id: 'older', phase: 'executing', created_at: new Date(Date.now() - 3_600_000).toISOString() });
    const sorted = [older, newer].sort(compareByAttention).map((s) => s.id);
    expect(sorted).toEqual(['newer', 'older']);
  });

  it('awaiting_approval ranks above must_ask even when must_ask_count > 0 on both', () => {
    const a = makeSession({ id: 'a', phase: 'awaiting_approval', must_ask_count: 1 });
    const b = makeSession({ id: 'b', phase: 'executing', must_ask_count: 1 });
    const sorted = [b, a].sort(compareByAttention).map((s) => s.id);
    expect(sorted).toEqual(['a', 'b']);
  });
});
