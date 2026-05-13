# Tasks — add more subagents

## Engineering

### Slice 1 — Standardize agent prompt format
- [x] @engineer Refactor `agent-prompts/scout.md` to standardized opening (Intro / Your team / Effort level / Your mission / Before you start / Your workflow / agent-specific). Preserve substantive content.
- [x] @engineer Refactor `agent-prompts/engineer.md` to standardized opening.
- [x] @engineer Refactor `agent-prompts/tester.md` to standardized opening.
- [x] @engineer Refactor `agent-prompts/reviewer.md` to standardized opening.
- [x] @engineer Refactor `agent-prompts/captain.md` opening section to use standardized headers (adapted for orchestrator context).

### Slice 2 — Five new agent prompts
- [x] @engineer Write `agent-prompts/debugger.md` (model: sonnet; tools: Read, Grep, Glob, Bash).
- [x] @engineer Write `agent-prompts/designer.md` (model: sonnet; tools: Read, Edit, Bash). Include Playwright lazy-install + screenshot loop instructions.
- [x] @engineer Write `agent-prompts/runner.md` (model: sonnet; tools: Read, Bash). Include lazy-install Playwright if endpoint testing needs a browser; otherwise curl/CLI is fine.
- [x] @engineer Write `agent-prompts/auditor.md` (model: opus; tools: Read, Grep, Glob, Write). Writes findings to `review.md` under `## Security audit (auditor)`.
- [x] @engineer Write `agent-prompts/documenter.md` (model: haiku; tools: Read, Edit).

### Slice 3 — Captain prompt updates
- [x] @engineer Add all 5 new agents to captain dispatch rules section in `agent-prompts/captain.md`.
- [x] @engineer Add SRD step to captain planning phase: scout returns → captain drafts `.team/srd.md` with user → user confirms → captain drafts `plan.md` → approval → execution.
- [x] @engineer Add captain section: "Conditional dispatch triggers" — when to invoke designer/runner/auditor/debugger/documenter.
- [x] @engineer Extend effort-level table in captain to cover new agents.

### Slice 4 — SRD artifact wiring
- [x] @engineer Add `'srd.md'` to `TEAM_FILE_NAMES` in `packages/wrapper/src/team-files.ts`.
- [x] @engineer Add `srd` field to `TeamFiles` interface in `packages/shared/src/types.ts`.
- [x] @engineer Update `readAllTeamFiles` to include `srd.md`.
- [x] @engineer Initialize `.team/srd.md` (empty stub or placeholder header) in `packages/wrapper/src/worktree.ts`.
- [x] @engineer Create `packages/cli/src/commands/srd.ts` mirroring `plan.ts` (with `__test__` export for the render function).
- [x] @engineer Register `srdCommand()` in `packages/cli/src/index.ts` (alphabetical, between `purge` and `start`).
- [x] @engineer Add `team srd <id>` to the command list in `packages/cli/src/commands/help-info.ts`.

### Slice 5 — Landing page
- [ ] @engineer Extend `AgentId` union and `AGENTS` array in `apps/landing/app/agents.ts` with 5 new entries (id, label, title, description, color, status).
- [ ] @engineer Extend the hardcoded `SUB_AGENTS` array in `apps/landing/app/components/Architecture.tsx` (5 → 9 entries) and update aria-label.
- [ ] @engineer Add `srd.md` to `FILE_TREE` in `apps/landing/app/components/HowItWorks.tsx`.
- [ ] @engineer Add `srd.md` to `TEAM_FILES` in `apps/landing/app/components/GettingStarted.tsx`.

### Slice 6 — Docs
- [ ] @engineer Update `README.md` — "The team" section (lines 44-52), command table (lines 55-74) with `team srd <id>`, "How it works" prose (line 117).
- [ ] @engineer Update `SPEC.md` — glossary line 15, add §5.6–5.10 specialist subsections, update §12 phases to include SRD, update file layout tree at lines 428-434.
- [ ] @engineer Update agent team list in `packages/cli/src/commands/help-info.ts` (lines 52-57) to include all 9 specialists.

## Testing

- [ ] @tester Write `packages/cli/src/commands/srd.test.ts` — happy path (file present), missing-file path, empty-file path. Mirror `plan.test.ts`.
- [ ] @tester Add tests for `srd.md` in team-files watching — `packages/wrapper/src/team-files.test.ts`.
- [ ] @tester Update `apps/landing/app/components/Architecture.test.ts:36-44` — assert all 9 specialists are present.
- [ ] @tester Add a frontmatter-validity test for all 9 agent `.md` files (`name`, `description`, `model`, `tools` present and well-formed).
- [ ] @tester Add a test verifying every agent `.md` file contains the standardized section headers (Intro / Your team / Effort level / Your mission / Before you start / Your workflow).
- [ ] @tester Run `pnpm test` across the whole workspace, report pass/fail counts.
- [ ] @tester Run `pnpm build` to verify nothing breaks at compile time.
- [ ] @tester Manual smoke: simulate the SRD planning step by writing a sample SRD to a temp `.team/` dir and confirming `readTeamFile` picks it up.

## Review

- [ ] @reviewer Thorough security review of `agent-prompts/auditor.md` content (does its own prompt encourage correct OWASP coverage?).
- [ ] @reviewer Review the Playwright lazy-install path in designer/runner for command-injection / arbitrary-shell risks.
- [ ] @reviewer Review captain dispatch rule changes for ambiguity (could two agents fire on the same trigger?).
- [ ] @reviewer Standard correctness pass across all CLI / wrapper / types changes.
- [ ] @reviewer Verify landing page test assertions match the rendered component output.

## Git

- [ ] @captain Push branch and open PR.
