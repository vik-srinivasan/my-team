# Tasks — team list/watch fix

## Engineering

- [x] @engineer In `packages/wrapper/src/worktree.ts` `resolveRepoRoot`, move `realpath(path)` inside the existing `try` block so a deleted source repo throws `NotAGitRepoError` instead of a raw `ENOENT`.
- [x] @engineer Make `ARCHIVES_DIR` env-overridable via `MY_TEAM_ARCHIVES_DIR` in `packages/wrapper/src/worktree.ts` (mirror the existing `sessionsDir()` pattern at lines 18-20). — converted to `archivesDir()` function.
- [x] @engineer In `packages/wrapper/src/session-manager.ts`, add a private `hydrateFromDisk(id) → ManagedSession | null` helper that reads `meta.json` + `state.json` via the existing `readTeamMeta` / `readTeamState` helpers and builds a synthetic `ManagedSession` with `captain: null, watcher: null`. Returns `null` on missing/corrupt — caller throws `SessionNotFoundError` as today.
- [x] @engineer Update `killSession` (`session-manager.ts:704`): if `this.sessions.get(id)` is undefined, call `hydrateFromDisk(id)` and proceed with the synthetic entry (no captain.kill, no watcher.close, but still persist `phase='killed'` + journal entry). Do NOT insert into `this.sessions`.
- [x] @engineer Update `cleanSession` (`session-manager.ts:745`): same disk-only fallback. Guard `archiveWorktree(id)` with `existsSync(teamDir)` and skip+warn if `.team/` is missing. Catch `NotAGitRepoError` from `removeWorktree` and fall back to `fs.rm(worktreePath, { recursive: true, force: true })`. Do NOT call `this.sessions.delete(id)` on the synthetic path.
- [x] @engineer Add a new public method `purgeOrphans({ exclude?: string[] }) → { purged: string[]; skipped: Array<{ id: string; reason: string }> }` on `SessionManager`. Uses `scanDiskSessions(new Set())` to enumerate, iterates calling `killSession` then `cleanSession`, catches per-session failures (records to skipped), respects `exclude` and skips any id with `this.sessions.get(id)?.captain?.running === true`. — iterates union of disk + in-memory ids.
- [x] @engineer Add `POST /api/sessions/purge-orphans` route in `packages/wrapper/src/api/sessions.ts` with zod-validated body `{ exclude?: string[] }`. Returns the summary JSON from the manager. — registered before `/:id` to avoid the parameterised-route collision.
- [x] @engineer Add `purgeOrphans(exclude: string[])` method in `packages/cli/src/api-client.ts`.
- [x] @engineer Update `packages/cli/src/commands/purge.ts`: add `--orphans` option, make `<id>` optional when the flag is set, derive current session id from `$PWD` (walk up to find `~/team/sessions/<id>/` parent), call `api.purgeOrphans([currentId].filter(Boolean))`, print a friendly summary table (`Purged N, skipped M (live: A, current: B, errors: C)`). — current-session detection exported as `currentSessionIdFromCwd` for tester reuse.
- [x] @engineer Update CLI help text in `packages/cli/src/commands/help-info.ts` to document `team purge --orphans`.
- [x] @engineer In `packages/wrapper/src/websocket.test.ts`, add `MY_TEAM_SESSIONS_DIR` + `MY_TEAM_ARCHIVES_DIR` isolation in `beforeAll` (mkdtemp), `git worktree remove --force` each created session in `afterAll`, then `rm -rf` the temp dirs. Add a guard assertion at top of suite: `expect(sessionsDir()).not.toBe(join(homedir(), 'team', 'sessions'))`. — recursive rm of `sessionsRootDir` nukes the worktrees, so no per-session `git worktree remove` is needed.

## Testing

- [x] @tester Add `packages/cli/src/commands/purge.test.ts` covering: (a) single `team purge <orphan-id>` succeeds when no live captain, (b) `team purge --orphans` summary output shape.
- [x] @tester Add to `packages/wrapper/src/session-manager.test.ts`: (a) `killSession` succeeds on a disk-only session and writes `phase='killed'` to state.json, (b) `cleanSession` succeeds on a disk-only session, archives `.team/`, and removes the worktree, (c) `cleanSession` falls back to `fs.rm` when `source_repo` directory has been deleted, (d) `purgeOrphans` skips live captains and skips ids in `exclude`, (e) `purgeOrphans` returns per-session errors in `skipped` instead of aborting. — engineer note: the (e) test was rewritten in f983b30 to use an archive-destination-collision error trigger (the previous trigger relied on the WorktreeError bug that this commit fixes); test is green.
- [x] @tester Add to `packages/wrapper/src/server.test.ts`: `POST /api/sessions/purge-orphans` returns 200 with the summary JSON, and `POST /:id/kill` + `DELETE /:id` now succeed on disk-only orphans (regression coverage for the bug).
- [x] @tester Run the full vitest suite for `packages/wrapper` and `packages/cli` and confirm everything green. — engineer-verified post-fix: 460/460 tests pass.
- [x] @tester Run the wrapper test suite twice in a row and confirm `ls ~/team/sessions/ | wc -l` is unchanged between runs (e2e pollution regression check). — 346 before, 346 after two consecutive runs.

## Docs

- [x] @documenter Sweep README.md, CHANGELOG.md, and any `docs/` for mentions of `team purge` and add the `--orphans` flag. Verify CLI help text is accurate.

## End-to-end

- [ ] @runner In an isolated `MY_TEAM_SESSIONS_DIR`, create 3 fake orphan worktrees (mkdir + write meta.json + state.json), boot one real session, then run `team purge --orphans` and verify only the 3 orphans are deleted and the live session is preserved. Run `team list` after to confirm count.

## Review

- [x] @reviewer Code review pass on the diff.

## Git

- [ ] @captain Push branch and open PR.
