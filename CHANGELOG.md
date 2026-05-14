# Changelog

All notable user-visible changes to my-team are recorded here. The format loosely follows [Keep a Changelog](https://keepachangelog.com/) and the project follows [Conventional Commits](https://www.conventionalcommits.org/) at the commit level.

## Unreleased

### Fixed
- **UI Terminal tab** no longer garbles the captain's CLI output. Spinner lines overwrite themselves correctly instead of stacking, and the status bar renders intact. Root cause was xterm.js `convertEol: true` double-translating the PTY's CRLF; pinned to `false`.

### Added
- **Chat tab** — first-class conversational surface for talking to the captain. Streams replies token-by-token, renders markdown, autoscrolls (with a "↓ jump to latest" affordance when scrolled up), and lives as the **leftmost / default** workspace tab.

### Changed
- The inline "Send to captain..." input in the top-right session header has been **removed**. Use the new Chat tab instead. Approve / Kill / Purge / VS Code buttons are unchanged.
- `team attach` is now the **authoritative source for PTY size** when connected. When any CLI client is attached to a session, the wrapper drops `resize` messages from web UI clients so the CLI's view stays clean. Web UI is authoritative when no CLI is attached.
- Keyboard shortcuts now span `⌘1..⌘9` (was `⌘1..⌘8`). `⌘1` activates the new Chat tab; `⌘9` activates the Workflow tab (newly addressable by digit).

### Internal
- WebSocket clients identify themselves on connect with `{type:'hello', role:'web' | 'cli'}`. The wrapper is backwards-tolerant of legacy clients that don't send a hello (treated as `web`).
- Added a small in-memory ring buffer (cap 50) for recent PTY output chunks on the UI's WebSocket hook so tabs can be re-mounted without losing immediate context.
- Resize messages forwarded to the PTY are now deduplicated when consecutive dimensions are identical.
- `team attach`'s WS close handler now reliably tears down stdin/stdout listeners (idempotent cleanup), preventing listener accumulation across reconnects.
