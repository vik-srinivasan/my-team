# my-team — Multi-Agent Orchestrator for Claude Code

## 1. Overview

my-team is a local multi-agent orchestrator that turns Claude Code into a coordinated team of specialists. The user chats with a "captain" agent to plan a piece of work, approves the plan, then walks away. A team of specialists (engineer, tester, reviewer) executes the plan inside an isolated git worktree, communicates through shared files in a `.team/` directory, and the captain opens a pull request when done. The user oversees through a CLI (`team new`, `team attach`, `team status`, etc.).

The system runs entirely on the user's Mac for v1. Long-running execution survives terminal closes, SSH disconnects, and wrapper restarts (via a daemon). It does not yet survive machine sleep or shutdown — that's a future "deploy to a small server" upgrade that does not change any of this code.

All Claude calls go through the `claude` CLI (Claude Code), which means the user's Claude Max subscription covers them. No direct Anthropic API usage anywhere in the codebase. No `ANTHROPIC_API_KEY` reads.

## 2. Glossary

- **Captain**: The main `claude` process the user chats with. Plans the work, dispatches specialists, ferries feedback, decides when the session is done. One per session.
- **Specialist**: A Claude Code subagent defined in `.claude/agents/<name>.md`. Has its own system prompt, tool allowlist, and model. Invoked by the captain via the Task tool.
- **Team**: The captain plus its specialists for one session. Always: captain + scout + engineer + tester + reviewer.
- **Session**: One unit of work, from "I want feature X" through PR opened. Has its own git worktree, branch, and `.team/` directory.
- **Worktree**: A git worktree created at `~/team/sessions/<session-id>/`, checked out to a session-specific branch off the source repo's main branch.
- **`.team/` directory**: Shared file-based state inside the worktree. How specialists communicate without talking to each other directly.
- **Wrapper**: The Node.js daemon that manages sessions, spawns `claude` processes, and serves the CLI.
- **Source repo**: The repo the user runs `team new` from. The session's worktree is created from this repo.
- **Scout**: A read-only specialist used only during the planning phase to produce `context.md`. Never modifies files.

## 3. Architecture

```
              ┌─────────────────────┐
              │  CLI (`team` cmd)   │
              └──────────┬──────────┘
                         │ HTTP + WebSocket
                         ▼
              ┌──────────────────────┐
              │  Wrapper daemon      │
              │  (Node + TypeScript) │
              │  - HTTP API          │
              │  - WS server         │
              │  - Session manager   │
              │  - Worktree manager  │
              └──────┬───────────────┘
                     │ spawns
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
   ┌────────┐    ┌────────┐    ┌────────┐
   │ claude │    │ claude │    │ claude │
   │  ses 1 │    │  ses 2 │    │  ses N │
   └────────┘    └────────┘    └────────┘
   each captain dispatches specialists via Task tool
   inside its own process
```

The wrapper is a long-running Node daemon. It owns:
- The list of active sessions and their state
- One `claude` child process per session (spawned via `node-pty`)
- The HTTP API and WebSocket server
- Worktree creation and cleanup

The CLI is a thin HTTP client. It calls the wrapper's API and prints output. It does not manage state itself. `team attach <id>` upgrades to a WebSocket so the user can stream captain output and send input from the terminal.

Specialists are not separate processes. They are Claude Code subagents (`.claude/agents/*.md`) invoked by the captain via Claude Code's built-in Task tool. Specialists share the captain's token budget and inherit its working directory (the worktree). The captain can dispatch multiple specialists in parallel by including multiple Task tool calls in a single message — e.g., scouting the codebase while chatting with the user, or running multiple engineers on independent tasks simultaneously.

When the wrapper dies (crash or restart), the `claude` child processes also die. Recovery is manual for v1: the user can re-attach to the worktree's git state, but in-flight conversation is lost. The `.team/journal.md` makes resuming non-trivial-but-possible. Daemon resilience is a v1.5 concern.

## 4. Data model

### 4.1 Worktree layout

Each session lives at `~/team/sessions/<session-id>/`. Inside:

```
~/team/sessions/abc123/
├── <full clone of source repo at session branch>
├── .team/
│   ├── meta.json
│   ├── plan.md
│   ├── context.md
│   ├── tasks.md
│   ├── journal.md
│   ├── review.md
│   ├── decisions.md
│   └── state.json
└── .claude/agents/  (specialist definitions for this session)
```

The session branch is `my-team/<session-id>` off the source repo's default branch.

### 4.2 `.team/` files

**`meta.json`** — written once at session start, never modified.
```json
{
  "id": "abc123",
  "title": "Add fog of war to map rendering",
  "source_repo": "/Users/dom/code/wyvern",
  "source_branch": "main",
  "session_branch": "my-team/abc123",
  "created_at": "2026-05-09T10:30:00Z"
}
```

**`plan.md`** — captain writes during planning, locked after user approval. Markdown. Includes goals, approach, file-level scope, must-ask items, and the agreed acceptance criteria.

**`context.md`** — scout writes once during planning. Codebase exploration findings: relevant files, existing conventions, related tests, dependencies the work will touch.

**`tasks.md`** — captain writes during planning, specialists check off as they complete. Format:
```markdown
## Engineering
- [ ] @engineer Set up search endpoint scaffolding
- [ ] @engineer Wire up API route to existing query builder

## Testing
- [ ] @tester Integration tests for /search endpoint
- [ ] @tester Full suite green

## Review
- [ ] @reviewer Review query builder for SQL injection
- [ ] @reviewer Final approval pass

## Git
- [ ] @captain Open PR
```
Specialists mark `[x]` when complete and add brief notes if needed. Captain may add tasks during execution if scope grows.

**`journal.md`** — append-only log. Every meaningful action by every agent. One entry per action:
```markdown
## 2026-05-09T10:42:13Z — engineer
Completed: Set up search endpoint scaffolding
Created: src/api/search.ts (skeleton)
Modified: src/api/index.ts (registered route)
Commit: a1b2c3d

## 2026-05-09T10:48:01Z — engineer
Decision: Used existing AuthMiddleware rather than adding a new one. See decisions.md.
```
This is the resume key if the wrapper restarts. The captain on relaunch reads this to figure out where the team was.

**`review.md`** — reviewer writes, engineer reads. File:line-style comments grouped by severity:
```markdown
# Review pass 1 — 2026-05-09T11:12:00Z

## Blocking
### src/api/search.ts:34
The `userInput` is concatenated into the SQL query. Use parameterized queries via the existing `db.query` helper.

### src/api/search.ts:67
`results` can be `null` here; the `.map` will throw.

## Suggestions
### src/api/search.ts:12
Consider extracting the validation logic into a separate function for testability.

## Approved
The pagination logic in src/api/search.ts:80-95 looks clean.
```
Each review pass appends a new section. Engineer addresses blockers, may address or skip suggestions, replies inline with `> resolved: <commit>` or `> skipped: <reason>`.

**`decisions.md`** — append-only. When any specialist hits genuine ambiguity and makes a judgment call, it's logged here:
```markdown
## 2026-05-09T10:48:01Z — engineer
Question: Should auth middleware be applied to /search?
Options considered: (1) reuse AuthMiddleware (2) make endpoint public (3) ask captain.
Decision: Reused AuthMiddleware — plan said "follow existing endpoint conventions" and all neighboring endpoints use it.
```

**`state.json`** — machine-readable session state. Updated by wrapper and captain.
```json
{
  "phase": "executing",
  "active_specialist": "engineer",
  "review_iterations": 0,
  "max_review_iterations": 8,
  "last_checkpoint": "2026-05-09T10:48:01Z",
  "blockers": [],
  "must_ask_pending": []  // captain → human queue; drives `team watch` AT column
}
```

Each session worktree's `.claude/settings.json` registers a `UserPromptSubmit` hook that resets `must_ask_pending` to `[]` whenever the user submits a message, so the captain only has to push entries — clearing is mechanical. Pre-existing sessions created before this hook was introduced do not get it; only new sessions benefit from the auto-clear behavior.

### 4.3 Session phases (state machine)

```
created → scouting → planning → awaiting_approval → executing → reviewing
                                       │                  ↑          │
                                       │                  └──────────┘
                                       │              (review iteration)
                                       ▼
                                   rejected

executing/reviewing → done ⇆ planning/executing (follow-up rounds)
                  └→ blocked (must_ask hit, max iterations hit, or fatal)
                  └→ killed (user terminated)
```

`done` is a soft-terminal state. The session, worktree, and captain stay alive after the PR is opened. If the user sends another message, the captain re-enters `planning` or `executing` for a follow-up round (see the captain prompt's "Phase: Follow-up" section). Finalisation is user-driven: `team purge <id>` (or `team kill` + `team clean`) removes the worktree.

Phase transitions are written to `state.json` and `journal.md`. The wrapper watches `state.json` for transitions to drive lifecycle hooks (e.g., on `blocked`, send notification). The wrapper does NOT auto-clean on `done` — that's the user's explicit signal.

## 5. Specialist roster

All specialist definitions live at `~/.claude/agents/<name>.md` by default (global, applied to every session). A repo can override by dropping its own `.claude/agents/<name>.md`, which the wrapper will copy into the worktree at session start, taking precedence over the global one.

Each definition is a markdown file with YAML frontmatter:
```markdown
---
name: 
description: 
model: 
tools:
---

[detailed system prompt]
```

The four specialists plus captain (the captain also handles the final push + PR itself):

### 5.1 Captain
- **Where defined**: Not as a subagent. The captain's system prompt is injected via `--append-system-prompt` when the wrapper spawns `claude`.
- **Model**: most recent opus model with highest context (default in Claude Code; do not override unless cost becomes a concern)
- **Tools**: All standard Claude Code tools. Captain needs broad access for orchestration but should not directly write source files — that's engineer's job.
- **Role**:
  - Phase: scouting → calls scout subagent, ingests `context.md`
  - Phase: planning → chats with user, drafts `plan.md` and `tasks.md`, flags must-ask items
  - Phase: awaiting_approval → presents plan, waits for explicit "approved"
  - Phase: executing → dispatches engineer, then tester, then reviewer; ferries `review.md` feedback back to engineer; loops until done criteria met
  - Phase: done → pushes the session branch and opens the PR itself (no subagent), then marks state done
- **Stuck protocol**: When a specialist escalates, captain decides. When a must-ask item is hit, captain pauses session and writes a notification (v1: file at `~/team/notifications/`, surfaced via `team notifications`).

### 5.2 Scout
- **Tools**: Read, Grep, Glob (no Write, no Edit, no Bash)
- **Model**: most recent sonnet model (research, doesn't need Opus)
- **Role**: One-shot. Captain dispatches with a brief description of the upcoming work. Scout explores the codebase and produces `.team/context.md`. Must include: relevant files, existing conventions in the area, related tests, libraries/frameworks in use that touch this work, anything surprising or fragile.
- **System prompt highlights**:
  - "You are read-only. Never modify any file."
  - "Output goes to `.team/context.md`. Be concise — one or two pages."
  - "Bias toward citing file:line references over describing in prose."

### 5.3 Engineer
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Model**: most recent opus model with highest context
- **Role**: Implements the plan. Writes feature code and accompanying unit tests. Commits to the session branch. Marks tasks done in `tasks.md`. Logs ambiguous decisions in `decisions.md`. Reads `review.md` and addresses blockers when captain re-dispatches.
- **Bash restrictions** (prompt-level, not enforced): may run `git add`, `git commit`, build commands, test commands. Must not run `git push`, `git checkout`, `git rebase`, `git merge`, `git reset --hard`, or anything that mutates branch structure. Those are reserved for the captain.
- **Stuck protocol**: Make the most reasonable choice based on `plan.md` and `context.md`, log the decision in `decisions.md`, continue. Only escalate to captain if the choice would meaningfully change scope or break the plan.
- **System prompt highlights**:
  - "You implement features. You commit your work. You do not push branches or open PRs."
  - "When you finish a task, mark it `[x]` in `.team/tasks.md` and append an entry to `.team/journal.md`."
  - "When ambiguous, prefer the option closest to existing conventions in `context.md`. Log it in `decisions.md`. Move on."

### 5.4 Tester
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Model**: most recent sonnet model
- **Role**: Writes integration tests, runs the full test suite, hunts edge cases the engineer may have missed. Distinct from engineer's unit tests. Final responsibility: the suite is green. If tests fail because of engineer code, files a `review.md` entry. If tests fail because of bad tests, fixes them.
- **System prompt highlights**:
  - "You are responsible for the test suite being green at session end."
  - "Engineer writes unit tests for their own code. You write integration tests and stress edge cases."
  - "If you find a real bug while testing, do not fix it — file a `review.md` entry."

### 5.5 Reviewer
- **Tools**: Read, Grep, Glob, Write
- **Model**: most recent sonnet model
- **Role**: Reads the engineer's code with fresh eyes. Produces `review.md`. Categorizes findings as Blocking (must fix before merge), Suggestion (engineer's call), or Approved (positive callouts). Final pass produces an explicit "approved" verdict if no blockers remain.
- **Tool restriction is prompt-level**: reviewer has Write, but the prompt strictly forbids writing anywhere except `.team/review.md`.
- **System prompt highlights**:
  - "You may write to `.team/review.md` and nowhere else. Never modify source files."
  - "Be thorough on first pass. Subsequent passes only check whether prior blockers were addressed plus any new code."
  - "Format: file:line headers, severity buckets (Blocking, Suggestion, Approved)."

## 6. Workflow phases

The end-to-end happy path:

**1. Session creation.** User runs `team new "<title>"` from inside a source repo. The wrapper:
- Generates a session ID (8-char hex)
- Creates `~/team/sessions/<id>/` via `git worktree add`, branch `my-team/<id>` off the source repo's default branch
- Copies global `~/.claude/agents/*.md` into the worktree's `.claude/agents/` directory; if the source repo has its own `.claude/agents/`, those override
- Initializes `.team/` with empty `tasks.md`, `journal.md`, `review.md`, `decisions.md`, and writes `meta.json` and initial `state.json` (phase: `scouting`)
- Spawns `claude` in the worktree with the captain system prompt appended
- Prints the session ID and drops the user into the captain's chat

**2. Scouting + Planning.** Captain dispatches scout in the background and immediately begins chatting with the user (no waiting). Scout produces `context.md` which enriches the plan. Captain drafts `plan.md` and `tasks.md`. Captain identifies must-ask items and surfaces them in chat. State → `awaiting_approval`.

**3. Approval.** User says some variant of "approved" / "go" / "ship it". Captain locks the plan (writes a note to `journal.md`) and transitions state → `executing`.

**4. Execution.** Captain dispatches specialists, parallelizing where tasks are independent:
- Engineers (multiple in parallel if tasks are independent; single if sequential)
- Tester (can start once early engineering tasks are complete)
- Reviewer (runs after all engineers and testers finish; produces `review.md`)

If reviewer returns blockers, captain re-dispatches engineer with the `review.md` brief. Engineer addresses blockers, marks resolutions inline in `review.md`, commits. Captain re-dispatches reviewer for a follow-up pass. Loop until reviewer returns no blockers OR `review_iterations` hits `max_review_iterations` (default 8).

If tester reports failures during the loop, captain may insert another engineer pass to address them.

**6. Done criteria.** All three must be true to ship:
- Every task in `tasks.md` is `[x]`
- `review.md` has a final "approved, no blockers" verdict
- Tester reports the full suite green

State → `done`. Captain handles the PR phase itself (no subagent dispatch).

**7. PR.** Captain pushes the session branch, runs `gh pr create` with a body built from `plan.md`, `journal.md`, `decisions.md`, and `review.md`, writes the resulting PR URL to `.team/pr.url`, marks the PR task done, and writes a final journal entry. State → `done`. The captain's closing message tells the user the session is still alive and points at `team purge` for cleanup.

**8. Follow-up (optional, repeatable).** Any user message received while `phase === "done"` re-engages the captain. The captain triages: small fix → flip phase straight to `executing`; bigger ask → `planning`. A new `## Follow-up round N` section is appended to `journal.md`, `plan.md`, and `tasks.md`. Specialists are dispatched against the new round's tasks and are told explicitly to read the latest round (not the original tasks). The reviewer appends a new `# Review pass N` to `review.md` as usual. When the round wraps, the captain pushes commits to the existing branch — `git push origin <branch>` — and the open PR auto-updates. The captain MUST NOT call `gh pr create` again (guarded by a `gh pr view` check at the top of the Done phase); for the user-visible round summary it may optionally `gh pr comment`. State returns to `done`. Repeat as many times as the user wants.

**9. Cleanup (user-driven).** The wrapper does NOT auto-remove worktrees. The user explicitly finalises a session by running `team purge <id>` (kill + clean) or `team clean <id>` (just clean, after `team kill`). Either path archives `.team/` to `~/team/archives/<id>/` and removes the worktree + local branch. The PR on GitHub is unaffected.

**Failure modes:**
- `max_review_iterations` hit → state `blocked`, captain notifies user, no PR pushed, worktree preserved.
- Must-ask hit during execution → state `blocked`, captain notifies, worktree preserved.
- Engineer/tester/reviewer fatal error (e.g., code can't compile after multiple attempts) → captain decides whether to escalate to user or try a different approach. If unrecoverable, state `blocked`.
- Wrapper crash → all child `claude` processes die. State files persist. Sessions can be inspected manually but cannot resume in v1.
- User runs `team kill <id>` → state `killed`, processes terminated, worktree preserved (until `team clean`).

## 7. CLI commands

The CLI binary is `team`. All commands talk to the wrapper over HTTP at `http://127.0.0.1:3001`.

| Command | Description |
|---|---|
| `team start` | Start the wrapper daemon in the foreground. Prints logs to stdout. Ctrl-C to stop. (v1.5: `team start --daemon` for background.) |
| `team new "<title>"` | Create a new session for the current working directory's repo. Drops the user into the captain chat by default (`--no-attach` to skip). |
| `team list` | List all sessions: id, title, source repo, phase, age. |
| `team status <id>` | Detailed status for one session: phase, active specialist, last journal entry, current blockers. |
| `team attach <id>` | Re-attach to a session's chat in the terminal. (v1: streams the captain's output and lets user send input. Implemented via WebSocket from CLI to wrapper.) |
| `team kill <id>` | Terminate a session. Worktree preserved. |
| `team clean <id>` | Remove a session's worktree. Refuses if session is active (must `kill` first). Archives `.team/` first. |
| `team archive <id>` | Copy `.team/` to `~/team/archives/<id>/` without removing the worktree. |
| `team logs <id>` | Print recent journal entries. |

Working-directory rule for `team new`: must be inside a git repo; that repo is the source repo. The wrapper resolves the repo root via `git rev-parse --show-toplevel`.

## 8. HTTP / WebSocket API

The wrapper serves both. The CLI uses HTTP for everything except `team attach`, which upgrades to a WebSocket.

### 8.1 HTTP endpoints

```
POST   /api/sessions             { source_repo, title } -> { id, ... }
GET    /api/sessions             -> [ { id, title, phase, ... } ]
GET    /api/sessions/:id         -> { full session state including .team/ summary }
POST   /api/sessions/:id/input   { text } -> 202 (forwards to captain stdin)
POST   /api/sessions/:id/approve -> 202 (sets state from awaiting_approval to executing)
POST   /api/sessions/:id/kill    -> 202
DELETE /api/sessions/:id         -> 200 (clean)
POST   /api/sessions/:id/archive -> 200

GET    /api/sessions/:id/diff    -> { diff: "..." } (git diff session_branch..base)
GET    /api/sessions/:id/team    -> .team/ file contents { plan, tasks, journal, ... }
GET    /api/sessions/:id/team/:file -> raw file content
```

### 8.2 WebSocket

`ws://127.0.0.1:3001/ws/sessions/:id` — bidirectional stream for one session.

Server → client events:
```ts
{ type: "output", text: string }                 // captain stdout chunk
{ type: "state", state: SessionState }           // state.json changed
{ type: "team_file", file: string, content: string }  // .team/ file changed
{ type: "diff", diff: string }                    // git diff updated
{ type: "specialist", name: string, status: "started" | "finished" }
```

Client → server events:
```ts
{ type: "input", text: string }                  // user message to captain
```

The wrapper watches `.team/state.json` and `.team/*.md` via `chokidar` (filesystem watcher) and emits events on changes. Diff updates are debounced 500ms.

## 9. Auth and binding

Wrapper binds to `127.0.0.1:3001` only. No auth needed — the loopback interface is the boundary. v1.5 will add LAN binding plus a shared-secret token if accessed remotely.

## 10. File layout

Single repo, Node monorepo with workspaces.

```
my-team/
├── package.json                     (root, defines workspaces)
├── tsconfig.base.json
├── SPEC.md                          (this file)
├── CLAUDE.md                        (project conventions)
├── README.md
│
├── packages/
│   ├── wrapper/                     (the daemon)
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts             (entry point)
│   │   │   ├── server.ts            (HTTP + WS)
│   │   │   ├── session-manager.ts   (lifecycle)
│   │   │   ├── worktree.ts          (git worktree ops)
│   │   │   ├── claude-process.ts    (node-pty wrapper)
│   │   │   ├── team-files.ts        (.team/ readers/watchers)
│   │   │   ├── api/
│   │   │   │   ├── sessions.ts      (HTTP routes)
│   │   │   │   └── websocket.ts     (WS handler)
│   │   │   └── types.ts
│   │   └── tests/
│   │
│   ├── cli/                         (the `team` command)
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts             (commander setup)
│   │   │   └── commands/
│   │   │       ├── new.ts
│   │   │       ├── list.ts
│   │   │       ├── status.ts
│   │   │       ├── attach.ts
│   │   │       ├── kill.ts
│   │   │       ├── clean.ts
│   │   │       └── archive.ts
│   │   └── tests/
│   │
│   └── shared/                      (types + utils used by all)
│       ├── package.json
│       └── src/
│           └── types.ts             (Session, State, etc.)
│
└── agent-prompts/                   (specialist definitions)
    ├── captain.md                   (injected via --append-system-prompt)
    ├── scout.md
    ├── engineer.md
    ├── tester.md
    └── reviewer.md
```

The wrapper installs/copies `agent-prompts/*.md` into `~/.claude/agents/` on first run (and the captain prompt path is referenced when spawning each session's `claude`).

## 11. Tech stack

**Runtime**: Node.js 20+. TypeScript 5.x with strict mode. ESM modules.

**Wrapper**:
- `express` for HTTP
- `ws` for WebSocket
- `node-pty` for spawning `claude` with a real pty (line-buffered output, ANSI handling, etc.)
- `simple-git` for worktree operations
- `chokidar` for `.team/` file watching
- `pino` for structured logging
- `zod` for API schema validation
- `commander` for CLI argument parsing

**CLI**:
- `commander`
- `chalk` for colored output
- `ora` for spinners
- `ws` for `team attach`'s WebSocket connection

**Other**:
- `@github/gh` (the `gh` CLI) — required on the host. Captain uses it for PR creation.
- `pnpm` for the monorepo (workspace support is cleaner than npm).
- `vitest` for tests across all packages.

## 12. Phasing

The build order is roughly:

**Phase 1 — Wrapper core + CLI + happy path engineer-only.** No specialists beyond engineer. No reviewer or tester. Captain plans → engineer executes → engineer commits → wrapper opens PR via direct `gh` call. This proves the architecture works end-to-end on a hello-world repo. Should fit one or two `claude` sessions.

**Phase 2 — Full specialist roster.** Add scout, tester, reviewer. Implement the review iteration loop. Implement done criteria. Implement `team kill`/`status`/`logs`. Implement archiving and cleanup.

**Phase 3 — Polish.** Better error messaging, recovery from common failure modes, rate-limit awareness (warn before exhausting Max usage), notification surface for blocked sessions, README and a short demo.

Start each phase with a minimal end-to-end happy-path test, then layer in features and edge cases.

## 13. Out of scope for v1

Explicitly not building these now. Don't let scope creep happen mid-build:

- Hetzner / DigitalOcean / cloud deployment. v1 runs on the user's Mac.
- Tauri / Electron desktop wrapper. The web app is the deliverable; bundling comes later.
- True parallel specialists (multi-process). Specialists run sequentially via Claude Code subagents.
- Cross-machine session migration.
- Multi-user support, permissions, or auth. Wrapper binds to `127.0.0.1`.
- Mobile-specific UI. Responsive design is a v1.5 concern.
- Cost tracking and rate-limit enforcement. v1 ignores token costs and Max usage windows.
- Persistent across wrapper restart (in-flight conversation recovery). v1 only persists git state.
- LLM-driven session resumption. Manual recovery is fine for v1.
- Plugins, custom workflow phases, custom specialist roles. The 4-specialist + captain shape is fixed for v1.
- Windows / Linux support beyond what works incidentally. Build for macOS first.
- A `gh` alternative for non-GitHub forges. GitHub only.

## 14. Open questions to resolve early

These are flagged for the first build session — Claude Code should ask about them before writing too much code:

1. **macOS keychain vs PAT in `.env`.** Where does `gh` get its token? Probably easiest to require the user to run `gh auth login` once, separately, and let `gh` find its own credentials. Confirm.
2. **Session ID format.** 8-char hex (e.g., `a1b2c3d4`) or human-readable (e.g., `quiet-river-42`)? Lean readable so the CLI is easier to type — but a deterministic short hex might be easier. Pick one and stay consistent.
3. **`claude` invocation flags.** Confirm what flags are needed to (a) inject the captain system prompt, (b) get clean machine-readable output for the wrapper to parse vs ANSI for the terminal to render. Try `--append-system-prompt`, `--output-format json` (if it exists in the version installed), and fall back to raw pty output otherwise.
4. **Worktree base branch.** Default to the source repo's default branch (read via `gh repo view --json defaultBranch`). Allow override via `team new --base <branch>` later but not in v1.

## Future / Out of Scope

The following was descoped on 2026-05-12. It may return as a future phase. Captured here to preserve design intent.

### Section 9 — UI (descoped)

## 9. UI

A React SPA served by the wrapper. Three columns, full viewport height, dark mode by default.

### 9.1 Layout

```
┌─────────┬──────────────────────────┬──────────────────────┐
│ LEFT    │  MIDDLE                  │  RIGHT               │
│         │                          │                      │
│ Sessions│  Chat with captain       │  Diff view           │
│ list    │  (markdown rendered)     │  (file tree +        │
│         │                          │   side-by-side diff) │
│ [Active]│  ┌────────────────────┐  │                      │
│ - abc1  │  │ captain message    │  │                      │
│ * def2  │  │ user message       │  │                      │
│ - ghi3  │  │ captain message    │  │                      │
│         │  └────────────────────┘  │                      │
│ Agents  │                          │                      │
│ for *   │                          │                      │
│ - cap   │  ┌────────────────────┐  │                      │
│ - scout │  │ prompt input       │  │                      │
│ - eng   │  └────────────────────┘  │                      │
│ - tester│                          │                      │
│ - rev   │                          │                      │
└─────────┴──────────────────────────┴──────────────────────┘
```

### 9.2 Left column

Two stacked sections.

**Sessions** (top): list of all sessions ordered by most recent activity. Each row shows title (truncated), phase badge, source repo name. Click selects.

**Agents** (bottom, only when a session is selected): five rows — captain, scout, engineer, tester, reviewer. Each shows current status: `idle`, `active` (currently running), `done`, `blocked`. Clicking does not switch chats — there's only one chat (with captain). It scrolls the middle column to the most recent message from that specialist if any.

A `+ New session` button at the bottom opens a modal: source repo picker (file dialog), title input, submit. The wrapper validates the path is a git repo and creates the session.

### 9.3 Middle column

Chat with captain. Messages rendered as markdown using `react-markdown` with `remark-gfm` (tables, task lists, strikethrough). Code blocks get syntax highlighting via `rehype-highlight`.

Message types:
- User messages (right-aligned, accent color)
- Captain messages (left-aligned, default)
- System events ("Engineer started working on task 3", muted, italic, full-width)

Prompt input at the bottom: textarea, multiline, Enter to send, Shift+Enter for newline. While the captain is in `awaiting_approval`, an "Approve plan" button appears next to the input as a shortcut for sending "approved".

### 9.4 Right column

Live git diff between the session branch and the base branch.

Top: file list with status indicators (M, A, D). Click a file to focus it.

Below: side-by-side diff for the focused file. Use `react-diff-viewer-continued` or similar.

The diff updates live via WebSocket events. Debounced to avoid thrashing during rapid commits.

If the session is `awaiting_approval`, the right column shows `plan.md` rendered as markdown instead of the diff (because there's no diff yet). After approval, it switches to diff view.

A small toolbar at the top of the right column lets the user toggle between: Diff / Plan / Review (renders `review.md`) / Journal / Decisions. Diff is default during execution; Plan is default during planning.

### 9.5 Auth and binding

Wrapper binds to `127.0.0.1:3001` only. No auth needed — the loopback interface is the boundary. v1.5 will add LAN binding plus a shared-secret token if accessed remotely.

### 9.6 Styling

Tailwind CSS. Dark mode default with light mode toggle. `lucide-react` for icons. Use the system's monospace font for code/diff areas. The aesthetic should be utilitarian, not decorative — this is a tool, not a marketing page.

### Phase 3 — Web UI (descoped)

**Phase 3 — Web UI.** React app, three-column layout, live chat via WebSocket, live diff panel, agent status sidebar. Reads from existing wrapper API; no wrapper changes required (or only minor additions like the `/team/:file` endpoint).
