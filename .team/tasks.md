# Tasks — landing-page value props

## Engineering
- [x] @engineer Create `apps/landing/app/components/WhyMyTeam.tsx` — new client section component with three terse value-prop cards (full-team quality, fewer tokens, hands-off after brainstorm). Match existing section/card patterns from `context.md`. Use `motion/react`, `useReducedMotion`, `lucide-react` icons, `var(--color-*)` tokens. Keep copy short.
- [x] @engineer Wire `WhyMyTeam` into `apps/landing/app/page.tsx` between `HowItWorks` and `Architecture`.
- [x] @engineer Run `pnpm --filter @my-team/landing build` and confirm it passes.
- [x] @engineer Commit using Conventional Commits style.

## Testing
- [ ] @tester Light: confirm `pnpm --filter @my-team/landing build` passes. No new integration tests needed (presentational only).

## Review
- [ ] @reviewer Light single-pass review: copy length, visual consistency with adjacent sections, accessibility (motion guard, aria-hidden on icons), TS strict.

## Preview
- [ ] @engineer Produce a Vercel preview deployment of the landing app and capture the URL for the final report.

## Git
- [ ] @git Push branch and open PR with the session title.
