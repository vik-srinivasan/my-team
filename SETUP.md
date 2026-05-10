# Viktown Setup Guide

How to set up Viktown and use it with any git repository.

## Prerequisites

You need these installed before starting:

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 22+ | `node -v` |
| pnpm | 11+ | `pnpm -v` |
| Claude Code | latest | `claude --version` |
| GitHub CLI | latest | `gh auth status` |

### Installing prerequisites (macOS)

```bash
# Node.js 22 via nvm
nvm install 22
nvm use 22

# pnpm
brew install pnpm

# Claude Code (if not installed)
npm install -g @anthropic-ai/claude-code

# GitHub CLI
brew install gh
gh auth login
```

## Installation

```bash
git clone https://github.com/vik-srinivasan/viktown.git
cd viktown
./setup.sh
```

`setup.sh` will:
1. Verify all prerequisites
2. Install dependencies (`pnpm install`)
3. Build all packages (shared, wrapper, cli, ui)
4. Link the `team` CLI globally via `pnpm link`
5. Create `~/team/sessions/`, `~/team/archives/`, `~/team/notifications/`

Verify the install:

```bash
team --help
```

If `team` is not found, add pnpm's global bin to your PATH:

```bash
export PATH="$(pnpm bin -g):$PATH"
```

Add that line to your `~/.zshrc` or `~/.bashrc` to make it permanent.

## Usage

### 1. Start the daemon

In a dedicated terminal:

```bash
team start
```

This starts the wrapper daemon on `http://127.0.0.1:3001`. It manages all sessions, spawns Claude processes, and serves the web UI. Keep this running.

### 2. Create a session

Open another terminal, navigate to **any git repo**, and create a session:

```bash
cd ~/code/my-project
team new "Add user authentication with JWT"
```

This will:
- Create a git worktree at `~/team/sessions/<session-id>/`
- Branch off your repo's default branch (main/master)
- Spawn a captain agent that starts chatting with you
- Drop you into the captain's chat in your terminal

### 3. Chat with the captain

The captain will:
1. **Scout** your codebase (read-only exploration)
2. **Draft a plan** with goals, approach, tasks, and acceptance criteria
3. **Ask for approval** — review the plan and type `approved`, `go`, or `lgtm`

### 4. Walk away

After approval, the captain autonomously:
- Dispatches **engineers** to implement (can parallelize independent tasks)
- Dispatches the **tester** for integration tests
- Dispatches the **reviewer** for code review
- Loops through review iterations if there are blockers
- Dispatches the **git agent** to push and open a PR

### 5. Check on progress

```bash
# List all sessions
team list

# Detailed status
team status <session-id>

# Re-attach to chat
team attach <session-id>

# View journal
team logs <session-id>

# Check for blocked sessions
team notifications
```

### 6. Web UI

Open [http://localhost:3001](http://localhost:3001) in your browser for the full dashboard:
- **Left column**: Session list + agent status
- **Middle column**: Live chat with the captain (markdown rendered)
- **Right column**: Live diff viewer with file tree, plus Plan/Review/Journal/Decisions tabs

## Managing Sessions

```bash
# Kill a running session (preserves worktree)
team kill <session-id>

# Archive .team/ files to ~/team/archives/
team archive <session-id>

# Remove the worktree entirely (archives first)
team clean <session-id>

# Clear all notifications
team notifications --clear
```

## Directory Layout

After running, your filesystem looks like:

```
~/team/
├── sessions/          # Active session worktrees
│   └── quiet-river-42/
│       ├── (repo files)
│       ├── .team/     # Shared state files
│       └── .claude/agents/  # Specialist definitions
├── archives/          # Archived .team/ dirs from completed sessions
│   └── quiet-river-42/
└── notifications/     # JSON files for blocked session alerts
```

## Customizing Agent Prompts

Viktown's agent prompts live in `viktown/agent-prompts/`. You can override them per-repo:

1. Create `.claude/agents/` in your source repo
2. Add any specialist file (e.g., `engineer.md`) with your custom prompt
3. Your repo's prompts take priority over Viktown's defaults

Priority order (last wins):
1. Viktown built-in (`viktown/agent-prompts/`)
2. Global (`~/.claude/agents/`)
3. Source repo (`.claude/agents/` in the repo you run `team new` from)

## Troubleshooting

### `team` command not found
```bash
export PATH="$(pnpm bin -g):$PATH"
```

### Wrapper not running
```bash
# Error: "Cannot connect to wrapper daemon"
# Solution: Start it
team start
```

### Session stuck / captain crashed
```bash
# Check notifications
team notifications

# Kill and retry
team kill <session-id>
team clean <session-id>
team new "same task title"
```

### Build failures
```bash
# Rebuild everything
cd /path/to/viktown
pnpm install
pnpm --filter @viktown/shared build
pnpm --filter @viktown/wrapper build
pnpm --filter @viktown/cli build
```

### Tests
```bash
cd /path/to/viktown
pnpm test
```

## How It Works (Technical)

1. **Wrapper daemon** (Node.js) manages all sessions via HTTP API + WebSocket
2. **Captain** is a `claude` CLI process spawned with `--append-system-prompt` via `node-pty`
3. **Specialists** are Claude Code subagents (`.claude/agents/*.md`) invoked by the captain via the Task tool
4. **Communication** is file-based: agents read/write `.team/` files, the wrapper watches with `chokidar` and streams changes
5. **Isolation**: Each session gets its own git worktree on a `viktown/<id>` branch — your main branch is never touched
6. **Cleanup**: When a session finishes, the worktree is archived and removed after a 30-second grace period
