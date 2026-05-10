# Tasks

## Engineering
- [x] @engineer Create `packages/cli/src/commands/purge.ts` implementing `purgeCommand()` that sequences `api.killSession(id)` then `api.cleanSession(id)`, matching the style of `kill.ts` / `clean.ts`. Success line: `Purged ${id}: session killed and worktree removed.`
- [x] @engineer Register `purge` in `packages/cli/src/index.ts` (import + `program.addCommand(purgeCommand())`).
- [x] @engineer Update `packages/cli/src/commands/help-info.ts`: add `team purge <id>` under "Session management" (one-line description: "Kill and clean a session in one step"). Also add the currently-missing entries `team list-past` under "Session lifecycle" and `team open <id>` under "Other".
- [x] @engineer Update the command table in `README.md` to include rows for `team purge <id>`, `team open <id>`, `team help`, `team ui`, and `team notifications --clear`. Match the existing one-line descriptions used in `help-info.ts`.
- [x] @engineer Verify `pnpm -r build` is green. (Required clearing stale `packages/shared/tsconfig.tsbuildinfo` first — composite build was reporting Done but dist/ was missing.)

## Testing
- [ ] @tester Light effort — build/smoke check only. Confirm `team --help` (Commander auto) shows `purge`, and that `team help` (custom) output includes `purge`, `list-past`, and `open`. No new tests required.

## Review
- [ ] @reviewer Confirm `purge.ts` matches the conventions of `kill.ts` / `clean.ts`, help text additions are accurate, and README table covers every command in `index.ts`.

## Git
- [ ] @git Push branch `my-team/gold-dew-22` and open a PR titled "feat(cli): add `team purge` command and refresh help text".
