# @my-team/ui

Vite + React 19 + Tailwind 4 + Tauri v2 desktop/web UI for my-team.

This package ships **two** distribution targets from the same frontend codebase:

- **Mac desktop app** — Tauri v2 shell (`pnpm --filter @my-team/ui tauri:dev`, `tauri:build`).
- **Web fallback** — Vite-built static assets served on `localhost:3737` via `team ui`.

## Scripts

| Script        | Description                                           |
| ------------- | ----------------------------------------------------- |
| `dev`         | Vite dev server on `localhost:5173`                   |
| `build`       | `vite build` → `dist/`                                |
| `preview`     | Preview the production build locally                  |
| `test`        | `vitest run`                                          |
| `tauri:dev`   | Boot the Tauri shell against the Vite dev server      |
| `tauri:build` | Build a macOS `.app` / `.dmg` from the production build |

## Requirements

- Node 22+
- pnpm 11
- (Tauri only) Rust toolchain — install via `rustup` <https://rustup.rs>
- (Tauri only) Xcode Command Line Tools on macOS

If Rust isn't installed, only the web fallback works. `pnpm --filter @my-team/ui tauri:dev` will fail with a missing-cargo error.

## First-launch Gatekeeper note

The Mac `.app` produced by `tauri:build` is **unsigned** in v1. On first launch macOS Gatekeeper will refuse to open it; right-click → Open and confirm to bypass. Code-signing/notarization is a follow-up.

## Status

Phase 1 scaffolding — the actual sidebar, tabs, terminal, diff viewer and workflow editor land in Phase 2.
