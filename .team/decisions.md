## 2026-05-10T22:05:00Z — engineer
Question: Vercel preview deploy: repo-root link with `vercel.json` outputDirectory `.next` failed because the build outputs to `apps/landing/.next` when run via `pnpm --filter`. The existing landing project (per commit 89610bd) is configured with project root = `apps/landing`, but local `.vercel` link did not exist.
Options considered:
  1. Edit `vercel.json` outputDirectory to `apps/landing/.next` for repo-root deploys (would break the existing remote project where root is already `apps/landing`).
  2. Deploy from `apps/landing/` directory — Vercel auto-creates a fresh project named `landing` and runs `next build` natively.
Decision: Option 2. Deleted the auto-created `clear-ash-84` Vercel link at repo root, ran `vercel --yes` from `apps/landing/`. New project `landing` created (separate from the existing `docs` landing project). This avoids touching the committed `vercel.json` and gets the user a working preview URL fast. The new project link lives at `apps/landing/.vercel/` which is gitignored.

## 2026-05-10T22:06:00Z — engineer
Question: Icon choice for the three value props.
Options considered: Users/Zap/Coffee, Users/Coins/Hand, UsersRound/Sparkles/Moon.
Decision: Users/Zap/Coffee. Users maps cleanly to "team", Zap to "lighter/faster tokens", Coffee to "walk away" — all from the requirements suggestion list and tonally consistent with the existing FlowNarrative/HowItWorks icon usage.
