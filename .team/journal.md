## 2026-05-10T19:35:00Z — captain
Session started. Title: "UI-changes". User wants to simplify the viktown dashboard webapp: drop heavy per-session detail (terminal chat already covers that), keep a multi-session overview surfacing captain output and flagging sessions needing attention. Dispatching scout to map current UI code.

## 2026-05-10T19:48:00Z — captain
Plan approved by user ("go"). Beginning execution. Dispatching engineer to work through tasks.md in order: backend types -> foundations -> store -> components. Single engineer because the tasks are tightly coupled across shared types and component files (parallel engineers would step on App.tsx and store.ts).

## 2026-05-10T20:00:00Z — engineer
Completed: All @engineer tasks (backend types, frontend foundations, store/data plumbing, layout + components).
Created: packages/ui/src/lib/phase.ts, packages/ui/src/lib/attention.ts, packages/ui/src/lib/attention.test.ts, packages/ui/src/components/OutputLog.tsx (renamed from Chat.tsx), packages/ui/src/dev-seed.ts.
Modified: packages/shared/src/types.ts, packages/wrapper/src/session-manager.ts, packages/wrapper/src/server.test.ts, packages/ui/src/store.ts, packages/ui/src/hooks/useSession.ts, packages/ui/src/hooks/useWebSocket.ts, packages/ui/src/App.tsx, packages/ui/src/components/SessionList.tsx, packages/ui/src/main.tsx.
Deleted: packages/ui/src/components/RightPanel.tsx (and its rightTab / teamFiles / diff store slices, ws handlers, and useSession fetches).
Commits: 55098fb feat(shared) SessionSummary fields; ba73b37 feat(wrapper) listSessions populates fields; 565a379 refactor(ui) extract phase lib; 430f1ee feat(ui) attention lib + tests; 8303e25 feat(ui) lastViewed slice; 2c13dc8 refactor(ui) useSession; 03354fe refactor(ui) useWebSocket; 7a0b351 feat(ui) two-column layout + OutputLog; 0cce1ba feat(ui) sidebar attention badges; 63600b3 feat(ui) dev-seed; 772f3ec fix(ui) vite/client reference.
Build/test status: pnpm -C packages/ui build green, pnpm -C packages/wrapper build green, full repo test suite (47 tests) all passing including the new attention tests. Pre-existing CLI build error and root pnpm lint failure unchanged from base.
Preview: cd packages/ui && pnpm dev, then open http://localhost:5173/?seed=1 to see the new dashboard with mock sessions exercising every attention path.
