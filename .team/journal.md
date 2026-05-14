
## 2026-05-14T06:08:00Z — captain
Action: Session started. User asked about building a UI on top of my-team, citing Conductor.build as the comparable. Dispatching scout to map the existing surface (CLI commands, `.team/` artifacts, wrapper hooks, session lifecycle) so we can scope a UI proposal accurately.

## 2026-05-14T06:12:00Z — captain
Action: Scout completed. Wrote `.team/context.md`.
Key finding: wrapper already exposes a full HTTP+WebSocket API on 127.0.0.1:3001. Every CLI command is already a thin client over it. PTY pass-through, multi-attach, state/file change broadcasts, and on-connect hydration are all live. A UI is "build a second client" not "build a data layer".
Phase → planning (pending user direction on UI shape + goal).

## 2026-05-14T06:22:00Z — captain
Action: Drafted SRD + plan + tasks.
Brief from user: rewrite (no legacy), Mac-app preferred + web fallback, goal is "better than Conductor for my use case", customizability is non-negotiable, other people use my-team via terminal so CLI must keep working. Scope: full v1 incl. Workflow pane. Effort: thorough.
Decisions baked in:
- Stack: Tauri v2 + Vite + React 19 + Tailwind 4 + TS strict.
- Same frontend code powers .app and web (`team ui`).
- Wrapper API stays; additive endpoints only (CORS, agent-prompt CRUD, workflow-config CRUD, recents).
- Customization surface = Workflow tab (per-session prompt editor + specialist toggles + effort override) backed by `.team/workflow.json` honored by captain.
- Out of scope: code signing, auto-update, Windows/Linux native, built-in editor, auth.
Phase → awaiting_approval.

## 2026-05-14T06:26:00Z — captain
Action: Plan approved by user. Beginning execution.
Phase 1 (foundation): dispatching two engineers in parallel.
- Engineer 1 (backend foundation): shared/format move + wrapper CORS + agent-prompts + workflow-config + recents + api-client wrappers + tests + captain.md prompt change
- Engineer 2 (frontend skeleton): apps/ui/ scaffolding (Vite + React + Tailwind + Tauri shim) + team ui CLI command
Independent surfaces — no file collisions expected. Phase 2 (3 parallel engineers) follows Phase 1 completion.

## 2026-05-14T06:58:00Z — engineer
Completed: Phase 1 frontend skeleton (Engineer 2 lane) — apps/ui/ Vite+React+Tailwind+Tauri scaffolding plus the `team ui` CLI command.
Created:
- apps/ui/package.json, tsconfig.json, vite.config.ts, index.html, .gitignore, README.md
- apps/ui/src/main.tsx, App.tsx (placeholder "my-team UI"), index.css (Tailwind 4 @import)
- apps/ui/src-tauri/Cargo.toml, build.rs, tauri.conf.json, src/main.rs + lib.rs, capabilities/default.json
- apps/ui/src-tauri/icons/ — full PNG ladder + icon.icns (via iconutil) + icon.ico (hand-built header wrapping a 256x256 PNG)
- packages/cli/src/commands/ui.ts + ui.test.ts (8 tests, all green)
Modified:
- packages/cli/src/index.ts — registered `uiCommand`
- apps/landing/app/components/GettingStarted.tsx — added `team ui` to the Daemon group (keeps CLI-coverage regression test green)
Commits:
- ba35ead feat(ui): scaffold apps/ui with vite + react 19 + tailwind 4
- c669f48 feat(ui): add tauri v2 shim for macOS desktop build  (also absorbed Engineer 1's format-move staged changes that were in the index when I committed — clean, no rework needed)
- 1c91b3f feat(cli): add team ui command
Verification:
- `pnpm install` resolves at the root.
- `pnpm --filter @my-team/ui build` produces dist/index.html + assets.
- `pnpm --filter @my-team/ui tauri info` reads the Tauri config and recognises the Vite/React frontend.
- `pnpm test` from repo root: 332 / 332 passing.
- Smoke-tested `startStaticServer()` against the real `apps/ui/dist`: 200 OK, content-type text/html, "my-team UI" in body, clean shutdown.

Preview:
- Web: `pnpm --filter @my-team/ui build && pnpm --filter @my-team/cli build && node packages/cli/dist/index.js ui` (boots localhost:3737, opens browser, shows "my-team UI · Phase 1 scaffolding").
- Vite dev (HMR): `pnpm --filter @my-team/ui dev` → http://localhost:5173.
- Tauri Mac: blocked locally — see below.

Blockers / gaps:
- **Rust toolchain not installed on this machine** (`rustc not installed`, `cargo not installed` per `tauri info`). `pnpm --filter @my-team/ui tauri:dev` and `tauri:build` were therefore NOT exercised. Documented in apps/ui/README.md (rustup link, Gatekeeper note). Runner needs to install rustup + Xcode CLT and verify the Tauri shell boots.
- Icons are placeholder teal-on-dark "mt" marks generated via sharp/iconutil; designer can replace later.

## 2026-05-14T07:10:00Z — captain
Action: Engineer 1 (backend foundation) hit Cloudflare 522 mid-execution after ~15 minutes. Completed and committed: agent-prompts module (ee0be47), agent-prompt CRUD HTTP routes (0477095), CORS (5515ad9). Engineer 2 (frontend skeleton) completed cleanly: scaffold (ba35ead), Tauri shim (c669f48), team ui (1c91b3f). 
On-disk but uncommitted from Engineer 1: workflow-config.ts + workflow-config.test.ts, api/repos.ts (recents endpoint), small route hookups in server.ts + api/sessions.ts.
Remaining Phase 1: commit the on-disk work after verification, add api-client wrappers in CLI, update captain.md for .team/workflow.json honoring.
Re-dispatching engineer to finish Phase 1 backend.

## 2026-05-14T07:25:00Z — engineer
Completed: Phase 1 backend foundation — finished and committed the in-flight work from the 522-interrupted engineer plus the remaining items.

Audited on-disk work first:
- `workflow-config.ts` matched the plan (getWorkflowConfig/putWorkflowConfig, defaults, validation against KNOWN_CONDITIONAL_SPECIALISTS + EffortLevel; also rejects disabled+forced overlap). Imports types/errors from `@my-team/shared` — no redefinition needed; the previous engineer already added `WorkflowConfig`, `EffortLevel`, `RecentRepo`, `InvalidWorkflowConfigError`, `KNOWN_CONDITIONAL_SPECIALISTS` to shared.
- `workflow-config.test.ts` covered everything the plan asked for plus more — 21 tests, all green.
- `api/repos.ts` matched the plan — uses `readRegistry` from `@my-team/shared`, honors `MY_TEAM_REGISTRY_PATH` env override for test isolation, compacts `RepoRecord` to `RecentRepo`.
- Found a real gap: `packages/wrapper/src/api/sessions.ts` had imported `getWorkflowConfig` / `putWorkflowConfig` but never wired the GET/PUT routes for them. Added the two routes and INVALID_WORKFLOW_CONFIG → 400 to `handleError`. Un-skipped the previously-skipped `describe.skip('Workflow config endpoints')` + `describe.skip('Recents endpoint')` in `server.test.ts` — all 6 now pass.

Modified/added:
- packages/wrapper/src/api/sessions.ts — added workflow GET/PUT routes + INVALID_WORKFLOW_CONFIG mapping.
- packages/wrapper/src/server.test.ts — un-skipped 6 integration tests.
- packages/cli/src/api-client.ts — added listAgents / getAgent / putAgent / getWorkflow / putWorkflow / getRecents typed wrappers.
- agent-prompts/captain.md — new "Workflow config overrides (.team/workflow.json)" section before the conditional-specialist dispatch decision; defines skip/force/effort-override behavior and the disabled-wins tiebreaker for the hand-edited overlap case.

Created (committed):
- packages/wrapper/src/workflow-config.ts, packages/wrapper/src/workflow-config.test.ts
- packages/wrapper/src/api/repos.ts

Commits:
- a8fd757 feat(wrapper): add workflow-config module with .team/workflow.json read/write
- 1f35196 feat(wrapper): expose workflow-config CRUD over HTTP
- 174f060 feat(wrapper): add recents endpoint backed by ~/team/recents.json
- 21cfbe3 feat(cli): add api-client wrappers for agents, workflow, and recents
- 570edd3 feat(captain): honor .team/workflow.json for specialist dispatch

Verification:
- `pnpm vitest run packages/wrapper/` → 225 tests, all green (was 219 with 6 skipped — now the 6 are un-skipped and passing).
- `pnpm vitest run packages/cli/` → 47 tests, all green.
- `pnpm test` (repo root) → 396 tests across 32 files, all green.
- `pnpm -r build` → @my-team/wrapper, @my-team/cli, @my-team/ui all build clean.

Deviations from plan: none. The plan said "(Or combine related ones if the diffs are small)" — I kept five separate commits because each maps to a distinct slice of the surface (helper module, HTTP routes, recents, CLI client, captain prompt) and stays under ~60 LOC each.

Phase 1 backend foundation: complete. All Phase 1 tasks (engineering only — Phase 2/3 not mine) are now `[x]` in `.team/tasks.md`. Ready for Phase 2.
