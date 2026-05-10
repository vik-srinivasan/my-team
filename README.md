# Viktown

Multi-agent orchestrator for Claude Code. Turns Claude Code into a coordinated team of specialists that plan, implement, test, review, and ship code autonomously.

## Prerequisites

- Node.js 22+
- pnpm 11+
- `claude` CLI (Claude Code) installed and authenticated
- `gh` CLI authenticated (`gh auth login`)

## Setup

```bash
pnpm install
pnpm -r build
```

## Usage

### Start the wrapper daemon

```bash
node packages/wrapper/dist/index.js
```

Or via the CLI (after building):

```bash
node packages/cli/dist/index.js start
```

### Create a session

From inside a git repository:

```bash
node packages/cli/dist/index.js new "Add fog of war to map rendering"
```

### Other commands

```bash
node packages/cli/dist/index.js list          # List all sessions
node packages/cli/dist/index.js status <id>   # Detailed session status
node packages/cli/dist/index.js attach <id>   # Attach to session chat
node packages/cli/dist/index.js kill <id>     # Terminate a session
node packages/cli/dist/index.js logs <id>     # Print journal entries
node packages/cli/dist/index.js archive <id>  # Archive .team/ directory
node packages/cli/dist/index.js clean <id>    # Remove session worktree
```

### API

The wrapper daemon serves HTTP on `http://127.0.0.1:3001` and WebSocket on `ws://127.0.0.1:3001/ws/sessions/:id`.

See `SPEC.md` section 8 for full API documentation.

## Testing

```bash
pnpm test
```

## Architecture

See `SPEC.md` for the full specification.

**Packages:**
- `packages/shared` — Core types, errors, utilities
- `packages/wrapper` — Daemon: HTTP API, WebSocket, session management, worktree management
- `packages/cli` — `team` CLI commands
- `packages/ui` — Web UI (Phase 3)

**Agent prompts:**
- `agent-prompts/captain.md` — Session orchestrator
- `agent-prompts/engineer.md` — Implementation specialist

## Non-obvious dependencies

- `node-pty` — Spawns `claude` with a real PTY for interactive output
- `simple-git` — Git worktree operations
- `chokidar` — Filesystem watching for `.team/` file changes
