# Tasks

## Engineering
- [x] @engineer Create `packages/cli/src/commands/jump.ts` — `jumpCommand()` factory; resolve worktree, `access()` check, print path, error+exit on missing.
- [x] @engineer Register `jumpCommand()` in `packages/cli/src/index.ts` between `helpInfoCommand()` and `killCommand()`.
- [x] @engineer Update `packages/cli/src/commands/help-info.ts` — add `jump` under the session-lifecycle section; add a "Shell integration" block with the `tj()` snippet.
- [x] @engineer Add `team jump` row to the commands table in `README.md` (root) and a "Shell integration" subsection with the `tj()` snippet.
- [x] @engineer Add `team jump <id>` to `CLI_GROUPS` in `apps/landing/app/components/GettingStarted.tsx` (session-lifecycle group); include shell-function note.
- [x] @engineer Add `team jump <id>` and the `tj()` snippet to `apps/landing/public/my-team-setup.md`.
- [x] @engineer Write `packages/cli/src/commands/jump.test.ts` — happy path stdout, not-found error message.
- [x] @engineer Build CLI: `pnpm --filter @my-team/cli build`.

## Testing
- [x] @tester Run `pnpm test` — full suite green.
- [x] @tester Verify `team jump <this-session-id>` prints the expected path; `team jump bogus-id` errors with exit 1.
- [x] @tester Verify `cd "$(team jump <this-session-id>)"` works in a real shell.

## Review
- [x] @reviewer Code review pass.

## Git
- [ ] @captain Push branch and open PR.
