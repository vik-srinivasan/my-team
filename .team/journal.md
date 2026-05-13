## 2026-05-13T01:53:18Z — captain
Action: Session started. User wants `team jump <id>` CLI command that prints the worktree path (with shell wrapper to cd). Dispatching scout to map the existing CLI.

## 2026-05-13T02:00:00Z — captain
Action: Scout returned. Wrote context.md, plan.md, tasks.md. Effort: standard. Presenting plan for approval.

## 2026-05-13T02:01:00Z — captain
Action: Plan approved by user ("go"). Dispatching engineer for all engineering tasks.

## 2026-05-13T02:30:00Z — engineer
Completed: All @engineer tasks for the `team jump <id>` command.
Created:
- packages/cli/src/commands/jump.ts (the jumpCommand factory)
- packages/cli/src/commands/jump.test.ts (2 unit tests: happy path stdout + not-found error)
Modified:
- packages/cli/src/index.ts (registered jumpCommand alphabetically between journalCommand and killCommand)
- packages/cli/src/commands/help-info.ts (added jump row + new "Shell Integration" block with tj() snippet)
- README.md (added jump row to commands table + new "Shell integration" subsection)
- apps/landing/app/components/GettingStarted.tsx (added jump to CLI_GROUPS.sessions + Shell integration card)
- apps/landing/public/my-team-setup.md (added jump to useful-commands list + Shell integration subsection)
Commits:
- 9618f5e feat(cli): add team jump <id> command
- d04db02 docs: document team jump and tj() shell function
Verification:
- pnpm --filter @my-team/cli build passes (tsc clean).
- pnpm test passes: 20 files / 162 tests, including 2 new tests in jump.test.ts.
- Smoke tests against the built dist: `team jump calm-brook-81` prints the bare path; `team jump bogus-id` writes red error to stderr and exits 1; `cd "$(team jump calm-brook-81)"` succeeds.

