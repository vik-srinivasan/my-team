# my-team

Multi-agent orchestrator for Claude Code. Turns Claude Code into a coordinated team of specialists that plan, implement, test, review, and ship code — all from a single command.

## Prerequisites

- **Node.js 22+** (`node -v`)
- **pnpm 11+** (`pnpm -v`)
- **Claude Code** installed and authenticated (`claude --version`)
- **GitHub CLI** authenticated (`gh auth status`)

## Install

```bash
git clone https://github.com/vik-srinivasan/my-team.git
cd my-team
./setup.sh
```

This builds all packages and makes the `team` command available globally. Verify with:

```bash
team --help
```

## Quick Start

**Terminal 1** — Start the daemon:

```bash
team start
```

**Terminal 2** — Create a session from any git repo:

```bash
cd /path/to/your/project
team new "Add user authentication"
```

This creates an isolated worktree, spawns a captain agent, and drops you into the chat. The captain will:
1. Scout the codebase
2. Draft a plan and ask for your approval
3. Dispatch engineers, testers, and reviewers
4. Open a PR when everything passes

**Web UI** — Open [http://localhost:3001](http://localhost:3001) for the full dashboard with live chat, diff viewer, and agent status.

## Commands

| Command | Description |
|---|---|
| `team start` | Start the wrapper daemon |
| `team new "<title>"` | Create a session in the current repo |
| `team new <shortcut> "<title>"` | Create a session against a known repo basename (no `cd` needed) |
| `team new <name> --new` | Bootstrap a new project (`mkdir` + `git init` + initial commit) and start a session |
| `team list` | List all active sessions |
| `team list-past` | List source repos used in past sessions (works without the daemon) |
| `team status <id>` | Detailed status for one session |
| `team attach <id>` | Re-attach to a session's chat |
| `team kill <id>` | Terminate a session |
| `team logs <id>` | Print recent journal entries |
| `team archive <id>` | Archive `.team/` files |
| `team clean <id>` | Remove session worktree |
| `team notifications` | Show blocked session alerts |

### Recents and shortcuts

Every successful `team new` records its source repo in `~/team/recents.json`. Browse history with:

```bash
team list-past             # table view
team list-past --json      # machine-readable
```

If you've used a repo before, you can launch a session against it from anywhere by basename:

```bash
team new my-team "Refactor wrapper logging"
```

This resolves `my-team` to its known path. If multiple recorded repos share the same basename, you'll get an error listing the candidates — just `cd` to the one you want and use the single-arg form.

### Bootstrap a new project

Skip the manual `mkdir` + `git init` dance:

```bash
team new my-app --new                  # local repo only
team new my-app --new --github         # also runs `gh repo create --private` and pushes
team new my-app --new --github --public  # public GitHub repo
```

The directory is created relative to your current working directory. Bootstrap errors leave the filesystem in place so you can inspect or fix and rerun.

## How It Works

Each session creates a git worktree at `~/team/sessions/<id>/` with a team of six agents:

- **Captain** — Orchestrates the session. Plans work, dispatches specialists, ferries feedback.
- **Scout** — Read-only. Explores the codebase and produces context for the plan.
- **Engineer** — Implements features, writes unit tests, commits to the session branch.
- **Tester** — Writes integration tests, runs the full suite, reports bugs.
- **Reviewer** — Reviews code with severity-bucketed findings. Quality gate.
- **Git** — Pushes the branch and opens a PR. Final phase only.

Agents communicate via shared files in `.team/` (plan, tasks, journal, review, decisions). The captain dispatches specialists as Claude Code subagents via the Task tool.

See `SPEC.md` for the full specification.

## Web UI

Three-column layout:
- **Left** — Session list + agent status panel
- **Middle** — Live chat with the captain (markdown rendered)
- **Right** — Diff viewer with file tree (M/A/D indicators) + plan/review/journal tabs

## Architecture

```
packages/
├── shared/    — Core types, errors, session ID generator
├── wrapper/   — Daemon: HTTP API, WebSocket, session & worktree management
├── cli/       — 'team' CLI (thin HTTP client)
└── ui/        — React SPA (Vite + Tailwind + Zustand)

agent-prompts/ — Specialist definitions (.claude/agents/*.md format)
```

## API

The daemon binds to `127.0.0.1:3001`:
- **HTTP** — REST endpoints for session CRUD, input, approve, diff, team files
- **WebSocket** — `ws://127.0.0.1:3001/ws/sessions/:id` for live streaming

See `SPEC.md` section 8 for full API documentation.

## Development

```bash
pnpm install
pnpm -r build
pnpm test          # Run all tests (vitest)

# Dev mode for UI
cd packages/ui && pnpm dev   # Vite dev server with hot reload (proxies to wrapper)
```

## Key Dependencies

- `node-pty` — Spawns `claude` with a real PTY for interactive output
- `simple-git` — Git worktree operations
- `chokidar` — Filesystem watching for `.team/` state changes
- `express` + `ws` — HTTP and WebSocket server
- `zustand` — Client state management
- `react-markdown` — Markdown rendering in chat
