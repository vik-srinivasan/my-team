# Tasks — ui-rework

## Engineering

### Phase A — stream rendering correctness
- [x] @engineer Fix `stripAnsi` in `packages/ui/src/hooks/useWebSocket.ts` to simulate terminal CR-overwrite (split each line on `\r`, keep last segment), removing the `.replace(/\r/g, '')` step. _(7a907df)_
- [x] @engineer Expand `NOISE_LINE_PATTERNS` to cover Claude Code spinner verbs (billow/ponder/cogitat/ruminat/muse/mull/deliberat/simmer/osmos), Unicode glyph spinner lines, `N active` / `thinking on N` counters, and `(Ns ↑/↓ Nk tokens · thought for Ns)` footers. _(7a907df)_
- [x] @engineer Fix the append behavior at `useWebSocket.ts:184`: do not unconditionally prepend `\n`. Use a separator that respects prior text ending and markdown-structural starts. _(7a907df — new `joinChunks` helper)_
- [x] @engineer Add a server-side line buffer in `packages/wrapper/src/claude-process.ts` that flushes on `\n` or after a short timeout (~50ms), so the WS emits whole lines rather than per-byte chunks. _(2b24f83)_

### Phase B — dashboard visual polish
- [x] @engineer Polish the header bar in `packages/ui/src/App.tsx`: larger padding, bigger title, phase as colored pill, drop raw session ID (move to title tooltip). _(6f53a7b — added `phasePill` helper)_
- [x] @engineer Polish session list items in `packages/ui/src/components/SessionList.tsx`: bigger tap target, dim relative time, accent border on active item. _(c8a777d — left-accent already present, bumped padding + dimmed time)_
- [x] @engineer Polish captain message styling and empty state in `packages/ui/src/components/OutputLog.tsx`: relaxed line-height, subtle separators between messages, friendlier empty state. _(b253ec1 — hairline only between consecutive captain messages)_

## Testing

- [x] @engineer Fix the test `stripAnsi('working\rdone\n')` in `useWebSocket.test.ts` to expect `'done'` (was wrongly encoded as `'workingdone'`). _(7a907df)_
- [x] @engineer Add tests in `useWebSocket.test.ts` for multi-segment CR overwrites, spinner-glyph clusters, and Billowing-style status words. _(7a907df)_
- [x] @engineer Add tests in `useWebSocket.test.ts` for the append-merge behavior on streamed chunks (no fragmenting to one-word paragraphs). _(7a907df — `joinChunks` + full-pipeline blocks)_
- [x] @engineer Add `packages/wrapper/src/claude-process.test.ts` covering the new line-buffer emitter. _(2b24f83 — added "CaptainProcess line buffer" describe block)_
- [x] @tester Run `pnpm test` and `pnpm typecheck` across the workspace; report any failures.
- [ ] @tester Smoke-check the UI: `pnpm dev`, open the dashboard, verify captain output is readable and the header/sidebar look polished.

## Review

- [ ] @reviewer Code review pass — focus areas: stream pipeline correctness, no regressions in noise-filtering of legitimate words ("complete", "completion", etc.), append-merge edge cases, UI accessibility (contrast, keyboard).

## Git

- [ ] @git Push branch `my-team/quick-ford-81` and open a PR titled "fix(ui): unmangle captain stream + dashboard polish".
