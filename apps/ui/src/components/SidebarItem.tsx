import type { ReactElement } from 'react';
import { effectivePhase, getAttention, humanizeAgo } from '@my-team/shared/format';
import type { SessionSummary } from '@my-team/shared/types';

/**
 * Tailwind background colors keyed by display phase. Kept in sync with
 * `phaseColor()` in @my-team/shared (which paints CLI ANSI). The chip uses
 * the dot-only variant; the selected item additionally borrows the same
 * color for its left border.
 */
const PHASE_DOT: Record<string, string> = {
  executing: 'bg-yellow-400',
  done: 'bg-green-500',
  blocked: 'bg-red-500',
  killed: 'bg-neutral-500',
  cleaned: 'bg-neutral-500',
  planning: 'bg-cyan-400',
  scouting: 'bg-cyan-400',
  awaiting_approval: 'bg-cyan-400',
  reviewing: 'bg-cyan-400',
  created: 'bg-neutral-400',
};

/**
 * Left-border classes for the selected state. Mirrors the dot color so
 * the highlighted row reads as "this phase, selected".
 */
const PHASE_BORDER: Record<string, string> = {
  executing: 'border-yellow-400',
  done: 'border-green-500',
  blocked: 'border-red-500',
  killed: 'border-neutral-500',
  cleaned: 'border-neutral-500',
  planning: 'border-cyan-400',
  scouting: 'border-cyan-400',
  awaiting_approval: 'border-cyan-400',
  reviewing: 'border-cyan-400',
  created: 'border-neutral-400',
};

export function phaseDotClass(phase: string): string {
  return PHASE_DOT[phase] ?? 'bg-neutral-400';
}

export function phaseBorderClass(phase: string): string {
  return PHASE_BORDER[phase] ?? 'border-neutral-400';
}

export interface SidebarItemProps {
  session: SessionSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function SidebarItem({ session, selected, onSelect }: SidebarItemProps): ReactElement {
  const phase = effectivePhase(session);
  const attention = getAttention(session);
  const age = humanizeAgo(session.created_at);

  const borderClass = selected
    ? phaseBorderClass(phase)
    : 'border-transparent';
  const bgClass = selected
    ? 'bg-neutral-800/80'
    : 'hover:bg-neutral-900/60';

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      data-testid={`sidebar-item-${session.id}`}
      aria-current={selected ? 'true' : undefined}
      className={`w-full text-left border-l-2 ${borderClass} ${bgClass} px-3 py-2 transition-colors`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          data-testid="phase-dot"
          data-phase={phase}
          className={`size-2 rounded-full shrink-0 ${phaseDotClass(phase)}`}
        />
        <span className="font-mono text-xs text-neutral-400 shrink-0">{session.id}</span>
        <span className="ml-auto text-[10px] text-neutral-500 shrink-0">{age}</span>
      </div>
      <div className="mt-1 flex items-start gap-2">
        <span className="text-sm text-neutral-100 line-clamp-2 break-words">
          {session.title}
        </span>
      </div>
      {attention.critical && session.must_ask_count > 0 ? (
        <div className="mt-1.5">
          <span
            data-testid="attention-badge"
            className="inline-flex items-center gap-1 rounded-sm bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-300"
          >
            {attention.label}
          </span>
        </div>
      ) : null}
    </button>
  );
}
