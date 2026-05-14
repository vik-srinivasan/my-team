# @my-team/ui

Tauri macOS app + Vite web frontend for my-team session control. This package ships a single React + Tailwind 4 codebase that runs both as a native macOS desktop app (Tauri v2) and as a web fallback served by the `team ui` command on `localhost:3737`.

## Overview

The UI provides a visual dashboard for managing my-team sessions:

- **Sidebar** — Lists all active sessions with attention sort, search, and a "New Session" button.
- **Workspace tabs** — Eight tabs per session: Journal (live updates), Tasks (live checklist), Plan (feature spec), SRD (requirements), Review (latest pass expanded), Diff (syntax-highlighted source changes), Terminal (bidirectional PTY bridge), and Workflow (specialist prompt editor + toggles + effort override).
- **Real-time updates** — Journal, Tasks, Plan, and Review tabs stream live via WebSocket as the captain writes. The diff viewer updates on each engineer commit. The terminal tab pipes bidirectional I/O to the captain's PTY.
- **Customization** — The Workflow tab lets you edit specialist prompts, toggle optional specialists on/off, and override the session effort level — all persisted to `.team/workflow.json` and honored by the captain on next dispatch.

## Development

### Web mode (Vite dev server)

```bash
pnpm --filter @my-team/ui dev
```

Boots Vite at `http://localhost:5173` with HMR. The UI connects to the wrapper daemon at `http://127.0.0.1:3001`, so start the daemon first with `team start`.

### Tauri mode (macOS desktop)

```bash
pnpm --filter @my-team/ui tauri:dev
```

Launches the native macOS window with HMR pointed at the Vite dev server. Requires Rust toolchain and Xcode CLT (see **Prerequisites** below).

## Build

### Web

```bash
pnpm --filter @my-team/ui build
```

Produces `dist/` with optimized HTML, JS, and CSS. Served by `team ui` at `localhost:3737`.

### macOS desktop app (Tauri)

```bash
pnpm --filter @my-team/ui tauri:build
```

Builds the unsigned `.app` and `.dmg` under `apps/ui/src-tauri/target/release/bundle/macos/`. The build supports both arm64 and x86_64 targets. Use:

```bash
pnpm --filter @my-team/ui tauri:build:universal    # fat binary
pnpm --filter @my-team/ui tauri:build:aarch64      # arm64 only
pnpm --filter @my-team/ui tauri:build:x64          # x86_64 only
```

## Prerequisites

**All targets:**
- Node.js 22+
- pnpm 11+

**Tauri only (macOS desktop build):**
- Rust toolchain — install via `rustup`:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- Xcode Command Line Tools — install via:
  ```bash
  xcode-select --install
  ```

If Rust isn't installed, `pnpm --filter @my-team/ui tauri:dev` and `tauri:build` will fail. The web fallback (`team ui` command) works without Rust.

## Gatekeeper note (first launch)

The `.app` produced by `tauri:build` is **unsigned** in v1. On first launch, macOS Gatekeeper will refuse to open it with a "app cannot be opened because Apple cannot check it for malicious software" dialog. To bypass:

1. Right-click the `.app` in Finder.
2. Select **Open** from the context menu.
3. Click **Open** in the system prompt.

Code-signing and notarization is a follow-up.

## Testing

```bash
pnpm --filter @my-team/ui test
```

Runs vitest with jsdom. Tests use `@testing-library/react` for component testing and `mock-socket` for WebSocket stubs.

## Architecture quick-reference

**Layout:** `App.tsx` wraps the UI with QueryClientProvider (TanStack Query) and hosts two top-level ErrorBoundaries — one for Sidebar, one for SessionWorkspace.

**Sidebar:** Session list with attention sort, search filter, and "+ New Session" button. Powered by `useSessions` hook (TanStack Query polling + Zustand selection state).

**SessionWorkspace:** Eight tabs managed via a `useSessionWebSocket` hook (custom reducer + exponential-backoff reconnect), TanStack Query for fetch-once data (plan, srd, journal, tasks, review, diff), and imperative xterm.js handle for the terminal.

**Tabs:** 
- Read-only tabs (Journal, Tasks, Plan, SRD, Review) use `react-markdown` + `remark-gfm` with shared markdown styling.
- DiffTab uses `parse-diff` to reconstruct per-file diffs and `react-diff-viewer-continued` with Prism syntax highlighting.
- TerminalTab attaches xterm.js to the WebSocket pty stream with a ResizeObserver-driven refit loop.
- WorkflowTab loads agent prompts via `useAgentPrompt` (cache-seeded mutations) and workflow config via `useWorkflowConfig` (optimistic updates).

**State:** Zustand store (`src/store.ts`) holds ephemeral UI state (selected session, active tab). TanStack Query handles server cache. Custom `connectSessionSocket` (lib/ws.ts) manages WebSocket lifecycle with backoff reconnect.

## File structure

```
apps/ui/
├── src/
│   ├── main.tsx              # Vite entry
│   ├── App.tsx               # Top-level layout + error boundaries
│   ├── store.ts              # Zustand UI state
│   ├── lib/
│   │   ├── api.ts            # Typed fetch client
│   │   ├── ws.ts             # WebSocket helper with reconnect
│   │   ├── markdown.tsx       # Shared react-markdown components
│   │   ├── diff.ts           # Unified diff parser + helpers
│   ├── hooks/
│   │   ├── useSessions.ts
│   │   ├── useSessionDetail.ts
│   │   ├── useSessionWebSocket.ts
│   │   ├── useTeamFile.ts
│   │   ├── useAgentPrompt.ts
│   │   ├── useAgentList.ts
│   │   ├── useWorkflowConfig.ts
│   │   ├── useKeyboardShortcuts.ts
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── SidebarItem.tsx
│   │   ├── NewSessionModal.tsx
│   │   ├── SessionWorkspace.tsx
│   │   ├── SessionHeader.tsx
│   │   ├── SessionActions.tsx
│   │   ├── Terminal.tsx
│   │   ├── PromptEditor.tsx
│   │   ├── Skeleton.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── ShortcutHelp.tsx
│   │   ├── tabs/
│   │   │   ├── JournalTab.tsx
│   │   │   ├── TasksTab.tsx
│   │   │   ├── PlanTab.tsx
│   │   │   ├── SrdTab.tsx
│   │   │   ├── ReviewTab.tsx
│   │   │   ├── DiffTab.tsx
│   │   │   ├── TerminalTab.tsx
│   │   │   ├── WorkflowTab.tsx
│   ├── index.css
├── src-tauri/
│   ├── src/main.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── index.html
├── README.md (this file)
```
