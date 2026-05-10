import type { SessionPhase } from '@my-team/shared';

/**
 * Tailwind class names for the small status dot rendered next to a session.
 * Active phases pulse; terminal phases are static.
 */
export const PHASE_DOT: Record<SessionPhase, string> = {
  created: 'bg-zinc-400',
  scouting: 'bg-cyan-400',
  planning: 'bg-cyan-400',
  awaiting_approval: 'bg-amber-400 animate-pulse',
  executing: 'bg-blue-400 animate-pulse',
  reviewing: 'bg-purple-400 animate-pulse',
  done: 'bg-green-400',
  blocked: 'bg-red-400 animate-pulse',
  killed: 'bg-zinc-500',
  cleaned: 'bg-zinc-600',
};

/** Human-readable label for a session phase. */
export const PHASE_LABEL: Record<SessionPhase, string> = {
  created: 'Created',
  scouting: 'Scouting',
  planning: 'Planning',
  awaiting_approval: 'Awaiting Approval',
  executing: 'Executing',
  reviewing: 'Reviewing',
  done: 'Done',
  blocked: 'Blocked',
  killed: 'Killed',
  cleaned: 'Cleaned',
};

/** Look up dot classes with a safe fallback for unknown phase strings. */
export function phaseDot(phase: string | undefined | null): string {
  if (!phase) return 'bg-zinc-500';
  return PHASE_DOT[phase as SessionPhase] ?? 'bg-zinc-500';
}

/** Look up a label with a safe fallback (returns the raw phase if unknown). */
export function phaseLabel(phase: string | undefined | null): string {
  if (!phase) return '';
  return PHASE_LABEL[phase as SessionPhase] ?? phase;
}

/**
 * Human-friendly, narrative status line for a session row.
 *
 * Most phases map to a fixed sentence. `executing` is dynamic: if we know
 * which specialist is active, we name them; otherwise we default to
 * "Engineer is working" (the most common case).
 */
export function phaseFriendlyLabel(
  phase: string | undefined | null,
  activeSpecialist?: string | null,
): string {
  switch (phase) {
    case 'created':
      return 'Just created';
    case 'scouting':
      return 'Scout is exploring';
    case 'planning':
      return 'Drafting plan';
    case 'awaiting_approval':
      return 'Waiting for your approval';
    case 'executing': {
      if (activeSpecialist && activeSpecialist.length > 0) {
        const name =
          activeSpecialist.charAt(0).toUpperCase() + activeSpecialist.slice(1);
        return `${name} is working`;
      }
      return 'Engineer is working';
    }
    case 'reviewing':
      return 'Reviewing code';
    case 'done':
      return 'Done';
    case 'blocked':
      return 'Blocked — needs you';
    case 'killed':
      return 'Killed';
    case 'cleaned':
      return 'Cleaned';
    default:
      return phaseLabel(phase);
  }
}
