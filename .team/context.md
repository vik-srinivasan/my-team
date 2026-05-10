# Context — Rename "Viktown" to "my-team"

**Scope: 134 occurrences across 53 files** (raw `rg -i viktown` count, includes pnpm-lock.yaml).

---

## 1. Package metadata (`package.json` files)

| File | Field | Current |
|---|---|---|
| `package.json` | `name` | `"viktown"` (root workspace) |
| `packages/cli/package.json` | `name` | `"@viktown/cli"` |
| `packages/cli/package.json` | dep | `"@viktown/shared": "workspace:*"` |
| `packages/shared/package.json` | `name` | `"@viktown/shared"` |
| `packages/wrapper/package.json` | `name` | `"@viktown/wrapper"` |
| `packages/wrapper/package.json` | dep | `"@viktown/shared": "workspace:*"` |
| `packages/ui/package.json` | `name` | `"@viktown/ui"` |
| `packages/ui/package.json` | dep | `"@viktown/shared": "workspace:*"` |
| `apps/landing/package.json` | `name` | `"@viktown/landing"` |
| `vercel.json` | `buildCommand` | `pnpm --filter @viktown/landing build` |
| `setup.sh` | `pnpm --filter` x4 | `@viktown/shared|wrapper|cli|ui` |

CLI `bin` is already `"team"` — no change.

## 2. TS imports — `@viktown/shared` → `@my-team/shared`

- `packages/cli/src/commands/attach.ts:5`
- `packages/wrapper/src/claude-process.ts:6`
- `packages/wrapper/src/session-manager.ts:15,21`
- `packages/wrapper/src/api/sessions.ts:10,11`
- `packages/wrapper/src/api/websocket.ts:5`
- `packages/wrapper/src/team-files.ts:5`
- `packages/wrapper/src/worktree.ts:8,9`
- `packages/ui/src/store.ts:7`
- `packages/ui/src/hooks/useWebSocket.ts:3`
- `packages/ui/src/api.ts:8`

## 3. Branded strings / class names

| File | What |
|---|---|
| `packages/shared/src/errors.ts:1,6,11,18,25,32,39,46` | `ViktownError` class + subclasses + `this.name` |
| `packages/wrapper/src/api/sessions.ts:11,41` | import + `instanceof ViktownError` |
| `packages/wrapper/src/worktree.ts:15` | `VIKTOWN_AGENTS_DIR` const (rename to `MY_TEAM_AGENTS_DIR`) |
| `packages/wrapper/src/worktree.ts:57,150` | branch prefix: `` `viktown/${sessionId}` `` |
| `packages/wrapper/src/worktree.ts:138` | comment `Viktown built-in →` |
| `packages/wrapper/src/claude-process.ts:105` | fallback `'viktown-captain'` |
| `packages/wrapper/src/index.ts:28` | log `'Viktown wrapper daemon started'` |
| `packages/cli/src/index.ts:22` | `.description('Viktown — Multi-agent…')` |
| `packages/cli/src/commands/help-info.ts:6,9` | description + colored banner |
| `packages/cli/src/commands/ui.ts:7` | `.description('Open the Viktown web dashboard…')` |
| `packages/ui/index.html:6` | `<title>Viktown</title>` |

## 4. Branch prefix call sites + tests

- `packages/wrapper/src/worktree.ts:57,150` — production code
- `packages/wrapper/src/server.test.ts:118,189,237,274` — `git branch -D viktown/${sessionId}`
- `packages/wrapper/src/worktree.test.ts:64,96` — expect/cleanup
- `packages/wrapper/src/team-files.test.ts:17` — fixture
- Cosmetic temp-dir prefixes (rename optional): `server.test.ts:45`, `worktree.test.ts:15,35`, `team-files.test.ts:32`

## 5. Landing page (`apps/landing/app/`)

- `layout.tsx:7,10,12,18,20,22` — metadata title, OG, `metadataBase: new URL('https://viktown.dev')`
- `components/Hero.tsx:7` — `GITHUB_URL` + h1 header (must change to `my-team: Multi-Agent…`)
- `components/Hero.tsx` right-panel `AgentFlow` — **dashboard-like widget → add WIP badge**
- `components/Footer.tsx:3,4,13` — URLs + visible `viktown` brand text
- `components/Quickstart.tsx:18,35,36` — clone URL + GITHUB_URL + README_URL
- `components/HowItWorks.tsx:13,14` — terminal demo `[viktown]` lines
- `components/Architecture.tsx:228-241` — SVG `<text>` `VIKTOWN` header (all-caps)
- `components/Architecture.tsx:26` — `Web UI` box → **add WIP label**

## 6. Hardcoded GitHub URLs

- `apps/landing/app/components/Hero.tsx:7`
- `apps/landing/app/components/Footer.tsx:3,4`
- `apps/landing/app/components/Quickstart.tsx:18,35,36`
- `README.md:15`
- `SETUP.md:39,169,175,177,207-213,228` (URLs + path suggestions like `~/.viktown`)
- `CLAUDE.md:74` — `repo at 'vik-srinivasan/viktown'`

## 7. Local-path references

- `.team/meta.json:4` — `"source_repo": "/Users/vik/Documents/viktown"` (this session's generated artifact; ignore)
- No hardcoded `/Users/vik/Documents/viktown` in source files.

## 8. Agent prompts (source of truth: `agent-prompts/`)

- `agent-prompts/captain.md:3`
- `agent-prompts/scout.md:10`
- `agent-prompts/engineer.md:10`
- `agent-prompts/tester.md:10`
- `agent-prompts/reviewer.md:10`
- `agent-prompts/git.md:10,63`

`.claude/agents/` is regenerated from `agent-prompts/` at session creation — do NOT edit.

## 9. Docs

- `SPEC.md` (6), `README.md` (3), `CLAUDE.md` (3), `SETUP.md` (15), `implementation_plan.md` (9), `tasks.md` (1)

## 10. Casing convention

| Old | New |
|---|---|
| `viktown` (npm scope, branch prefix, lowercase prose) | `my-team` |
| `Viktown` (CLI description, prose) | `my-team` |
| `VIKTOWN` (SVG all-caps) | `MY-TEAM` |
| `ViktownError` | `MyTeamError` |
| `@viktown/` (npm scope) | `@my-team/` |
| `VIKTOWN_AGENTS_DIR` (internal const) | `MY_TEAM_AGENTS_DIR` |

**`pnpm-lock.yaml`**: do NOT hand-edit. Run `pnpm install` after package.json updates.

## 11. Explicitly out of scope (post-merge user actions)

- `gh repo rename my-team` (GitHub redirects old URL)
- `mv /Users/vik/Documents/viktown /Users/vik/Documents/my-team`
- Cleaning up the `viktown/` branch prefix on already-pushed branches
- This session's own branch (`viktown/safe-sun-66`) stays — renaming mid-flight would break the PR push
