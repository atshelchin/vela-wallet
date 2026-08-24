#!/usr/bin/env bash
#
# Open every gallery state once and check the app survives a frame in it.
#
# The gallery's real audience is a person looking at it. This is the part a
# machine can still do on a host with no screen-recording permission, where it
# can neither press the arrow keys nor take a picture: a duplicate gpui element
# id, a panicking layout, or a corpus key that resolves to nothing kills the
# process, and this notices which state did it.
#
# Usage: scripts/sweep-gallery.sh [seconds-per-state]
set -euo pipefail
cd "$(dirname "$0")/.."

BIN=target/debug/vela-wallet
DWELL="${1:-2}"
LOG=$(mktemp)
trap 'rm -f "$LOG"' EXIT

cargo build

run_state() {
  VELA_GALLERY=1 VELA_GALLERY_STATE="$1" VELA_SKIP_LAUNCH_ANIMATION=1 VELA_LANG=en \
    "$BIN" >"$LOG" 2>&1 &
  local pid=$!
  sleep "$DWELL"
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "FAILED at state $1:"
    sed 's/^/    /' "$LOG"
    return 1
  fi
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

# The gallery prints its inventory size on startup, so the count comes from the
# app rather than from a number in this file that could go stale.
run_state 0
COUNT=$(sed -n 's/.*gallery: \([0-9]*\) states.*/\1/p' "$LOG" | head -1)
if [ -z "$COUNT" ]; then
  echo "could not read the state count from the gallery's startup line" >&2
  exit 1
fi
echo "sweeping $COUNT states, ${DWELL}s each"

failed=0
for i in $(seq 0 $((COUNT - 1))); do
  if run_state "$i"; then
    printf '  ok   %s\n' "$(sed -n 's/.*opening `\(.*\)`.*/\1/p' "$LOG" | head -1)"
  else
    failed=$((failed + 1))
  fi
done

if [ "$failed" -gt 0 ]; then
  echo "$failed state(s) did not survive a frame"
  exit 1
fi
echo "every state rendered"
