# Tasks — landing page update

## Engineering
- [x] @engineer Add `core: boolean` to `Agent` interface and each entry in `apps/landing/app/agents.ts`. Scout/engineer/tester/reviewer = `true`; debugger/designer/runner/auditor/documenter = `false`. Captain entry stays as-is. — done in 91700bd; made `core` required and set captain to `false` so the typing catches future omissions.
- [x] @engineer Rework `AgentFlow.tsx`: re-center captain horizontally, expand viewBox if needed, split specialists into two concentric arcs (4 core inner at full size + solid stroke; 5 optional outer at smaller size + dashed/dimmed stroke). Update reduced-motion fallback to mention both groups. No overlap, no clipping. — done in bfb847b; viewBox 760×520, captain at (380, 260), inner r=140 (4 cardinal), outer r=225 (5 nodes at 72° spacing offset 36° from inner). All nodes verified in-bounds.
- [x] @engineer Update `FlowNarrative.tsx`: visually group/badge core vs optional agents (subhead between sections, small badge on each card). — done in f66794f; three sections (captain alone, core, optional) with eyebrow group headings + blurbs and solid/dashed badge pills.
- [x] @engineer Reframe `Hero.tsx` stat counter from "6 agents" to the "4 core + 5 optional" framing. — done in f66794f; grid expanded to 4 cols with `core: 4` + `optional: 5` tiles alongside setup/output.
- [x] @engineer Refactor `Architecture.tsx` to consume the shared `core` flag from `agents.ts` (replacing local `conditional`). Visual output must stay identical. — done in b803419; iterates `SPECIALISTS`, derives `conditional: !agent.core`, per-agent `produces`/`stack` metadata moved to a small `ARCH_META` map.
- [x] @engineer Add/update unit tests covering the geometry change, the `core` flag pass-through, and the FlowNarrative grouping. — done across the feature commits + b6719b7; new files `agents.test.ts` and `FlowNarrative.test.ts`, updated Hero/Architecture/agent-flow-state tests. 45/45 landing tests pass.
- [x] @engineer Commit after each meaningful chunk. Run `pnpm lint` and `pnpm build` from `apps/landing/` before signing off. — five commits total; lint + build both pass.

## Testing
- [x] @tester Run `pnpm lint`, `pnpm build`, `pnpm vitest run` in `apps/landing/`. Verify all green.
- [x] @tester Add integration coverage for the new geometry and the agent grouping where it adds real value (don't pad).
- [x] @tester File any bugs in `.team/review.md` under a "Tester findings" section.

## Review
- [ ] @reviewer Standard pass on the diff. Produce `.team/review.md` with Blocking / Suggestion / Approved buckets.

## Visual
- [ ] @designer Boot `pnpm dev` in `apps/landing/` (port 3100), screenshot the hero animation + FlowNarrative, critique visual hierarchy of the core/optional split. Iterate with engineer if needed.

## Deploy
- [ ] @captain Run `vercel` from `apps/landing/` to produce a preview URL. Capture the URL.

## Git
- [ ] @captain Push branch and open PR — include the Vercel preview URL in the PR body.
