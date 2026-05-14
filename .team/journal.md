## 2026-05-14T08:30:00Z — captain
Session started. Title: "team resume command".

User context: ripe-coast-18 session had its captain daemon die mid-execution. Worktree + `.team/` files survived, branch had 33 commits and tests passing, but `team list` didn't show the session and there was no resume command. User had to manually piece things back together.

Two asks emerged:
1. `team list` should enumerate every non-purged session on disk (not just daemon-tracked ones).
2. New `team resume` / `team recover` command that re-spawns a captain on the existing worktree, picking up from `.team/state.json` + journal.

Dispatching scout in background to map the wrapper daemon, CLI layout, and the existing session-lifecycle code paths.

## 2026-05-14T08:35:00Z — captain
Scout returned. Context written to `.team/context.md`. Key finding: `SessionManager.sessions` is a pure in-memory Map with no disk-hydration path. `team list` reflects only daemon-known sessions, so when the captain (or the daemon itself) dies, the worktree survives but the session vanishes from `list`. No resume/recover code exists anywhere — net-new.

User answered design questions:
1. Command name: `team resume`.
2. `team list` for dead-captain sessions: no special "stalled" badge — `last_checkpoint` age is enough.
3. Resume behavior: re-spawn captain on existing worktree, captain reads journal/tasks/srd/state to pick up; append a "resumed at X" journal entry; session must be re-attachable afterward (via existing `team open` flow).
4. Dead-vs-alive detection: punted — using the natural model where disk-scanned sessions are by definition not running (their captain was a child of a dead daemon), so no PID file infrastructure needed.
5. Effort level: standard.

Drafting SRD, plan, and tasks now. Will present all three together for combined approval.

## 2026-05-14T08:42:00Z — captain
User approved SRD + plan with "go". Phase → executing. Dispatching a single engineer to land both parts (disk-scan in `listSessions` and the `resumeSession` method + endpoint + CLI command) — the work touches overlapping files (session-manager.ts, sessions.ts router, api-client.ts) so parallel engineers would mostly fight.

## 2026-05-14T09:15:00Z — engineer
Completed all 8 Engineering tasks. Implementation summary:

A. **`listSessions` disk-merge** (255cc86): `SessionManager.listSessions()` now merges in-memory entries with a `readdir(~/team/sessions/)` scan; orphan worktrees surface with their on-disk phase/title/last_checkpoint via existing `readTeamMeta`/`readTeamState`. Corrupt or partial worktrees are skipped silently. Introduced `MY_TEAM_SESSIONS_DIR` env override (exported `sessionsDir()` helper in `worktree.ts`) so tests can isolate from the user's real session directory; updated `server.test.ts`, `worktree.test.ts`, and the heal-integration test in `session-manager.test.ts` to set it.

B. **`resumeSession(id)` + `SessionCorruptError`** (0f23065): New method follows the plan's sequencing exactly — resolve worktree, read meta, refuse double-spawn, pre-trust + hooks, append journal entry BEFORE spawn, spawn captain, attach handlers + watcher, insert into Map, record recents. Added `SessionCorruptError` (code `SESSION_CORRUPT`) — decision logged in `.team/decisions.md`. Refactored `createSession`'s captain-event wiring + watcher setup into private helpers `attachCaptainHandlers` / `attachTeamFileWatcher` (used by both create and resume).

C. **HTTP endpoint** (2249bae): `POST /api/sessions/:id/resume` with zod path-param validation, mapped to 200 SessionSummary on success. Added `SESSION_CORRUPT → 422` to the error map.

D. **CLI command** (311d5f6): `packages/cli/src/commands/resume.ts` + `api.resumeSession(id)` + registration in `index.ts` (between purge and srd). SESSION_ACTIVE shows a friendly "already running" message; SESSION_CORRUPT propagates the daemon-side purge suggestion. Also added `team resume` to the landing page CLI panel (Cleanup & Remote group) to keep the regression-guard test green.

E. **Unit tests** (9b569e2): 12 new tests on SessionManager — 5 for listSessions disk-merge (merge, fields preserved, missing-meta-skip, bad-state-skip, missing-dir → []) and 7 for resumeSession (happy path with hook re-write, sequencing of journal-before-spawn, SessionActiveError on running captain, SessionNotFoundError on missing worktree, SessionCorruptError on missing/invalid meta.json, kill-then-resume works).

All 331 tests pass (`pnpm test --run`). Wrapper + CLI typecheck clean. Commits: 255cc86, 0f23065, 2249bae, 311d5f6, 9b569e2.

Preview: there are no user-facing visual changes — CLI command only. Local smoke command for the user: build wrapper (`pnpm --filter @my-team/wrapper build`) + CLI (`pnpm --filter @my-team/cli build`), start the daemon, then `team resume <some-orphan-id>`.

## 2026-05-14T09:18:00Z — captain
Engineer complete. All 8 engineering tasks `[x]`; 5 commits land 12 new tests + the disk-merge + resume + new endpoint + CLI command. Wrapper + CLI typecheck clean, full 331-test suite green.

Dispatching tester + reviewer + runner + documenter in parallel. All four can run independently:
- tester: HTTP integration tests for `POST /api/sessions/:id/resume` + CLI smoke test for `team resume`.
- reviewer: full code-review pass on the 5 commits.
- runner: real e2e — start the daemon, kill it mid-session, restart, verify `team list` shows the orphan, run `team resume`, verify it relaunches.
- documenter: README + SPEC.md + CLI help text + landing page sync for the new command and the `team list` disk-merge behavior.

## 2026-05-14T09:40:00Z — tester
Completed: HTTP integration tests for `POST /api/sessions/:id/resume` and CLI smoke test for `team resume`.

Added a `describe('POST /api/sessions/:id/resume')` block to `packages/wrapper/src/server.test.ts` covering four cases: happy path (disk-only orphan resumes to 200 + full SessionSummary shape), already-running (409 SESSION_ACTIVE), missing session (404 SESSION_NOT_FOUND), and corrupt worktree with no meta.json (422 SESSION_CORRUPT). Used a `writeOrphanSession` helper that creates minimal `.team/` directories directly in `sessionsRootDir` (matching the `MY_TEAM_SESSIONS_DIR` env override the engineer introduced) and an `afterEach` to remove those directories so they don't pollute the later "full lifecycle" test that checks `list.length === 1`.

Created `packages/cli/src/commands/resume.test.ts` with four smoke tests: (1) happy path parses `<id>` and dispatches to `api.resumeSession`, printing "Resumed <id>" and the `team open` hint; (2) SESSION_ACTIVE prints "already running" and exits 1; (3) SESSION_NOT_FOUND prints a "not found" message and exits 1; (4) SESSION_CORRUPT surfaces the daemon-side purge suggestion and exits 1. All four mock `api-client.js` via `vi.mock` — no real daemon involved.

Full suite: 339 tests, all passing. No bugs found.

## 2026-05-14T09:35:00Z — documenter
Completed: Doc sync for `team resume` command and `team list` disk-merge behavior.

Modified:
- `README.md` — Added `team resume <id>` to command table (between `team open` and `team archive`). Updated `team list` description from "List all active sessions" to "List all active and orphan sessions". Added new "Session recovery" subsection explaining that worktrees survive daemon crashes, `team list` shows orphans with `pid: null`, and users can `team resume <id>` to re-spawn the captain.
- `SPEC.md` — Updated §7 (CLI commands table): added `team resume <id>` row with full description; updated `team list` row to clarify that it lists both "active (with live captain in this daemon) and orphan (surviving on disk with no running captain)" sessions. Updated §8.1 (HTTP endpoints) to add `POST /api/sessions/:id/resume` endpoint and note that `GET /api/sessions` now includes orphan sessions from disk.
- `packages/cli/src/commands/help-info.ts` — Added `team resume <id>` line to "Session management" command group in the help output (between `team kill` and `team archive`).
- `.team/tasks.md` — Marked all three @documenter task items `[x]` with notes on changes made.

Landing page (`apps/landing/app/components/GettingStarted.tsx`) already has `team resume` in "Cleanup & Remote" section (engineer added it as part of implementation to keep the regression-guard test green).

Suggested commit: docs: sync README, SPEC, and CLI help with team resume command and team list disk-merge behavior
