#!/usr/bin/env bash
set -euo pipefail

echo "=== Viktown Setup ==="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install Node 22+."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm is required. Install pnpm 11+."; exit 1; }
command -v claude >/dev/null 2>&1 || { echo "Error: claude CLI is required. Install Claude Code."; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "Error: gh CLI is required. Install GitHub CLI and run 'gh auth login'."; exit 1; }

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Error: Node 22+ is required (found Node $NODE_MAJOR)."
  exit 1
fi

echo "Prerequisites OK (Node $(node -v), pnpm $(pnpm -v))"
echo ""

# Install dependencies and build
echo "Installing dependencies..."
pnpm install

echo ""
echo "Building packages..."
pnpm --filter @viktown/shared build
pnpm --filter @viktown/wrapper build
pnpm --filter @viktown/cli build

# Build UI (may fail on type check but vite build succeeds)
echo ""
echo "Building UI..."
pnpm --filter @viktown/ui exec vite build 2>/dev/null || echo "Warning: UI build skipped (run 'cd packages/ui && npx vite build' manually if needed)"

# Make CLI globally available
echo ""
echo "Linking 'team' command globally..."

CLI_ENTRY="$(cd "$(dirname "$0")" && pwd)/packages/cli/dist/index.js"
chmod +x "$CLI_ENTRY"

# Find a writable bin directory on PATH
LINK_DIR=""
for dir in /usr/local/bin "$HOME/.local/bin" "$HOME/bin"; do
  if [ -d "$dir" ] && echo "$PATH" | grep -q "$dir"; then
    LINK_DIR="$dir"
    break
  fi
done

if [ -z "$LINK_DIR" ]; then
  LINK_DIR="$HOME/.local/bin"
  mkdir -p "$LINK_DIR"
  echo "  Adding $LINK_DIR to PATH in ~/.zshrc"
  echo "export PATH=\"$LINK_DIR:\$PATH\"" >> "$HOME/.zshrc"
  export PATH="$LINK_DIR:$PATH"
fi

ln -sf "$CLI_ENTRY" "$LINK_DIR/team"

# Fix node-pty spawn-helper permissions (pnpm may strip +x on install)
SPAWN_HELPER="$(cd "$(dirname "$0")" && pwd)/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper"
chmod +x $SPAWN_HELPER 2>/dev/null || true

# Create required directories
mkdir -p ~/team/sessions ~/team/archives ~/team/notifications

# Verify
echo ""
if command -v team >/dev/null 2>&1; then
  echo "Success! 'team' command is now available globally."
  echo ""
  echo "Quick start:"
  echo "  1. team start          # Start the wrapper daemon"
  echo "  2. cd /your/repo       # Go to any git repo"
  echo "  3. team new \"title\"    # Create a session"
  echo "  4. Open http://localhost:3001 for the web UI"
else
  echo "Symlink created at $LINK_DIR/team"
  echo "You may need to restart your shell or run: source ~/.zshrc"
fi
