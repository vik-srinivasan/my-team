# Plan — UI-changes

## Goals

A lightweight visual overview of all active viktown sessions. The terminal owns conversational interaction with captains; the dashboard owns at-a-glance triage.

The dashboard answers two questions at a glance:
1. **Which sessions need me right now?** (must approve / blocked / captain has a question)
2. **Which sessions have moved since I last looked?** (unread updates)

When I click a session, I see its captain's recent output as a scrollable log — no editing, no chat input.

## Approach — "Reshape what's there"

Keep the App shell, store, hooks, websocket plumbing, and `NotificationBanner`. Rebuild the layout into two columns (sidebar + main) and strip down the per-session view to a read-only output log.

### Layout change

- **Drop the right panel entirely** — diff / plan / review / journal / decisions tabs go away. The PR + terminal cover those needs.
- **Two columns**: left sidebar list (~320px wide, wider than today's 56px) + main pane (flex-1).
- **Main pane** = read-only captain output log (scrollable, ~last 100 lines kept, auto-scrolls unless user scrolls up).
- **Inline approve button** stays at the top of the main pane when `phase === 'awaiting_approval'` — one-click is friendlier than typing in terminal, and the dashboard already has the context to know it's needed.
- **No chat input** — terminal owns conversational input.

### Two-tier "needs attention" signals

Each session row shows zero, one, or both of:

- **Critical badge (red, with icon)** — action required. Triggers:
  - `phase === 'awaiting_approval'`
  - `phase === 'blocked'`
  - `must_ask_pending.length > 0`
- **Update dot (blue, subtle)** — captain has fresh output since I last viewed this session. Cleared the moment I select the session.

The sidebar sorts: critical first, then unread updates, then everything else by recency.

### Tracking "last viewed"

Add `lastViewed: Record<sessionId, ISOString>` to the store, persisted in `localStorage`. On `selectSession()`, set `lastViewed[id] = now`. To detect "fresh output", compare `lastViewed[id]` against the session's `last_checkpoint` from `SessionState`.

`SessionSummary` doesn't include `last_checkpoint` today, so we'll add it (small additive change to shared types + `listSessions()` in the wrapper) so the sidebar can compute "fresh" without fetching detail for every session.

`must_ask_pending` will get the same treatment — added to `SessionSummary` as a count (`must_ask_count: number`) so the sidebar can flag it without fetching each session's detail.

### What gets deleted

- `packages/ui/src/components/RightPanel.tsx` — gone.
- `Chat.tsx` chat input + send icon + draft state — gone. Component shrinks into a read-only output log; rename to `OutputLog.tsx`.
- Diff fetching + `diff` slice in store — gone (was only used by RightPanel).
- `teamFiles` state + `team_file` WS handler in store — gone (was only used by RightPanel).
- `rightTab` state + auto-switch behavior — gone.

`useWebSocket` keeps the `output`, `state`, `specialist`, and `remote_url` events; drops `team_file` and `diff` handlers.

## Scope (file-level)

### Frontend (`packages/ui`)

- `src/App.tsx` — drop right column, simplify to two-column layout, remove header bar's diff/plan UI references.
- `src/components/SessionList.tsx` — wider rows; add critical badge + unread dot; sort by attention; show `last_checkpoint` age instead of `created_at` age.
- `src/components/Chat.tsx` -> rename to `src/components/OutputLog.tsx` — strip chat input, keep streaming markdown messages, keep approve button at top when applicable.
- `src/components/RightPanel.tsx` — delete.
- `src/components/AgentList.tsx` — keep, no functional change.
- `src/components/NotificationBanner.tsx` — keep, no change.
- `src/components/NewSessionModal.tsx` — keep, no change.
- `src/store.ts` — remove `teamFiles`, `diff`, `rightTab`. Add `lastViewed: Record<string,string>` with localStorage persistence + `markViewed(id)` action.
- `src/hooks/useSession.ts` — drop diff fetching and team-files state syncing.
- `src/hooks/useWebSocket.ts` — drop `team_file` and `diff` handlers. Keep everything else.
- `src/lib/phase.ts` (new) — extract `PHASE_DOT` + phase color helpers, used by both list and main pane.
- `src/lib/attention.ts` (new) — pure derivation: `getAttention(session, lastViewed) -> { critical: boolean, hasUpdate: boolean, reason?: string }`.
- `src/dev-seed.ts` — update mocks: more sessions, varied phases, simulate fresh output.

### Backend (`packages/wrapper` + `packages/shared`)

- `packages/shared/src/types.ts` — extend `SessionSummary` with `last_checkpoint: string` and `must_ask_count: number`.
- `packages/wrapper/src/session-manager.ts` — `listSessions()` returns the new fields.

## Must-ask items (decisions to flag)

- **Approve button on dashboard** — proposing keep (one-click). If you'd rather it be terminal-only, say so and we'll drop it.
- **Sidebar sort order** — proposing critical -> updates -> recency. Alphabetical or pure-recency are alternatives.
- **Persisting `lastViewed`** — proposing localStorage so it survives reload. Alternative: in-memory only (resets every reload, simpler but more "noise").
- **Dropping the right panel entirely** — proposing yes (heavy, terminal + GitHub PR cover it). If you want diff or review.md still accessible behind a toggle, say so.

## Acceptance criteria

- Dashboard loads with sidebar showing all sessions; phase color + age visible per row.
- Sessions in `awaiting_approval`, `blocked`, or with pending must-asks show a clear red critical badge with a one-line reason on hover.
- Sessions with new captain output since last viewed show a subtle blue unread dot; selecting the session clears it.
- Sessions are sorted: critical first, then unread updates, then recency.
- Selecting a session shows the main pane with that captain's recent output (scrollable, last ~100 lines, auto-scroll unless user has scrolled up).
- For `awaiting_approval`, an approve button appears at the top of the main pane and works.
- `NotificationBanner` continues to work for blocked sessions.
- No regressions in session creation flow (`+` button, NewSessionModal).
- `pnpm -C packages/ui build` succeeds; `pnpm typecheck` (or equivalent) passes.
- Dev startup (`pnpm dev`) renders the new dashboard; manual smoke: create session, approve, observe updates.
- Unit tests cover `getAttention()` and `lastViewed` persistence behavior.
