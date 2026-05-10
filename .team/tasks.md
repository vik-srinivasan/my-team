# Tasks — landing-page value props

## Round 1 (shipped — PR #8)

### Engineering
- [x] @engineer Create `apps/landing/app/components/WhyMyTeam.tsx` — new client section component with three terse value-prop cards (full-team quality, fewer tokens, hands-off after brainstorm). Match existing section/card patterns from `context.md`. Use `motion/react`, `useReducedMotion`, `lucide-react` icons, `var(--color-*)` tokens. Keep copy short.
- [x] @engineer Wire `WhyMyTeam` into `apps/landing/app/page.tsx` between `HowItWorks` and `Architecture`.
- [x] @engineer Run `pnpm --filter @my-team/landing build` and confirm it passes.
- [x] @engineer Commit using Conventional Commits style.

### Testing
- [x] @tester Light: confirm `pnpm --filter @my-team/landing build` passes. No new integration tests needed (presentational only).

### Review
- [x] @reviewer Light single-pass review.

### Preview
- [x] @engineer Vercel preview deploy. URL: https://landing-eosin-mu.vercel.app

### Git
- [x] @git Push branch and open PR. PR: https://github.com/vik-srinivasan/my-team/pull/8

---

## Round 2 (current)

### Engineering
- [x] @engineer Add a 2–3 sentence personal-story paragraph under the hero header in `apps/landing/app/components/Hero.tsx`. Conversational, first-person. Vibe seed (rewrite tightly, do not copy verbatim): "started because I wanted a more structured way to interact with Claude Code that felt like having a coworker engineer. Now it's how I build 95% of the time. Give a team a task, approve the plan, walk away." → commit fb88ed7
- [x] @engineer Restructure the Architecture diagram in `apps/landing/app/components/Architecture.tsx` so Captain + sub-agents (scout, engineer×N, tester, reviewer, git) are the visual centre. Show what each sub-agent produces / does (e.g. scout → context.md, engineer → commits, tester → suite, reviewer → review.md, git → PR). Demote CLI / Wrapper daemon / Web UI / sessions dir into a smaller infra lane. → commit a0a8dda
- [x] @engineer Run `pnpm --filter @my-team/landing build` and confirm it passes.
- [x] @engineer Commit using Conventional Commits style.

### Testing
- [x] @tester Light: confirm build passes and the new paragraph + restructured diagram render in `page.tsx`.

### Review
- [x] @reviewer Light single-pass review: paragraph tone/length, diagram visual hierarchy, accessibility, TS strict.

### Preview
- [x] @engineer Vercel preview deploy. Preview: https://landing-19gwazpyo-vikr4m-5448s-projects.vercel.app · Production alias updated: https://landing-eosin-mu.vercel.app

### Git
- [x] @git Push branch (it's the same `my-team/clear-ash-84` branch, so the existing PR #8 picks up the new commits automatically). Comment on PR #8 with the new preview URL.

---

## Round 3 (current)

### Engineering
- [x] @engineer Move the infra lane (CLI / Web UI / Wrapper daemon / sessions worktree) back to the **top** of the Architecture diagram, above Captain. Keep it visually subordinate — smaller, dimmer, in a thin row — so Captain + sub-agent fan-out remains the focal point.
- [x] @engineer Polish the diagram: clean up dispatch / result curve routing under Captain (round-2 looks busy), reposition the `spawn` and `Task tool` labels so they sit intentionally on their lines, remove any stray dotted lines bleeding between layers, tighten vertical / horizontal alignment of agent boxes and labels.
- [x] @engineer Run `pnpm --filter @my-team/landing build` and confirm it passes.
- [x] @engineer Commit using Conventional Commits style.

### Testing
- [ ] @tester Light: confirm build passes; spot-check that infra lane is now above Captain in the SVG and existing tests still pass. Do not write new integration tests.

### Review
- [ ] @reviewer Light single-pass review: visual hierarchy (infra → captain → agents), curve routing readability, no regressions in accessibility / TS strict.

### Preview
- [ ] @engineer Vercel preview deploy. Capture URL for final report.

### Git
- [ ] @git Push to the existing branch / PR #8. Comment on PR with the new preview URL.
