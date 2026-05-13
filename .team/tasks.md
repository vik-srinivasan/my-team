# Tasks — keep-session-open

## Engineering

### Wrapper code
- [x] @engineer Remove auto-cleanup trigger in `packages/wrapper/src/session-manager.ts` (the `oldState.phase !== 'done' && newState.phase === 'done'` block around L231-L233).
- [x] @engineer Delete the now-unused `scheduleCleanup` method in `packages/wrapper/src/session-manager.ts` (around L482–L516). Verify it has no other callers. (grep across repo confirms zero remaining references.)
- [x] @engineer Verify `cleanSession` is still called by the DELETE route and `team purge`, and that path still works. (Unit-test regression added in `server.test.ts` exercises `cleanSession` end-to-end.)

### Prompt edits
- [ ] @engineer Update `agent-prompts/captain.md` Done phase: change the closing user-facing message to mention the session stays alive and how to finalise (`team purge <id>`).
- [ ] @engineer Add a new "Phase: Follow-up" section to `agent-prompts/captain.md` after the Done phase, describing re-engagement: flip phase, append `## Follow-up round N` headers to `journal.md` / `plan.md` / `tasks.md`, dispatch specialists for the round, push commits (PR auto-updates), optionally `gh pr comment` the round summary.
- [ ] @engineer Guard the captain's `gh pr create` call so it does not run twice: check `gh pr view --json url,number` first; on a hit, skip create and just push.
- [ ] @engineer Have the captain write the final PR URL to `.team/pr.url` (one line) after PR open. Update the captain's Done phase to do this.
- [ ] @engineer Relax the captain's blocked-git-commands list to allow `git merge` and `git checkout <file>` for the narrow merge-conflict-resolution workflow. Keep `git rebase`, `git reset --hard`, `git push --force`, `git branch -D` blocked. Document the workflow inline.
- [ ] @engineer Mirror the same merge-conflict allowlist relaxation in `agent-prompts/engineer.md` if needed; engineer must be able to stage and commit conflict resolutions.
- [ ] @engineer Add a note to `agent-prompts/engineer.md` telling the engineer to read the most-recent `## Round N` section in `tasks.md` (not the first).
- [ ] @engineer Verify `agent-prompts/reviewer.md` already appends `# Review pass N`. If it overwrites, fix to append.
- [ ] @engineer Verify how `agent-prompts/` is mirrored to `.claude/agents/` (build step? copy script?) and update the authoritative source so both stay in sync.

### Docs
- [ ] @engineer Update `SPEC.md` section 12 (around L298) to remove the auto-cleanup-on-done step and replace with explicit `team purge` / `team clean` for finalisation; mention follow-up rounds.
- [ ] @engineer Scan `README.md` for any mention of done-lifecycle / auto-cleanup and update if present (otherwise leave alone).

## Testing
- [ ] @tester Build the wrapper and run the full test suite — confirm no regressions.
- [ ] @tester Add a unit/integration test in `packages/wrapper/src/__tests__/` (or wherever wrapper tests live) that asserts: transitioning a session to `phase: done` does NOT trigger any cleanup, and the session remains in the manager's registry indefinitely.
- [ ] @tester Add a test that `cleanSession` (invoked via the API DELETE route or directly) still removes the worktree and evicts from the registry.
- [ ] @tester Smoke-check `team list` shows a `done` session correctly and that flipping `state.json` back to `planning` is reflected on the next watch poll (can be a manual instruction in the test plan if integration test is impractical).

## Review
- [ ] @reviewer Standard-effort review pass: wrapper change correctness, prompt clarity, doc-spec consistency, no leftover references to `scheduleCleanup`, follow-up phase logic, merge-allowlist scope is narrow enough.

## Git
- [ ] @captain Push branch and open PR.
