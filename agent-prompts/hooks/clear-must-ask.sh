#!/usr/bin/env bash
# clear-must-ask.sh
#
# Claude Code UserPromptSubmit hook. Runs whenever the user submits a message
# to the captain. Sets `.must_ask_pending = []` in this session's
# .team/state.json so the AT column in `team watch` clears as soon as the
# user has actually replied (no longer waiting on them).
#
# Idempotent: no-op when the state file is missing or malformed. Only
# rewrites must_ask_pending; every other field in state.json is preserved
# byte-for-byte from jq's perspective.
#
# Silent on success; errors go to stderr.

set -u

STATE_FILE="${CLAUDE_PROJECT_DIR:-.}/.team/state.json"

# No file → nothing to clear. Hook is best-effort, not required.
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "clear-must-ask.sh: jq not found on PATH; skipping" >&2
  exit 0
fi

# Round-trip through jq. If state.json is malformed, jq exits non-zero and we
# leave the file untouched. Otherwise force `must_ask_pending` to an empty
# array and atomically replace the file.
TMP_FILE="${STATE_FILE}.tmp.$$"
if ! jq '.must_ask_pending = []' "$STATE_FILE" > "$TMP_FILE" 2>/dev/null; then
  rm -f "$TMP_FILE"
  echo "clear-must-ask.sh: state.json malformed; leaving untouched" >&2
  exit 0
fi

mv "$TMP_FILE" "$STATE_FILE"
exit 0
