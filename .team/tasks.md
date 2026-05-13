# Tasks — team-watch-changes

## Engineering

### A. Display fixes (format.ts + commands)
- [x] @engineer In `packages/cli/src/format.ts`: drop the `phase === 'awaiting_approval'` critical branch from `getAttention()`. — stale test assertions in `format.test.ts` flipped to new behavior in the same commit.
- [x] @engineer In `packages/cli/src/format.ts`: update `compareByAttention()` — collapse the awaiting_approval rank-0 bucket into rank 2 (must_ask). — `list.test.ts` sort assertions updated to match.
- [x] @engineer In `packages/cli/src/format.ts`: add `effectivePhase(s: SessionSummary): SessionPhase` mapping active_specialist → canonical phase.
- [x] @engineer In `packages/cli/src/commands/list.ts`: render PHASE column via `effectivePhase(s)`.
- [x] @engineer In `packages/cli/src/commands/watch.ts`: same.

### B. Wrapper auto-heal
- [x] @engineer In `packages/wrapper/src/session-manager.ts`: extend `refreshStateFromDisk()` to auto-heal stale `awaiting_approval` when active_specialist is set to a real specialist. Atomic write. Log `warn` when healing fires. — heal logic via new pure `healedPhaseFor()` helper; write wrapped in its own try/catch.

### C. AskUserQuestion hook
- [x] @engineer Create `agent-prompts/hooks/mark-must-ask-on-question.sh` — PreToolUse hook that pushes `"user question pending"` to `must_ask_pending` if empty. Mirror the atomic-write + skip-conditions pattern of `mark-must-ask.sh`. chmod +x. — committed on `main` in the source repo (vik/Documents/my-team) AND copied into this branch's worktree so the wrapper entry point can resolve it.
- [x] @engineer In `packages/wrapper/src/session-manager.ts`: add `askQuestionHookPath` to `CaptainHookPaths`; add `PreToolUse` (matcher: `AskUserQuestion`) section to `buildCaptainSettings()`; thread through `SessionManager` constructor.
- [x] @engineer Update the wrapper entry point (where `SessionManager` is constructed) to pass the new hook path. — `packages/wrapper/src/index.ts`.

### D. Captain prompt tightening
- [x] @engineer In `agent-prompts/captain.md` "Phase: Executing" step 1: explicitly say "set `phase` to `'executing'`" alongside `active_specialist`. Same for the Reviewing dispatch step. — committed on `main` in the source repo `/Users/vik/Documents/my-team` (01a2fbb), not on the session branch (agent-prompts is a shared resource per Task D instructions).

### E. Docs
- [x] @engineer Update `SPEC.md` AT-column description (§174-176) to reflect: AT lights up on must_ask_pending or blocked; AskUserQuestion auto-pushes via PreToolUse hook; wrapper auto-heals stale awaiting_approval. — replaced the single-paragraph clear-must-ask blurb with a richer breakdown of the three hooks + PHASE derivation + auto-heal.

## Testing
- [x] @tester `packages/cli/src/format.test.ts`: new cases for `getAttention()` and `effectivePhase()`.
- [x] @tester `packages/cli/src/commands/list.test.ts`: sort order — awaiting_approval folds into must_ask bucket.
- [x] @tester `packages/wrapper/src/session-manager.test.ts`: assert `buildCaptainSettings()` includes the new PreToolUse entry; assert `refreshStateFromDisk` auto-heals stale phase.
- [x] @tester New `packages/wrapper/src/mark-must-ask-on-question.test.ts`: shell-script integration tests mirroring `mark-must-ask.test.ts`.
- [x] @tester `pnpm -r build && pnpm -r test` green.

## Review
- [x] @reviewer Code review pass — format.ts edge cases, auto-heal idempotency, hook script correctness, captain.md wording.

## Git
- [ ] @captain Push branch and open PR.
