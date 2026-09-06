#!/usr/bin/env bash
# Watch a dispatched verifier through its ARTIFACTS, not only through its watchdog.
#
# WHY. Verifier #41's watchdog process exited without ever writing a terminal line, and its stdout
# log stayed 0 bytes, while the verifier itself ran to completion and wrote every artifact. A watcher
# that only tails the watchdog state file sees nothing at all in that case, and silence is
# indistinguishable from "still running". The verdict was recovered only by inspecting the worktree
# by hand. Artifacts are the durable signal; the watchdog is not.
#
# Emits one line per event and exits when the verifier is done or has demonstrably stopped.
# Usage: watch-verifier-artifacts.sh <verifier-number> <worktree> [poll-seconds]
set -u

V="$1"
WT="$2"
POLL="${3:-60}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE="$REPO/qa/verification/scratch/watchdog-verifier${V}_output.state"
PIDF="$REPO/qa/verification/scratch/watchdog${V}.pid"
PROPOSED="$WT/qa/verification/proposed"

seen_state=0
[ -f "$STATE" ] && seen_state=$(wc -l < "$STATE" 2>/dev/null || echo 0)
seen_artifacts=""
dead_ticks=0

while true; do
  # ---- 1. new lines in the watchdog state file -------------------------------------------
  if [ -f "$STATE" ]; then
    now=$(wc -l < "$STATE" 2>/dev/null || echo 0)
    if [ "$now" -gt "$seen_state" ]; then
      tail -n +$((seen_state + 1)) "$STATE" | grep -aiE "attempt|BLOCKED|exhausted|watchdog done|ABORT|rc=" || true
      seen_state="$now"
    fi
    if grep -aqiE "watchdog done|exhausted|ABORT|BLOCKED — EXECUTION_MODE" "$STATE"; then
      echo "TERMINAL: watchdog state reports completion or a stop. Read the artifacts for the verdict."
      exit 0
    fi
  fi

  # ---- 2. artifacts the verifier writes itself -------------------------------------------
  if [ -d "$PROPOSED" ]; then
    cur="$(ls "$PROPOSED" 2>/dev/null | grep -a "^v${V}_" | sort | tr '\n' ' ')"
    if [ -n "$cur" ] && [ "$cur" != "$seen_artifacts" ]; then
      echo "ARTIFACT: verifier #${V} wrote -> $cur"
      seen_artifacts="$cur"
    fi
    # the ledger entry is the last thing a verifier writes
    if ls "$PROPOSED"/v${V}_known_failure_modes_entry_*.md >/dev/null 2>&1; then
      f="$(ls "$PROPOSED"/v${V}_known_failure_modes_entry_*.md | head -1)"
      verdict="$(grep -aoiE "Verdict: (PASS|FAIL|BLOCKED[^.]*)" "$f" | head -1)"
      if [ -n "$verdict" ]; then
        echo "TERMINAL: verifier #${V} report is written and states -> $verdict"
        echo "  report: $f"
        exit 0
      fi
    fi
  fi

  # ---- 3. the watchdog died with no terminal line: the #41 failure mode -------------------
  if [ -f "$PIDF" ]; then
    p="$(tr -d '\r\n' < "$PIDF")"
    if [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null; then
      dead_ticks=$((dead_ticks + 1))
      if [ "$dead_ticks" -ge 2 ]; then
        echo "WATCHDOG GONE: pid $p is not running and no terminal line was written — this is the #41 failure mode."
        echo "  Do NOT infer a verdict. Inspect $PROPOSED and the worktree for artifacts."
        exit 0
      fi
    else
      dead_ticks=0
    fi
  fi

  sleep "$POLL"
done
