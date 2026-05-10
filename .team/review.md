# Review pass 1 — 2026-05-10T00:00:00Z

## Blocking

### packages/ui/src/hooks/useWebSocket.ts:27
The contemplating-pattern regex will over-filter legitimate words like "complete", "template", and potentially others.

> resolved: 40f759d — replaced with `/\b(?:contempl|conplat|complat)(?:at)?(?:e|ing|es|ed|or|ion)?\b/i`, verified against the full must/must-not matrix, and added 11 regression test cases.

The pattern `/\b(?:co[mn]t?em|co[mn])pl[ae]t(?:e|ing|es|or)?/` is intended to match PTY typos of "contemplating" (e.g., "conplating", "complating"), but the second alternation `co[mn]` followed by `pl[ae]t` will incorrectly match "complete":
- "complete" = c + o + m + p + l + e + t + e
- Pattern matches: `\bcom` (via `co[mn]`) + `plet` (via `pl[ae]t` + `e` suffix)

This will cause legitimate output like "the changes are complete" or "implementation is now complete" to be silently dropped from the captain stream, breaking readability.

**Fix:** Tighten the regex to avoid false positives. Either:
1. Require the full "contemplate" stem: `/\b(?:con|com)t?empl[ae]t(?:e|ing|es|or)?/` (requires "em" together, not just "e")
2. Or explicitly word-boundary the suffix: `/\b(?:co[mn]t?em|co[mn])pl[ae]t(?:e|ing|ing|es|or)?\b/` but this still breaks on "complete" because of the greedy match of the second alternation.

Better approach: use non-capturing group to anchor "contemplate" family more tightly:
`/\b(?:contemplate|conplate|complat|contem)(?:ing|ed|s|es|or)?\b/` (explicit list of typo variations)

Or safer regex that requires "em" or full word:
`/\b(?:con|com)t?empl[ae]t(?:e|ing|es|or)?\b|conp?lat(?:e|ing|es|or)?\b/`

The tests (lines 43-45 in `useWebSocket.test.ts`) do not cover false-positives like "complete" — add test case to prevent regression.

## Suggestions

### packages/ui/src/hooks/useWebSocket.test.ts
Consider adding test coverage for edge cases to prevent future false-positives:
- Words that might accidentally match the contemplating regex: "complete", "template", "implemented"
- Very short legitimate content to verify the 3-char word-boundary rule

Not blocking (tests pass with current regex), but would strengthen the suite.

> resolved: 40f759d — added regression cases for "complete", "completed", "completing", "completes", "completion", "template literal", "implemented", and "compatible" as part of the blocking-fix commit.

## Approved

- **phase.ts `phaseFriendlyLabel()`**: Correct implementation with good test coverage. The specialist name capitalization (line 69) is clean. Fallback to `phaseLabel()` for unknown phases is sensible.
- **SessionList.tsx**: Status indicator logic is sound. `attentionDotClass()` correctly prioritizes red > yellow > green. The tooltip text is helpful and the integration of `phaseFriendlyLabel()` + `getAttention()` is exactly as spec'd. Sorting by critical/update/recency is correct. Responsive layout with proper truncation for long titles.
- **Imports and types**: All ESM imports have `.js` extensions and are correctly typed. No `any` escapes.
- **WebSocket hook changes**: The `cleanCaptainOutput()` and `isMeaningfulText()` pipeline is well-structured and the supporting functions (`isBoxDrawingLeftover()`, `isMarkdownStructural()`) are defensive and handle edge cases well.
- **Test quality**: `phase.test.ts` thoroughly covers all canonical phases and the specialist name capitalization. `useWebSocket.test.ts` has good coverage of the noise-filtering pipeline and preserves real content (headers, markdown, links).

# Review pass 2 — 2026-05-10T13:45:00Z

## Verdict: Approved

Regex fix verified. The new pattern `/\b(?:contempl|conplat|complat)(?:at)?(?:e|ing|es|ed|or|ion)?\b/i` correctly matches all contemplating variants (Contemplating, contemplate, conplating, complating) while avoiding false positives on complete, completed, completing, completes, completion, template, compatible, and implemented. Regression test suite covers all required must-not-match cases (lines 113–127 in useWebSocket.test.ts) and existing noise tests still catch the true positives (lines 43–45). No blockers remain.
