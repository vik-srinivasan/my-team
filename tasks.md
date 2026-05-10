# Viktown — Build Tasks

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

## Phase 4 — Polish

- [ ] 4.1 Error messaging & recovery
- [ ] 4.2 Notification surface for blocked sessions
- [ ] 4.3 README, demo, final cleanup
- [ ] 4.4 Final push
