## 2026-05-13T00:25:00Z — captain
Action: Session started. Title: "keep-session-open" — make my-team sessions continue after PR is opened so the user can give follow-up feedback, fix merge conflicts, or add changes, and have the captain still drive `.team/` updates and specialist dispatch.

Dispatching scout to map the full lifecycle (not just the captain prompt): wrapper, CLI, watch view, hooks, state machine, worktree cleanup, notifications. Need to know what assumes `done` is terminal beyond the captain prompt itself.

## 2026-05-13T00:33:00Z — captain
Action: Scout returned. Headline finding: the actual blocker is `scheduleCleanup` in `packages/wrapper/src/session-manager.ts:L231-L233` — a 30s auto-cleanup timer with no cancel handle that nukes the worktree + local branch on `done`. Captain prompt issues are downstream of that.

Wrote `.team/context.md` with full file-by-file breakdown. Phase → planning.

## 2026-05-13T00:38:00Z — captain
Action: Plan drafted. User chose: one PR, standard effort, hard-delete the timer (no cancellable variant). Phase → awaiting_approval.

## 2026-05-13T00:40:00Z — captain
Action: Plan approved by user ("go"). Beginning execution. Dispatching two engineers in parallel — Engineer A on wrapper code, Engineer B on prompts + docs. Phase → executing.

## 2026-05-13T00:55:21Z — engineer (B)
Action: Investigated `agent-prompts/` vs `.claude/agents/` mirroring. Findings:
- No build script / symlink / copy-on-commit mechanism. Both directories are edited by hand.
- `packages/wrapper/src/worktree.ts:L131-L142` (`copyAgentPrompts`) is the only consumer: on session creation, it copies `agent-prompts/*.md` (repo-root, the source of truth for future sessions) into `<worktree>/.claude/agents/`, then overlays `~/.claude/agents/*.md` (global) and `<source-repo>/.claude/agents/*.md` (repo override).
- For THIS running session the captain is reading from `<worktree>/.claude/agents/captain.md` — the snapshot taken at session start.
- Captain.md is byte-identical across both copies. Engineer/tester.md differ slightly because of past partial updates.
- Conclusion: `agent-prompts/` is authoritative for future sessions, but I have to also edit `.claude/agents/` in this worktree so other agents in *this* session see the changes if they re-read prompts. Editing both keeps history honest and matches the existing pattern (every prior prompt commit touched both paths in lockstep — see `git log` on `agent-prompts/captain.md` vs `.claude/agents/captain.md`).
Decision: edit both copies for every prompt change.

## 2026-05-13T00:55:35Z — engineer (A)
Completed: Wrapper auto-cleanup removal. Deleted the `oldState.phase !== 'done' && newState.phase === 'done'` branch in the state.json watcher and removed the entire `scheduleCleanup` private method. `cleanSession` (used by DELETE /api/sessions/:id and `team purge`) is untouched. `grep -rn 'scheduleCleanup' packages/` returns zero references.
Modified: packages/wrapper/src/session-manager.ts, packages/wrapper/src/server.test.ts
Tests: Added an integration regression in `server.test.ts` ("transitioning to phase: done does NOT auto-clean the session") that writes a done state.json, waits for chokidar, asserts the session is still in `team list` with its worktree on disk, then exercises killSession + cleanSession to confirm the explicit teardown path still removes the worktree and evicts from the registry.
Verified: `pnpm --filter @my-team/shared build` + `pnpm --filter @my-team/wrapper build` (typecheck) clean; full `pnpm test` 146/146 passing.
Commit: 5dd515d

## 2026-05-13T00:59:15Z — engineer (B)
Completed: All prompt-edit + docs tasks (Engineering → Prompt edits + Engineering → Docs).
Created: nothing new — all edits are in place.
Modified:
- `agent-prompts/captain.md` (also mirrored to `.claude/agents/captain.md`):
  - New step at top of Done phase guards against double `gh pr create` via `gh pr view --json url,number`.
  - New step 9 writes the PR URL to `.team/pr.url` after open.
  - User-facing closing line in step 11 tells the user the session stays alive and points at `team purge`.
  - New `## Phase: Follow-up` section added before `## Phase: Blocked`. Covers triage (small fix → executing; bigger ask → planning), round counter detection / append, dispatch hints (specialists read latest `## Follow-up round N`), and round-wrap (no `gh pr create`, just push + optional `gh pr comment`, flip back to done).
  - "Allowed and blocked git commands" relaxed for merge-conflict resolution: `git merge origin/<base>` and `git checkout <file>` allowed in the narrow documented workflow. Added a `#### Merge-conflict resolution workflow` subsection with the five-step playbook. `git rebase`, `reset --hard`, force-push, `branch -D`, `checkout <branch>` still blocked.
  - "After plan approval, GO ALL THE WAY TO PR" rule softened to clarify it applies to the initial run; follow-up rounds end by updating the existing PR.
- `agent-prompts/engineer.md` (also mirrored to `.claude/agents/engineer.md`):
  - "Before you start" step 3: if `tasks.md` has `## Round N` / `## Follow-up round N` headers, read the LATEST.
  - Rules: narrow merge-conflict exception — engineer may run `git merge` and `git checkout <file>` only when explicitly dispatched to resolve conflicts; the rest of the bans (rebase, reset --hard, push --force, branch -D, checkout <branch>, push) remain.
- `SPEC.md`:
  - §4 phase diagram and lifecycle paragraph: `done` is soft-terminal, cycles back via follow-up rounds; wrapper does NOT auto-clean.
  - §6 workflow: step 7 (PR) updated to mention `.team/pr.url` + session-stays-alive note; new step 8 (Follow-up, repeatable); new step 9 (Cleanup is user-driven via `team purge` / `team clean`). Old auto-cleanup paragraph removed.
- `.team/tasks.md`: my tasks `[x]`.
Verified (no edit):
- `agent-prompts/reviewer.md` already appends `# Review pass N` (line 68: "Append a new review pass section to `.team/review.md`"). `.claude/agents/reviewer.md` is byte-identical to it.
- `README.md` has no done-auto-cleanup language to remove.

Mirroring investigation finding: there is no copy script / symlink / build step between `agent-prompts/` and `.claude/agents/`. The wrapper (`worktree.ts:copyAgentPrompts`) reads from `agent-prompts/` at session-creation time and copies into the worktree's `.claude/agents/`. So `agent-prompts/` is authoritative for FUTURE sessions, while `<worktree>/.claude/agents/` is a snapshot consumed by the running captain in THIS session. The repo-root `.claude/agents/` (where this session's captain is reading from right now, since we're operating inside the worktree) was kept in lockstep historically by hand. I followed the same hand-mirror pattern — every prompt change in this PR touches both copies.

Commits:
- 5300a3d feat(captain): add follow-up phase, PR-create guard, merge-conflict workflow
- 6bc402c feat(prompts,spec): support follow-up rounds and merge-conflict resolution

No preview — purely prompt/spec/docs text changes; nothing visual to render.

## 2026-05-13T01:00:00Z — captain
Action: Both engineers returned. Three commits land on the branch (5dd515d wrapper, 5300a3d captain prompt, 6bc402c prompts+spec). All engineer tasks complete. Phase → reviewing. Dispatching tester + reviewer in parallel at standard effort.

## 2026-05-13T01:05:00Z — tester
Completed: Full build + test suite run; regression test review; new DELETE route integration test.
Tests written: packages/wrapper/src/server.test.ts (added "DELETE /api/sessions/:id on a done session removes worktree and evicts from registry")
Tests passed: 147
Tests failed: 0
Bugs filed: none

Details:
- `pnpm --filter @my-team/shared build` + `pnpm --filter @my-team/wrapper build` + `pnpm --filter @my-team/cli build` all clean (tsc, no errors).
- `pnpm test` — 147/147 passing across 18 test files.
- Engineer A's existing regression test ("transitioning to phase: done does NOT auto-clean the session") is strong: it verifies the session stays in GET /api/sessions, the worktree exists on disk, and that explicit killSession + cleanSession (direct call) removes the worktree and evicts the session. Not just "no crash".
- Gap found and filled: the existing test used cleanSession directly; the HTTP DELETE /api/sessions/:id route (which is what `team purge` and `team clean` go through) had no HTTP-layer coverage. Added a new integration test that: creates a session, flips to done, kills the captain via POST /api/sessions/:id/kill, DELETEs via the HTTP route, then asserts worktree is gone from disk, session absent from GET /api/sessions list, and GET /api/sessions/:id returns 404 SESSION_NOT_FOUND.
- No remaining references to `scheduleCleanup` anywhere in packages/ (grep confirms).
- CLI smoke-check: `node packages/cli/dist/index.js --help` renders full command list cleanly; `purge` and `clean` both present.
