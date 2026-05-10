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
pnpm link --global --filter @viktown/cli

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
  echo "Warning: 'team' command not found in PATH after linking."
  echo "You may need to add pnpm's global bin to your PATH:"
  echo "  export PATH=\"\$(pnpm bin -g):\$PATH\""
fi
