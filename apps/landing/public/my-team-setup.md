# my-team — setup guide for coding agents

You are a coding agent helping a developer install and run **my-team**, a tool that orchestrates a team of Claude Code agents (captain, scout, engineer, tester, reviewer, git) inside a git worktree.

Execute the steps below in order. After each command, verify the expected output before moving on. If a prereq is missing, install it for the user's platform and confirm with them before proceeding.

---

## 1. Verify prerequisites

Run each and confirm the version meets the minimum:

| Command | Required |
|---|---|
| `node -v` | v22 or newer |
| `pnpm -v` | v11 or newer |
| `claude --version` | any (the Claude Code CLI must be installed and authenticated) |
| `gh auth status` | must show "Logged in to github.com" |

If `node` is below 22: install via `nvm install 22 && nvm use 22`.
If `pnpm` is missing: `brew install pnpm` (macOS) or `npm install -g pnpm`.
If `claude` is missing: `npm install -g @anthropic-ai/claude-code` then `claude` once to log in.
If `gh` is missing: `brew install gh` then `gh auth login`.

---

## 2. Clone and bootstrap

```bash
git clone https://github.com/vik-srinivasan/my-team.git ~/.my-team
cd ~/.my-team
./setup.sh
```

`setup.sh` installs deps, builds all packages, and links the `team` CLI globally via `pnpm link`.

---

## 3. Verify install

```bash
team --help
```

If the shell reports `team: command not found`, add pnpm's global bin to PATH:

```bash
echo 'export PATH="$(pnpm bin -g):$PATH"' >> ~/.zshrc && source ~/.zshrc
```

Re-run `team --help` and confirm the workflow summary prints.

---

## 4. First run

Open two terminals.

**Terminal 1 — daemon:**
```bash
team start
```
Wait for `wrapper listening on http://127.0.0.1:3001` and `ready`. Leave this running.

**Terminal 2 — your project:**
```bash
cd <path-to-any-git-repo>
team new "<one-line description of what you want built>"
```

This creates a session worktree at `~/team/sessions/<id>/` on branch `my-team/<id>`, and drops you into a chat with the captain.

---

## 5. What the team does

The captain orchestrates specialists in this order: **scout** (maps the codebase) → **planning** (proposes a plan; you approve) → **engineer(s)** (write code, can run in parallel) → **tester** + **reviewer** (parallel) → **git** (push + open PR).

Inspect any session's state via the `.team/` directory inside its worktree:
- `meta.json` — session id, title, source repo
- `state.json` — phase, active specialist, blockers
- `plan.md` — the approved plan
- `tasks.md` — checklist with `@role` assignments
- `journal.md` — append-only log of every step

---

## 6. Useful commands

- `team list` — all sessions
- `team status <id>` — phase + blockers for one session
- `team attach <id>` — re-attach the captain chat in any terminal (Ctrl+] to detach)
- `team notifications` — see if any captain is blocked waiting on you
- `team logs <id>` — print the journal
- `team open <id>` — open the worktree in VS Code
- `team purge <id>` — kill + clean a finished session

---

## When things go wrong

- **Daemon won't start / port in use:** kill any stray process on 3001, then `team start` again.
- **Captain seems stuck:** `team status <id>` to see the phase; `team logs <id>` for the journal.
- **You disagree with the plan:** answer the captain in chat — it will revise before executing.

---

## Reporting back to the user

Once `team --help` works and `team start` is running, tell the user:

> my-team is installed. Run `team new "<title>"` from any git repo to start your first session.
