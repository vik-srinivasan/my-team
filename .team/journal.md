## 2026-05-10T19:57:11Z — captain
Session started. Title: "landing-page-update" but actual scope per user is broader: rename Viktown → my-team across backend, GitHub repo, local directory, and landing page; also mark dashboard view as WIP (or remove). Dispatching scout to map every "viktown" reference.

## 2026-05-10T20:04:00Z — captain
Scout returned. 134 references across 53 files mapped in `.team/context.md`. User chose: mark dashboard as WIP, defer GitHub/local rename to post-merge. Wrote `plan.md` and `tasks.md` splitting work across three engineers by file area (packages, landing, docs+prompts — non-overlapping). User pre-approved the high-level approach. Dispatching three engineers in parallel.

## 2026-05-10T20:12:00Z — engineer (B)
Completed: Engineer B scope — rebrand `apps/landing/app/**` to my-team and add WIP indicators.
Modified:
- apps/landing/app/components/Hero.tsx (header copy + GITHUB_URL + amber WIP pill replacing the green "live" dot)
- apps/landing/app/components/Architecture.tsx (SVG header `VIKTOWN` → `MY-TEAM`; Web UI box subtitle now `React 19 + Vite · WIP`)
- apps/landing/app/components/Footer.tsx (GITHUB_URL, SPEC_URL, visible brand text)
- apps/landing/app/components/Quickstart.tsx (clone command, cd dir, GITHUB_URL, README_URL)
- apps/landing/app/components/HowItWorks.tsx (two `[viktown]` terminal lines → `[my-team]`)
- apps/landing/app/layout.tsx (title, OG, Twitter, metadataBase → https://my-team.dev)
Commits:
- 03e131b feat(landing): rebrand Hero header to my-team and add WIP badge
- 15f136c feat(landing): rebrand components to my-team and mark Web UI as WIP
- 1083ec6 feat(landing): update metadata to my-team branding
Build verified: `pnpm --filter @my-team/landing build` succeeded (Next.js 16.2.6, 3 static pages prerendered, TypeScript clean).
Preview: from repo root run `pnpm --filter @my-team/landing dev` to inspect locally (default http://localhost:3000), or `pnpm --filter @my-team/landing start` after the production build.

## 2026-05-10T20:20:00Z — engineer (A)
Completed: Engineer A scope — rename `viktown` → `my-team` across `packages/*`, root configs, and `apps/landing/package.json` name field.
Modified:
- package.json (root: name "viktown" -> "my-team")
- packages/{cli,shared,wrapper,ui}/package.json (npm scope + workspace deps -> @my-team/*)
- apps/landing/package.json (name only — Engineer B owns the rest of the landing app)
- vercel.json (buildCommand filter)
- setup.sh (4x pnpm --filter calls + "Viktown Setup" banner)
- packages/cli/src/commands/{attach.ts,ui.ts,help-info.ts}, packages/cli/src/index.ts (imports + CLI descriptions + ANSI banner)
- packages/wrapper/src/{claude-process.ts,session-manager.ts,team-files.ts,worktree.ts,index.ts}, packages/wrapper/src/api/{sessions.ts,websocket.ts} (imports, log line, fallback remote-id, branch prefix `viktown/${id}` -> `my-team/${id}` at lines 57 & 150, VIKTOWN_AGENTS_DIR -> MY_TEAM_AGENTS_DIR, "Viktown built-in" comment)
- packages/wrapper/src/{server.test.ts,worktree.test.ts,team-files.test.ts} (branch assertions/cleanup + temp-dir prefixes + import paths + fixture session_branch)
- packages/shared/src/errors.ts (ViktownError class + all 6 subclasses' `extends` + the `this.name = 'ViktownError'` literal -> MyTeamError)
- packages/wrapper/src/api/sessions.ts (import + `instanceof ViktownError` -> MyTeamError)
- packages/ui/index.html (`<title>`)
- packages/ui/src/{store.ts,api.ts,hooks/useWebSocket.ts} (imports)
- pnpm-lock.yaml (regenerated; now references @my-team/shared 3x)

Commits:
- c2acaef chore(rename): update package names and configs to @my-team scope
- 9b34e80 refactor(rename): rewrite @viktown/shared imports to @my-team/shared
- 410a0b2 refactor(rename): ViktownError -> MyTeamError
- bf30a46 refactor(rename): branch prefix viktown -> my-team in worktree code and tests
- 7ed4343 refactor(rename): update branded strings (CLI descriptions, log strings, title)

Verification:
- `grep -rni viktown packages/ setup.sh vercel.json package.json apps/landing/package.json pnpm-lock.yaml` -> 0 results.
- `pnpm install` clean (no lockfile churn after the initial workspace name updates were picked up).
- `pnpm test` passes 39/39 on a clean run; intermittent flakiness in server.test.ts (parallel git-worktree contention) is pre-existing.
- `pnpm -r build` is green for shared, wrapper, ui, and landing. `@my-team/cli` fails on a pre-existing `start.ts` strict-mode error (missing `@types/node` in `packages/cli/package.json`); confirmed by checking out b360f5c that the same error exists pre-rename. Out of my scope — logged in `.team/decisions.md`.

Preview: N/A (no visual surface in my scope). To inspect rename end-to-end after Engineer B's landing changes:
  `pnpm --filter @my-team/landing dev`        # http://localhost:3000 — branded landing
  `pnpm --filter @my-team/wrapper dev`        # wrapper daemon, listens on 127.0.0.1:3001
  `pnpm --filter @my-team/cli build && node packages/cli/dist/index.js help`   # blocked by pre-existing cli build error noted above
