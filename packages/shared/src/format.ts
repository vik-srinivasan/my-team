import chalk from 'chalk';

import type { SessionSummary, SessionPhase } from './types.js';

// ── ANSI handling ──────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Strip ANSI escape codes from a string. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

/** Visible character length, ignoring ANSI escapes. */
export function visibleLength(s: string): number {
  return stripAnsi(s).length;
}

/**
 * Pad a string to width `n` with trailing spaces, computing width on the
 * stripped (uncolored) string so that ANSI escapes don't throw off the
 * count. If the visible string is wider than `n`, it is returned as-is.
 */
export function padEndVisible(s: string, n: number): string {
  const len = visibleLength(s);
  if (len >= n) return s;
  return s + ' '.repeat(n - len);
}

/**
 * Truncate visible width to `n`, adding an ellipsis (…) when shortened.
 * ANSI-naive: assumes no color in input (call before applying chalk).
 */
export function truncate(s: string, n: number): string {
  if (n <= 0) return '';
  if (s.length <= n) return s;
  if (n === 1) return '…';
  return s.slice(0, n - 1) + '…';
}

// ── Age formatting ─────────────────────────────────────────────────────

/** Human-friendly relative age from an ISO timestamp. */
export function humanizeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return '0m';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ── Phase abbreviations / colors ───────────────────────────────────────

const PHASE_ABBREV: Partial<Record<SessionPhase, string>> = {
  awaiting_approval: 'approve',
  executing: 'exec',
  reviewing: 'review',
  scouting: 'scout',
  planning: 'plan',
  blocked: 'block',
};

export function abbreviatePhase(phase: string): string {
  return PHASE_ABBREV[phase as SessionPhase] ?? phase;
}

export function phaseColor(phase: string): string {
  const label = abbreviatePhase(phase);
  switch (phase) {
    case 'executing':
      return chalk.yellow(label);
    case 'done':
      return chalk.green(label);
    case 'blocked':
      return chalk.red(label);
    case 'killed':
    case 'cleaned':
      return chalk.gray(label);
    case 'planning':
    case 'scouting':
    case 'awaiting_approval':
    case 'reviewing':
      return chalk.cyan(label);
    default:
      return label;
  }
}

/**
 * Derive the phase to display from `active_specialist` when a real specialist
 * is running, falling back to `s.phase` otherwise. Lets the PHASE column
 * stay accurate even when the captain forgot to advance state.json.
 */
export function effectivePhase(s: Pick<SessionSummary, 'phase' | 'active_specialist'>): SessionPhase {
  switch (s.active_specialist) {
    case 'engineer':         return 'executing';
    case 'tester':
    case 'reviewer':
    case 'tester+reviewer':  return 'reviewing';
    case 'scout':            return 'scouting';
    default:                 return s.phase;
  }
}

// ── Attention derivation ───────────────────────────────────────────────

export interface AttentionInfo {
  /** Single-glyph indicator for the ATTN column (one visible character). */
  glyph: string;
  /** Short label, e.g. "approve", "blocked", "ask (2)", "done". Empty if nothing notable. */
  label: string;
  /** True if the session needs the user's eyes right now. */
  critical: boolean;
  /** True for completed sessions (✓). */
  done: boolean;
}

export const ATTN_GLYPHS = {
  needsInput: '●',
  blocked: '⚠',
  done: '✓',
  idle: ' ',
} as const;

/**
 * Priority: blocked > must_ask_count > done > (idle).
 *
 * `awaiting_approval` no longer forces AT critical — captains advance the
 * phase as soon as they dispatch, and the wrapper auto-heals stale
 * `awaiting_approval` paired with a real `active_specialist`. AT lights up
 * for genuine user-input demand (`must_ask_pending` non-empty) or `blocked`.
 */
export function getAttention(s: Pick<SessionSummary, 'phase' | 'must_ask_count'>): AttentionInfo {
  if (s.phase === 'blocked') {
    return { glyph: ATTN_GLYPHS.blocked, label: 'blocked', critical: true, done: false };
  }
  if (s.must_ask_count > 0) {
    const label = s.must_ask_count === 1 ? 'ask' : `ask (${s.must_ask_count})`;
    return { glyph: ATTN_GLYPHS.needsInput, label, critical: true, done: false };
  }
  if (s.phase === 'done') {
    return { glyph: ATTN_GLYPHS.done, label: 'done', critical: false, done: true };
  }
  return { glyph: ATTN_GLYPHS.idle, label: '', critical: false, done: false };
}

/** Color the ATTN glyph for the list view. */
export function colorAttnGlyph(info: AttentionInfo): string {
  if (info.glyph === ATTN_GLYPHS.needsInput) return chalk.red(info.glyph);
  if (info.glyph === ATTN_GLYPHS.blocked) return chalk.yellow(info.glyph);
  if (info.glyph === ATTN_GLYPHS.done) return chalk.green(info.glyph);
  return info.glyph;
}

// ── Shared list/watch table layout ─────────────────────────────────────
//
// Column widths (visible characters) and attention-first sort order for the
// `list` and `watch` table renderers. Kept here so a single change updates
// both views and they never drift apart.

export const LIST_COL_WIDTHS = {
  attn: 2,
  id: 18,
  phase: 8,
  repo: 14,
  age: 4,
} as const;

/**
 * Attention-first comparator for `SessionSummary` rows:
 *   blocked → must_ask → idle/running → done
 * Tie-break by `created_at` (newest first within each bucket).
 *
 * `awaiting_approval` is no longer a critical bucket — sessions that still
 * need user input while in that phase will surface via `must_ask_count > 0`
 * (rank 2). Otherwise they rank with idle/running.
 */
export function compareByAttention(a: SessionSummary, b: SessionSummary): number {
  const rank = (s: SessionSummary): number => {
    const att = getAttention(s);
    if (att.critical) {
      if (s.phase === 'blocked') return 1;
      return 2; // must_ask
    }
    if (att.done) return 4;
    return 3; // idle / running
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}
