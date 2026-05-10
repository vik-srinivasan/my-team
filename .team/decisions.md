## 2026-05-10T23:19:00Z — engineer
Question: `pnpm -r build` initially failed with `Cannot find module '@my-team/shared'` even though the shared package reported `Done`. The composite TS project's `packages/shared/tsconfig.tsbuildinfo` existed but `packages/shared/dist/` did not.
Options considered: (a) blow away tsbuildinfo and rebuild; (b) `tsc --build --force`; (c) escalate.
Decision: Deleted the stale `packages/shared/tsconfig.tsbuildinfo`. Subsequent `pnpm -r build` produced `dist/` and the whole workspace built cleanly. This is a recurring footgun with TS composite projects when `dist/` is git-ignored but the buildinfo persists across worktrees / clones; not a regression introduced by this change.
