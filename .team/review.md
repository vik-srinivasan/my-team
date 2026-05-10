# Review

## Verdict
Approved

---

# Review pass 2 — 2026-05-10T21:00:00Z

## Verdict: Approved
All prior blockers resolved. No new issues found.

### Blocker 1 — `packages/ui/src/api.ts` dead methods (resolved by 684bc45)
Verified: `api.ts` now imports only `CreateSessionRequest`, `CreateSessionResponse`, `SessionSummary`, and `SessionDetail` — exactly what the remaining live methods use. `DiffResponse`, `TeamFiles`, `diff()`, `team()`, and `teamFile()` are gone. No new dead code introduced; the commit only removes lines. Confirmed `DiffResponse` and `TeamFiles` remain in `packages/shared/src/types.ts` and are actively consumed by `packages/wrapper/src/api/sessions.ts`, `packages/wrapper/src/team-files.ts`, and `packages/wrapper/src/session-manager.ts` — the shared-types preservation is correct.

### Blocker 2 — `lastViewed` persistence tests (resolved by f2adb73)
Verified: `packages/ui/src/lib/last-viewed.ts` extracts `loadLastViewed` and `persistLastViewed` cleanly. `packages/ui/src/lib/last-viewed.test.ts` delivers 13 cases across `loadLastViewed`, `persistLastViewed`, and round-trip describe blocks, covering: missing key, malformed JSON, JSON array payload, JSON null payload, non-string value filtering, SSR guard (`window === undefined`) for both helpers, `getItem` throw, `setItem` throw, single-write read-back, overwrite read-back, and two round-trip cases. `store.ts` correctly imports the extracted helpers at line 9 and wires them at lines 100 and 104 — no regression in the store's `lastViewed` / `markViewed` behavior.

### Optional suggestion (attention.test.ts `blocked + must_ask` case)
The symmetrical priority case was added: `attention.test.ts` line 58 — "prefers blocked reason over must_ask when both apply." This is a net positive; the priority matrix is now complete.

---

# Review pass 1 — 2026-05-10T20:30:00Z

## Blocking

### packages/ui/src/api.ts:6-8, 64-78
Dead API methods were not removed after `RightPanel.tsx` was deleted. `DiffResponse` and `TeamFiles` are imported, and `api.sessions.diff()`, `api.sessions.team()`, and `api.sessions.teamFile()` remain in the file with no callers anywhere in the codebase. The plan explicitly calls out "Removed code is FULLY removed" as the highest-scrutiny concern, and these are the direct residue of the RightPanel deletion. None of these methods are called by any current code. Remove them along with the two unused type imports (`DiffResponse`, `TeamFiles`).

> resolved: 684bc45 — methods + imports removed; verified no callers anywhere in `packages/ui/src`. Shared type defs left in place because `packages/wrapper` and `packages/cli` still consume them.

### packages/ui/src/lib/attention.test.ts — missing `lastViewed` persistence tests
The acceptance criteria in `plan.md` states: "Unit tests cover `getAttention()` and `lastViewed` persistence behavior." `attention.test.ts` covers `getAttention()` thoroughly, but there are no tests for the localStorage persistence: the `loadLastViewed` try/catch paths (malformed JSON, missing key, non-object value), the `persistLastViewed` failure path, or the `markViewed` action writing to storage. A dedicated `store.test.ts` or `last-viewed.test.ts` covering at least: (a) `loadLastViewed` returns `{}` on malformed JSON, (b) `loadLastViewed` returns `{}` when key is absent, (c) `markViewed` persists to localStorage, (d) `loadLastViewed` round-trips correctly — would satisfy this criterion.

> resolved: f2adb73 — extracted `loadLastViewed` / `persistLastViewed` to `packages/ui/src/lib/last-viewed.ts` and added `last-viewed.test.ts` (13 cases) covering missing key, malformed JSON, array / null payloads, non-string value filtering, SSR guard, getItem/setItem error swallow, and write-then-read round-trip. Map-backed Storage mock injected via `vi.stubGlobal` keeps the suite in the default node env.

## Suggestions

### packages/ui/src/hooks/useWebSocket.ts:128-130
The comment "team_file and diff events are no longer rendered — the right panel was removed. Fall through silently." is clear, but the `default: break` still accepts those event types without a type error because they are in `WsServerEvent`. If `WsTeamFileEvent` and `WsDiffEvent` are never going to be handled in the UI, consider removing them from `WsServerEvent` in `packages/shared/src/types.ts` so that any future accidental send is caught at the type level. (Requires backend alignment; not urgent if the backend still emits them for other consumers.)

> skipped: out of scope for this fix — the wrapper still emits these events and the CLI / shared types remain consumers, so removing them from `WsServerEvent` would either be a wider cross-package change or just a UI-side narrowed type. The reviewer themselves flagged this as "not urgent." Better as a separate refactor.

### packages/ui/src/lib/attention.test.ts — missing `blocked + must_ask` priority test
The priority test at line 50 only covers `awaiting_approval` winning over `must_ask_count`. The symmetrical case — `blocked` wins over `must_ask_count` — is not covered. The logic is simple enough to be unambiguous, but adding a one-liner would complete the priority matrix.

> resolved: f2adb73 — added "prefers blocked reason over must_ask when both apply" to `attention.test.ts` (now 9 cases).

## Approved

- `loadLastViewed` is exemplary: SSR guard, full try/catch, validates that the parsed value is a non-array object before trusting it, and filters each value to `string` type before returning. This is exactly the right level of defensiveness for localStorage.
- `attention.ts` is a clean, pure function with no side effects and zero store coupling. The JSDoc explains the "never-viewed + no checkpoint = quiet" design decision clearly, pointing at `decisions.md`.
- `isFresh` uses direct `>` string comparison on ISO timestamps — correct, since both sides are always UTC ISO strings, and lexicographic order matches chronological order for them.
- `sortSessions` in `SessionList.tsx` creates a fresh array before sorting (`[...decorated].sort(...)`), so the store's session array is never mutated. Sort is stable: critical → hasUpdate → recency fallback.
- `setSessionState` in `store.ts` keeps `SessionSummary` entries in the session list in sync with incoming `state` WS events — `last_checkpoint` and `must_ask_count` are both backfilled from `SessionState`, so the sidebar stays fresh without needing a list refetch.
- `persistLastViewed` is called only from `markViewed`, not on every store mutation. localStorage writes are bounded to selection events.
- `PHASE_DOT` duplication is fully resolved — one definition in `lib/phase.ts`, imported by both `App.tsx` and `SessionList.tsx`.
- The `attention.test.ts` coverage is thorough for `getAttention`: all three critical triggers, priority ordering, off-by-one on equal timestamps, never-viewed branch, and full all-clear case.
- `RightPanel.tsx` and `Chat.tsx` are fully deleted with no dangling references in any component, hook, or type import (outside the `api.ts` issue noted above).
- The `last-viewed.test.ts` Map-backed `Storage` mock is clean — typed correctly, injected via `vi.stubGlobal`, and torn down in `afterEach`. No jsdom dependency needed, keeping the suite fast in the default node environment.

## Tester findings — 2026-05-10T20:15:00Z

### Build and test results
- `pnpm -C packages/shared build`: green
- `pnpm -C packages/wrapper build`: green
- `pnpm -C packages/ui build`: green (chunk size warning is pre-existing, not a build error)
- `pnpm test` (root, 47 tests across 7 files): all passing on second+ run
- `packages/wrapper/src/server.test.ts` "emits specialist events" test: timing-flaky under heavy system load (pre-existing from commit 2825b64, not a regression from this session)

### Smoke-test results (http://localhost:5175/?seed=1)
- Two-column layout confirmed: 320px sidebar + flex-1 main pane, no right panel present
- Sessions render with phase color dots, phase labels, and last_checkpoint age in sidebar rows
- Critical badges (red, AlertCircle icon) appear on awaiting_approval and blocked sessions; curious-cat-08 (must_ask_count=2) also shows the critical badge with "Captain has 2 questions"
- Unread blue dots appear on amber-fox-12, blocked-bear-44, curious-cat-08 (never-viewed + fresh checkpoints); absent on drowsy-deer-31 and eager-eel-77 (pre-marked as viewed by seed)
- Sort order confirmed: critical first, then must_ask, then recency
- Approve banner renders for awaiting_approval session when selected in main pane
- NotificationBanner wired and functional
- dev-seed.ts wiring via ?seed=1 in main.tsx works correctly

### Pre-existing issues (out of scope, not regressions)
- pnpm lint (root tsc --noEmit -p tsconfig.base.json): broken on base branch
- pnpm -C packages/cli build: fails on start.ts on base branch
