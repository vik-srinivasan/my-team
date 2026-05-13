
## 2026-05-13T09:22:00Z — captain
Action: Session started. User wants landing-page dispatch-loop animation fixed (overlap + visibility) and a clear core/non-core distinction (4 main agents vs 5 optional). Dispatching scout to map the landing app.

## 2026-05-13T09:24:00Z — captain
Action: User scoping decisions captured —
  * Visual distinction: TWO SEPARATE ORBITS (inner = 4 core, outer = 5 optional, smaller).
  * Surfaces: audit ANYWHERE agents are listed across the landing page, not just animation.
  * Effort: standard. Designer will be dispatched to verify the visual result.
Waiting on scout (background) before drafting SRD.

## 2026-05-13T09:26:00Z — captain
Action: Scout completed; context.md persisted. Key findings:
  * `agents.ts` has no core/optional flag — needs one field added.
  * `Architecture.tsx` already does dashed-stroke conditional treatment — precedent to align with.
  * `FlowNarrative.tsx` lists all 10 agents flat — needs grouping.
  * Hero stat counter says "6 agents" — stale.
  * Reduced-motion fallback text only lists 4 core agents — already matches new model but should be reviewed.
Drafting SRD next.

## 2026-05-13T09:30:00Z — captain
Action: User approved SRD ("perfect, ... and go"). Plan + tasks committed. Phase → executing. Dispatching single engineer for the full implementation chain (sequential because all consumers depend on the agents.ts change). Designer and Vercel preview to follow.

## 2026-05-13T02:40:00Z — engineer
Completed: All 7 engineering tasks for the landing-page two-orbit + core/optional refactor.

Created:
  * `apps/landing/app/agents.test.ts` — locks down the 4-core / 5-optional partition, captain-as-non-core typing, and the explicit-flag invariant.
  * `apps/landing/app/components/FlowNarrative.test.ts` — covers the captain/core/optional grouping, the shared-flag derivation, and the badge variants.

Modified:
  * `apps/landing/app/agents.ts` — added required `core: boolean` to the Agent interface; tagged scout/engineer/tester/reviewer core, captain + 5 optional as `false`; exported `CORE_SPECIALISTS` and `OPTIONAL_SPECIALISTS` helpers.
  * `apps/landing/app/components/AgentFlow.tsx` — re-centred captain at (380, 260) inside a 760×520 viewBox; built two concentric orbits — inner r=140 with 4 cardinal core nodes (r=28, solid), outer r=225 with 5 evenly-spaced optional nodes (r=20, dashed/dimmed), offset 36° so the rings interleave; faint orbit guides; dashed connectors for optional; dispatch dot + active-path animation reused unchanged; reduced-motion fallback rewritten as a caption below the SVG so it doesn't crowd the bottom outer node.
  * `apps/landing/app/components/Hero.tsx` — replaced stale `agents: 6` tile with two tiles `core: 4` + `optional: 5`; grid bumped to 4 columns.
  * `apps/landing/app/components/FlowNarrative.tsx` — split into Captain → Core specialists → Optional specialists with eyebrow-style group headings + one-line blurbs; added solid (core) / dashed (optional) badge pill on each card; numbering continues 01..10 across all groups; extracted reusable `AgentCard` and `GroupHeading` components.
  * `apps/landing/app/components/Architecture.tsx` — now derives `conditional: !agent.core` from the shared `SPECIALISTS` import; per-agent `produces` and `stack` metadata moved to a small `ARCH_META` map keyed by `AgentId` (Architecture-only metadata stays out of `agents.ts`); visual output unchanged.
  * `apps/landing/app/components/Hero.test.ts` — asserts new core/optional stat copy and guards against the stale `agents: 6` framing returning.
  * `apps/landing/app/components/Architecture.test.ts` — updated the conditional-flag assertion to match the new shared-flag derivation; added a "consumes the shared roster" guard.
  * `apps/landing/app/components/agent-flow-state.test.ts` — added two arcPoints geometry tests covering the inner-orbit (4 cardinal) and outer-orbit (5 evenly-spaced 72°) layouts.

Commits:
  * `91700bd` feat(landing): add core flag to Agent interface as source of truth
  * `bfb847b` feat(landing): two-orbit dispatch animation with core vs optional rings
  * `f66794f` feat(landing): reframe stats and group narrative around core vs optional
  * `b803419` refactor(landing): consume shared core flag in architecture diagram
  * `b6719b7` test(landing): cover the two-orbit AgentFlow geometry

Verification:
  * `cd apps/landing && pnpm lint` — passes (tsc --noEmit clean).
  * `cd apps/landing && pnpm build` — passes; static page generated.
  * `pnpm vitest run apps/landing/` — 45/45 tests pass across 6 files.
  * Numerically verified all 9 specialist nodes fit inside the 760×520 viewBox with ≥15px margin to the nearest edge (bottom-most outer node is the tightest at y_max=505 in a 520-tall box).
  * Wrapper-suite test failures observed in repo-wide `pnpm vitest run` are pre-existing (`@my-team/shared` package-resolution issue) and unrelated to this work — confirmed by stashing my changes and re-running.

Decisions worth recording:
  * Made `core` a required field on the Agent interface (rather than optional) and set captain to `false`, so every agent has an explicit flag and TypeScript catches future-agent additions that forget to set it. Captain is filtered out of `SPECIALISTS` anyway, so the value is unobservable in render — the typing wins outweigh the slight semantic awkwardness ("captain isn't really a non-core specialist, it's an orchestrator").
  * Numbering in FlowNarrative continues 01..10 across captain + core + optional rather than restarting per group. This reads as one canonical list of agents that happens to be sectioned, which matches how the rest of the page talks about the roster.
  * Architecture.tsx's per-agent `produces` and `stack: true` metadata stays in a small sibling `ARCH_META` map in `Architecture.tsx` rather than getting added to `agents.ts`. agents.ts stays lean (5 fields + the new `core` flag); diagram-only knobs live where they're rendered.

Preview command (no Vercel deploy from engineer per session conventions):
  * `cd apps/landing && pnpm dev` → http://localhost:3100
  * Captain will run `vercel` from `apps/landing/` after review for a preview URL.

## 2026-05-13T09:42:00Z — captain
Action: Engineer completed all 7 @engineer tasks across 5 commits (91700bd, bfb847b, f66794f, b803419, b6719b7). 45/45 landing tests pass, lint + build green. Dispatching tester + reviewer + designer in parallel for verification before Vercel preview deploy + PR.

## 2026-05-13T02:45:00Z — tester
Completed: Ran lint, build, and full test suite for `apps/landing/`. Added integration tests for the two-orbit AgentFlow geometry and FlowNarrative three-section structure. All checks green.

Tests written:
- `apps/landing/app/components/AgentFlow.test.ts` — 10 tests covering: correct import of 9 specialists (4 core + 5 optional), two orbit radii (CORE_RADIUS=140 < OPTIONAL_RADIUS=225), node radii (CORE_NODE_R=28 > OPTIONAL_NODE_R=20), captain centering (VIEW_W/2, VIEW_H/2), strokeDasharray applied only to optional circles, reduced opacity for optional nodes, smaller font size for optional labels, dashed outer orbit guide ring, reduced-motion fallback text listing both groups, aria-label describing two-orbit layout.
- `apps/landing/app/components/FlowNarrative.integration.test.ts` — 8 tests covering: exactly three `<ol>` sections, correct DOM order (captain → core → optional), data-driven section counts (CORE.length and OPTIONAL.length), captain numbered as 1, core numbering formula `i + 2`, optional numbering formula `i + 2 + CORE.length`, all 10 agents covered via AGENTS import, GroupHeading used exactly twice.

Tests passed: 63
Tests failed: 0
Bugs filed: none
