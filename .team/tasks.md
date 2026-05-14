# Tasks — team resume command

## Engineering

- [x] @engineer Extend `SessionManager.listSessions()` in `packages/wrapper/src/session-manager.ts` to merge in-memory sessions with on-disk sessions found in `~/team/sessions/`. In-memory entries win when both exist. Skip silently on missing/corrupt `.team/meta.json` or `.team/state.json`. — commit 255cc86
- [x] @engineer Add `SessionManager.resumeSession(id)` method that validates the worktree, refuses double-spawn (throws `SessionActiveError`), pre-trusts the directory, rewrites captain hooks, appends a "Session resumed" journal entry, spawns the captain, wires the watcher, updates the `sessions` Map, calls `recordSessionStart(id)`, and returns a `SessionSummary`. — commit 0f23065
- [x] @engineer Decide on error shape: either reuse `SessionNotFoundError` with a clear message for missing `meta.json`, or add a `SessionCorruptError` to `packages/shared/src/errors.ts`. Pick one and stay consistent. — added `SessionCorruptError` (code `SESSION_CORRUPT`, HTTP 422). Decision logged in `.team/decisions.md`. Commit 0f23065.
- [x] @engineer Add `POST /api/sessions/:id/resume` endpoint to `packages/wrapper/src/api/sessions.ts`. Validate the path param with zod. Delegate to `SessionManager.resumeSession`. Map errors to the standard HTTP status codes the existing routes use. — commit 2249bae
- [x] @engineer Add `api.resumeSession(id)` to `packages/cli/src/api-client.ts`. — commit 311d5f6
- [x] @engineer Create `packages/cli/src/commands/resume.ts` implementing `resumeCommand(id)`. Pattern after `kill.ts`. On success print `chalk.green('Resumed <id>')` plus a hint about `team open <id>`. On `SESSION_ACTIVE` print a clear "already running" message. On `SESSION_NOT_FOUND` print the standard not-found error. Always exit 1 on error. — commit 311d5f6
- [x] @engineer Register `resume <id>` in `packages/cli/src/index.ts` alphabetically. — commit 311d5f6
- [x] @engineer Add unit tests in `packages/wrapper/src/session-manager.test.ts`: (a) `listSessions` disk-merge, (b) `resumeSession` happy path, (c) `resumeSession` throws on already-running, (d) `resumeSession` throws on missing worktree, (e) `resumeSession` errors clearly on missing `meta.json`. — commit 9b569e2 (12 new tests, all 331 in the suite pass)
- [x] @engineer Commit after each meaningful working piece — Conventional Commits (`feat(wrapper): hydrate listSessions from disk`, `feat(cli): add team resume command`, etc.). — 5 commits landed: 255cc86, 0f23065, 2249bae, 311d5f6, 9b569e2

## Testing

- [x] @tester Add integration tests for `POST /api/sessions/:id/resume` in `packages/wrapper/src/server.test.ts` covering happy path, 404 on missing session, and the already-running case. Follow the existing `supertest` + mocked-`spawnCaptain` pattern.
- [x] @tester Add a CLI-level smoke test for `resume` in `packages/cli/src/commands/resume.test.ts` (parse + dispatch to `api.resumeSession`).
- [x] @tester Run `pnpm test` end-to-end; full suite green.

## End-to-end

- [ ] @runner Manually exercise the flow against a real wrapper: create a session, kill the wrapper daemon mid-flight, restart the daemon, verify `team list` shows the orphan with `pid: null` and correct `phase`, run `team resume <id>`, verify the session is live again, verify `team open <id>` attaches cleanly. Report mismatches.

## Docs

- [x] @documenter Update `README.md` (root) to mention `team resume <id>` and note that `team list` now surfaces orphan sessions. — Updated command table, added `team resume` entry, updated `team list` description to mention orphan sessions, added "Session recovery" subsection.
- [x] @documenter Update `SPEC.md` if it documents the CLI surface — add the resume command and the disk-merge behavior. — Updated §7 CLI commands table with `team resume` entry and updated `team list` description; added new `POST /api/sessions/:id/resume` endpoint to §8.1 HTTP endpoints section.
- [x] @documenter Check `apps/landing/` and CLI help text (`packages/cli/src/help-info.ts` or equivalent) for command lists that need the addition. — Landing page already has `team resume` in "Cleanup & Remote" section (engineer added it). Updated `packages/cli/src/commands/help-info.ts` to add `team resume` to "Session management" group in help output.

## Review

- [ ] @reviewer Full code review pass over the engineer's changes. Produce `.team/review.md` with severity-bucketed findings.

## Git

- [ ] @captain Push session branch `my-team/soft-crow-65` and open a PR against `main` once review approves.
