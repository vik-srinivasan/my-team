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
    // Use distinct created_at values so tie-breaking is deterministic within each rank bucket.
    const now = Date.now();
    const ses = [
      makeSession({ id: 'idle', phase: 'executing', created_at: new Date(now - 60_000).toISOString() }),
      makeSession({ id: 'done', phase: 'done', created_at: new Date(now - 60_000).toISOString() }),
      makeSession({ id: 'ask', phase: 'executing', must_ask_count: 2, created_at: new Date(now - 60_000).toISOString() }),
      makeSession({ id: 'block', phase: 'blocked', created_at: new Date(now - 60_000).toISOString() }),
      // approve is newer than idle so it sorts first within rank 3 (idle/running bucket).
      makeSession({ id: 'approve', phase: 'awaiting_approval', created_at: new Date(now - 30_000).toISOString() }),
    ];

    const sorted = [...ses].sort(compareByAttention).map((s) => s.id);
    // approve is newer than idle so within rank 3 it appears first.
    expect(sorted).toEqual(['block', 'ask', 'approve', 'idle', 'done']);
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

  it('awaiting_approval WITHOUT must_ask ranks with idle/running (rank 3, not rank 0)', () => {
    // Contract: a bare awaiting_approval (no must_ask_pending) is calm. It
    // should sort AFTER must_ask sessions and before done, not before them.
    const waiting = makeSession({
      id: 'waiting',
      phase: 'awaiting_approval',
      must_ask_count: 0,
    });
    const askSession = makeSession({
      id: 'ask',
      phase: 'executing',
      must_ask_count: 2,
    });
    const idleSession = makeSession({
      id: 'idle',
      phase: 'executing',
      must_ask_count: 0,
    });
    const doneSession = makeSession({ id: 'done', phase: 'done' });

    const sorted = [doneSession, waiting, idleSession, askSession]
      .sort(compareByAttention)
      .map((s) => s.id);

    // must_ask first, then idle bucket (awaiting_approval and idle tie on rank 3),
    // then done last.
    expect(sorted[0]).toBe('ask');
    expect(sorted[sorted.length - 1]).toBe('done');
    // Both 'waiting' and 'idle' are rank 3 — awaiting_approval does NOT jump to rank 0.
    const idleGroupIds = sorted.slice(1, 3);
    expect(idleGroupIds).toContain('waiting');
    expect(idleGroupIds).toContain('idle');
  });
});
