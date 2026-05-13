#!/usr/bin/env bash
# mark-must-ask-on-question.sh
#
# Claude Code PreToolUse hook matched on `AskUserQuestion`. Fires the moment
# the captain opens an AskUserQuestion form — *before* the question is
# rendered to the user. Pushes a generic "user question pending" entry into
# .must_ask_pending so the `team watch` AT column lights up while the user
# is composing an answer.
#
# Why a PreToolUse hook (not Stop): Claude Code's `Stop` hook only fires at
# the end of a captain assistant turn. While `AskUserQuestion` is mid-call
# the turn is still open, so `mark-must-ask.sh` never runs and the AT
# column stays calm even though the user is the bottleneck. This hook
# closes that gap.
#
# Skip conditions (all silent exit 0):
#   - state.json missing or jq unavailable.
#   - phase ∈ {done, cleaned, killed} — session is no longer live.
#   - must_ask_pending already non-empty — captain already pushed a
#     specific summary this turn; don't clobber it with the generic one.
#
# Note: this hook does NOT skip based on `active_specialist`. The captain
# can open an AskUserQuestion form while a scout runs in the background,
# and the long-running specialists (engineer/tester/reviewer) don't open
# AskUserQuestion forms in the captain's transcript, so this matcher
# implies the captain is the one asking the user.
#
# Idempotent atomic write via mktemp + mv. Silent on success; errors to stderr.

set -uo pipefail

STATE_FILE="${CLAUDE_PROJECT_DIR:-.}/.team/state.json"

# No file → nothing to mark. Hook is best-effort, not required.
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "mark-must-ask-on-question.sh: jq not found on PATH; skipping" >&2
  exit 0
fi

# Read the two fields we need. If state.json is malformed jq exits
# non-zero and we leave the file alone.
PHASE=$(jq -r '.phase // ""' "$STATE_FILE" 2>/dev/null) || {
  echo "mark-must-ask-on-question.sh: state.json unreadable; leaving untouched" >&2
  exit 0
}
PENDING_LEN=$(jq -r '.must_ask_pending | length' "$STATE_FILE" 2>/dev/null) || {
  echo "mark-must-ask-on-question.sh: state.json unreadable; leaving untouched" >&2
  exit 0
}

# Skip if session is no longer live.
case "$PHASE" in
  done|cleaned|killed)
    exit 0
    ;;
esac

# Skip if the captain already pushed a specific entry this turn — don't
# clobber a more informative summary with the generic one.
if [ "$PENDING_LEN" != "0" ]; then
  exit 0
fi

# Atomically rewrite state.json with the generic question-pending entry.
# Use mktemp in the same directory so mv is a rename, not a cross-device copy.
TMP_FILE=$(mktemp "${STATE_FILE}.tmp.XXXXXX") || {
  echo "mark-must-ask-on-question.sh: mktemp failed; leaving untouched" >&2
  exit 0
}
if ! jq '.must_ask_pending = ["user question pending"]' "$STATE_FILE" > "$TMP_FILE" 2>/dev/null; then
  rm -f "$TMP_FILE"
  echo "mark-must-ask-on-question.sh: jq rewrite failed; leaving untouched" >&2
  exit 0
fi

mv "$TMP_FILE" "$STATE_FILE"
exit 0
