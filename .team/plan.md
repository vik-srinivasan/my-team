# Plan — Add `my-team purge` and refresh help text

**Effort level:** light — small CLI addition (one new command file, one registration line) plus text edits to `help-info.ts` and `README.md`. No backend changes, no new tests required (existing wrapper tests cover the underlying kill/clean endpoints).

## Goal

1. Add a `team purge <id>` command that combines `kill` + `clean` so users can tear down an abandoned session in one shot.
2. Bring `team help` (and the README command table) into sync with everything currently registered in `packages/cli/src/index.ts`.

## Approach

- `purge` is implemented entirely in the CLI. No wrapper endpoint needed — the existing `POST /api/sessions/:id/kill` followed by `DELETE /api/sessions/:id` does the job in order. After `killSession` returns, `captain.running` is `false`, so `cleanSession` will not 409.
- Behavior:
  - Call `api.killSession(id)`. If it 404s (session doesn't exist) → bail with the usual not-found error. If it succeeds OR the session is already not-running, continue.
  - Call `api.cleanSession(id)`. Same error treatment.
  - Print one success line: `Purged ${id}: session killed and worktree removed.`
- No `--force` or `--yes` flag — `kill` and `clean` already don't prompt; `purge` inherits the same fire-and-forget behavior.

## Scope

**Add:**
- `packages/cli/src/commands/purge.ts` — new file, ~25 lines following the `kill.ts` shape.

**Edit:**
- `packages/cli/src/index.ts` — import `purgeCommand` and add `program.addCommand(purgeCommand())`.
- `packages/cli/src/commands/help-info.ts` — add `purge` to the "Session management" block; also add the two currently-missing commands `list-past` (Session lifecycle) and `open` (Other).
- `README.md` command table — add rows for `purge`, `open`, `help`, `ui`, and `notifications --clear` so the table matches `index.ts`.

**Do not touch:**
- Wrapper API. No new endpoints.
- Web UI. No related dashboard changes.
- Test suites. Existing wrapper tests cover the underlying primitives.

## Must-ask items

None. The behavior is mechanical (kill, then clean) and the help/README gaps are unambiguous.

## Acceptance criteria

- `team purge <id>` exits 0 on a valid session and the worktree at `~/team/sessions/<id>` is removed.
- `team purge <nonexistent>` prints a clear error and exits 1 (inherited from the underlying API error mapping).
- `team help` lists `purge` under "Session management" and includes `list-past` and `open`.
- `README.md` command table includes every command registered in `index.ts`.
- `pnpm -r build` is green; existing wrapper tests still pass.
