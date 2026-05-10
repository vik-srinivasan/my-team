# Tasks — ui-changes

## Engineering

- [x] @engineer Add `phaseFriendlyLabel(phase, active_specialist)` helper in `packages/ui/src/lib/phase.ts` with the mapping in plan.md. Unit test it. (commit 57a913c)
- [x] @engineer Update `SessionList.tsx`: replace the tiny phase dot with a prominent green/yellow/red status indicator driven by `getAttention()` (red=critical, yellow=hasUpdate, green=otherwise). Use the new friendly label under the session name. (commit a45f885)
- [x] @engineer Tighten `stripAnsi()` and `isMeaningfulText()` in `useWebSocket.ts` to drop: permission-prompt chrome, `Contemplating...`, `thinking with xhigh effort`, token counters (`↓ N tokens`), `(ctrl+o to expand)`, stray ANSI fragments, leading box-drawing characters. Unit test the filter with sample noisy inputs. (commit 1098671) > **BLOCKING: regex over-filters legitimate words like "complete"**
- [x] @engineer Quick visual sanity check of `OutputLog.tsx` — make sure cleaned output still renders nicely (headers, dividers, code blocks). (no changes needed — filter preserves markdown structure, ReactMarkdown handles it)
- [x] @engineer Fix contemplating regex false positive (review pass 1) (commit 40f759d)

## Testing

- [x] @tester Light effort: run `pnpm --filter @my-team/ui build` and `pnpm --filter @my-team/ui test`. Confirm both pass. No new integration tests unless you suspect a real bug.

## Review

- [x] @reviewer Light effort: single-pass review. Skim for obvious blockers (broken imports, mis-typed `getAttention` usage, regex that drops too much). Don't deep-dive. **BLOCKERS FOUND: see .team/review.md**
- [x] @reviewer Follow-up: verify regex fix (commit 40f759d) against must/must-not matrix. Check regression test coverage.

## Git

- [ ] @git Push branch and open PR titled "UI: prominent status indicator + cleaner captain stream".
