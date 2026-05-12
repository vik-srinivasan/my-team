# Tasks — team-status-list-rework

## Engineering

### Shared infra
- [x] @engineer Create `packages/cli/src/format.ts` with: `padEndVisible(str, n)` (ANSI-aware), `humanizeAgo(iso)`, `abbreviatePhase(p)`, `phaseColor(p)`, `getAttention(summary)` (mirrors `packages/ui/src/lib/attention.ts`), glyph map. Add `format.test.ts`.
- [x] @engineer Create `packages/cli/src/session-paths.ts` exporting `resolveSessionDir(id)` and `readSessionFile(id, relpath)` helpers.
- [x] @engineer Widen `packages/cli/src/api-client.ts` `listSessions()` return type to `SessionSummary` from `@my-team/shared`.

### Rewrites
- [x] @engineer Rewrite `packages/cli/src/commands/list.ts`: width-aware rendering, ATTN column, abbreviated phase labels, REPO column (basename of `source_repo`, truncated to 14, dropped on terminals < 80 cols), attention-first sort, footer line, `--json`, `--needs-attention/-a`. Add `list.test.ts`.
- [x] @engineer Rewrite `packages/cli/src/commands/status.ts`: full triage view per `plan.md` (sections, task progress from `.team/tasks.md`, pending questions, **single most recent journal entry**, PR url from `.team/pr.url` if present), `--json`. Add `status.test.ts`.

### New commands
- [x] @engineer `packages/cli/src/commands/journal.ts` — last 5 entries default, `-n N`, `--all`, `--follow/-f` via `fs.watch`. Register in `index.ts`. Add `journal.test.ts`.
- [x] @engineer `packages/cli/src/commands/tasks.ts` — pretty-print `.team/tasks.md`: color headers, render checkboxes, summary line. Add `tasks.test.ts`.
- [x] @engineer `packages/cli/src/commands/plan.ts` — pretty-print `.team/plan.md`: color markdown headers; otherwise passthrough. Add `plan.test.ts`.
- [x] @engineer `packages/cli/src/commands/diff.ts` — `git -C <worktree> diff <source_branch>...HEAD`, pipe through `$PAGER` (fallback `less -R`); plain stdout if no tty. Base branch from `meta.json.source_branch`.
- [x] @engineer `packages/cli/src/commands/logs.ts` — locate wrapper pino log destination (grep wrapper source for pino transport config), tail it. `-n N`, `-f` to follow. If no log exists, print friendly "no logs yet".
- [x] @engineer `packages/cli/src/commands/watch.ts` — auto-refresh list every 2s. ANSI clear+home between draws. Quit on `q` / Ctrl-C / SIGINT. `--interval N`.

### Wiring
- [x] @engineer Register all 6 new commands in `packages/cli/src/index.ts` with one-line `.description()`. Verify `team --help` lists every command with its description.

## Testing
- [x] @tester Run the full vitest suite from the repo root.
- [x] @tester Manual: `team list` in an 80-col terminal — no row wrap; ATTN glyph appears for a known `awaiting_approval` session (this one). `team list -a` filters. `team list --json` parses.
- [x] @tester Manual: `team status mild-moon-80`, `team journal mild-moon-80`, `team tasks mild-moon-80`, `team plan mild-moon-80` all render readably.
- [x] @tester Manual: `team diff mild-moon-80` outputs git diff. `team logs mild-moon-80` either tails or prints "no logs yet". `team watch` redraws on interval and Ctrl-C exits cleanly.
- [x] @tester Manual: `team --help` lists all commands with descriptions; `team help status` shows flags.

## Review
- [x] @reviewer Code review pass — focus: ANSI-safe padding correctness, attention-derivation parity with `packages/ui/src/lib/attention.ts`, missing-file error handling (`.team/*.md` may be empty/absent), `--json` output shape stability, no shell-injection in `diff` (worktree path).

## Review iteration 1 fixes
- [x] @engineer Thread `worktree_path` from the API response through `RenderArgs` → `renderStatus`; render it as the "Worktree:" line and add to `--json`. Falls back to `meta.source_repo` only when the API doesn't return it.
- [x] @engineer Sanitize `remote_url` from the API by stripping anything at/after the first BEL byte (OSC 8 hyperlink contamination from the wrapper's URL regex).
- [x] @engineer Replace `heading.length` with `visibleLength(heading)` for the status heading separator bar — chalk.bold escapes were inflating the width by ~9 chars.
- [x] @engineer Extract `compareByAttention` and `LIST_COL_WIDTHS` into `format.ts`; `list.ts` and `watch.ts` now import the shared helpers instead of duplicating them.
- [x] @engineer Wrap `journal`/`tasks`/`plan` actions in top-level try/catch so non-ENOENT I/O errors print a clean chalk-red message and exit 1.
- [x] @engineer `diff.ts` now sets a non-zero exit code when git or the pager fails to spawn.
- [x] @engineer Add regression test in `format.test.ts` verifying `visibleLength` is unaffected by `chalk.bold` (the chalk-escape-inflated-length bug that motivated the separator fix).

## Git
- [ ] @git Push the session branch and open a PR titled `feat(cli): responsive list, richer status, new journal/tasks/plan/diff/logs/watch`.
