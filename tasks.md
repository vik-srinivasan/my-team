# my-team — Build Tasks

Checked off as completed. See `implementation_plan.md` for detailed steps.

---

## Phase 1 — Wrapper Core + CLI + Happy-Path Engineer-Only

### Infrastructure
- [x] 1.1 Monorepo scaffolding (pnpm workspace, tsconfig, all packages)
- [x] 1.2 Shared types (Session, State, Events, Errors)
- [x] 1.3 Session ID generator (human-readable)

### Wrapper Core
- [x] 1.4 Worktree manager (create, remove, archive)
- [x] 1.5 Claude process manager (node-pty spawn, stdin/stdout, lifecycle)
- [x] 1.6 Team files manager (read, write, watch .team/)
- [x] 1.7 Session manager (orchestrate lifecycle, in-memory registry)
- [x] 1.8 HTTP API (all session endpoints with zod validation)
- [x] 1.9 WebSocket server (live streaming, bidirectional)
- [x] 1.10 Wrapper entry point (daemon startup, graceful shutdown)

### Agent Prompts
- [x] 1.11 Captain + Engineer system prompts

### CLI
- [x] 1.12 `team start` command
- [x] 1.13 `team new` command
- [x] 1.14 `team attach` command (WebSocket streaming)
- [x] 1.15 Remaining commands (list, status, kill, clean, archive, logs)

### Validation
- [x] 1.16 End-to-end integration test
- [x] 1.17 Phase 1 polish, README, push

---

## Phase 2 — Full Specialist Roster

- [x] 2.1 Scout specialist prompt + scouting phase in session manager
- [x] 2.2 Tester specialist prompt
- [x] 2.3 Reviewer specialist prompt
- [x] 2.4 Git specialist prompt + remove wrapper direct PR creation
- [x] 2.5 Update captain + engineer prompts for full roster and review loop
- [x] 2.6 Done criteria, blocked state, notifications
- [x] 2.7 Phase 2 integration test + push

---

## Phase 3 — Web UI

- [x] 3.1 Vite + React + Tailwind setup
- [x] 3.2 API client + Zustand state management
- [x] 3.3 WebSocket hook (useWebSocket)
- [x] 3.4 Left column: SessionList, AgentList, NewSessionModal
- [x] 3.5 Middle column: Chat with markdown rendering
- [x] 3.6 Right column: DiffPanel, TeamArtifactPanel
- [x] 3.7 Wrapper: serve UI static files
- [x] 3.8 Phase 3 integration test + push

---

## Phase 4 — Ship It

- [x] 4.1 Captain Task tool dispatch + scouting phase fix — explicit invocation syntax + examples in captain.md, correct `scouting` → `planning` phase transitions, set `active_specialist: "scout"`
- [x] 4.2 Live diff events + PTY output accumulation — WebSocket diff emission with 500ms debounce, buffer PTY chunks into coherent messages instead of one-bubble-per-chunk
- [x] 4.3 Auto-cleanup on done + kill state persistence — archive worktree + remove after grace period, write `killed` phase to `state.json` on disk + journal entry
- [x] 4.4 Global CLI installation — `team` command works from anywhere via setup.sh
- [x] 4.5 Notification surface — API endpoint + UI banner + `team notifications` CLI command
- [x] 4.6 Diff panel file tree + per-file view + reactive tab switching — M/A/D indicators, click to focus, auto-switch right tab on phase changes via WebSocket
- [x] 4.7 Error messaging & recovery + UI polish — structured errors, helpful CLI messages, crash handling, fix `sendInput` wrong error on dead captain, `rehype-highlight` in Chat, human-readable system event messages, approve error feedback
- [x] 4.8 README & setup guide — clone-to-running instructions, no raw node paths
- [x] 4.9 End-to-end smoke test + push
