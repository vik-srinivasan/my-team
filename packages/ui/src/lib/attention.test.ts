import { describe, it, expect } from 'vitest';
import type { SessionSummary } from '@my-team/shared';

import { getAttention } from './attention.js';

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'sess-1',
    title: 'Test session',
    source_repo: '/tmp/repo',
    phase: 'executing',
    active_specialist: 'engineer',
    created_at: '2026-05-10T10:00:00Z',
    last_checkpoint: '2026-05-10T10:00:00Z',
    must_ask_count: 0,
    ...overrides,
  };
}

describe('getAttention', () => {
  it('flags awaiting_approval as critical with reason', () => {
    const session = makeSession({ phase: 'awaiting_approval' });
    const result = getAttention(session, { 'sess-1': session.last_checkpoint });

    expect(result.critical).toBe(true);
    expect(result.reason).toBe('Awaiting approval');
  });

  it('flags blocked as critical with reason', () => {
    const session = makeSession({ phase: 'blocked' });
    const result = getAttention(session, { 'sess-1': session.last_checkpoint });

    expect(result.critical).toBe(true);
    expect(result.reason).toBe('Blocked');
  });

  it('flags must_ask_count > 0 as critical, singular vs plural reason', () => {
    const single = makeSession({ must_ask_count: 1 });
    const many = makeSession({ must_ask_count: 3 });

    const r1 = getAttention(single, { 'sess-1': single.last_checkpoint });
    expect(r1.critical).toBe(true);
    expect(r1.reason).toBe('Captain has a question');

    const r3 = getAttention(many, { 'sess-1': many.last_checkpoint });
    expect(r3.critical).toBe(true);
    expect(r3.reason).toBe('Captain has 3 questions');
  });

  it('prefers awaiting_approval reason over must_ask when both apply', () => {
    const session = makeSession({ phase: 'awaiting_approval', must_ask_count: 2 });
    const result = getAttention(session, { 'sess-1': session.last_checkpoint });

    expect(result.critical).toBe(true);
    expect(result.reason).toBe('Awaiting approval');
  });

  it('prefers blocked reason over must_ask when both apply', () => {
    const session = makeSession({ phase: 'blocked', must_ask_count: 2 });
    const result = getAttention(session, { 'sess-1': session.last_checkpoint });

    expect(result.critical).toBe(true);
    expect(result.reason).toBe('Blocked');
  });

  it('marks hasUpdate when last_checkpoint is newer than lastViewed', () => {
    const session = makeSession({
      last_checkpoint: '2026-05-10T11:00:00Z',
    });
    const lastViewed = { 'sess-1': '2026-05-10T10:00:00Z' };

    const result = getAttention(session, lastViewed);
    expect(result.hasUpdate).toBe(true);
  });

  it('does NOT mark hasUpdate when last_checkpoint equals lastViewed', () => {
    const ts = '2026-05-10T10:00:00Z';
    const session = makeSession({ last_checkpoint: ts });
    const lastViewed = { 'sess-1': ts };

    const result = getAttention(session, lastViewed);
    expect(result.hasUpdate).toBe(false);
  });

  it('marks hasUpdate when the session has never been viewed', () => {
    const session = makeSession();
    const result = getAttention(session, {});
    expect(result.hasUpdate).toBe(true);
  });

  it('all-clear: not critical, no update, no reason', () => {
    const ts = '2026-05-10T10:00:00Z';
    const session = makeSession({
      phase: 'executing',
      must_ask_count: 0,
      last_checkpoint: ts,
    });
    const lastViewed = { 'sess-1': ts };

    const result = getAttention(session, lastViewed);
    expect(result).toEqual({ critical: false, hasUpdate: false, reason: null });
  });
});
