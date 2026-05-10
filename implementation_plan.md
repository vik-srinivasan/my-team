# Viktown — Implementation Plan

This document is the authoritative build plan derived from `SPEC.md`, which is the source of truth for all architecture, data model, and behavioral decisions. Every stage has a clear deliverable and acceptance criteria. Tasks are tracked in `tasks.md`. Commits happen after every major stage; pushes happen after every phase.

When this plan and `SPEC.md` conflict, `SPEC.md` wins. Update this plan to match.

---

## Phase 1 — Wrapper Core + CLI + Happy-Path Engineer-Only

**Goal**: Prove the architecture end-to-end. User runs `team new "title"` → captain plans → user approves → engineer implements → wrapper opens PR via `gh`. No scout, tester, reviewer, or git specialist.

### Stage 1.1 — Monorepo Scaffolding

**Deliverable**: Empty but buildable pnpm workspace with all four packages, shared tsconfig, and basic scripts.

**Steps**:
1. Create root `package.json` with `pnpm-workspace.yaml` defining `packages/*`
2. Create `tsconfig.base.json` with strict mode, ESM, path aliases
3. Create `packages/shared/` with `package.json`, `tsconfig.json`, `src/types.ts` (Session, SessionPhase, SessionState, TeamFiles, Meta, WsEvent types from spec sections 4 and 8)
4. Create `packages/wrapper/` with `package.json`, `tsconfig.json`, empty `src/index.ts`
5. Create `packages/cli/` with `package.json`, `tsconfig.json`, empty `src/index.ts`
6. Create `packages/ui/` — skip internals for Phase 1, just `package.json` placeholder
7. Create `agent-prompts/` directory with placeholder `captain.md` and `engineer.md`
8. `pnpm install` succeeds, `pnpm -r build` succeeds (even if output is empty)
9. Add `vitest` to root dev deps, create root `vitest.config.ts`

**Acceptance**: `pnpm install && pnpm -r build` exits 0. TypeScript compiles with no errors.

**Commit**: `feat: scaffold pnpm monorepo with shared, wrapper, cli, ui packages`

---

### Stage 1.2 — Shared Types

**Deliverable**: All core types defined in `packages/shared/src/types.ts`, exported and importable by other packages.

**Steps**:
1. Define `SessionPhase` enum/union: `created | scouting | planning | awaiting_approval | executing | reviewing | done | blocked | killed | cleaned`
2. Define `SessionMeta` type matching `meta.json` schema
3. Define `SessionState` type matching `state.json` schema
4. Define `Session` type (meta + state + runtime info like pid, worktree path)
5. Define `TeamFiles` type (contents of all `.team/` files)
6. Define WebSocket event types: `WsServerEvent` (output, state, team_file, diff, specialist) and `WsClientEvent` (input)
7. Define HTTP request/response types for each API endpoint
8. Define `ViktownError` base error class in `packages/shared/src/errors.ts`
9. Export everything from `packages/shared/src/index.ts`

**Acceptance**: Types compile, are importable from `@viktown/shared` in wrapper and cli packages.

**Commit**: `feat(shared): define core types for sessions, state, events, and errors`

---

### Stage 1.3 — Session ID Generator

**Deliverable**: Human-readable session ID generator (e.g., `quiet-river-42`).

**Steps**:
1. Create `packages/shared/src/session-id.ts`
2. Use adjective-noun-number format: ~50 adjectives, ~50 nouns, 2-digit number
3. Collision check: accept an `existing: Set<string>` param
4. Unit test: generates valid IDs, no collisions in 1000 runs

**Acceptance**: `pnpm test` passes for session ID tests.

**Commit**: `feat(shared): human-readable session ID generator`

---

### Stage 1.4 — Worktree Manager

**Deliverable**: `packages/wrapper/src/worktree.ts` — creates and removes git worktrees for sessions.

**Steps**:
1. Install `simple-git` in wrapper package
2. `createWorktree(sourceRepo: string, sessionId: string)`:
   - Resolves source repo root via `git rev-parse --show-toplevel`
   - Detects default branch via `git symbolic-ref refs/remotes/origin/HEAD` (fallback: `main`)
   - Creates `~/team/sessions/<sessionId>/` directory
   - Runs `git worktree add ~/team/sessions/<sessionId> -b viktown/<sessionId>` from source repo
   - Initializes `.team/` directory with empty files and `meta.json` + initial `state.json`
   - Copies agent prompts: global `~/.claude/agents/*.md`, then source repo `.claude/agents/*.md` (overrides), into worktree `.claude/agents/`
   - Returns worktree path
3. `removeWorktree(sourceRepo: string, sessionId: string)`:
   - Runs `git worktree remove ~/team/sessions/<sessionId>`
   - Cleans up branch `viktown/<sessionId>`
4. `archiveSession(sessionId: string)`:
   - Copies `.team/` to `~/team/archives/<sessionId>/`
5. Unit tests: mock `simple-git`, verify correct commands issued, verify `.team/` structure

**Acceptance**: Tests pass. Manual smoke test against a real repo creates and removes a worktree.

**Commit**: `feat(wrapper): worktree manager for session lifecycle`

---

### Stage 1.5 — Claude Process Manager

**Deliverable**: `packages/wrapper/src/claude-process.ts` — spawns and manages `claude` child processes via `node-pty`.

**Steps**:
1. Install `node-pty` in wrapper package
2. `spawnCaptain(worktreePath: string, captainPromptPath: string)`:
   - Spawns `claude` with `--append-system-prompt` pointing to captain prompt content
   - Sets cwd to worktree path
   - Returns a `CaptainProcess` handle with: `onData(cb)`, `write(input)`, `kill()`, `pid`
3. Handle process lifecycle: track running state, emit events on exit
4. Parse PTY output: strip/preserve ANSI for UI streaming, detect tool usage patterns
5. Unit tests: mock `node-pty`, verify spawn args, verify data flow

**Acceptance**: Tests pass. `CaptainProcess` API is clean and testable.

**Commit**: `feat(wrapper): claude process manager with node-pty`

---

### Stage 1.6 — Team Files Manager

**Deliverable**: `packages/wrapper/src/team-files.ts` — reads `.team/` files and watches for changes.

**Steps**:
1. Install `chokidar` in wrapper package
2. `readTeamFiles(worktreePath: string)`: reads all `.team/` files, returns `TeamFiles` object
3. `readTeamFile(worktreePath: string, filename: string)`: reads single file
4. `watchTeamFiles(worktreePath: string, onChange: (file, content) => void)`: watches `.team/` via chokidar, debounces 200ms, calls handler on change
5. `initTeamFiles(worktreePath: string, meta: SessionMeta)`: writes initial `.team/` structure
6. Unit tests: create temp dir, write files, verify reads; verify watcher fires on changes

**Acceptance**: Tests pass.

**Commit**: `feat(wrapper): team files reader and watcher`

---

### Stage 1.7 — Session Manager

**Deliverable**: `packages/wrapper/src/session-manager.ts` — orchestrates session lifecycle, the central coordinator.

**Steps**:
1. Install `pino` in wrapper package
2. `SessionManager` class (exception to functional preference — this has genuine state):
   - `sessions: Map<string, Session>` — in-memory session registry
   - `createSession(sourceRepo: string, title: string)`: generates ID, calls worktree manager, calls team files init, spawns captain process, registers session, returns session info
   - `getSession(id: string)`: returns session state + team files summary
   - `listSessions()`: returns all sessions with summary info
   - `sendInput(id: string, text: string)`: writes to captain's stdin
   - `approveSession(id: string)`: sends approval message to captain
   - `killSession(id: string)`: kills captain process, sets state to `killed`
   - `cleanSession(id: string)`: archives then removes worktree
   - `archiveSession(id: string)`: copies `.team/` to archives
3. State watching: when `.team/state.json` changes, update in-memory session state, emit events
4. Wire up captain process output to session events (for WebSocket forwarding)
5. Integration tests: mock worktree + claude-process, verify full create→kill lifecycle

**Acceptance**: Tests pass for create, list, get, kill, clean lifecycle.

**Commit**: `feat(wrapper): session manager with full lifecycle`

---

### Stage 1.8 — HTTP API

**Deliverable**: `packages/wrapper/src/server.ts` + `packages/wrapper/src/api/sessions.ts` — Express server with all session endpoints.

**Steps**:
1. Install `express`, `zod` in wrapper package
2. Create Express app in `server.ts` with JSON body parsing, error handler, pino request logging
3. Implement routes in `api/sessions.ts`:
   - `POST /api/sessions` — validates `{ source_repo, title }` with zod, calls session manager
   - `GET /api/sessions` — lists all sessions
   - `GET /api/sessions/:id` — full session detail
   - `POST /api/sessions/:id/input` — forwards text to captain stdin
   - `POST /api/sessions/:id/approve` — triggers approval
   - `POST /api/sessions/:id/kill` — kills session
   - `DELETE /api/sessions/:id` — clean (archive + remove)
   - `POST /api/sessions/:id/archive` — archive only
   - `GET /api/sessions/:id/diff` — runs `git diff` and returns result
   - `GET /api/sessions/:id/team` — returns all `.team/` file contents
   - `GET /api/sessions/:id/team/:file` — returns single `.team/` file
4. Structured error responses using `ViktownError`
5. Integration tests with `supertest`: test each endpoint with mocked session manager

**Acceptance**: All endpoint tests pass. Error cases return proper status codes.

**Commit**: `feat(wrapper): HTTP API with all session endpoints`

---

### Stage 1.9 — WebSocket Server

**Deliverable**: `packages/wrapper/src/api/websocket.ts` — WS server for live session streaming.

**Steps**:
1. Install `ws` in wrapper package
2. Create WebSocket server that upgrades from Express at `/ws/sessions/:id`
3. Server → client: forward captain output chunks, state changes, team file changes, diff updates
4. Client → server: forward input to captain stdin
5. Wire into session manager events: captain output, state.json changes, team file changes
6. Debounce diff updates at 500ms as spec requires
7. Tests: mock WebSocket, verify event flow

**Acceptance**: Tests pass. WebSocket correctly relays events bidirectionally.

**Commit**: `feat(wrapper): WebSocket server for live session streaming`

---

### Stage 1.10 — Wrapper Entry Point

**Deliverable**: `packages/wrapper/src/index.ts` — ties everything together, starts the daemon.

**Steps**:
1. Create entry point that initializes pino logger, session manager, HTTP server, WebSocket server
2. Bind to `127.0.0.1:3001`
3. Log startup info (port, version)
4. Handle SIGINT/SIGTERM: kill all sessions, close server, exit
5. Add `"start"` script to wrapper `package.json`
6. Verify: `pnpm --filter wrapper start` launches the daemon and responds to `GET /api/sessions` with `[]`

**Acceptance**: Daemon starts, responds to HTTP, shuts down cleanly on Ctrl-C.

**Commit**: `feat(wrapper): daemon entry point with graceful shutdown`

---

### Stage 1.11 — Agent Prompts (Captain + Engineer)

**Deliverable**: `agent-prompts/captain.md` and `agent-prompts/engineer.md` with full system prompts.

**Steps**:
1. Write `captain.md`:
   - Role description: orchestrator, planner, dispatcher
   - Phase instructions: scouting (skip in Phase 1), planning (chat with user, write plan.md + tasks.md), awaiting_approval (wait for "approved"), executing (dispatch engineer), done (report completion)
   - `.team/` file conventions: what to write where, when to update state.json
   - Specialist dispatch instructions: use Task tool with engineer agent
   - Must-ask protocol: when to pause and ask user
   - Phase 1 simplification: no scout, no tester, no reviewer, no git specialist; captain handles PR via journal note
2. Write `engineer.md`:
   - Role description: implementer, writes code and unit tests
   - Must read `plan.md` and `context.md` before starting
   - Commit conventions: conventional commits, commit after each task
   - Task tracking: mark `[x]` in `tasks.md`, append to `journal.md`
   - Decision logging: use `decisions.md` for ambiguous choices
   - Restrictions: no `git push`, no `git checkout`, no branch mutations

**Acceptance**: Prompts are complete, follow spec section 5 exactly.

**Commit**: `feat(prompts): captain and engineer system prompts for Phase 1`

---

### Stage 1.12 — CLI: `team start`

**Deliverable**: `packages/cli/src/commands/start.ts` — starts the wrapper daemon.

**Steps**:
1. Install `commander`, `chalk`, `ora` in cli package
2. Create `src/index.ts` with commander program setup
3. `team start`: spawns wrapper as a foreground child process, pipes stdout/stderr, handles Ctrl-C
4. Add `"bin": { "team": "./dist/index.js" }` to cli `package.json`
5. Test: `pnpm --filter cli build && node packages/cli/dist/index.js start` launches wrapper

**Acceptance**: `team start` launches the wrapper daemon, logs appear, Ctrl-C stops it.

**Commit**: `feat(cli): team start command`

---

### Stage 1.13 — CLI: `team new`

**Deliverable**: `packages/cli/src/commands/new.ts` — creates a session and optionally attaches.

**Steps**:
1. `team new "<title>"`:
   - Detects current repo via `git rev-parse --show-toplevel`
   - POSTs to `POST /api/sessions` with `{ source_repo, title }`
   - Prints session ID, title, worktree path
   - By default, attaches to session (see stage 1.14)
   - `--no-attach` flag skips attachment
2. Error handling: not in a git repo, wrapper not running, API error
3. Test: mock HTTP call, verify correct payload

**Acceptance**: `team new "test"` creates a session via wrapper API and prints session info.

**Commit**: `feat(cli): team new command`

---

### Stage 1.14 — CLI: `team attach`

**Deliverable**: `packages/cli/src/commands/attach.ts` — connects to session WebSocket for live chat.

**Steps**:
1. Install `ws` in cli package
2. `team attach <id>`:
   - Opens WebSocket to `ws://127.0.0.1:3001/ws/sessions/<id>`
   - Streams `output` events to stdout (with ANSI preserved)
   - Reads stdin and sends as `input` events
   - Shows `state` events as status line updates
   - Handles disconnect gracefully
3. Also show system events (specialist started/finished) inline

**Acceptance**: Can attach to a running session, see captain output, send messages.

**Commit**: `feat(cli): team attach command with WebSocket streaming`

---

### Stage 1.15 — CLI: Remaining Commands

**Deliverable**: `team list`, `team status`, `team kill`, `team clean`, `team archive`, `team logs`.

**Steps**:
1. `team list`: GET `/api/sessions`, table output with id, title, phase, repo, age
2. `team status <id>`: GET `/api/sessions/:id`, detailed status display
3. `team kill <id>`: POST `/api/sessions/:id/kill`, confirm, print result
4. `team clean <id>`: DELETE `/api/sessions/:id`, confirm, print result
5. `team archive <id>`: POST `/api/sessions/:id/archive`, print result
6. `team logs <id>`: GET `/api/sessions/:id/team/journal.md`, print formatted

**Acceptance**: All commands work against running wrapper.

**Commit**: `feat(cli): list, status, kill, clean, archive, and logs commands`

---

### Stage 1.16 — End-to-End Integration Test

**Deliverable**: A test that proves the full Phase 1 happy path works.

**Steps**:
1. Create a test git repo (temp dir, `git init`, add a file, commit)
2. Start wrapper programmatically
3. Create session via API
4. Verify worktree created with correct structure
5. Verify `.team/` files initialized
6. Verify captain process spawned
7. Send approval input
8. Verify state transitions: `created → planning → awaiting_approval → executing → done`
9. Verify worktree has commits from engineer
10. Verify cleanup works

**Acceptance**: Integration test passes end-to-end.

**Commit**: `test: end-to-end Phase 1 happy path integration test`

---

### Stage 1.17 — Phase 1 Polish & Push

**Steps**:
1. Verify all tests pass: `pnpm test`
2. Verify build: `pnpm -r build`
3. Update `README.md` with Phase 1 getting-started instructions
4. Review all files for `console.log` (replace with pino), `any` types, missing `.js` extensions
5. Update `tasks.md` — all Phase 1 tasks checked off

**Acceptance**: Clean build, all tests pass, README has setup instructions.

**Commit**: `docs: Phase 1 README and cleanup`
**Push**: `git push origin main`

---

## Phase 2 — Full Specialist Roster

**Goal**: Add scout, tester, reviewer, git specialists. Implement the review iteration loop. Full done criteria. All CLI commands working.

### Stage 2.1 — Scout Specialist
- Write `agent-prompts/scout.md` per SPEC.md §5.2 (read-only, tools: Read/Grep/Glob, model: sonnet, produces `context.md`)
- Update session manager to handle `scouting` phase
- Test: scout produces `context.md` from a real repo

### Stage 2.2 — Tester Specialist
- Write `agent-prompts/tester.md` per SPEC.md §5.4 (tools: Read/Write/Edit/Grep/Glob/Bash, model: sonnet, writes integration tests, runs suite, files review.md entries for real bugs)
- Test: tester writes tests and reports results

### Stage 2.3 — Reviewer Specialist
- Write `agent-prompts/reviewer.md` per SPEC.md §5.5 (tools: Read/Grep/Glob/Write, model: sonnet, writes only to .team/review.md, severity buckets: Blocking/Suggestion/Approved)
- Test: reviewer produces `review.md` with correct format

### Stage 2.4 — Git Specialist
- Write `agent-prompts/git.md` per SPEC.md §5.6 (tools: Read/Bash scoped to git+gh, model: haiku, pushes branch, opens PR via `gh pr create`)
- Remove wrapper's direct `gh` PR creation from Phase 1
- Test: git agent pushes and opens PR

### Stage 2.5 — Update Captain & Engineer Prompts for Full Roster
- Rewrite `agent-prompts/captain.md` to:
  - Remove Phase 1 simplifications
  - Dispatch scout during scouting phase (SPEC.md §6 step 2)
  - Dispatch engineer → tester → reviewer in executing phase (SPEC.md §6 step 5)
  - Implement review iteration loop: re-dispatch engineer with review.md, then reviewer again, up to max_review_iterations (SPEC.md §6 step 5)
  - Dispatch git agent on done (SPEC.md §6 step 7)
  - Reference all specialist agents by name for Task tool dispatch
  - Implement stuck protocol and must-ask escalation (SPEC.md §5.1)
- Update `agent-prompts/engineer.md` to:
  - Reference all other specialists it interacts with (reviewer feedback in review.md, tester bug reports)
  - Ensure review.md addressing instructions are complete per SPEC.md §4.2

### Stage 2.6 — Done Criteria & Blocked State
- Implement full done criteria check per SPEC.md §6 step 6: all tasks `[x]`, review approved (no blockers), tests green
- Implement `blocked` state: max review iterations, must-ask hits, fatal errors (SPEC.md §6 failure modes)
- Notification system: write to `~/team/notifications/` on block (SPEC.md §5.1)
- Test: verify blocked state triggers on max iterations

### Stage 2.7 — Phase 2 Integration Test & Push
- End-to-end test with all specialists
- All Phase 2 tasks checked off
- Push

---

## Phase 3 — Web UI

**Goal**: React SPA with three-column layout, live chat, live diff, agent status.

### Stage 3.1 — Vite + React + Tailwind Setup
- Initialize Vite React app in `packages/ui/`
- Tailwind CSS, dark mode default
- Basic layout shell: three columns, placeholder content

### Stage 3.2 — API Client & State Management
- `packages/ui/src/api.ts` — HTTP client wrapping all wrapper endpoints
- Zustand store: sessions list, selected session, team files, diff

### Stage 3.3 — WebSocket Hook
- `useWebSocket(sessionId)` — connects, dispatches events to zustand store
- Auto-reconnect on disconnect

### Stage 3.4 — Left Column: Session List + Agent Status
- `SessionList.tsx` — lists sessions, click to select
- `AgentList.tsx` — shows specialist status for selected session
- `NewSessionModal.tsx` — create new session

### Stage 3.5 — Middle Column: Chat
- `Chat.tsx` — renders captain conversation with markdown
- Message types: user, captain, system events
- Input area with send button, approve button during `awaiting_approval`

### Stage 3.6 — Right Column: Diff + Artifacts
- `DiffPanel.tsx` — file tree + side-by-side diff
- `TeamArtifactPanel.tsx` — toggle between Plan, Review, Journal, Decisions
- Show plan during `awaiting_approval`, diff during execution

### Stage 3.7 — Wrapper: Serve UI
- Configure wrapper to serve built UI static files at `/`
- Add proxy/dev config for Vite dev server during development

### Stage 3.8 — Phase 3 Integration Test & Push
- Manual smoke test of full UI workflow
- All Phase 3 tasks checked off
- Push

---

## Phase 4 — Ship It

**Goal**: Fix every gap that would prevent a user from cloning this repo, installing, running `team new "title"` in a different repo, and having the full orchestrator work end-to-end.

### Stage 4.1 — Captain Task Tool Dispatch (CRITICAL)

**Problem**: The captain prompt says "dispatch scout" but never shows the actual Claude Code Task tool syntax. The captain won't know how to invoke subagents.

**Deliverable**: Updated `agent-prompts/captain.md` with explicit Task tool invocation examples.

**Steps**:
1. Add a `## How to dispatch specialists` section to captain.md with:
   - The exact Task tool syntax Claude Code expects: `subagent_type` must match the agent filename (e.g., `"scout"` maps to `.claude/agents/scout.md`)
   - A concrete example showing how to dispatch scout with instructions
   - A concrete example showing parallel dispatch (multiple Task calls in one message)
2. Ensure agent names in the prompt exactly match the filenames in `agent-prompts/` (scout, engineer, tester, reviewer, git)
3. Verify each specialist prompt has a `description` field in its YAML frontmatter that Claude Code can display

**Acceptance**: Captain prompt contains unambiguous Task tool dispatch instructions that Claude Code can act on.

**Commit**: `fix(prompts): add explicit Task tool dispatch syntax to captain`

---

### Stage 4.2 — Live Diff Events

**Problem**: Wrapper only serves diffs on HTTP GET. Spec says diffs should stream over WebSocket, debounced at 500ms.

**Deliverable**: Session manager emits `diff` WsServerEvents when files change in the worktree.

**Steps**:
1. In `session-manager.ts`, add a diff polling mechanism:
   - When any team file changes (file watcher fires), schedule a debounced diff recalculation (500ms)
   - Run `git diff source_branch...HEAD` and compare with last emitted diff
   - If changed, emit `{ type: 'diff', diff }` WsServerEvent
2. Store the last emitted diff per session to avoid sending duplicates
3. Test: modify a file in a test worktree, verify diff event is emitted after debounce

**Acceptance**: UI receives live diff updates without polling.

**Commit**: `feat(wrapper): emit live diff events over WebSocket with 500ms debounce`

---

### Stage 4.3 — Auto-Cleanup on Done

**Problem**: Spec section 6 says wrapper should auto-archive and remove worktree when phase hits `done`, after a grace period. Currently sessions stay in memory forever.

**Deliverable**: Session manager reacts to `done` phase transition by archiving and cleaning up.

**Steps**:
1. In the state.json watcher (session-manager.ts), detect transition to `done`
2. After a 30-second grace period (to let the user see the final state):
   - Run `archiveSession(id)` to save `.team/` to `~/team/archives/<id>/`
   - Run worktree removal
   - Remove session from in-memory registry
   - Emit a final state event with phase `cleaned`
3. If the captain process is still running when `done` fires, wait for it to exit first
4. Test: write state.json with `done` phase, verify archive created and session cleaned after grace period

**Acceptance**: Done sessions auto-clean. User can still find archived `.team/` files at `~/team/archives/<id>/`.

**Commit**: `feat(wrapper): auto-archive and cleanup on done state`

---

### Stage 4.4 — Global CLI Installation

**Problem**: Users have to run `node packages/cli/dist/index.js` instead of `team`. Need proper global installation.

**Deliverable**: `team` command works globally after install.

**Steps**:
1. Add shebang `#!/usr/bin/env node` to `packages/cli/src/index.ts` (must survive compilation)
2. Ensure `packages/cli/package.json` has correct `"bin": { "team": "./dist/index.js" }`
3. Add a root-level `setup.sh` script that:
   - Runs `pnpm install && pnpm -r build`
   - Runs `pnpm link --global --filter @viktown/cli` to make `team` available globally
   - Verifies `team --help` works
4. Test: run setup.sh, then run `team list` from a random directory — should connect to wrapper

**Acceptance**: After running `setup.sh`, `team` is available globally in any terminal.

**Commit**: `feat(cli): global installation via pnpm link`

---

### Stage 4.5 — Notification Surface

**Problem**: Wrapper writes `~/team/notifications/<id>.json` when sessions block, but nothing reads them.

**Deliverable**: Notifications endpoint in wrapper + notification display in UI + CLI notification check.

**Steps**:
1. **Wrapper**: Add `GET /api/notifications` endpoint:
   - Reads `~/team/notifications/*.json`
   - Returns array of notification objects sorted by timestamp (newest first)
   - Add `DELETE /api/notifications/:id` to dismiss
2. **UI**: Add `NotificationBanner.tsx` component:
   - Polls `/api/notifications` every 10s
   - Shows a dismissible banner at the top of the screen for each blocked session
   - Banner includes session title, reason, and a "Go to session" button that selects it
   - Amber/warning color to match the `blocked` phase badge
3. **CLI**: Add `team notifications` command:
   - Lists all pending notifications with session ID, title, and reason
   - `team notifications --clear` removes all notification files
4. Add notification API routes, wire UI component into App.tsx

**Acceptance**: When a session blocks, user sees it in both UI (banner) and CLI (`team notifications`).

**Commit**: `feat: notification surface for blocked sessions (API + UI + CLI)`

---

### Stage 4.6 — Diff Panel: File Tree + Side-by-Side

**Problem**: Spec section 9.4 says "file list with M/A/D indicators, click to focus" and "side-by-side diff". Currently just colored text.

**Deliverable**: DiffPanel with file tree and per-file diff view.

**Steps**:
1. Parse the unified diff string to extract individual files with their status (M/A/D) and hunks
2. Create a `DiffFileTree.tsx` component:
   - Lists changed files with status badges (green A, yellow M, red D)
   - Click a file to focus its diff below
   - Highlight the selected file
3. Update `DiffPanel.tsx`:
   - Top section: file tree
   - Bottom section: focused file's diff with +/- coloring (keep current coloring approach, just scoped to one file)
   - When no file is selected, show full diff
4. Install `react-diff-viewer-continued` if side-by-side is feasible without excessive bundle size, otherwise keep the current inline diff but scoped per file

**Acceptance**: User can see which files changed (M/A/D), click one, and see its diff. Works with live WebSocket updates.

**Commit**: `feat(ui): diff panel with file tree and per-file view`

---

### Stage 4.7 — Error Messaging & Recovery

**Problem**: CLI doesn't gracefully handle wrapper-not-running, bad session IDs, network errors, etc. Wrapper returns raw errors.

**Deliverable**: Structured error handling throughout CLI and wrapper.

**Steps**:
1. **CLI**: Improve error messages in `api-client.ts`:
   - Connection refused → "Wrapper not running. Start it with: team start"
   - 404 → "Session '<id>' not found. Run 'team list' to see active sessions."
   - 409 → "Session '<id>' is still active. Kill it first with: team kill <id>"
   - Timeout → "Wrapper not responding. Check if it's running."
2. **CLI**: Add `--json` flag to all commands for scriptable output
3. **Wrapper**: Ensure all error responses use the `ErrorResponse` type from shared types
4. **Wrapper**: Handle captain process crashes gracefully — set phase to `blocked` with reason "Captain process crashed"
5. Test error paths: bad session ID, wrapper not running, active session operations

**Acceptance**: Every CLI error produces a helpful, actionable message. No raw stack traces shown to users.

**Commit**: `fix: structured error handling across CLI and wrapper`

---

### Stage 4.8 — README & Setup Guide

**Problem**: README shows `node packages/cli/dist/index.js` paths. Needs real install/usage instructions for someone who wants to use this on their own repo.

**Deliverable**: README that takes a user from clone to running `team new` in their own project.

**Steps**:
1. Rewrite README with sections:
   - **What is Viktown**: 2-sentence overview
   - **Prerequisites**: Node 22+, pnpm 11+, `claude` CLI authenticated, `gh` CLI authenticated
   - **Install**: `git clone`, `./setup.sh` (from stage 4.4), verify with `team --help`
   - **Quick start**: `team start` in one terminal, `team new "title"` in another (from inside any git repo), open `http://localhost:3001` for web UI
   - **Commands**: table of all `team` commands with one-line descriptions
   - **How it works**: brief description of the captain→specialist flow, link to SPEC.md for details
   - **Web UI**: screenshot placeholder, description of three-column layout
   - **Architecture**: package overview (keep existing, clean up)
2. Remove all `node packages/cli/dist/index.js` paths — everything should use `team` command
3. Add a `CONTRIBUTING.md` or dev section for developing viktown itself

**Acceptance**: A developer can follow the README from scratch and have `team` working in under 5 minutes.

**Commit**: `docs: rewrite README with install and quick start guide`

---

### Stage 4.9 — End-to-End Smoke Test & Push

**Deliverable**: Verify the full flow works, push Phase 4.

**Steps**:
1. From a test repo, run the full flow:
   - `team start` — wrapper starts
   - `team new "Add hello world endpoint"` — session created, captain starts chatting
   - Verify captain dispatches scout via Task tool
   - Verify captain plans and asks for approval
   - Verify UI shows session at `http://localhost:3001`
   - Approve plan, verify engineers dispatch
   - Check `team notifications` works
   - Check `team list`, `team status`, `team logs` all work
2. Fix any issues found during smoke test
3. All tasks checked off in tasks.md
4. Final push

**Acceptance**: Full end-to-end flow works from `team new` to PR opened.

**Commit**: `chore: Phase 4 complete — full orchestrator ready`

---

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Human-readable session IDs (`quiet-river-42`) | User preference, better UX in UI and CLI |
| 2 | `node-pty` for captain (interactive), `.team/` file watching for state | Interactivity + readability per user request; spec-aligned |
| 3 | Node 22 + pnpm 11 | pnpm 11 requires Node ≥22.13; future-proofs the project |
| 4 | `gh auth login` for GitHub auth | Already configured on user's machine, no PAT management needed |
