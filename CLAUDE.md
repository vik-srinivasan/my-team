# my-team — Project Conventions

This file is read at the start of every Claude Code session in this repo. Treat it as standing orders.

## Source of truth

`SPEC.md` at the repo root is the spec. If the user asks for something that contradicts it, point at the spec and ask whether it should be updated. Do not silently deviate.

## Working style

- **Build phase by phase.** SPEC.md section 12 lists the phases. Don't pull features from later phases into earlier ones unless the user asks. The point of phasing is to validate the architecture early on a small surface.
- **End-to-end happy path before edge cases.** For each phase, get the smallest version working all the way through before adding error handling, edge cases, or polish.
- **Commit frequently.** After each meaningful working piece (a passing test, a working API endpoint, a rendered component), commit. Use Conventional Commits: `feat(wrapper): spawn claude with captain prompt`, `fix(cli): handle missing repo gracefully`, etc.
- **No big-bang changes.** Refactors should land as their own commits, separately from feature work.

## Code style

- TypeScript strict mode. No `any`. If you must escape the type system, use `unknown` and narrow.
- ESM modules everywhere (`"type": "module"` in package.json, `.js` extensions in imports).
- Functional over class-based unless there's a reason. Hooks for React state, plain functions in the wrapper.
- Errors: throw typed errors that extend a base `MyTeamError` class. Catch at API boundaries, log with `pino`, return structured error responses.
- No console.log in committed code. Use `pino` in the wrapper, `console.error` for fatal CLI errors only.
- Async/await over `.then`. No callback-style code unless interfacing with a library that requires it (and even then, wrap in `promisify`).
- Top-level imports first, then types, then code. No mid-file imports.

## File naming

- Files: `kebab-case.ts`
- React components: `PascalCase.tsx`, one component per file
- Types: live in `types.ts` per package, or in `packages/shared/src/types.ts` if used across packages
- Tests: `<name>.test.ts` colocated with the source file

## Testing

- `vitest` for everything.
- Unit tests for pure functions and reducers.
- Integration tests for HTTP endpoints (use supertest).
- For the wrapper, mock `node-pty` and `simple-git` at the boundary.
- Aim for tests that verify behavior, not implementation. Don't test private internals.
- Don't ship a phase without tests for the happy path of every public surface added in that phase.

## Dependencies

- Add new dependencies sparingly. If a feature can be done with the standard library or an existing dep, prefer that.
- Pin major versions. Use `^` for minor.
- Document non-obvious deps in `README.md`.

## When in doubt

Ask the user. The spec covers the major shape; small ambiguities (naming, exact file paths, whether to log a thing or not) are fine to make a call on and note. Architectural ambiguities should be raised.

## Things to be loud about

If any of these come up, stop and tell the user before continuing:
- A spec section is internally inconsistent.
- A dependency in the spec doesn't work as described (e.g., a `claude` CLI flag doesn't exist in the installed version).
- Something in the spec assumes a capability that isn't there (e.g., assuming Claude Code subagents can run in parallel when they can't).
- The build is going significantly differently from the spec.

Better to surface a problem at line 100 than discover it at line 5000.

## Implementation tracking

- **Follow `implementation_plan.md` strictly.** It is the step-by-step build plan. Do not skip stages or reorder without user approval.
- **Check off tasks in `tasks.md`** as each stage is completed. Use `[x]` format.
- **Commit after every major stage** using the commit message specified in `implementation_plan.md`.
- **Push after every phase** (Phase 1, 2, 3, 4).
- **Keep docs updated throughout**: `tasks.md`, `implementation_plan.md` decision log, and `README.md` as features land.

## Environment

- **Node**: v22 (required by pnpm 11)
- **pnpm**: v11 (installed via homebrew)
- **GitHub**: `gh` authenticated as `vik-srinivasan`, repo at `vik-srinivasan/my-team`
- **Session IDs**: human-readable format (`adjective-noun-number`)
