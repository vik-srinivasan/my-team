import type { SessionSummary } from '@my-team/shared';

export interface Attention {
  /** True when the session needs the user's eyes right now. */
  critical: boolean;
  /** True when there is fresh captain output since the user last viewed this session. */
  hasUpdate: boolean;
  /** Short, human-readable reason for the critical flag, suitable for a tooltip. */
  reason: string | null;
}

/**
 * Pure derivation of attention state for a session.
 *
 * Critical (red badge):
 *   - phase === 'awaiting_approval'  -> 'Awaiting approval'
 *   - phase === 'blocked'            -> 'Blocked'
 *   - must_ask_count > 0             -> 'Captain has a question' (or N questions)
 *   When more than one trigger applies, awaiting_approval > blocked > must_ask.
 *
 * Update (blue dot):
 *   - last_checkpoint is strictly newer than lastViewed[session.id].
 *   - If the session has never been viewed, only count it as "fresh" once we
 *     actually have a last_checkpoint (always-true otherwise creates noise on
 *     first load — see decisions.md).
 */
export function getAttention(
  session: SessionSummary,
  lastViewed: Record<string, string>,
): Attention {
  let critical = false;
  let reason: string | null = null;

  if (session.phase === 'awaiting_approval') {
    critical = true;
    reason = 'Awaiting approval';
  } else if (session.phase === 'blocked') {
    critical = true;
    reason = 'Blocked';
  } else if (session.must_ask_count > 0) {
    critical = true;
    reason =
      session.must_ask_count === 1
        ? 'Captain has a question'
        : `Captain has ${session.must_ask_count} questions`;
  }

  const hasUpdate = isFresh(session, lastViewed);

  return { critical, hasUpdate, reason };
}

function isFresh(
  session: SessionSummary,
  lastViewed: Record<string, string>,
): boolean {
  if (!session.last_checkpoint) return false;
  const seen = lastViewed[session.id];
  if (!seen) {
    // Never viewed: treat as an update so the user notices it exists.
    return true;
  }
  return session.last_checkpoint > seen;
}
