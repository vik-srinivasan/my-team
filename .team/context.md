# Context — UI-changes

## Relevant files

- `packages/ui/src/App.tsx:L37-L107` — Root layout. Three-column shell: left (56px), middle (flex-1), right (520px). Renders `NotificationBanner`, header bar when a session is selected, conditionally mounts `Chat` and `RightPanel`. Right column absent when nothing selected.
- `packages/ui/src/components/SessionList.tsx:L31-L101` — Left column session list. Phase dot + title + age, second line shows phase + `active_specialist`. Click selects; `+` opens `NewSessionModal`. Polls every 5s via `useSession`.
- `packages/ui/src/components/AgentList.tsx:L22-L62` — Bottom of left column when a session is selected. Captain status + `Scout > Eng > Test > Rev > Git` pipeline bar.
- `packages/ui/src/components/Chat.tsx` — Full captain chat with streaming markdown, approve button (when `awaiting_approval`), auto-scroll. Heavy detail view we're moving away from.
- `packages/ui/src/components/RightPanel.tsx` — Tab bar (Diff / Plan / Review / Journal / Decisions). Custom diff parser + react-markdown views.
- `packages/ui/src/components/NotificationBanner.tsx` — Polls `/api/notifications` every 10s. Amber dismissible banners for blocked sessions. Already wired into `App.tsx`.
- `packages/ui/src/store.ts` — Zustand store: `sessions`, `selectedSessionId`, `sessionState`, `messages`, `teamFiles`, `diff`, `rightTab`, `remoteUrl`. `selectSession()` clears per-session state.
- `packages/ui/src/hooks/useSession.ts` — Fetches list (poll 5s); on selection fetches `GET /api/sessions/:id` + diff; polls both every 5s.
- `packages/ui/src/hooks/useWebSocket.ts` — `ws://.../ws/sessions/:id`. Events: `output` (ANSI strip > captain stream), `state`, `team_file`, `diff`, `remote_url`, `specialist`. Auto-reconnects every 2s. Streaming finalized after 3s silence. No `tabManuallySet` flag.
- `packages/ui/src/api.ts` — Thin HTTP client; relative `/api` base (Vite proxy in dev, wrapper serves `dist/` in prod).
- `packages/ui/src/dev-seed.ts` — Mock seed data via `seedDevData()`.
- `packages/shared/src/types.ts:L130-L139` — `SessionSummary`: `{ id, title, source_repo, phase, active_specialist, created_at }`. No `last_checkpoint`, `blockers`, or `must_ask_pending` at the list level.
- `packages/shared/src/types.ts:L27-L34` — `SessionState`: `{ phase, active_specialist, review_iterations, max_review_iterations, last_checkpoint, blockers, must_ask_pending }`.
- `packages/wrapper/src/session-manager.ts:L38` — Notifications dir: `~/team/notifications/`.
- `packages/wrapper/src/session-manager.ts:L222-L231` — `listSessions()` returns `SessionSummary[]` from in-memory state; does NOT include `blockers` or `must_ask_pending`.

## Conventions

- Components: `PascalCase.tsx`. Hooks: `useXxx.ts` in `src/hooks/`. ESM imports use `.js` extension.
- Tailwind v4 via `@tailwindcss/vite`. One `@import 'tailwindcss'` in `src/index.css`. No `tailwind.config.js`.
- Color palette: `zinc-950` bg, `zinc-900` panels, `zinc-800` borders/hover. Status: cyan=scouting/planning, amber=awaiting_approval, blue=executing, purple=reviewing, green=done, red=blocked. `PHASE_DOT` is duplicated in `App.tsx` and `SessionList.tsx` — consolidate.
- Zustand with selector subscriptions. All mutations through named actions. `selectSession()` resets per-session state — any persistent "last seen" must live outside the session slice.
- No UI component tests currently. Convention is vitest colocated.

## Dependencies

- React 19.1 + Vite 6
- Tailwind v4
- Zustand v5
- `lucide-react` v0.511
- `react-markdown` v10 + `remark-gfm` v4 + `rehype-highlight` v7
- No component library (no shadcn / radix)

## Data available for "needs attention" signals

`GET /api/sessions` returns `SessionSummary` with `phase` + `active_specialist` only. From this alone:
- `phase === 'awaiting_approval'` -> needs approval
- `phase === 'blocked'` -> needs attention (also in `NotificationBanner`)
- `must_ask_pending.length > 0` -> only in `SessionState`, not `SessionSummary`. Options: (a) expand `SessionSummary` + `listSessions()`, (b) fetch all detail, (c) poll `/api/notifications`.

"New updates since last viewed" has no built-in signal. Simplest: client-side `Map<id, lastViewedAt>` in store, compare against `last_checkpoint` from detail fetch / state WS events.

## Gotchas

- `PHASE_DOT` duplicated — extract to shared util.
- `selectSession()` wipes messages — if overview shows recent captain output for non-selected sessions, output must come from a separate endpoint or a session-keyed map.
- `useWebSocket` mounts in `Chat`. Single instance tied to selected session.
- Session list polling is 5s — fine for overview.
- `NotificationBanner` already works — keep.
- `SessionSummary` lacks `last_checkpoint` — if overview wants "updated X ago", expand the shared type + `listSessions()`.
- Tailwind v4 — no config file. Dark mode is manual classes.
- Vite proxy — dev `/api` and `/ws` -> `localhost:3001`. Prod: wrapper serves `dist/`. No router; SPA, no URL-based routing.
