# Viktown — Build Tasks

Checked off as completed. See `implementation_plan.md` for detailed steps.

---

## Phase 1 — Wrapper Core + CLI + Happy-Path Engineer-Only

### Infrastructure
- [ ] 1.1 Monorepo scaffolding (pnpm workspace, tsconfig, all packages)
- [ ] 1.2 Shared types (Session, State, Events, Errors)
- [ ] 1.3 Session ID generator (human-readable)

### Wrapper Core
- [ ] 1.4 Worktree manager (create, remove, archive)
- [ ] 1.5 Claude process manager (node-pty spawn, stdin/stdout, lifecycle)
- [ ] 1.6 Team files manager (read, write, watch .team/)
- [ ] 1.7 Session manager (orchestrate lifecycle, in-memory registry)
- [ ] 1.8 HTTP API (all session endpoints with zod validation)
- [ ] 1.9 WebSocket server (live streaming, bidirectional)
- [ ] 1.10 Wrapper entry point (daemon startup, graceful shutdown)

### Agent Prompts
- [ ] 1.11 Captain + Engineer system prompts

### CLI
- [ ] 1.12 `team start` command
- [ ] 1.13 `team new` command
- [ ] 1.14 `team attach` command (WebSocket streaming)
- [ ] 1.15 Remaining commands (list, status, kill, clean, archive, logs)

### Validation
- [ ] 1.16 End-to-end integration test
- [ ] 1.17 Phase 1 polish, README, push

---

## Phase 2 — Full Specialist Roster

- [ ] 2.1 Scout specialist (read-only codebase exploration → context.md)
- [ ] 2.2 Tester specialist (integration tests, suite runner)
- [ ] 2.3 Reviewer specialist (review.md, severity buckets, iteration loop)
- [ ] 2.4 Git specialist (push branch, open PR via gh)
- [ ] 2.5 Done criteria, blocked state, notifications
- [ ] 2.6 Phase 2 integration test + push

---

## Phase 3 — Web UI

- [ ] 3.1 Vite + React + Tailwind setup
- [ ] 3.2 API client + Zustand state management
- [ ] 3.3 WebSocket hook (useWebSocket)
- [ ] 3.4 Left column: SessionList, AgentList, NewSessionModal
- [ ] 3.5 Middle column: Chat with markdown rendering
- [ ] 3.6 Right column: DiffPanel, TeamArtifactPanel
- [ ] 3.7 Wrapper: serve UI static files
- [ ] 3.8 Phase 3 integration test + push

---

## Phase 4 — Polish

- [ ] 4.1 Error messaging & recovery
- [ ] 4.2 Notification surface for blocked sessions
- [ ] 4.3 README, demo, final cleanup
- [ ] 4.4 Final push
