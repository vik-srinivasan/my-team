# Tasks — Rename Viktown → my-team

## Engineering

### Engineer A — packages/ + root configs
- [x] @engineer Rename `name` and workspace `dependencies` in every `package.json` (root, `packages/cli`, `packages/shared`, `packages/wrapper`, `packages/ui`, `apps/landing`)
- [x] @engineer Update `vercel.json` `buildCommand` to `pnpm --filter @my-team/landing build`
- [x] @engineer Update `setup.sh` `pnpm --filter` invocations
- [x] @engineer Rewrite all `@viktown/shared` imports → `@my-team/shared` in TS source
- [x] @engineer Rename `ViktownError` (class + subclasses + `this.name` + all import/usage sites) → `MyTeamError`
- [x] @engineer Rename `VIKTOWN_AGENTS_DIR` const → `MY_TEAM_AGENTS_DIR`
- [x] @engineer Update branch prefix in `packages/wrapper/src/worktree.ts:57,150` → `my-team/${sessionId}`
- [x] @engineer Update test assertions/cleanup that reference `viktown/` branch prefix (server.test.ts, worktree.test.ts, team-files.test.ts fixture)
- [x] @engineer Update CLI description strings, help banner, wrapper log strings, claude-process fallback remote ID, ui index.html title
- [x] @engineer Run `pnpm install` to regenerate `pnpm-lock.yaml`
- [x] @engineer Verify `pnpm -r build` passes and `pnpm -r test` passes — tests: 39/39 pass on re-run (intermittent parallel git-worktree flakiness in server.test.ts is pre-existing). Build: shared/wrapper/ui/landing all pass; `@my-team/cli` fails on pre-existing `start.ts` type error (ChildProcess.on not found) — verified the same error exists at b360f5c before my rename. See `.team/decisions.md`.

### Engineer B — apps/landing/
- [x] @engineer Update Hero `<h1>` to read `my-team: Multi-Agent orchestration` / `for Claude Code.` (preserve gradient styling)
- [x] @engineer Update all `GITHUB_URL` / repo URL constants in Hero, Footer, Quickstart
- [x] @engineer Update Quickstart clone command (`viktown.git` → `my-team.git`)
- [x] @engineer Update HowItWorks terminal-demo `[viktown]` lines → `[my-team]`
- [x] @engineer Update Architecture SVG `VIKTOWN` text → `MY-TEAM`
- [x] @engineer Update Footer brand text and any `viktown` strings
- [x] @engineer Update `layout.tsx` metadata (title, description, OG, `metadataBase`)
- [x] @engineer Add WIP indicator to Hero's right-panel `AgentFlow` widget (small WIP pill near the "live" badge)
- [x] @engineer Add WIP indicator to Architecture diagram's "Web UI" box (subtitle now reads `React 19 + Vite · WIP`)
- [x] @engineer Verify `pnpm --filter @my-team/landing build` succeeds — build green

### Engineer C — docs + agent prompts
- [ ] @engineer Update `SPEC.md` (replace viktown → my-team; update any URLs/paths)
- [ ] @engineer Update `README.md`
- [ ] @engineer Update `CLAUDE.md`
- [ ] @engineer Update `SETUP.md`
- [ ] @engineer Update `implementation_plan.md`
- [ ] @engineer Update repo-root `tasks.md` (NOT this `.team/tasks.md`)
- [ ] @engineer Update `agent-prompts/captain.md`
- [ ] @engineer Update `agent-prompts/scout.md`
- [ ] @engineer Update `agent-prompts/engineer.md`
- [ ] @engineer Update `agent-prompts/tester.md`
- [ ] @engineer Update `agent-prompts/reviewer.md`
- [ ] @engineer Update `agent-prompts/git.md` (identity line + PR-body footer)

## Testing
- [ ] @tester Run full suite: `pnpm -r test` — all packages pass
- [ ] @tester Verify `rg -i viktown -g '!pnpm-lock.yaml' -g '!node_modules' -g '!.git' -g '!.team/meta.json' -g '!.claude/agents'` returns 0 hits
- [ ] @tester Verify landing page builds (`pnpm --filter @my-team/landing build`)
- [ ] @tester Spot-check landing page renders header and WIP indicators correctly

## Review
- [ ] @reviewer Code review pass — verify no stale `viktown` references, no broken imports, casing convention applied uniformly

## Git
- [ ] @git Push session branch and open PR with title `rename: viktown → my-team`
