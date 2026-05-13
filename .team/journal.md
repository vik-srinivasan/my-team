## 2026-05-13T02:01:00Z — captain
Action: Session started. User reports bug: `team watch` shows stale phase ("approve") and red AT for calm-brook-81 even though the user approved and the engineer is running. Confirmed via state.json — captain in that session never transitioned phase from `awaiting_approval` to `executing` before dispatching the engineer. Dispatched scout to map team-watch code paths.

## 2026-05-13T02:05:00Z — captain
Action: Scout finished; identified `getAttention()` in format.ts:116-131 as the AT root cause and the captain prompt + missing PreToolUse hook on AskUserQuestion as the dispatch/question root causes. User reported a second symptom mid-conversation: AT stayed calm while my `AskUserQuestion` was pending because the `Stop` hook only fires at end-of-turn, not while a tool is open. Scope widened to include a new `PreToolUse` hook on `AskUserQuestion`. Plan + tasks written. Moving to awaiting_approval.

## 2026-05-13T02:07:00Z — captain
Action: Plan approved by user. Dispatching two engineers in parallel: (1) display fixes in packages/cli + captain.md + SPEC.md, (2) wrapper auto-heal + new PreToolUse hook + wiring. Phase → executing.

## 2026-05-13T02:25:00Z — engineer
Completed: Task B (wrapper auto-heal in `refreshStateFromDisk`) + Task C1-C3 (new `AskUserQuestion` PreToolUse hook script, `buildCaptainSettings` extension, `SessionManager` constructor + entry-point wiring).
Created: `agent-prompts/hooks/mark-must-ask-on-question.sh` (committed on `main` of `/Users/vik/Documents/my-team` AND copied into this worktree branch).
Modified: `packages/wrapper/src/session-manager.ts` (new `askQuestionHookPath` on `CaptainHookPaths`, new `PreToolUse` section in `buildCaptainSettings`, new `healedPhaseFor()` exported helper, auto-heal write in `refreshStateFromDisk`), `packages/wrapper/src/index.ts` (resolves `ASK_QUESTION_HOOK_PATH`, passes to `SessionManager`), `packages/wrapper/src/session-manager.test.ts` (covers new shape + new `healedPhaseFor` unit tests), `packages/wrapper/src/server.test.ts` + `packages/wrapper/src/websocket.test.ts` (constructor + temp hook stub).
Commits:
 - source repo `main`: 56507c4 `feat(hooks): mark must_ask when AskUserQuestion opens`
 - feature branch: 36fae46 `feat(wrapper): wire AskUserQuestion PreToolUse hook`
 - feature branch: 18acb7d `feat(wrapper): auto-heal stale awaiting_approval on refresh`
Verification: `pnpm --filter @my-team/wrapper build` clean; `npx vitest run packages/wrapper/src` → 64/64 green. No tester-owned tests are currently broken (I patched the strict-shape assertions that the new `PreToolUse` entry would have broken — both in `session-manager.test.ts` and `server.test.ts`). Tester still owes the new `mark-must-ask-on-question.test.ts` shell-script tests + the `refreshStateFromDisk` auto-heal integration test (see `.team/tasks.md` Testing section).

## 2026-05-13T02:40:00Z — engineer
Completed: Task A1-A2 (drop `awaiting_approval` AT critical branch in `getAttention()`; collapse the rank-0 bucket in `compareByAttention()`).
Modified: `packages/cli/src/format.ts` (priority comment + branch removal + sort docstring), `packages/cli/src/format.test.ts` (flipped `phase=awaiting_approval -> approve` and `awaiting_approval wins over must_ask_count` cases to assert the new "calm unless must_ask" behavior), `packages/cli/src/commands/list.test.ts` (sort order assertion updated; awaiting_approval now folds into must_ask bucket or idle bucket).
Verification: `pnpm --filter @my-team/cli build` clean; `pnpm vitest run packages/cli/src/format.test.ts packages/cli/src/commands/list.test.ts` → 35/35 green.
Commit: d3dbb2d

## 2026-05-13T02:45:00Z — engineer
Completed: Task A3-A5 (new `effectivePhase()` helper in format.ts; both `list` and `watch` render PHASE via `effectivePhase(s)` instead of raw `s.phase`).
Modified: `packages/cli/src/format.ts` (new `effectivePhase()` exported helper after `phaseColor()`), `packages/cli/src/commands/list.ts` (import + apply in row builder), `packages/cli/src/commands/watch.ts` (import + apply in `drawOnce()` row loop).
Verification: `pnpm --filter @my-team/cli build` clean; format + list tests still green.
Commit: dfbe141

## 2026-05-13T02:50:00Z — engineer
Completed: Task D (captain prompt tightening). Updated `agent-prompts/captain.md` "Phase: Executing" step 1 to require setting BOTH `phase` to `"executing"` AND `active_specialist` to `"engineer"` in one write; added a one-line caution under "Dispatch tester + reviewer in parallel" step 1 warning that dispatching while `phase` is still `"awaiting_approval"` triggers a wrapper auto-heal warning.
Source-repo status check before edit: `captain.md` and `agent-prompts/` were clean (only unrelated `pnpm-lock.yaml` + untracked `docs/`, `packages/ui/`, etc.).
Modified: `/Users/vik/Documents/my-team/agent-prompts/captain.md` (NOT in the session worktree — agent-prompts is a shared resource per the task instructions, lives on `main` of the source repo).
Worktree's `.claude/agents/captain.md` deliberately left unchanged — running specialists in this session already read their cached copies, and the source-of-truth change benefits future sessions via `worktree.ts:copyAgentPrompts`.
Commit (source repo `main`): 01a2fbb

## 2026-05-13T02:55:00Z — engineer
Completed: Task E (SPEC.md AT-column docs). Replaced the single-paragraph clear-must-ask blurb at §176 with a richer description: AT lights up on `must_ask_pending` non-empty or `phase === 'blocked'`; the three hooks (`UserPromptSubmit` clear, `PreToolUse` AskUserQuestion mark, `Stop` end-of-turn safety net) keep `must_ask_pending` accurate without captain effort; PHASE column derives from `active_specialist` so stale `phase` doesn't show the wrong label; wrapper auto-heals stale `awaiting_approval`.
Modified: `SPEC.md`.

Preview: no UI changes — these are CLI table renderers + docs/prompts. To eyeball the new behavior locally:
- `pnpm --filter @my-team/cli build && node packages/cli/dist/index.js list` (or `watch`) against any wrapper running a session with `active_specialist: "engineer"` and stale `phase: "awaiting_approval"` — PHASE column should now read `exec`, AT column should be calm.

## 2026-05-13T03:10:00Z — reviewer
Completed: Review pass 1. No blocking issues found. Verdict: Approved.
Suggestions: non-atomic heal write (cosmetic), missing effectivePhase('captain') regression guard, watcher race note (informational), mark-must-ask-on-question.test.ts not yet written (tester tasks still open).

## 2026-05-12T19:27:00Z — tester
Completed: All five testing tasks. Full suite green.
Tests written:
  - `packages/cli/src/format.test.ts` — 9 new cases: 2 for `getAttention()` (awaiting_approval+must_ask_count=0 idle, awaiting_approval+must_ask_count=1 critical) and 7 for `effectivePhase()` (all specialist mappings + two pass-through cases). Total format.test.ts: 41 tests.
  - `packages/cli/src/commands/list.test.ts` — 1 new focused case pinning awaiting_approval-without-must_ask sorts at rank 3 (idle bucket), not rank 0. Fixed a pre-existing unstable sort-order assertion (see review.md). Total list.test.ts: 4 tests.
  - `packages/wrapper/src/session-manager.test.ts` — added `refreshStateFromDisk` auto-heal integration test: creates a real session via `createSession` (captain mocked), writes stale state.json (phase=awaiting_approval + active_specialist=engineer), calls `listSessions()`, asserts on-disk phase healed to `executing` and warn logger fired with correct context (from/to/specialist). Total session-manager.test.ts: 10 tests.
  - `packages/wrapper/src/mark-must-ask-on-question.test.ts` — 14 shell-script integration tests covering: no state.json, terminal phases (done/killed/cleaned), non-empty must_ask_pending, scout+scouting write paths, active_specialist=engineer/tester/reviewer/tester+reviewer all WRITE (unlike mark-must-ask.sh), malformed JSON, idempotency, absent must_ask_pending key.
Tests passed: 147 total (79 wrapper + 68 CLI)
Tests failed: 0
Bugs filed: 1 (pre-existing unstable sort-order assertion in list.test.ts — fixed in test code)
