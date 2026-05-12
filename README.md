# my-team

Multi-agent orchestration for Claude Code. Spin up a team of AI specialists that plan, code, test, review, and ship a PR — all from one command.

Landing page → [docs-olive-eight-29.vercel.app](https://docs-olive-eight-29.vercel.app/)

The live site has a tabbed "Get started" walkthrough — Quickstart, Agent (use my-team to set up my-team), and Remote (control sessions from your phone).

## Quickstart

Three commands. Then walk away.

```bash
git clone https://github.com/vik-srinivasan/my-team.git
```
> Public repo. No auth needed.

```bash
cd my-team && ./setup.sh
```
> Builds packages and links the `team` CLI globally. Needs Node 22 and pnpm 11.

```bash
team new "Add user authentication"
```
> From inside any git repo. Creates a worktree, spawns the captain, drops you into chat.

Then start the daemon in a second terminal:

```bash
team start
```

Then `team attach <id>` from any terminal to rejoin the chat.

### Prerequisites

- **Node.js 22+** (`node -v`)
- **pnpm 11+** (`pnpm -v`)
- **Claude Code** installed and authenticated (`claude --version`)
- **GitHub CLI** authenticated (`gh auth status`)

## The team

Six agents share a session. The captain drives; the rest are dispatched as Claude Code subagents via the Task tool.

- **Captain** — The conversational anchor. Plans the work with you, dispatches specialists, ferries feedback, decides when the session is done.
- **Scout** — Read-only. Maps the codebase before any code is written, surfacing the files, conventions, and gotchas that shape the plan.
- **Engineer** — Implements the plan task by task. Writes unit tests beside the code, commits to the session branch, leaves a journal entry for the next agent.
- **Tester** — Adds integration coverage, runs the full suite, files reproducible bug reports as severity-bucketed findings.
- **Reviewer** — Quality gate. Reads the diff, flags blocking issues, leaves suggestions, and either approves or sends fixes back to the engineer.
- **Git** — Final mile. Pushes the session branch, opens a pull request with a written summary, hands you back a link.

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
| `team open <id>` | Open a session worktree in VS Code |
| `team archive <id>` | Archive `.team/` files |
| `team clean <id>` | Remove session worktree |
| `team purge <id>` | Kill and clean a session in one step |
| `team notifications` | Show blocked session alerts |
| `team notifications --clear` | Clear all notifications |
| `team help` | Show this help summary |

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
team new my-app --new                    # local repo only
team new my-app --new --github           # also runs `gh repo create --private` and pushes
team new my-app --new --github --public  # public GitHub repo
```

The directory is created relative to your current working directory. Bootstrap errors leave the filesystem in place so you can inspect or fix and rerun.

## How it works

Each session creates a git worktree at `~/team/sessions/<id>/` and spawns a captain. Agents communicate through a small set of shared files under `.team/` — `plan.md`, `tasks.md`, `journal.md`, `review.md`, `decisions.md`, plus `meta.json` and `state.json`. The captain dispatches scout, engineer, tester, reviewer, and git as subagents via the Task tool, reading their output back from those files. You can read them too.

A live session looks roughly like this:

```
$ team new "Add user authentication"
  [my-team] creating worktree at ~/team/sessions/calm-river-12
  [my-team] spawning captain (claude-opus-4)…
  captain › I'll scout the repo, draft a plan, and check in. Anything specific to call out?
$ > JWT, please. RS256.
  captain › Got it. Dispatching scout.
  [scout] reading 47 files in src/auth, src/middleware…
  captain › Plan ready. Approve to dispatch the team?
$ approve
  [engineer] feat(auth): add JWT signing service
  [tester] 14 specs passing, 1 flake fixed
  [reviewer] approved — 0 blocking, 2 suggestions
  [git] PR opened → github.com/you/repo/pull/482
```

See `SPEC.md` for the full specification.

## Architecture

```
packages/
├── shared/    — Core types, errors, session ID generator
├── wrapper/   — Daemon: HTTP API, WebSocket, session & worktree management
└── cli/       — 'team' CLI (thin HTTP client)

agent-prompts/ — Specialist definitions (.claude/agents/*.md format)
```

## API

The daemon binds to `127.0.0.1:3001`:

- **HTTP** — REST endpoints for session CRUD, input, approve, diff, team files (the `team` CLI is the primary consumer)
- **WebSocket** — `ws://127.0.0.1:3001/ws/sessions/:id` — the channel `team attach` uses to stream captain output and send input back

See `SPEC.md` section 8 for full API documentation.

## Development

```bash
pnpm install
pnpm -r build
pnpm test          # Run all tests (vitest)
```

## Key dependencies

- `node-pty` — Spawns `claude` with a real PTY for interactive output
- `simple-git` — Git worktree operations
- `chokidar` — Filesystem watching for `.team/` state changes
- `express` + `ws` — HTTP and WebSocket server
