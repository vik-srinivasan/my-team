# Plan — landing-page value props (round 2)

**Effort level:** light — copy + diagram restructure, no logic changes.

## Round 1 (shipped — PR #8)

Added `WhyMyTeam` value-props section between `HowItWorks` and `Architecture`.

## Round 3 goals

1. **Move infra back to the top** of the Architecture diagram (above Captain). User reviewed the round-2 layout and prefers infra leading visually but still subordinate (smaller / dimmer than the agent fan-out).
2. **Polish pass on the diagram.** Round-2 layout reads well but the curves crossing under Captain feel busy, the `spawn` / `Task tool` labels float awkwardly, and there's a stray dotted line bleeding from the agent area through the infra lane. Tighten alignment, clean up routing, improve label placement, ensure every line lands intentionally. No new libraries.

## Round 2 goals

1. **Personal-story blurb under the hero header.** 2–3 sentences. Vibe: "this started because I wanted a more structured way to interact with Claude Code that felt like having a coworker engineer. It's now how I build 95% of the time. Give a team a task, approve the plan, walk away to a PR." Conversational, first-person, terse.
2. **Restructure the Architecture diagram** to put Captain + sub-agents (scout, engineer×N, tester, reviewer, git) at the visual centre. The current diagram leads with CLI / Wrapper / Web UI infra and treats sub-agents as a side cluster — the user wants the sub-agent fan-out and how each one feeds back to Captain to be the headline. CLI/wrapper/sessions can stay but should be visually secondary.

## Approach

- **Hero blurb** — edit `apps/landing/app/components/Hero.tsx`. Insert a `<p>` directly under the existing tagline / before the stat row. Use `text-[color:var(--color-muted)] leading-relaxed max-w-2xl`. Keep tone first-person, no marketing fluff.
- **Diagram** — edit `apps/landing/app/components/Architecture.tsx` (the file behind the screenshot the user sent). Reorganize so:
  - Captain is the centre / top of the visual hierarchy.
  - The sub-agents (scout, engineer×N, tester, reviewer, git) fan out from Captain with labelled edges showing what each produces or does (e.g. scout → `context.md`, engineer → commits, tester → test runs, reviewer → `review.md`, git → PR).
  - CLI / Web UI / Wrapper daemon / sessions directory stay but are demoted — smaller, off to one side, or rendered as a thin "infra" lane underneath.
  - Engineer×N parallelism stays visually obvious.
- After implementation, redeploy a Vercel preview and report the URL.

## Scope

- `apps/landing/app/components/Hero.tsx` — add intro paragraph
- `apps/landing/app/components/Architecture.tsx` — restructure diagram

## Out of scope

- Other sections, design tokens, Tailwind config changes
- Adding new agents or changing the agents.ts data shape

## Acceptance criteria

- Hero has a short personal-story paragraph in the right spot.
- Diagram visually leads with Captain → sub-agents fan-out, with infra demoted.
- Build passes.
- Preview URL provided.
