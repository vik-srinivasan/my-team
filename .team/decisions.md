## 2026-05-10T20:18:00Z — engineer (A)
Question: `pnpm -r build` failed for `@my-team/cli` due to pre-existing TS errors in `packages/cli/src/commands/start.ts` (`Property 'on' does not exist on type 'ChildProcess'`, `Parameter 'err' implicitly has 'any' type` x2 etc.). The `cli` package is missing `@types/node` in its devDependencies, so Node's `ChildProcess` lacks type info.
Options considered:
1. Add `@types/node` to `packages/cli/package.json` devDependencies as a minimal fix.
2. Leave it alone — it's unrelated to the rename and out of my engineer-A scope.
Decision: Option 2 — leave alone. Verified by checking out `b360f5c` (pre-rename) that the same error existed before my changes. The rename did not introduce or worsen it. Logging here for the reviewer/captain to triage as a separate follow-up.
