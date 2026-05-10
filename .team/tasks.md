# Tasks — UI-changes

## Engineering

### Backend / shared types
- [x] @engineer Extend `SessionSummary` in `packages/shared/src/types.ts` with `last_checkpoint: string` and `must_ask_count: number`.
- [x] @engineer Update `listSessions()` in `packages/wrapper/src/session-manager.ts` to populate the two new fields from in-memory state. Add unit test if a `session-manager.test.ts` doesn't already exist for `listSessions`. (Extended existing lifecycle test in `server.test.ts` to assert the new fields.)

### Frontend foundations
- [x] @engineer Create `packages/ui/src/lib/phase.ts` exporting `PHASE_DOT`, `PHASE_LABEL`, and any shared phase helpers. Replace the duplicated maps in `App.tsx` and `SessionList.tsx` with imports from this file.
- [x] @engineer Create `packages/ui/src/lib/attention.ts` exporting `getAttention(session, lastViewed) -> { critical: boolean, hasUpdate: boolean, reason: string | null }`. Add `attention.test.ts` covering: awaiting_approval, blocked, must_ask_count > 0, fresh `last_checkpoint`, all-clear.

### Store / data plumbing
- [x] @engineer In `packages/ui/src/store.ts`: remove `teamFiles`, `diff`, `rightTab` slices. Add `lastViewed: Record<string,string>` with `markViewed(id)` action. Persist `lastViewed` to `localStorage` under `viktown.lastViewed.v1` (load on store init, save on update).
- [x] @engineer In `packages/ui/src/hooks/useSession.ts`: drop diff fetching and team-files syncing. Call `markViewed(selectedSessionId)` whenever a session is selected.
- [x] @engineer In `packages/ui/src/hooks/useWebSocket.ts`: drop `team_file` and `diff` event handlers. Leave `output`, `state`, `specialist`, `remote_url` intact.

### Layout + components
- [x] @engineer Rewrite `packages/ui/src/App.tsx` into a two-column layout: sidebar (~320px) + main pane (flex-1). Drop the right column entirely. Header bar simplified to title + remoteUrl link.
- [x] @engineer Rework `packages/ui/src/components/SessionList.tsx`: wider rows (~320px), show title + phase label + age (from `last_checkpoint`), critical badge with icon + tooltip reason, unread dot. Sort: critical -> hasUpdate -> recency.
- [x] @engineer Rename `packages/ui/src/components/Chat.tsx` -> `OutputLog.tsx`. Remove input box, draft state, send button. Keep streaming markdown messages, auto-scroll, approve button (when `phase === 'awaiting_approval'`). Update `App.tsx` import.
- [x] @engineer Delete `packages/ui/src/components/RightPanel.tsx` and any imports/references to it.
- [x] @engineer Update `packages/ui/src/dev-seed.ts` with 4-5 mock sessions across varied phases (executing, awaiting_approval, blocked, done) and simulate `last_checkpoint` so unread/critical badges are exercisable. (File didn't exist; created it and wired it via `main.tsx` behind `?seed=1`.)

## Testing

- [x] @tester Run `pnpm install` if needed, then `pnpm -C packages/ui build` — must succeed with no type errors.
- [x] @tester Run `pnpm -C packages/wrapper build` (or repo-wide `pnpm build`) — must succeed.
- [x] @tester Run `pnpm -C packages/ui test` and `pnpm -C packages/wrapper test` — all green, including the new `attention.test.ts`.
- [x] @tester Start dev (`pnpm dev`) with seed data, smoke-test: dashboard renders two-column layout, sessions sort correctly, clicking a session clears its unread dot, approve button appears for `awaiting_approval`, NotificationBanner still shows blocked sessions. Report any visual regressions.
- [x] @engineer Add `packages/ui/src/lib/last-viewed.test.ts` covering load/persist round-trip, malformed JSON, missing key, non-string filtering, SSR guard, and quota-error swallow. (Added during review-fix pass; helpers extracted to `lib/last-viewed.ts`.)

## Review

- [x] @reviewer Code review pass. Produce `.team/review.md` with Blocking / Suggestion / Approved findings. Pay attention to: removed code is fully removed (no dangling imports/types), localStorage persistence handles SSR/first-load gracefully, attention derivation has no off-by-one on `last_checkpoint` comparisons.

## Git

- [x] @git Push the session branch and open a PR against `main` with the session title.
