# Tasks — ui fixes

## Engineering — Track A (Terminal tab rendering)

- [x] @engineer Flip `convertEol: true` → `convertEol: false` in `apps/ui/src/components/Terminal.tsx` xterm options. (commit d865a63)
- [x] @engineer Move initial `fit.fit()` from `requestAnimationFrame` to synchronous post-`term.open()` so the first PTY frames render at the right width. (commit b2fa784)
- [x] @engineer Add a 16ms trailing debounce around `handleResize` in `apps/ui/src/components/tabs/TerminalTab.tsx`. (commit 20b8d66)
- [x] @engineer Update `apps/ui/src/components/Terminal.test.tsx` to assert `convertEol: false`. (commit 29cd633)
- [x] @engineer Add a `TerminalTab.test.tsx` case verifying debounced resize emits one WS resize per burst. (commit 29cd633)

## Engineering — Track B (Captain Chat tab)

- [x] @engineer Add `'chat'` to `TabName` + `TAB_NAMES` as the **first** entry in `apps/ui/src/store.ts`, and set the store's default `activeTab` to `'chat'`. (commit 379e298)
- [x] @engineer Add Chat entry to `TAB_LABELS` as the **leftmost** tab and the `renderTab()` switch in `apps/ui/src/components/SessionWorkspace.tsx`. (commit 379e298)
- [x] @engineer Create `apps/ui/src/components/tabs/ChatTab.tsx`: subscribes to socket output, ANSI-strips, maintains `messages` state, **renders each turn with a faint horizontal rule above it and a small muted "you"/"captain" role label**, autoscrolls, renders markdown, has bottom-pinned input (Enter to send, Shift+Enter newline). (commit 379e298)
- [x] @engineer Extend `apps/ui/src/hooks/useSessionWebSocket.ts` with a small (≤50) ring buffer of recent output chunks; expose via the snapshot. Keep existing `output` semantics for incremental writes. (commit 3b94f8b)
- [x] @engineer Remove the inline `<input>` form from `apps/ui/src/components/SessionActions.tsx` (Approve/Kill/Purge/VSCode stay). (commit d253ade)
- [x] @engineer Add `strip-ansi` to `apps/ui/package.json` dependencies. (commit 379e298)
- [x] @engineer Write `apps/ui/src/components/tabs/ChatTab.test.tsx`: send echoes locally, captain output ANSI-stripped and appended, multiple chunks within 2s merge into one message, autoscroll on new content, send disabled when session not alive. (commit 379e298)
- [x] @engineer Extend `useSessionWebSocket.test.ts` with a ring-buffer accumulation test. (commit 3b94f8b)

## Engineering — Track C (Cross-session non-interference, CLI-priority)

- [x] @engineer Add `client_role: 'cli'` to the WS hello sent by `packages/cli/src/commands/attach.ts`. CLI keeps its resize-on-SIGWINCH behavior. (commit d6dbae1)
- [x] @engineer Send `client_role: 'web'` as the first WS message from `apps/ui/src/hooks/useSessionWebSocket.ts` (or `lib/ws.ts`). (commit 3b94f8b)
- [x] @engineer In `packages/wrapper/src/api/websocket.ts`: track per-session CLI client count. On `resize` from `web`, drop if any CLI is attached; otherwise forward. Decrement on close so resizes fall back to `web` when no CLI is connected. (commit aad009b)
- [x] @engineer Dedupe redundant identical-dimension resize forwards in `packages/wrapper/src/api/websocket.ts`. (commit aad009b)

## Testing

- [x] @tester Run full vitest suite (`apps/ui` + `packages/wrapper` + `packages/cli`); confirm green.
- [x] @tester Add `packages/wrapper/src/api/websocket.test.ts` cases for CLI-priority resize: (a) `web` + `cli` both send resize → only the `cli` resize reaches `sessionManager.resizeCaptain`; (b) only `web` client connected → its resize is forwarded; (c) `cli` disconnects → `web` resize starts being forwarded again.
- [x] @tester Verify the ChatTab tests cover the listed behaviors (send echo, ANSI strip, merge window, autoscroll, disabled-input).

## End-to-end

- [ ] @runner Boot `pnpm --filter @my-team/ui dev` (or `pnpm tauri dev`), open a live session, click Terminal tab. Verify spinner + status bar render correctly with no stacking/fragmenting.
- [ ] @runner On the same session, open the Chat tab. Type a message. Verify the user message echoes immediately and the captain's reply streams in cleanly with markdown.
- [ ] @runner Open the same session in a standalone terminal with `team attach <id>`. Resize the browser window. Verify the standalone view does not garble.
- [ ] @runner Confirm the top-right "Send to captain..." input is gone.

## Visual

- [ ] @designer Screenshot + critique the new Chat tab: message density, bubble vs. transcript readability, input affordances, empty state, autoscroll feel. Iterate with engineer for revisions if needed.

## Visual revisions (from designer pass 1 — blocking)

- [x] @engineer Fix 1: Center empty state vertically — move the empty state `<p>` out of the `font-mono` div and apply `flex h-full items-center justify-center` centering. Use `font-sans` on the empty state text. See `.team/artifacts/designer-revisions.md` for exact diff. (commit 4d84f12)
- [x] @engineer Fix 2: Suppress top border on first message — add `isFirst: boolean` prop to `ChatMessageView` and conditionally omit `border-t border-zinc-800/60` when `isFirst` is true. See `.team/artifacts/designer-revisions.md` for exact diff. (commit 4d84f12; also tweaked role label contrast — user `text-neutral-400`, captain `text-neutral-500`)

## Review

- [x] @reviewer Code review pass; produce `.team/review.md` with severity-bucketed findings.

## Review revisions (from reviewer pass 1 — blocking)

- [x] @engineer Fix Blocker 1: add `recentOutput: []` to `makeSnapshot` / `makeSocket` fixtures (TerminalTab + DiffTab + JournalTab + PlanTab + ReviewTab + TasksTab + ChatTab mock sig). `tsc --noEmit` now clean. (commit 9b495c3)
- [x] @engineer Fix Blocker 2: call `cleanup()` from `attach.ts` `ws.on('close')` handler; made cleanup idempotent with `cleaned` guard so user-initiated and server-initiated paths can both invoke it safely. (commit 73d0e32)
- [x] @engineer Regression test: `packages/cli/src/commands/attach.test.ts` boots a real WS server on an ephemeral port (new `MY_TEAM_WS_BASE` env override), drives server-side close, asserts listener counts return to baseline. Verified to fail on the bugged version. (commit 43daebd)

## Docs

- [ ] @documenter Update `CLAUDE.md` UI conventions section if xterm option changes need a note. Update `CHANGELOG.md` with: Terminal tab rendering fix, new Chat tab, `team attach` no longer forwards resize.

## Git

- [ ] @captain Push branch and open PR.
