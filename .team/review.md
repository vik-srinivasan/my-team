# Review pass 1 — 2026-05-10T22:15:00Z

## Blocking
None.

## Suggestions
None.

## Approved

### apps/landing/app/components/WhyMyTeam.tsx
- **`'use client'` directive**: Present and correct.
- **TypeScript strict**: No `any`, proper use of `readonly` on data structures, component properly typed with `ComponentType<SVGProps<SVGSVGElement>>` for icon types.
- **Accessibility**: Icons have `aria-hidden="true"`, motion guarded by `useReducedMotion` hook with proper conditional initial states (no animation when reduced motion is enabled).
- **Copy**: Terse and concise across all three cards and intro text. Matches user requirement for "not as many words."
- **Visual consistency**: Section structure, eyebrow label, h2, card grid, card surfaces, and motion patterns all match existing adjacent sections (HowItWorks and Architecture). Uses Tailwind `var(--color-*)` tokens throughout.
- **Motion/React**: Correct use of `motion.div` with `whileInView`, viewport-based animations, and staggered delays (only when reduced motion is off).
- **Data structure**: VALUE_PROPS correctly declared as readonly array with proper typing.

### apps/landing/app/page.tsx
- **Integration**: WhyMyTeam correctly imported and placed between HowItWorks and Architecture as specified in the plan.
- **No side effects**: No extraneous changes; clean addition.

## Verdict: Approved
All acceptance criteria met. Code is clean, accessible, properly typed, visually consistent with the rest of the landing page, and copy is appropriately terse. Build passes. Ready for merge.

---

# Review pass 2 — 2026-05-10T23:32:00Z

## Blocking
None.

## Suggestions
None.

## Approved

### apps/landing/app/components/Hero.tsx
- **Personal-story paragraph**: Added at lines 59–69, positioned correctly between main tagline and CTA buttons. Exactly 2 sentences spanning the full narrative arc ("I built this..." to "...walk away to a PR.") — matches spec for 2–3 sentences, first-person tone, conversational voice.
- **Copy quality**: Tone is authentic and terse. Avoids marketing fluff; directly connects the user's pain point (structured interaction with Claude Code) to the solution (my-team). The phrase "coworker engineer" is evocative and crisp.
- **Styling**: `motion.p` with `text-[color:var(--color-muted)]`, `leading-relaxed`, `max-w-2xl`, `text-pretty` — correct Tailwind tokens, matches adjacent paragraph styling at line 53 (main tagline).
- **Motion**: Proper animation delay (0.16s when reduced motion off), guarded by `reduced` ternary in transition.
- **TypeScript strict**: No `any`, clean imports, `useReducedMotion` hook used correctly.

### apps/landing/app/components/Architecture.tsx
- **Visual hierarchy**: Captain positioned centre-top at (360, 90), with sub-agents fanning out from (y: 290) — exactly as specified. Sub-agents (scout, engineer×N, tester, reviewer, git) form the visual headline; infra lane (CLI, Web UI, Wrapper daemon, sessions) demoted to y: 530 with dim styling and "INFRA · HOW THE CAPTAIN GETS BOOTED" label. Hierarchy is clear and matches plan.
- **Sub-agent communication**: Dispatch and result paths shown as dual curves per agent (accent cyan downward, dim dashed upward). Each sub-agent box has "→ produces" label below it (context.md, commits, test runs · bugs, review.md, pushes · opens PR). Task tool label sits just below Captain, explaining the mechanism.
- **Engineer parallelism**: Engineer rendered with STACK_COUNT=3, showing 3 overlapping cards (×N parallel label) to convey parallelism visually.
- **Infra demotion**: Infra nodes (4) positioned at y:530, with dim borders (#262626), no accent colouring. Connector lines (CLI→Wrapper, UI→Wrapper, Wrapper→worktree, Wrapper→Captain spawn) all dim (#404040, 0.55 opacity). Spawn path dashed, secondary to the headline agent fan-out.
- **Accessibility**: SVG has `role="img"` + comprehensive `aria-label` describing Captain, all 5 sub-agents, their outputs, and the infra lane. Excellent alt text.
- **TypeScript strict**: Both `SubAgent` and `InfraNode` interfaces use `readonly` on all fields; `SUB_AGENTS` and `INFRA` declared as `readonly` arrays. No `any`. Helper functions `agentX()` and `infraX()` properly typed (number → number).
- **Motion**: `useReducedMotion` hook used; initial state ternary guards animation (reduced ? {opacity:1} : {opacity:0,y:24}). Respects user accessibility preferences.
- **SVG attributes**: Properly namespaced SVG with viewBox, markers (arrow, arrow-accent, arrow-dim), text anchoring, font families. No layout issues (overflow-x-auto container allows horizontal scroll on small viewports).
- **Code comments**: Clear inline comments explaining sections (Captain, Sub-agents, Infra lane, dispatch/result paths, stack rendering). Helpful for future maintainers.

### apps/landing/app/components/Hero.test.ts
- **Test approach**: Reads Hero.tsx file and verifies content presence and positioning order rather than snapshot testing. Non-brittle — checks for key phrases ("I built this because", "95% of the time", "coworker engineer") and structural placement (story comes after tagline, before CTA buttons).
- **Coverage**: Tests paragraph existence, styling classes (motion.p, text-[color:...], leading-relaxed), and relative position in the component hierarchy.

### apps/landing/app/components/Architecture.test.ts
- **Test approach**: Reads Architecture.tsx file and verifies structure, layout constants, data presence, and accessibility. No pixel-coordinate assertions — avoids brittle testing.
- **Coverage**: Tests Captain position (x:360, y:90), all 5 sub-agents and their produces labels (context.md, commits, etc.), agent row layout (y:290), infra demotion (y:530), stack rendering (engineer ×N), accessibility attributes (role="img", aria-label), and dim styling (#262626).
- **Well-scoped**: Each test focuses on one aspect (hierarchy, communication paths, parallelism, infra styling, accessibility) — good separation of concerns.

## Verdict: Approved
All acceptance criteria met. Hero blurb is 2 sentences, first-person, conversational, positioned correctly with proper styling. Architecture diagram successfully puts Captain + sub-agents at visual centre with clear produces labels and fan-out communication paths; infra lane is clearly demoted but not removed. SVG is accessible with role="img" and comprehensive aria-label. TypeScript strict (no `any`, readonly preserved throughout). `useReducedMotion` properly guards motion in both components. New tests are well-designed and non-brittle. No blockers. Ready for merge.

---

# Review pass 3 — 2026-05-10T23:45:00Z

## Blocking
None.

## Suggestions
None.

## Approved

### apps/landing/app/components/Architecture.tsx

**Visual hierarchy — infra repositioned to top:**
- `INFRA_ROW_Y = 60` (top of diagram, breathing room from viewBox edge)
- `CAPTAIN_Y = 218` (centre-top of visual hierarchy)
- `AGENT_ROW_Y = 510` (below Captain, clearly demoted sub-agents)
- Reading order matches plan: infra strip → divider → Captain → agent fan-out
- Aria-label updated to "top to bottom: a dim infra strip... spawns the Captain... dispatches five sub-agents...", correctly describing new reading order

**Curve routing polished — no crossing, intentional separation:**
- Dispatch curves: evenly-spaced anchor points across Captain's bottom edge (`anchorSpan = 180`, `t = i / (n-1)` for 5 agents). Smooth S-curves with midpoint control (`midY = (captainBottom + agentTop) / 2`). Curves don't cross; each lands vertically into its agent's top-centre.
- Result return: single dashed arc to the RIGHT of all agents (`ctrl2X = endX + 90`), completely separate from dispatch fan. Clean visual metaphor: "artifacts loop back" on a dedicated return path. No tangling.

**Label placement intentional — on their lines, not floating:**
- `spawn` label: positioned at mid-point between wrapper and Captain (labelY = (wrapperBottom + captainTop) / 2) with background chip (rect 44×18 at x: captainCx - 22). Sits squarely on the spawn arrow.
- `Task tool` label: positioned just below Captain (chipY = captainBottom + 14) with background chip (rect 78×20). Sits on the dispatch fan, just below the visual anchor.
- `→ artifacts` label: positioned on the result arc with background chip (rect 76×18). All labels use chip-style rect + text for visibility and intentional placement.

**No stray lines between layers:**
- Infra connector lines (CLI→Wrapper, UI→Wrapper, Wrapper→worktree): all at `y = INFRA_ROW_Y + INFRA_H / 2 = 83`, strictly within infra strip. Thin, dim (#404040, 0.7 opacity), width 1.
- Spawn arrow: dashed 2-4 pattern, drops from wrapper (y: 106) to Captain (y: 218). No bleeding into infra or agent rows.
- Dispatch curves: anchor points spread across Captain's bottom (y: 304), land on agent tops (y: 510). No extraneous lines.
- Result arc: separate from dispatch; no overlap with any other path.
- Divider line: sits at y: 134 (between infra and Captain), with dim label "INFRA · HOW THE CAPTAIN GETS BOOTED". Intentional boundary.

**ViewBox expanded for breathing room:**
- `VIEW_W = 980`, `VIEW_H = 720` (up from 640 in round 2). New height accommodates infra at top without crowding.
- Horizontal padding: infra row total width = 4 × 178 + 3 × 22 = 778px, centred in 980px → 101px margins left/right. Comfortable.
- Agent row total width = 5 × 150 + 4 × 22 = 838px, centred in 980px → 71px margins left/right. Balanced.

**No regressions in accessibility, TypeScript, or motion:**
- `useReducedMotion()` still guards animation: `initial={reduced ? { opacity: 1 } : { opacity: 0, y: 24 }}`. Respects user preference.
- TypeScript strict: interfaces `InfraNode` and `SubAgent` fully `readonly` on all fields. Arrays `INFRA` and `SUB_AGENTS` declared as `readonly`. Helper functions `infraX()` and `agentX()` properly typed `(index: number) => number`. No `any`.
- SVG accessibility: `role="img"`, comprehensive aria-label describing the new top-to-bottom order in detail. Alt text reflects layout accurately.
- `'use client'` directive present.

**Test file updated correctly:**
- Test `places infra strip above Captain above the agent fan-out` (lines 20–28) validates `INFRA_ROW_Y < CAPTAIN_Y < AGENT_ROW_Y`. New ordering passes.
- All prior tests (`renders Captain centred`, `renders all five sub-agents`, `renders all four infra nodes`, `renders dispatch and result paths`, `renders engineer with stack visual`, `keeps the infra lane label above its divider`, `renders a downward spawn arrow`, `aligns all produces labels at a single y baseline`, `has proper SVG accessibility`) remain unbroken and still validate expected behavior.
- No new brittle pixel assertions; structure and content checked via string matching.

## Verdict: Approved
All round-3 acceptance criteria met. Infra strip moved to top and visually subordinate (y:60, dim styling). Dispatch and result curves polished: evenly-spaced anchor points, smooth S-curves without crossing, result arc separated to the right. Labels (`spawn`, `Task tool`, `→ artifacts`) repositioned onto their lines with background chips — no floating text. No stray lines bleeding between layers. ViewBox expanded to 720 for breathing room. Accessibility aria-label updated to reflect new reading order (infra → Captain → agents). No regressions in TS strict, useReducedMotion, readonly, or test coverage. Build passes. Ready for merge.
