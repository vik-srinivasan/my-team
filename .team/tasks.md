# Tasks — maybe we add a ui?

## Engineering — Phase 1 (foundation, sequential)

- [x] @engineer Move `packages/cli/src/format.ts` → `packages/shared/src/format.ts`; update CLI imports; ensure CLI tests still pass — landed via commit c669f48 (Engineer 2 absorbed it alongside the Tauri shim); current shared/src/format.ts + .test.ts mirror the proposed contents; CLI tests pass.
- [x] @engineer Add `cors` middleware to `packages/wrapper/src/server.ts` allowing `http://localhost:3737` and `tauri://localhost` — commit 5515ad9; covers HTTP only; WS upgrade still accepts all origins (documented at top of server.ts).
- [ ] @engineer Create `packages/wrapper/src/agent-prompts.ts` with layer-fallback read (session → repo → user → packaged default) and session-scoped write
- [ ] @engineer Add wrapper routes: `GET /api/sessions/:id/agents`, `GET /api/sessions/:id/agents/:name`, `PUT /api/sessions/:id/agents/:name`
- [ ] @engineer Create `packages/wrapper/src/workflow-config.ts` for `.team/workflow.json` read/write with defaults
- [ ] @engineer Add wrapper routes: `GET /api/sessions/:id/workflow`, `PUT /api/sessions/:id/workflow`
- [ ] @engineer Add wrapper route: `GET /api/repos/recents` reading `~/team/recents.json`
- [ ] @engineer Add typed wrappers to `packages/cli/src/api-client.ts` for: `listAgents`, `getAgent`, `putAgent`, `getWorkflow`, `putWorkflow`, `getRecents`
- [x] @engineer Create `packages/cli/src/commands/ui.ts` — `team ui` boots a static file server on port 3737 from `apps/ui/dist/` and opens the default browser; ensures daemon is running first — commit 1c91b3f; node:http static server (no extra dep), SPA fallback, traversal guard, daemon-up check via /api/health, browser via `open`/`xdg-open`/`start`; tests cover dist-missing + traversal + clean close.
- [x] @engineer Register `team ui` in `packages/cli/src/index.ts` — commit 1c91b3f; also registered in `apps/landing/app/components/GettingStarted.tsx` Daemon group to keep the CLI-coverage regression test green.
- [x] @engineer Create `apps/ui/` skeleton: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `src/main.tsx`, `src/App.tsx` (blank), `src/index.css`. Verify `pnpm --filter @my-team/ui dev` works — commit ba35ead; Tailwind 4 + @tailwindcss/vite plugin so tailwind.config.js + postcss.config.js are NOT needed (Tailwind 4 ships its own Vite plugin); decision logged. `pnpm --filter @my-team/ui build` emits dist/index.html + assets.
- [x] @engineer Add Tauri shim under `apps/ui/src-tauri/`: `Cargo.toml`, `tauri.conf.json`, `src/main.rs`, placeholder icons. Verify `pnpm --filter @my-team/ui tauri dev` opens a blank Mac window — commit c669f48; full Tauri v2 layout (Cargo.toml, build.rs, src/main.rs + lib.rs, capabilities/default.json, full icon ladder + .icns + .ico). `pnpm --filter @my-team/ui tauri info` runs clean. **Blocker:** Rust toolchain is NOT installed on this machine so `tauri:dev` / `tauri:build` were not exercised — runner needs to install rustup and verify.
- [ ] @engineer Update `agent-prompts/captain.md` to read `.team/workflow.json` before optional-specialist dispatch (honor `disabled_specialists`, `forced_specialists`, `effort_override`)

## Engineering — Phase 2 (UI surface, parallel across A/B/C)

### Engineer A — shell + interaction

- [ ] @engineer Create `apps/ui/src/lib/api.ts` — typed fetch client wrapping all wrapper endpoints
- [ ] @engineer Create `apps/ui/src/lib/ws.ts` — WebSocket helper with reconnect on close
- [ ] @engineer Create `apps/ui/src/store.ts` — Zustand store for `selectedSessionId`, `activeTab`
- [ ] @engineer Create `apps/ui/src/hooks/useSessions.ts` — TanStack Query for `GET /api/sessions`, polling every 2s
- [ ] @engineer Create `apps/ui/src/hooks/useSessionDetail.ts` — TanStack Query for `GET /api/sessions/:id`
- [ ] @engineer Create `apps/ui/src/hooks/useSessionWebSocket.ts` — connects, exposes typed event stream
- [ ] @engineer Create `Sidebar.tsx` + `SidebarItem.tsx` — attention-sorted list with phase colors and search
- [ ] @engineer Create `NewSessionModal.tsx` — repo picker (uses recents endpoint), title input, options checkboxes
- [ ] @engineer Create `SessionWorkspace.tsx` — top-level layout with header + tab row + active tab content
- [ ] @engineer Create `SessionHeader.tsx` — title, ID, phase chip, branch, PR link (when `pr.url` exists)
- [ ] @engineer Create `SessionActions.tsx` — Approve, Kill, Purge, Open in VS Code, Send input

### Engineer B — read-only tabs + diff

- [ ] @engineer Create `JournalTab.tsx` — react-markdown rendering, auto-scroll to bottom on WS update
- [ ] @engineer Create `TasksTab.tsx` — render `tasks.md` with custom checkbox rendering (matches `team tasks` styling)
- [ ] @engineer Create `PlanTab.tsx` — react-markdown rendering of `plan.md`
- [ ] @engineer Create `SrdTab.tsx` — react-markdown rendering of `srd.md`
- [ ] @engineer Create `ReviewTab.tsx` — react-markdown rendering of `review.md`, with iteration-pass collapsibles
- [ ] @engineer Create `DiffTab.tsx` — `react-diff-viewer-continued` with unified/side-by-side toggle, 1k-line-per-file cap with "show full diff" override

### Engineer C — interactive tabs

- [ ] @engineer Create `Terminal.tsx` — xterm.js wrapper with `@xterm/addon-fit`; expose connect/disconnect via props
- [ ] @engineer Create `TerminalTab.tsx` — wires `Terminal.tsx` to `useSessionWebSocket` for bidirectional pipe (output → render, input → WS)
- [ ] @engineer Create `PromptEditor.tsx` — `@uiw/react-codemirror` + `@codemirror/lang-markdown`
- [ ] @engineer Create `useAgentPrompt.ts` — read + write hook for `.claude/agents/<name>.md`
- [ ] @engineer Create `useWorkflowConfig.ts` — read + write hook for `.team/workflow.json`
- [ ] @engineer Create `WorkflowTab.tsx` — left pane: list of 9 specialists with edit buttons + override indicators; right pane: PromptEditor + Save; bottom: effort-level selector + optional-specialist on/off toggles

## Engineering — Phase 3 (polish, sequential)

- [ ] @engineer Empty states: sidebar (no sessions), each tab (no content yet)
- [ ] @engineer Loading skeletons for sidebar and tab content
- [ ] @engineer Error boundaries on each tab
- [ ] @engineer Keyboard shortcuts: Cmd+N (new session), Cmd+W (close detail), Cmd+1..8 (jump to tab)
- [ ] @engineer Configure `tauri.conf.json` for macOS `aarch64` + `x86_64` targets; verify `pnpm --filter @my-team/ui tauri build` produces `.app` and `.dmg`

## Testing

- [ ] @tester Wrapper integration tests for new agent-prompt endpoints (list, get with each layer fallback, put writes to session)
- [ ] @tester Wrapper integration tests for workflow-config endpoints (defaults, write, read-back)
- [ ] @tester Wrapper integration tests for recents endpoint
- [ ] @tester Wrapper CORS test (cross-origin GET succeeds with allowed origin, fails otherwise)
- [ ] @tester CLI test for `team ui` (mock daemon, verify static server starts and opens browser)
- [ ] @tester `apps/ui` component test: Sidebar (attention sort, phase color, search filter)
- [ ] @tester `apps/ui` component test: WorkflowTab (loads prompts, edit + Save calls PUT, toggle writes workflow.json)
- [ ] @tester `apps/ui` hook test: useSessionWebSocket (reconnect on close)
- [ ] @tester Run `pnpm -r test`; report green

## Visual (designer)

- [ ] @designer Screenshot pass 1: sidebar + per-session header + each of 8 tabs; flag visual issues
- [ ] @designer Screenshot pass 2: after engineer addresses pass-1 feedback
- [ ] @designer Screenshot pass 3 (thorough): responsive breakpoints (narrow window), dark mode contrast, final visual polish

## End-to-end (runner)

- [ ] @runner Boot `pnpm --filter @my-team/ui tauri dev`; click through sidebar → workspace → each tab; verify live updates against a real session
- [ ] @runner Boot `team ui` (web fallback); repeat the click-through
- [ ] @runner Verify `pnpm --filter @my-team/ui tauri build` produces a working `.app`; manually open it and verify functionality
- [ ] @runner Edit a specialist prompt in Workflow tab; verify the file on disk changed
- [ ] @runner Toggle a specialist off; spin up a new test session; verify captain skips that specialist

## Documentation (documenter)

- [ ] @documenter Update root `README.md` with `apps/ui/` package and `team ui` command
- [ ] @documenter Create `apps/ui/README.md` with dev/build instructions, Gatekeeper note, Rust toolchain requirement
- [ ] @documenter Update `AGENTS.md` / `CLAUDE.md` with conventions for `apps/ui/` (Tailwind, React 19, vitest, naming)
- [ ] @documenter Add a "Customization" section to root README pointing at the Workflow tab

## Review

- [ ] @reviewer Full review pass; produce `.team/review.md` with severity-bucketed findings

## Git

- [ ] @captain Push branch and open PR
