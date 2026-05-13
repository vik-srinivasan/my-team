# Tasks — team-watch-changes

## Engineering

- [x] @engineer Write `agent-prompts/hooks/mark-must-ask.sh` — Stop hook script. Reads `.team/state.json` via `$CLAUDE_PROJECT_DIR`. Skips if `phase ∈ {done, cleaned, killed}`, if `active_specialist ∈ {engineer, tester, reviewer}`, or if `must_ask_pending` is already non-empty. Otherwise pushes a single generic entry (e.g. `"captain awaiting user reply"`). Atomic write via `mktemp` + `mv`. Silent no-op on missing file/`jq`. `chmod +x`. → `f251849`
- [x] @engineer Extend `packages/wrapper/src/index.ts` (L10-L19) — add `STOP_HOOK_PATH` constant resolved the same way as `CLEAR_MUST_ASK_HOOK_PATH`. Pass it as a new 4th constructor argument to `SessionManager`. → `0aaca3a`
- [x] @engineer Extend `packages/wrapper/src/session-manager.ts`:
  - Update `buildCaptainSettings` signature (L71-L89) to take both `clearMustAskHookPath` and `stopHookPath`. Return settings with `hooks.UserPromptSubmit` AND `hooks.Stop` arrays. (Implemented as a `CaptainHookPaths` options object — cleaner than two positional args.)
  - Update `SessionManager` constructor (L91-L106) to accept and store `stopHookPath`.
  - Update `writeCaptainHooks` (L571-L582) to pass both paths into `buildCaptainSettings`.
  → `0aaca3a`
- [x] @engineer Update captain prompt `agent-prompts/captain.md` (L72-L92) — short note that the Stop hook is a safety net; captain should still push specific summaries when it asks a question. Mirror the same change into `.claude/agents/captain.md`. → `1710e26`
- [x] @engineer Add a unit test for `mark-must-ask.sh` — added vitest test at `packages/wrapper/src/mark-must-ask.test.ts` that spawns the script with a controlled `$CLAUDE_PROJECT_DIR`. 11 tests cover the four acceptance cases plus regression guards (scout still flags, missing state.json is a silent no-op, malformed JSON left untouched). → `ac14229`
- [x] @engineer Commit after each logical piece (script, wrapper wiring, prompt update, tests). Conventional Commits: `feat(wrapper): add Stop hook for must_ask auto-push`, `feat(hooks): add mark-must-ask.sh`, etc.

## Testing

- [x] @tester Extend `packages/wrapper/src/session-manager.test.ts` — verify `buildCaptainSettings` shape with both hooks: existing UserPromptSubmit assertions still pass, new Stop hook assertions check command path and matcher.
- [x] @tester Extend `packages/wrapper/src/server.test.ts` (around L130-L144) — verify `.claude/settings.json` written during `POST /api/sessions` contains the Stop hook with the resolved absolute path.
- [x] @tester Run `pnpm test` in the repo root. Report counts (passed/failed/new) and any flake.
- [x] @tester Smoke-test the Stop hook script manually against a fake `state.json` for the four cases listed in plan.md acceptance criteria. Log results in journal.

## Review

- [ ] @reviewer Code review pass — focus on the hook script's robustness (jq error handling, atomic write, env var fallback) and the wrapper wiring (path resolution, constructor signature change is backward-compatible-enough, no leaking the new param into callers that shouldn't care). Produce `.team/review.md` with severity-bucketed findings.

## Git

- [ ] @captain Push branch and open PR.
