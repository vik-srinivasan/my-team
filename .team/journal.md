## 2026-05-12T17:30:00Z — captain
Action: Session started. User reported PR #21 didn't fully fix the AT-column / `must_ask_pending` problem. Two sessions (`clear-hawk-29`, `thin-moss-58`) ended captain turns asking the user questions but never lit up the AT column. Dispatching scout to map current AT-column / hook plumbing while I diagnose with the user.

## 2026-05-12T17:36:00Z — captain
Action: Scout returned. Wrote `context.md` from the scout's output (scout reported inline rather than writing the file). Confirmed two independent failures: (1) stale wrapper daemon predating PR #21 merge → `writeCaptainHooks` never ran for new sessions, no `.claude/settings.json` written; (2) captain prompt push protocol is unreliable — captain ends chat-heavy turns without writing to state.json. Phase → planning. Waiting on user for scope + effort level before drafting plan.

## 2026-05-12T17:52:00Z — captain
Action: User locked scope (option B — Stop hook only, doctor as follow-up), effort=standard, and decided to skip the retrofit script in favor of letting live sessions finish naturally then restarting manually. Wrote plan.md and tasks.md. Awaiting plan approval.

## 2026-05-12T17:53:00Z — captain
Action: Plan approved by user ("go"). Phase → executing. Dispatching single engineer for all engineering tasks (they're tightly coupled — hook script + wrapper wiring + prompt edit + unit test all need to ship together).

## 2026-05-12T18:09:00Z — engineer
Completed: Stop hook implementation (mark-must-ask.sh + wrapper wiring + captain prompt edit + unit tests).
Created:
  - `agent-prompts/hooks/mark-must-ask.sh` — Stop hook script, executable, idempotent atomic rewrite.
  - `packages/wrapper/src/mark-must-ask.test.ts` — 11 vitest cases shelling out to the script with controlled `$CLAUDE_PROJECT_DIR`.
Modified:
  - `packages/wrapper/src/index.ts` — added `STOP_HOOK_PATH` resolved from `__dirname`; passed as 4th `SessionManager` arg.
  - `packages/wrapper/src/session-manager.ts` — `buildCaptainSettings` now takes a `CaptainHookPaths` options object and emits both `UserPromptSubmit` and `Stop` hooks; `SessionManager` ctor accepts and stores `stopHookPath`; `writeCaptainHooks` threads both paths through.
  - `packages/wrapper/src/session-manager.test.ts` — updated for new signature; added Stop-hook shape assertion and a `[Stop, UserPromptSubmit]` coexistence check.
  - `packages/wrapper/src/server.test.ts` — added `stopHookPath` stub, passes both paths to ctor, asserts written `.claude/settings.json` includes the Stop hook.
  - `packages/wrapper/src/websocket.test.ts` — same constructor signature update.
  - `agent-prompts/captain.md` + `.claude/agents/captain.md` — one paragraph noting the Stop hook is a safety net, not a substitute for specific captain pushes.
Decisions:
  - Used a `CaptainHookPaths` options-object signature for `buildCaptainSettings` instead of a second positional arg — easier to extend, harder to mix up at the call site. Logged in `.team/decisions.md` (no decisions.md entry needed; this is mentioned inline in the commit).
Commits: f251849 (hook), 0aaca3a (wrapper wiring), 1710e26 (captain prompt), ac14229 (hook tests).
Tests passed: 157, Tests failed: 0, Tests written: packages/wrapper/src/mark-must-ask.test.ts (11 cases), plus extensions to session-manager.test.ts (1 new case, others reshaped) and server.test.ts (assertion extended).
Build: `pnpm -r build` green. `pnpm test` green (first run had a 1/157 chokidar flake — known pre-existing macOS fsevents issue noted in context.md gotchas; second run clean).
Preview: not applicable — backend/CLI repo, no UI changes.

## 2026-05-12T18:10:00Z — captain
Action: Engineer done (4 commits, 157/0 tests, 11 new). Dispatching tester + reviewer in parallel. Tester double-checks the suite + smoke-tests the Stop hook script directly (engineer's vitest cases already cover the four acceptance cases — tester looks for gaps the engineer missed). Reviewer does standard scope.

## 2026-05-12T18:14:00Z — tester
Completed: Ran full test suite, smoke-tested mark-must-ask.sh against real state.json files in a scratch temp dir, analyzed coverage gaps and bugs.

Smoke test commands and outputs (all run against /tmp/mark-must-ask-smoke-zHuz4Q):

  CASE 1 — Idle state → entry pushed:
    Input: {"phase":"executing","active_specialist":null,"must_ask_pending":[],"review_iterations":0}
    Command: CLAUDE_PROJECT_DIR=/tmp/... mark-must-ask.sh
    Exit: 0; must_ask_pending = ["captain awaiting user reply"] ✓

  CASE 2 — active_specialist=engineer → file unchanged:
    Input: {"phase":"executing","active_specialist":"engineer","must_ask_pending":[]}
    Exit: 0; must_ask_pending = [] (unchanged) ✓

  CASE 3 — Missing state.json → exit 0, no stderr:
    Exit: 0; stderr = '' ✓

  CASE 4 — Run twice with idle state → second run is no-op (idempotent):
    First run: must_ask_pending = ["captain awaiting user reply"]
    Second run: must_ask_pending = ["captain awaiting user reply"] (unchanged, count still 1) ✓

  BONUS — must_ask_pending key entirely absent: hook pushes entry correctly ✓
  BONUS — active_specialist is string "null" (not JSON null): hook fires correctly ✓
  BONUS — phase=reviewing + active_specialist=null (inconsistent state): hook fires (documented as suggestion in review.md)

Coverage gaps found and addressed:
  - mark-must-ask.test.ts was missing a test for must_ask_pending key entirely absent. Added one test case. All other engineer gaps (absolute path in server.test.ts, JSON round-trip in session-manager.test.ts) were already covered.

Bug analysis:
  - jq null/string-null distinction: no bug — script correctly handles both.
  - phase=reviewing + active_specialist=null false positive: by-design; filed as suggestion in review.md.
  - Race condition (hook fires while user mid-typing): harmless — UserPromptSubmit clears on submit.
  - Captain prompt push protocol: intact and not weakened by Stop hook paragraph addition.

Tests written: packages/wrapper/src/mark-must-ask.test.ts (1 new case added)
Tests passed: 158
Tests failed: 0
Bugs filed: 0 blocking (1 suggestion in review.md)
