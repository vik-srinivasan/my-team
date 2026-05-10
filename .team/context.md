# Context — Add `my-team purge` command and update help text

## Relevant files

- `packages/cli/src/index.ts:1-41` — Entry point. Uses `commander`. Every command registered via `program.addCommand(xyzCommand())`. Register `purge` here.
- `packages/cli/src/commands/kill.ts` — Calls `api.killSession(id)` → `POST /api/sessions/:id/kill`. Prints "Session ${id} killed. Worktree preserved." No flags.
- `packages/cli/src/commands/clean.ts` — Calls `api.cleanSession(id)` → `DELETE /api/sessions/:id`. Wrapper throws 409 `SESSION_ACTIVE` if captain still running.
- `packages/cli/src/commands/help-info.ts:1-75` — `help` command is hand-written `console.log` template literal with raw ANSI codes (no chalk). Command list at lines 19-38 must be manually updated.
- `packages/cli/src/api-client.ts:52-94` — `api` object. `killSession`/`cleanSession` at L68-72. CLI-side purge needs no new method.
- `packages/wrapper/src/api/sessions.ts:123-140` — `POST /:id/kill` and `DELETE /:id` handlers.
- `packages/wrapper/src/session-manager.ts:266-330` — `killSession` (L266) sets `captain.running = false` synchronously before responding, so a subsequent `cleanSession` call from the same client succeeds without sleep.
- `README.md:49-66` — Markdown command table. Hand-maintained.

## Currently-registered commands vs help/README

`index.ts` registers 14 commands: `start`, `new`, `list`, `list-past`, `status`, `attach`, `kill`, `clean`, `archive`, `logs`, `notifications`, `help`, `ui`, `open`.

**`help-info.ts` is missing:** `list-past`, `open`.
**`README.md` is missing:** `open`, `help`, `ui` (and the `--clear` flag on `notifications`).

Adding `purge` is one piece; making help "fully up to date" means filling those gaps too.

## Conventions

- Files: `kebab-case.ts`, export `xyzCommand(): Command`. New file: `packages/cli/src/commands/purge.ts` exporting `purgeCommand()`.
- Command shape: `new Command('name').description(...).argument('<id>', 'Session ID').action(async (id) => { try { ... } catch (err) { if (err instanceof ApiError) { console.error(chalk.red(err.message)); } else { console.error(chalk.red('Failed to ...')); } process.exit(1); } })`.
- Success: `chalk.green` → `console.log`. Errors: `chalk.red` → `console.error`.
- ESM `.js` extensions in imports.
- `help-info.ts` uses raw ANSI codes (`\x1b[33m` yellow header, `\x1b[0m` reset) — match existing style.

## Wrapper API

- No new endpoint needed. `purge` = CLI-side sequence: `api.killSession(id)` then `api.cleanSession(id)`.
- `killSession` is idempotent (no-op if already not running); `cleanSession` requires `!captain.running`. After kill returns, clean will succeed.
- If session is already killed, `kill` no-ops cleanly so `purge` works on any state.

## Tests

- No existing CLI unit tests (`packages/cli/src/**/*.test.ts` — none).
- Wrapper integration tests at `packages/wrapper/src/server.test.ts:178-321` already cover kill+clean lifecycle.
- For a light-effort change like this, a smoke build check is sufficient; no new tests required.

## Gotchas

1. `cleanSession` throws 409 if session active — `purge` must kill first.
2. `help-info.ts` is hand-written. Commander's auto `--help` picks up `purge` automatically once registered, but `team help` won't.
3. README command table is also hand-maintained — must update.
