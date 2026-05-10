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
