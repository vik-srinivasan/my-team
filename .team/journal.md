
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

## 2026-05-14T07:18:00Z — captain
Action: Phase 1 fully complete. Test suite 396/396 green. Dispatching Phase 2 in two waves to keep dispatch scopes recoverable in case of upstream 522s:
- Wave 1 (now): Engineer A solo — lib/api.ts, lib/ws.ts, store, hooks (useSessions/useSessionDetail/useSessionWebSocket), Sidebar + SidebarItem, NewSessionModal, SessionWorkspace + SessionHeader + SessionActions
- Wave 2 (after A): Engineers B (read-only tabs + diff) and C (terminal + workflow) in parallel

## 2026-05-14T08:05:00Z — engineer (Engineer A, Phase 2 Wave 1)
Completed: Phase 2 Engineer A scope — data layer (api client, ws helper, store, hooks), sidebar + new-session modal, session workspace shell with header + actions + tab stubs, plus unit tests for the load-bearing pieces.

Created:
- apps/ui/src/lib/api.ts (typed fetch wrappers; throws ApiError extends MyTeamError)
- apps/ui/src/lib/ws.ts (connectSessionSocket with exponential-backoff reconnect, queued send())
- apps/ui/src/store.ts (Zustand UI store: selectedSessionId + activeTab + TAB_NAMES)
- apps/ui/src/hooks/useSessions.ts (TanStack Query polling + attentionSorted slice)
- apps/ui/src/hooks/useSessionDetail.ts (TanStack Query for one session)
- apps/ui/src/hooks/useSessionWebSocket.ts (useReducer-managed snapshot + send())
- apps/ui/src/hooks/useTeamFile.ts (TanStack Query for /team/:file with 404→null)
- apps/ui/src/components/Sidebar.tsx + SidebarItem.tsx
- apps/ui/src/components/NewSessionModal.tsx
- apps/ui/src/components/SessionWorkspace.tsx + SessionContext.tsx
- apps/ui/src/components/SessionHeader.tsx + SessionActions.tsx
- apps/ui/src/components/tabs/{Journal,Tasks,Plan,Srd,Review,Diff,Terminal,Workflow}Tab.tsx — compile stubs only (engineers B & C fill these)
- apps/ui/vitest.config.ts + src/test-setup.ts
- apps/ui/src/lib/api.test.ts (19 tests; stubs global fetch)
- apps/ui/src/hooks/useSessionWebSocket.test.ts (6 tests; uses mock-socket)
- apps/ui/src/components/Sidebar.test.tsx (6 tests; RTL + jsdom)

Modified:
- apps/ui/src/App.tsx — QueryClientProvider + Sidebar/SessionWorkspace layout (replaces the placeholder)
- apps/ui/package.json — adds @tanstack/react-query, zustand, @testing-library/{react,jest-dom,user-event}, jsdom, mock-socket
- packages/shared/package.json — adds ./types ./errors ./format subpath exports so apps/ui imports stay browser-clean

Commits:
- e7cc752 feat(ui): add data layer (api client, ws helper, store, hooks)
- a66edfb feat(ui): add sidebar, workspace shell, header, actions, tab stubs
- 9287ca6 test(ui): add api, sidebar, useSessionWebSocket unit tests

Verification:
- pnpm --filter @my-team/ui test — 31 tests pass across 3 files (api.test, Sidebar.test, useSessionWebSocket.test).
- pnpm test (root) — 396 prior tests still green; apps/ui isn't in the root include glob, but `pnpm -r test` runs both root and ui suites.
- pnpm -r test — 396 root + 31 ui = 427 total, all green.
- pnpm --filter @my-team/ui build — emits dist/index.html + 258 KB JS / 79.7 KB gzipped (under the 300 KB UX budget; no warnings).
- pnpm --filter @my-team/ui dev — Vite ready in ~190 ms at http://localhost:5173.
- pnpm install --frozen-lockfile — clean (lockfile up to date).

Preview: from this session worktree, run `pnpm --filter @my-team/ui dev` to view the sidebar shell at http://localhost:5173. The sidebar populates from the wrapper daemon at http://127.0.0.1:3001 — start it first via `team start` (or via the existing daemon launcher in `packages/wrapper/dist/index.js`). To see populated sessions, ensure at least one session exists in `~/team/sessions/`. No Vercel/Netlify deploy because the UI is a localhost-only desktop/web fallback per the SRD.

Deviations:
- SessionHeader spec called for a "PR link button if pr.url present in team files", but the wrapper's `/api/sessions/:id/team/:file` route only handles the fixed TeamFiles keys (plan/tasks/journal/review/srd/context/decisions/meta/state). `.team/pr.url` is written by the captain but never exposed by the wrapper today. I omitted the PR-link button; decisions.md records the rationale and a follow-up note for whoever extends the wrapper's team-files surface. The `useTeamFile` hook I added is still useful for Engineer B's read-only markdown tabs.
- NewSessionModal's `--new`/`--github`/`--public` checkboxes are visible but state-only — `POST /api/sessions` currently accepts only `source_repo`, `title`, `cols`, `rows`. The captain handles github/public side-effects via its prompt today; surfacing the toggles validates the design before the wrapper grows fields. Decisions log captures this.
- Tab stubs are intentionally trivial (`<div>journal placeholder</div>`). Engineers B and C will replace each with real content; tasks for those remain `[ ]`.


## 2026-05-14T07:33:00Z — captain
Action: Phase 2 Wave 1 complete (commits e7cc752, a66edfb, 9287ca6). 427 tests green; UI bundle 258 kB raw / 80 kB gzipped.
Engineer A flagged two follow-ups for Wave 2 or a later round:
1. PR-link button needs wrapper route for `.team/pr.url` (wrapper's team-file route whitelists fixed keys only). Out-of-scope for B/C; capture as follow-up.
2. NewSessionModal `--new`/`--github`/`--public` checkboxes are state-only — wrapper's `CreateSessionRequest` doesn't accept them. Also follow-up.
Dispatching Wave 2 in parallel: Engineer B (read-only tabs + diff), Engineer C (terminal + workflow). Disjoint file ownership; no merge collisions expected.


## 2026-05-14T07:42:00Z — engineer (Engineer B, Phase 2 Wave 2)
Completed: read-only tabs + diff for the per-session workspace (6 tasks under Engineer B in `.team/tasks.md`).

Files created:
- apps/ui/src/lib/markdown.tsx — shared `react-markdown` component overrides (headings, lists, code, table, blockquote, EmptyState) used by every read-only tab so the surface stays visually consistent.
- apps/ui/src/lib/diff.ts — unified-diff parser (`parseUnifiedDiff`), Prism language map (`prismLanguageForPath`), and line-truncation helper (`truncateLines`).
- apps/ui/src/components/tabs/JournalTab.tsx — live `teamFiles.journal` view with rAF-deferred auto-scroll to bottom.
- apps/ui/src/components/tabs/TasksTab.tsx — custom checkbox glyph renderer; detects task rows via the hast `node.properties.className === 'task-list-item'` plus the `input.checked` property (react-markdown v9 doesn't surface `checked` on `li` directly). `readTaskState` helper is exported.
- apps/ui/src/components/tabs/PlanTab.tsx — straight react-markdown render of `teamFiles.plan` using shared `markdownComponents`.
- apps/ui/src/components/tabs/SrdTab.tsx — uses `useTeamFile(id, 'srd.md')` since SRD isn't in the WS broadcast set (`TeamFileName = plan|tasks|journal|review`); 30s polling is the hook default.
- apps/ui/src/components/tabs/ReviewTab.tsx — splits `# Review pass <N>` headers into `<details>` sections, latest pass expanded by default, older passes collapsed; falls back to flat render when no pass headers are present. `splitReviewPasses` exported.
- apps/ui/src/components/tabs/DiffTab.tsx — live `lastDiff` with one-shot `api.getDiff` bootstrap; per-file collapsible header (+N/-M chips, added/deleted badges); top toggle between Unified and Side-by-side; per-file 1000-line cap with "Show full diff" override; Prism syntax highlighting for ts/tsx/js/jsx/css/json/md/rust/bash via `renderContent`.

Tests created (24 new tests, all green):
- apps/ui/src/components/tabs/JournalTab.test.tsx — empty state, markdown render, auto-scroll on update (3 tests).
- apps/ui/src/components/tabs/TasksTab.test.tsx — empty state, `[x]` filled / `[ ]` empty glyphs, section heading preservation, non-task `<li>` keeps default bullet (4 tests).
- apps/ui/src/components/tabs/PlanTab.test.tsx — empty state, fenced code block render (2 tests).
- apps/ui/src/components/tabs/SrdTab.test.tsx — 404 → empty state, 200 → markdown render via mocked fetch (2 tests).
- apps/ui/src/components/tabs/ReviewTab.test.tsx — `splitReviewPasses` unit + ReviewTab smoke (empty / multi-pass / no-pass-headers) (5 tests).
- apps/ui/src/components/tabs/DiffTab.test.tsx — `parseUnifiedDiff` + `truncateLines` units + DiffTab empty / file-count / view-toggle / 1000-line cap (8 tests).

Files modified:
- apps/ui/package.json — added `react-markdown@^9.1.0`, `remark-gfm@^4.0.1`, `react-diff-viewer-continued@^4.0.1`, `prismjs@^1.30.0`, `parse-diff@^0.11.1`, `@types/prismjs@^1.26.5`. (The same diff also includes Engineer C's parallel codemirror/xterm additions, which were on disk already; C will own those rows in their commit.)
- pnpm-lock.yaml — regenerated.
- .team/tasks.md — marked the 6 Engineer-B Phase-2 tasks `[x]` with implementation notes.
- .team/decisions.md — recorded three decisions (no syntax-highlighter for plan/srd/review code fences; hast-walking for TasksTab task discrimination; per-file synthetic reconstruction for the diff viewer).

Commits:
- ef6cd9c feat(ui): add markdown + diff dependencies for read-only tabs
- 1f8f52f feat(ui): add JournalTab and TasksTab with live updates
- 4631ca8 feat(ui): add PlanTab, SrdTab, and ReviewTab
- ebff4df feat(ui): add DiffTab with react-diff-viewer-continued and Prism highlighting

Verification:
- `pnpm install` at repo root — clean (1.5s).
- `pnpm exec tsc -p apps/ui/tsconfig.json --noEmit` — 0 errors across the whole UI package.
- `pnpm exec vitest run` (apps/ui) — 79 of 81 pass; the 2 flaky failures (`useAgentPrompt.test.ts:131` and `useSessionWebSocket.test.ts:191`) are not in my surface (the former is Engineer C, the latter is a pre-existing reconnect-flake in Engineer A's hook test). All 24 of my new tests pass.
- `pnpm --filter @my-team/ui build` — succeeds; emits `dist/index.html` + 1.5 MB JS / 474 KB gzipped (the codemirror+prism+react-markdown+react-diff-viewer bundle is large; landing-page bundle-budget doesn't apply to a desktop/web fallback app).

Preview: from this worktree, run `pnpm --filter @my-team/ui dev` to view the workspace at http://localhost:5173. Start the wrapper daemon first (`team start`) so the Journal/Tasks/Plan/Review tabs receive live `team_file` events and Diff renders something. With at least one active session, click into it from the sidebar and cycle through Journal / Tasks / Plan / SRD / Review / Diff to see each tab populated.

Deviations from plan:
- Plan code fences are NOT syntax-highlighted. The plan said "use `react-syntax-highlighter` if it pulls in nothing too heavy, OR keep it simple and just use a styled `<code>` block — your call, document the choice in journal". I picked the styled-code path for plan/srd/review and reserved Prism for DiffTab where it matters more. Logged in `.team/decisions.md`.

## 2026-05-14T08:10:00Z — engineer (Engineer C, Phase 2)
Completed: Phase 2 Engineer C scope — interactive tabs (Terminal + Workflow) plus the supporting hooks and components.

Created:
- apps/ui/src/hooks/useAgentList.ts — TanStack Query for `GET /api/sessions/:id/agents` (specialist list source-of-truth for the Workflow tab's left column).
- apps/ui/src/hooks/useAgentPrompt.ts — `useAgentPrompt` + `useAgentPromptMutation`. staleTime Infinity, mutation seeds the prompt cache + invalidates the sibling agent-list query so the source chip flips to `session` after a save.
- apps/ui/src/hooks/useAgentPrompt.test.ts — 7 tests (fetch happy path, disabled when sessionId or name is null, query-key shape, mutation cache-seeding, mutation failure without cache seed, throws-without-id-or-name).
- apps/ui/src/hooks/useWorkflowConfig.ts — `useWorkflowConfig` + `useWorkflowConfigMutation` (optimistic update + rollback on error) + DEFAULT_WORKFLOW_CONFIG export.
- apps/ui/src/components/Terminal.tsx — vanilla xterm.js wrapper. ForwardRef exposes `write(text)`, `clear()`, `size()`. FitAddon + WebLinksAddon. ResizeObserver + window-resize listener drive a debounced rAF refit. `convertEol: true` so PTY `\n` payloads render as newlines. Dark theme matching the rest of the UI.
- apps/ui/src/components/Terminal.test.tsx — 3 tests; stubs ResizeObserver, matchMedia, HTMLCanvasElement.getContext so xterm's constructor runs in jsdom; asserts mount + ref-API wiring + write/clear non-throwing.
- apps/ui/src/components/PromptEditor.tsx — `@uiw/react-codemirror` wrapper, controlled value/onChange, oneDark theme, markdown lang pack, line-wrapping, JetBrains Mono. Imports `EditorView` from `@uiw/react-codemirror` (re-exports it) rather than adding `@codemirror/view` as a direct dep.
- apps/ui/src/components/tabs/TerminalTab.test.tsx — 6 tests; mocks <Terminal> with a stub exposing the same imperative API; asserts output → write, input → socket.send, resize → socket.send, status-dot rendering, empty-state, and closed→connecting clears the terminal.
- apps/ui/src/components/tabs/WorkflowTab.test.tsx — 10 tests; mocks PromptEditor as a textarea; asserts source chips, override dots, click loads body, edit + Save calls putAgent with dirty body, toggling writes putWorkflow disabled/forced arrays, effort override writes effort_override, clearing effort drops it, empty states, list ordering.

Modified:
- apps/ui/src/components/tabs/TerminalTab.tsx — replaces Engineer A's stub with the real WS-piped terminal (output → xterm.write, onData → input, onResize → resize, status dot, empty state, clear-on-reconnect).
- apps/ui/src/components/tabs/WorkflowTab.tsx — replaces Engineer A's stub with the three-region tab (specialist list / editor + Save / workflow strip).

Commits:
- be242d2 feat(ui): add agent-prompt and workflow-config hooks
- bf6f1e9 feat(ui): add Terminal xterm.js wrapper
- 5831116 feat(ui): add PromptEditor with codemirror markdown
- ca14156 feat(ui): add TerminalTab with WS pty bridge
- 8e11d0f feat(ui): add WorkflowTab with prompt editor and specialist toggles

Decisions logged in `.team/decisions.md`:
- (Save Workflow strategy) Explicit "Save Workflow" button rather than debounced auto-save. Reason: the config drives captain orchestration; users should feel the commit, and mixing auto-save here with explicit Save in the prompt editor above would be inconsistent. Optimistic update in `useWorkflowConfigMutation` keeps the click feel snappy.
- (Reset-to-default link) Hidden. The wrapper exposes only GET/PUT for agent prompts; no DELETE handler exists. Adding the wrapper DELETE is explicitly outside Engineer C's scope. Flagged in this entry too.
- (Terminal test stubs) Stub `ResizeObserver` / `matchMedia` / `HTMLCanvasElement.getContext` in the test file rather than installing the optional `canvas` npm package. Keeps CI lean; the test asserts the wiring, not the renderer.

Deviations from prompt:
- Dependencies were added to `apps/ui/package.json` and pnpm-lock.yaml by Engineer B's commit ef6cd9c (they noted "Engineer C's parallel additions (codemirror / xterm) that were already on disk; C's commit will own those rows"). End state is correct — `@xterm/xterm@5.5.0`, `@xterm/addon-fit@0.11.0`, `@xterm/addon-web-links@0.12.0`, `@uiw/react-codemirror@4.25.9`, `@codemirror/lang-markdown@6.5.0`, `@codemirror/theme-one-dark@6.1.3` are all present in HEAD and resolved in the lockfile.
- xterm-package-name decision: `@xterm/xterm` 5.5.0 (the current major published under the `@xterm` org; the bare `xterm` package is at 5.3.0 and the package note recommends the scoped name going forward).
- The wrapper has NO DELETE endpoint for agent prompts. The Workflow tab's "Reset to default" link is hidden as a result. Flagging here for follow-up: a Phase-1 engineer can add `DELETE /api/sessions/:id/agents/:name` + the corresponding `fs.rm` in `packages/wrapper/src/agent-prompts.ts`, then re-enable the link.

Verification:
- `pnpm install` — clean, 1.3s, 29 new packages added (codemirror + xterm chains).
- `pnpm --filter @my-team/ui test` — 80 passing across 12 test files; the single failure (`useSessionWebSocket > reconnects after an unexpected close`) is pre-existing in Engineer A's commit 9287ca6 and unrelated to Engineer C's surface.
- `pnpm --filter @my-team/ui build` — emits dist/index.html + 1.5 MB JS / 474 KB gzipped. The size warning is expected (xterm + codemirror are big); the dev-mode chunking strategy can be addressed in Phase 3 if needed.
- `npx tsc --noEmit` from apps/ui — clean.

Preview / how to view the result:
- `pnpm --filter @my-team/ui dev` opens Vite at http://localhost:5173.
- With the wrapper daemon running (`team start`) and a real session selected in the sidebar, the Terminal tab attaches to the captain PTY and renders its output; the Workflow tab loads the 10-specialist roster (captain, scout, engineer, tester, reviewer, designer, runner, auditor, documenter, debugger) and lets the user edit any of their prompts.
- Workflow-tab end-to-end check: pick `engineer` from the list, append a marker line in the editor, click Save, then on disk: `cat <worktree>/.claude/agents/engineer.md` shows the edited body. Toggle a specialist; `cat <worktree>/.team/workflow.json` shows `{disabled_specialists, forced_specialists, ...}`.
- Tauri preview: not exercised — Rust toolchain wasn't installed at Phase 1 (see Engineer 2's blocker in tasks.md line 16). Runner will exercise tauri:dev + tauri:build with rustup installed.
