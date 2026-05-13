#!/usr/bin/env bash
# mark-must-ask.sh
#
# Claude Code Stop hook. Runs at the end of every captain assistant turn.
# When the captain ends a turn while the session is genuinely idle — no
# long-running specialist owns the next move and the captain hasn't already
# pushed a specific summary — push a generic safety-net entry into
# .must_ask_pending in this session's .team/state.json. That keeps the
# `team watch` AT column reliable even when the captain forgets to push a
# specific summary at end-of-turn.
#
# Skip conditions (all silent exit 0):
#   - state.json missing or jq unavailable.
#   - phase ∈ {done, cleaned, killed} — session is no longer live.
#   - active_specialist ∈ {engineer, tester, reviewer} — captain is waiting
#     on a long-running specialist, not the user. (scout is NOT in this
#     skip set; scout runs concurrently with chat, so a turn ending while
#     scout is in the background still means the user is the bottleneck.)
#   - must_ask_pending already non-empty — captain pushed a specific
#     summary this turn; don't clobber it with the generic one.
#
# Idempotent atomic write via mktemp + mv. Silent on success; errors to stderr.

set -uo pipefail

STATE_FILE="${CLAUDE_PROJECT_DIR:-.}/.team/state.json"

# No file → nothing to mark. Hook is best-effort, not required.
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "mark-must-ask.sh: jq not found on PATH; skipping" >&2
  exit 0
fi

# Read the three fields we need. If state.json is malformed jq exits
# non-zero and we leave the file alone.
PHASE=$(jq -r '.phase // ""' "$STATE_FILE" 2>/dev/null) || {
  echo "mark-must-ask.sh: state.json unreadable; leaving untouched" >&2
  exit 0
}
SPECIALIST=$(jq -r '.active_specialist // ""' "$STATE_FILE" 2>/dev/null) || {
  echo "mark-must-ask.sh: state.json unreadable; leaving untouched" >&2
  exit 0
}
PENDING_LEN=$(jq -r '.must_ask_pending | length' "$STATE_FILE" 2>/dev/null) || {
  echo "mark-must-ask.sh: state.json unreadable; leaving untouched" >&2
  exit 0
}

# Skip if session is no longer live.
case "$PHASE" in
  done|cleaned|killed)
    exit 0
    ;;
esac

# Skip if a long-running specialist owns the next move.
case "$SPECIALIST" in
  engineer|tester|reviewer)
    exit 0
    ;;
esac

# Skip if the captain already pushed a specific entry this turn.
if [ "$PENDING_LEN" != "0" ]; then
  exit 0
fi

# Atomically rewrite state.json with the generic safety-net entry. Use
# mktemp in the same directory so mv is a rename, not a cross-device copy.
TMP_FILE=$(mktemp "${STATE_FILE}.tmp.XXXXXX") || {
  echo "mark-must-ask.sh: mktemp failed; leaving untouched" >&2
  exit 0
}
if ! jq '.must_ask_pending = ["captain awaiting user reply"]' "$STATE_FILE" > "$TMP_FILE" 2>/dev/null; then
  rm -f "$TMP_FILE"
  echo "mark-must-ask.sh: jq rewrite failed; leaving untouched" >&2
  exit 0
fi

mv "$TMP_FILE" "$STATE_FILE"
exit 0
