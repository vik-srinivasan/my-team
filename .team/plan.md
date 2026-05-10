# Plan — ui-changes

**Effort level:** light — UI-only redesign, no security/data integrity concerns.

## Goal

Redesign the dashboard so it's actually usable:
1. **Left sidebar**: one row per session showing name + status label + a prominent green/yellow/red color indicator. Sorted by what needs attention first.
2. **Right panel**: clean streaming feed of captain output (like Claude Code), with the existing PTY garbage filtered out so messages are readable.

## Approach

The bones are already in place (`SessionList`, `OutputLog`, `phaseDot`, `getAttention`, ANSI strip). This is a redesign + noise-cleanup, not a from-scratch build.

### Sidebar (`SessionList.tsx`)

- Replace the tiny `h-1.5 w-1.5` phase dot with a more prominent **status pill** (left-edge accent bar or larger dot, ~12px).
- Color mapping uses existing `getAttention()`:
  - 🔴 **Red** when `critical === true` (awaiting_approval, blocked, must_ask_pending non-empty).
  - 🟡 **Yellow** when `hasUpdate === true` (new captain activity since last viewed).
  - 🟢 **Green** otherwise (running smoothly, including done).
- Show **friendly status label** under the session name instead of the raw phase. Mapping:
  - `created` → "Just created"
  - `scouting` → "Scout is exploring"
  - `planning` → "Drafting plan"
  - `awaiting_approval` → "Waiting for your approval"
  - `executing` → "Engineer is working" (or "<active_specialist> is working" when known)
  - `reviewing` → "Reviewing code"
  - `done` → "Done"
  - `blocked` → "Blocked — needs you"
  - `killed`/`cleaned` → "Killed" / "Cleaned"

### Right panel (`OutputLog.tsx` + `useWebSocket.ts`)

- Tighten `stripAnsi()` and add a stronger noise filter. Drop lines matching:
  - Permission prompt chrome: `>>bypasspermissionson`, `(shift+tab to cycle)`, `esctointerrupt`, `RemoteControlactive`, bare `bypass permissions on`.
  - Status spinners: `Contemplating...`, `thinking with xhigh effort`, `thought for Ns`.
  - Token counters: `↓ N tokens`, `tokens · thought for`.
  - Stray ANSI fragments: lines starting with `[38;` or containing `\x1b\[`.
  - Tool-call chrome that survives stripping: `(ctrl+o to expand)`, leading `└` / `┃` box-drawing leftovers.
- Keep the streaming "one bubble while typing, finalize on 3s silence" behavior.
- Keep the existing approve-banner when `phase === 'awaiting_approval'`.
- Keep the specialist-transition dividers (system-message style).

## Scope

**In scope:**
- `packages/ui/src/components/SessionList.tsx` — bigger status indicator, friendly labels
- `packages/ui/src/lib/phase.ts` — add `phaseFriendlyLabel()` helper
- `packages/ui/src/lib/attention.ts` — confirm green/yellow/red mapping (likely already correct)
- `packages/ui/src/hooks/useWebSocket.ts` — tighten `stripAnsi` and `isMeaningfulText`
- `packages/ui/src/components/OutputLog.tsx` — minor: ensure headers/dividers still look right
- Unit tests for filter regexes and the new label helper

**Out of scope:**
- Switching from PTY stream to journal-based feed (rejected — loses live feel)
- Persisting message history across session-switches
- Reworking the WebSocket protocol
- Touching the wrapper, API, or anything outside `packages/ui`

## Must-ask items

None — the user has confirmed:
- Green/yellow/red mapping uses existing `getAttention` critical/hasUpdate semantics.
- Keep PTY stream, just filter harder.
- Friendly labels under session name (per-specialist where possible).
- Effort: light.

## Acceptance criteria

- Sidebar shows session name + friendly status label + a clearly visible green/yellow/red indicator per session.
- Selected session's main panel shows clean captain output: no `>>bypasspermissions...`, no `Contemplating...`, no token counters, no ANSI residue.
- Approve banner still appears when phase is `awaiting_approval`.
- Specialist transitions still render as dividers.
- `pnpm --filter @my-team/ui test` passes.
- `pnpm --filter @my-team/ui build` succeeds.
- Visual smoke check: `?seed=1` dev mode shows the 5 mock sessions with correct color indicators.
