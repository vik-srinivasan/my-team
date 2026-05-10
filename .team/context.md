# Context — ui-changes

## Relevant files

- `packages/ui/src/App.tsx` — Root layout. Two-column flex: `w-80` left sidebar (`SessionList` + `AgentList`) and right main pane (`OutputLog` with a header bar).
- `packages/ui/src/components/SessionList.tsx` — Left sidebar session list. Already has color indicator via `phaseDot(s.phase)` (tiny `h-1.5 w-1.5` dot). Sort by criticality, attention badges.
- `packages/ui/src/components/OutputLog.tsx` — Main panel. Renders captain output as markdown via `ReactMarkdown` + `remarkGfm` + `rehype-highlight`. Has inline amber approve-banner when `phase === 'awaiting_approval'`.
- `packages/ui/src/components/AgentList.tsx` — Small pipeline widget below the session list (Scout › Eng › Test › Rev › Git).
- `packages/ui/src/hooks/useWebSocket.ts` — WebSocket events. `stripAnsi()` aggressive regex strip and `isMeaningfulText()` filter on raw pty output.
- `packages/ui/src/lib/phase.ts` — Canonical color/label tables. `PHASE_DOT` maps every `SessionPhase` to a Tailwind bg class.
- `packages/ui/src/lib/attention.ts` — Pure function `getAttention(session, lastViewed) → { critical, hasUpdate, reason }`. Where green/yellow/red logic lives.
- `packages/ui/src/store.ts` — Zustand store: `messages`, `sessionState`, `sessions`, `lastViewed`.
- `packages/ui/src/hooks/useSession.ts` — Polls `GET /api/sessions` every 5s and `GET /api/sessions/:id` every 5s.
- `packages/shared/src/types.ts` — `SessionSummary` (line 132): `{ id, title, source_repo, phase, active_specialist, created_at, last_checkpoint, must_ask_count }`. `SessionState` (line 27) adds `blockers` and `must_ask_pending`.
- `packages/ui/src/dev-seed.ts` — Dev seed with 5 varied sessions. Activate via `?seed=1`.
- `packages/ui/src/index.css` — Tailwind v4 + thin scrollbar. No CSS variables/design tokens.

## Conventions

- TypeScript strict, ESM, kebab-case files, PascalCase components.
- Tailwind v4 inline utility classes only — no shadcn, no tailwind.config.
- Zinc-based dark theme (`bg-zinc-950/900`, `border-zinc-800`, `text-zinc-200/300/500`).
- Phase color palette already in `phase.ts`: cyan (scouting/planning), amber-pulse (awaiting_approval), blue-pulse (executing), purple-pulse (reviewing), green (done), red-pulse (blocked), zinc (created/killed).
- Zustand store as single source of truth. No context providers.

## Data flow

1. **Captain output**: `node-pty` → `CaptainProcess.on('data')` → `sessionManager.emitEvent({type:'output'})` → WebSocket → `useWebSocket` → `stripAnsi()` → `isMeaningfulText()` filter → `addMessage/appendToMessage` → `OutputLog` markdown render.
2. **Session state**: Wrapper watches `.team/state.json` via `chokidar` → `setSessionState` updates store and matching `SessionSummary`.
3. **Session list**: `useSession` polls `GET /api/sessions` every 5s → `setSessions`.
4. **Specialist transitions**: Detected via active_specialist diff in state.json watcher → system-message dividers in `OutputLog`.
5. **Approve flow**: "Approve" button → `POST /api/sessions/:id/approve` → wrapper types `approved\n` into PTY.

## Gotchas

- `isMeaningfulText` requires ≥3 word characters — short replies ("OK", "Done") get dropped.
- 3-second `STREAM_FINALIZE_DELAY` stitches consecutive chunks into one bubble.
- Tailwind v4 has no `tailwind.config.ts`. Use `@theme` in `index.css` for custom tokens.
- Selecting a session resets `messages: []` and `sessionState: null`. No history persistence.
- `active_specialist` is only accurate for the selected session (polling).
- The current "color indicator" (`phaseDot`) is `h-1.5 w-1.5` — tiny. Redesign wants a more prominent green/yellow/red status indicator.
- `getAttention` already classifies critical/hasUpdate — use this for the green/yellow/red mapping.
