## 2026-05-13T00:25:00Z — captain
Action: Session started. Title: "keep-session-open" — make my-team sessions continue after PR is opened so the user can give follow-up feedback, fix merge conflicts, or add changes, and have the captain still drive `.team/` updates and specialist dispatch.

Dispatching scout to map the full lifecycle (not just the captain prompt): wrapper, CLI, watch view, hooks, state machine, worktree cleanup, notifications. Need to know what assumes `done` is terminal beyond the captain prompt itself.

## 2026-05-13T00:33:00Z — captain
Action: Scout returned. Headline finding: the actual blocker is `scheduleCleanup` in `packages/wrapper/src/session-manager.ts:L231-L233` — a 30s auto-cleanup timer with no cancel handle that nukes the worktree + local branch on `done`. Captain prompt issues are downstream of that.

Wrote `.team/context.md` with full file-by-file breakdown. Phase → planning.

## 2026-05-13T00:38:00Z — captain
Action: Plan drafted. User chose: one PR, standard effort, hard-delete the timer (no cancellable variant). Phase → awaiting_approval.

## 2026-05-13T00:40:00Z — captain
Action: Plan approved by user ("go"). Beginning execution. Dispatching two engineers in parallel — Engineer A on wrapper code, Engineer B on prompts + docs. Phase → executing.
