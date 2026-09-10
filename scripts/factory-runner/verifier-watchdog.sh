#!/usr/bin/env bash
# VERIFIER WATCHDOG — retry ownership OUTSIDE the Claude session.
#
# The founder's standing architecture requirement: "A background Claude CLI process cannot
# be the mechanism responsible for waking itself after its provider quota prevents it from
# running." A blocked verifier cannot retry itself, and the implementing session must not be
# the thing that remembers to. This is an ordinary detached OS process that owns the retry.
#
# PROCESS LIFETIME != WORK ORDER LIFETIME. This script may be killed and restarted; the work
# order lives in qa/verification/CURRENT_CAMPAIGN.json, and the pinned SHA is what makes a
# retry a RESUMPTION rather than a new campaign.
#
# EXECUTION MODE: TOP_LEVEL_ISOLATED_PROCESS. The verifier is launched as a SEPARATE
# top-level `claude -p` process with cwd = an isolated git worktree checked out at the exact
# candidate SHA (see dispatch-isolated-verifier.sh). It is never an in-session subagent, so
# it cannot inherit an implementation session's Plan Mode / approval gate — the
# BACKGROUND_AGENT_EXECUTION_MODE_MUST_NOT_INHERIT_UNACTIONABLE_PLAN_GATE regression.
#
# CLASSIFICATION IS FROM OUTPUT TEXT, NEVER FROM THE EXIT CODE:
#   BLOCKED — PROVIDER_CAPACITY         session/usage limit  -> wait for the provider's own
#                                       stated reset (fallback: linear backoff), retry
#   BLOCKED — PROVIDER_CAPACITY (model)  ONE MODEL is exhausted ("You've reached your <model>
#                                       limit. Switch to another model.") -> waiting cannot clear
#                                       it; ROTATE to the next model in MODELS and retry at once.
#                                       When the list is exhausted, stop (exit 6) rather than burn
#                                       attempts against a wall that no amount of sleeping moves.
#   BLOCKED — PROVIDER_TRANSIENT_ERROR  API 5xx / overloaded -> bounded exponential backoff,
#                                       retry; the checkpoint makes the retry a resumption
#   BLOCKED — EXECUTION_MODE            plan-mode / approval-gate text -> checkpoint and STOP.
#                                       Relaunching in the same mode cannot help; a human
#                                       or the Factory Director must change the mode.
#   (real report)                       hand back; the VERDICT is read from the report by
#                                       the campaign owner, never inferred here.
#
# Usage: verifier-watchdog.sh <prompt-file> <log-file> <expected-pinned-sha256> [max-attempts] [cwd] [pinned-file]
#   pinned-file defaults to supabase/functions/sem-ai-command/index.ts (the Edge candidate).
#   A DB review pins a migration file, or the string "GIT_HEAD" to pin the worktree's commit.
set -u

PROMPT="$1"
LOG="$2"
EXPECT_SHA="$3"
MAX_ATTEMPTS="${4:-6}"
CWD="${5:-}"
PINNED="${6:-supabase/functions/sem-ai-command/index.ts}"
# MODEL ROTATION. 2026-09-09: verifier #69 was refused with "You've reached your Fable limit. Switch to
# another model" — a limit on one MODEL, not on the session. The old watchdog had no model concept at all,
# so it retried the same exhausted model on a timer. The model in use is now explicit (which also means the
# campaign record can say WHICH model verified the candidate, instead of "inherit"), and a model-scoped
# refusal advances to the next entry instead of sleeping.
MODELS="${SEM_VERIFIER_MODELS:-${7:-opus,sonnet}}"
model_at() { echo "$MODELS" | cut -d',' -f"$1"; }
model_count() { echo "$MODELS" | tr ',' '\n' | grep -c .; }
model_idx=1
MODEL="$(model_at 1)"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -z "$CWD" ] && CWD="$REPO"
INDEX="$CWD/$PINNED"
pinned_sha() {
  if [ "$PINNED" = "GIT_HEAD" ]; then git -C "$CWD" rev-parse HEAD; else sha256sum "$INDEX" | cut -d' ' -f1; fi
}
STATE="$REPO/qa/verification/scratch/watchdog-$(basename "$LOG" .log).state"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$STATE"; }

log "watchdog started; mode=TOP_LEVEL_ISOLATED_PROCESS cwd=$CWD max_attempts=$MAX_ATTEMPTS expect_sha=${EXPECT_SHA:0:16}… models=$MODELS (starting on $MODEL)"

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  # SHA DISCIPLINE. A retry must run against the SAME source the campaign was opened for.
  # If the source under the worktree has moved, this is no longer a resumption and the
  # watchdog must stop rather than silently certify a different build.
  actual="$(pinned_sha)"
  if [ "$actual" != "$EXPECT_SHA" ]; then
    log "ABORT: $PINNED is $actual, campaign pinned $EXPECT_SHA. Source changed under the campaign; a retry would certify a different build. Stopping."
    exit 3
  fi

  log "attempt $attempt: dispatching verifier (cwd=$CWD, model=$MODEL)"
  ( cd "$CWD" && claude --permission-mode acceptEdits --model "$MODEL" \
      --allowedTools "Bash(node:*)" "Bash(sha256sum:*)" "Bash(git status:*)" "Bash(git log:*)" "Bash(git diff:*)" "Bash(git show:*)" "Bash(git rev-parse:*)" "Bash(git worktree list:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(echo:*)" "Bash(touch:*)" "Bash(rm:*)" "Bash(npx supabase functions list:*)" "Bash(npm install:*)" "Bash(npm ci:*)" "Bash(gh run view:*)" "Bash(gh run list:*)" "Bash(gh api:*)" "Bash(git add:*)" "Bash(git commit:*)" \
      --agent brain-os-verifier -p "$(cat "$PROMPT")" < /dev/null > "$LOG" 2>&1 )
  rc=$?
  bytes=$(wc -c < "$LOG" 2>/dev/null || echo 0)
  log "attempt $attempt: exited rc=$rc log_bytes=$bytes"

  # ---- 0. A FINISHED REPORT OUTRANKS EVERY TEXT CLASSIFIER BELOW IT. ----------------------------
  #
  # A verifier that reached its own conclusion was not blocked, whatever words appear inside the
  # conclusion. Verifier #81 produced a complete 10,400-byte report ending in FAILED and the exact
  # index.ts sha256 — and was classified BLOCKED — EXECUTION_MODE, because the report SAYS:
  #
  #     "`npx supabase db query --linked` requires approval here."
  #
  # That is the verifier REPORTING a coverage limit, which is exactly what it is supposed to do. The
  # classifier could not tell a report ABOUT an approval gate from output produced BY one — the same
  # "a mention is not an occurrence" class that has cost this campaign a mutation proof crediting a
  # printed hash and a guard whose disclaimer matched its own claim.
  #
  # Its verdict would have been discarded and the round re-dispatched for nothing.
  #
  # A report is recognised the way the hand-back below already recognises one: substantial output that
  # ends in a verdict line. Checked BEFORE the blocked-classifiers, because a completed report is a
  # fact about the process and the classifiers are guesses about it.
  if [ "$bytes" -ge 2000 ] && tail -c 4000 "$LOG" | grep -qiE '^[^A-Za-z0-9]*(PASSED|FAILED|VERDICT|CLASSIFICATION)'; then
    log "attempt $attempt: verifier produced a real report (${bytes} bytes) that ends in a verdict; watchdog done. Text classifiers are NOT consulted — a finished report outranks them. The verdict is read from the report, not from rc."
    # exit 0, NOT break: the loop is followed by the exhaustion message, so breaking out of it hands back a
    # real report AND logs "exhausted 6 attempts; work order remains open and NOT certified" over the top of
    # it. That is the same failure as the classifier this block was added to fix — a true report filed under
    # a false status — one line further down.
    exit 0
  fi

  # ---- 1. EXECUTION_MODE: an approval/plan gate a detached process can never satisfy. -----
  # Checked FIRST: this text can co-occur with anything else and no retry in the same mode
  # can clear it. Checkpoint (the state file + the log are the checkpoint) and stop.
  if grep -qiE "plan mode|ExitPlanMode|requires approval|waiting for approval|approval (is )?required|permission (prompt|denied|required)|needs your approval|blocked — execution_mode" "$LOG"; then
    log "attempt $attempt: BLOCKED — EXECUTION_MODE (approval/plan-gate text in output). NOT retrying in the same mode; re-dispatch requires a mode decision by the Factory Director."
    exit 5
  fi

  # ---- 2a. PROVIDER_CAPACITY, MODEL-SCOPED: rotate the model; sleeping cannot clear it. --------
  # Checked before the general capacity arm, because the general arm's remedy (sleep until the stated
  # reset) is the WRONG remedy here and the two texts overlap.
  if grep -qiE "reached your [A-Za-z0-9._-]+ limit|switch to another model" "$LOG"; then
    total="$(model_count)"
    log "attempt $attempt: BLOCKED — PROVIDER_CAPACITY (model-scoped) on model '$MODEL'"
    if [ "$model_idx" -ge "$total" ]; then
      log "attempt $attempt: every model in '$MODELS' is exhausted. Sleeping cannot clear a model-scoped limit; STOPPING. The work order stays open and NOT certified — re-dispatch with SEM_VERIFIER_MODELS naming a model that has capacity."
      exit 6
    fi
    model_idx=$((model_idx + 1))
    MODEL="$(model_at "$model_idx")"
    log "attempt $attempt: rotating to model '$MODEL' and retrying immediately (checkpoint + unchanged sha make this a RESUMPTION)"
    attempt=$((attempt + 1))
    continue
  fi

  # ---- 2b. PROVIDER_CAPACITY: wait for the provider's stated reset. --------------------------
  if grep -qiE "session limit|usage limit|rate limit|quota|capacity|credit balance" "$LOG"; then
    reset_line="$(grep -oiE "resets [0-9]{1,2}(:[0-9]{2})? ?(am|pm)?" "$LOG" | head -1)"
    log "attempt $attempt: BLOCKED — PROVIDER_CAPACITY ($reset_line)"
    wait_secs=""
    if [ -n "$reset_line" ]; then
      target="$(echo "$reset_line" | sed -E 's/^resets //I')"
      now_epoch=$(date +%s)
      tgt_epoch=$(date -d "$target" +%s 2>/dev/null || echo "")
      if [ -n "$tgt_epoch" ]; then
        [ "$tgt_epoch" -le "$now_epoch" ] && tgt_epoch=$((tgt_epoch + 86400))
        wait_secs=$(( tgt_epoch - now_epoch + 120 ))   # +2min guard past the boundary
      fi
    fi
    [ -z "$wait_secs" ] && wait_secs=$(( 900 * attempt ))
    log "attempt $attempt: sleeping ${wait_secs}s until retry eligibility"
    sleep "$wait_secs"
    attempt=$((attempt + 1))
    continue
  fi

  # ---- 3. PROVIDER_TRANSIENT_ERROR: bounded exponential backoff (60s, 120s, ... <= 15min). -
  if grep -qiE "API Error: 5[0-9]{2}|\b(500|502|503|504|529)\b[^\n]{0,40}(error|overloaded|internal|unavailable)|overloaded_error|internal server error|service unavailable|ECONNRESET|ETIMEDOUT|fetch failed" "$LOG"; then
    wait_secs=$(( 60 * (1 << (attempt - 1)) ))
    [ "$wait_secs" -gt 900 ] && wait_secs=900
    log "attempt $attempt: BLOCKED — PROVIDER_TRANSIENT_ERROR; backoff ${wait_secs}s then resume from checkpoint (sha unchanged => completed scenarios are reused)"
    sleep "$wait_secs"
    attempt=$((attempt + 1))
    continue
  fi

  if [ "$bytes" -lt 200 ]; then
    log "attempt $attempt: log is only ${bytes} bytes and shows no classified text — BLOCKED — OTHER, retrying after backoff"
    sleep $(( 600 * attempt ))
    attempt=$((attempt + 1))
    continue
  fi

  log "attempt $attempt: verifier produced a real report (${bytes} bytes); watchdog done. The verdict is read from the report, not from rc."
  exit 0
done

log "exhausted $MAX_ATTEMPTS attempts; work order remains open and NOT certified"
exit 4
