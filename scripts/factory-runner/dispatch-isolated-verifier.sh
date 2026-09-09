#!/usr/bin/env bash
# DISPATCH AN INDEPENDENT VERIFIER AS A TOP-LEVEL ISOLATED PROCESS.
#
# Execution mode: TOP_LEVEL_ISOLATED_PROCESS (never BACKGROUND_SUBAGENT).
#
#   * a FRESH git worktree, checked out at the EXACT candidate SHA, on its own artifact
#     branch (verify-<sha7>-campaign<N>) — the verifier has no write authority over the
#     implementation branch and no implementation history in its context;
#   * a SEPARATE top-level `claude -p` process, cwd = that worktree, with the verifier role
#     given directly (--agent brain-os-verifier) and an explicit non-interactive permission
#     mode — it cannot inherit an implementation session's Plan Mode / approval gate;
#   * retry ownership in verifier-watchdog.sh, an ordinary detached OS process that
#     classifies from OUTPUT TEXT (PROVIDER_CAPACITY / PROVIDER_TRANSIENT_ERROR /
#     EXECUTION_MODE / real report) and never derives a verdict from an exit code.
#
# The prompt file may contain the placeholders __CANDIDATE_SHA__, __INDEX_SHA__,
# __WORKTREE__, __ARTIFACT_BRANCH__, __CAMPAIGN__ and __VERIFIER__; they are substituted
# from the arguments, so the same template serves successive verifiers.
#
# Usage: dispatch-isolated-verifier.sh <candidate-sha> <campaign-number> <verifier-number> <prompt-template> [max-attempts] [pinned-file]
#   pinned-file: repo-relative file whose sha256 the watchdog pins (default: the Edge
#   candidate index.ts), or "GIT_HEAD" to pin the worktree commit itself (DB reviews).
set -eu

CANDIDATE="$1"
CAMPAIGN="$2"
VERIFIER="$3"
TEMPLATE="$4"
MAX_ATTEMPTS="${5:-6}"
PINNED="${6:-supabase/functions/sem-ai-command/index.ts}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHA7="$(git -C "$REPO" rev-parse --short=7 "$CANDIDATE")"
FULL="$(git -C "$REPO" rev-parse "$CANDIDATE")"
WORKTREE="$(dirname "$REPO")/brain-os-verify-${SHA7}"
BRANCH="verify-${SHA7}-campaign${CAMPAIGN}"
SCRATCH="$REPO/qa/verification/scratch"
PROMPT="$SCRATCH/verifier${VERIFIER}_prompt.txt"
LOG="$SCRATCH/verifier${VERIFIER}_output.log"
META="$SCRATCH/verifier${VERIFIER}_dispatch.json"

# ---- isolated worktree at the exact candidate ------------------------------------------
if [ -e "$WORKTREE" ]; then
  echo "worktree $WORKTREE already exists — refusing to reuse a possibly-dirty checkout" >&2
  exit 2
fi
git -C "$REPO" worktree add -b "$BRANCH" "$WORKTREE" "$FULL" >/dev/null
if [ "$PINNED" = "GIT_HEAD" ]; then INDEX_SHA="$FULL"; else INDEX_SHA="$(sha256sum "$WORKTREE/$PINNED" | cut -d' ' -f1)"; fi
if [ "$(git -C "$WORKTREE" rev-parse HEAD)" != "$FULL" ]; then
  echo "worktree HEAD does not equal the candidate — aborting" >&2
  exit 2
fi

# ---- prompt from template ----------------------------------------------------------------
sed -e "s|__CANDIDATE_SHA__|$FULL|g" -e "s|__INDEX_SHA__|$INDEX_SHA|g" \
    -e "s|__WORKTREE__|$WORKTREE|g" -e "s|__ARTIFACT_BRANCH__|$BRANCH|g" \
    -e "s|__CAMPAIGN__|$CAMPAIGN|g" -e "s|__VERIFIER__|$VERIFIER|g" \
    "$TEMPLATE" > "$PROMPT"

# ---- dispatch metadata (DATA for the supervisor / campaign record — never a command) -----
cat > "$META" <<EOF
{
  "role": "brain-os-verifier",
  "execution_mode": "isolated_process",
  "execution_mode_enum": "TOP_LEVEL_ISOLATED_PROCESS",
  "repo": "$REPO",
  "worktree": "$WORKTREE",
  "artifact_branch": "$BRANCH",
  "candidate_sha": "$FULL",
  "pinned_file": "$PINNED",
  "pinned_sha256": "$INDEX_SHA",
  "read_only_candidate": true,
  "checkpoint": "qa/verification/CURRENT_CAMPAIGN.json",
  "provider": "claude-code-cli",
  "model": "inherit",
  "campaign": $CAMPAIGN,
  "verifier": $VERIFIER,
  "prompt": "$PROMPT",
  "log": "$LOG",
  "dispatched_at": "$(date -Iseconds)"
}
EOF

# ---- freeze the candidate in the SOURCE repo for the life of this round -----------------
# The verifier reads its own worktree, so this is not about the verifier. It is about the repo
# where fixes get written: 85 apply-scripts under qa/verification/scratch/p1 default their target
# to the candidate, so running one to check that its anchors still resolve APPLIES it. That is
# exactly what happened to the candidate under verifier #74. Read-only turns the class into EPERM.
#
# Not fatal if it fails - the watchdog independently pins the sha and aborts on a mismatch - but
# never silent, because an unprotected candidate should not be something you discover afterwards.
# Thaw deliberately when the round ends:
#   node qa/verification/candidate_freeze.mjs unfreeze "<why>"
# WHICH TREE HOLDS THE CANDIDATE. This dispatcher runs from the repo it lives in, but the candidate is
# usually prepared in a SEPARATE worktree on the implementation branch - so freezing "$REPO"'s copy would
# lock a file nobody is editing and leave the real candidate writable. Name the tree explicitly with
# BRAIN_OS_CANDIDATE_REPO when they differ; it defaults to this repo, which is right for a single-tree setup.
CANDIDATE_REPO="${BRAIN_OS_CANDIDATE_REPO:-$REPO}"
FREEZE_TOOL="$CANDIDATE_REPO/qa/verification/candidate_freeze.mjs"
if [ -f "$FREEZE_TOOL" ] && [ "$PINNED" = "supabase/functions/sem-ai-command/index.ts" ]; then
  if ! node "$FREEZE_TOOL" freeze "verifier #$VERIFIER on $SHA7 / $INDEX_SHA"; then
    echo "WARNING: could not freeze the candidate - it stays writable for this round" >&2
  fi
fi
# ---- launch under the watchdog, detached ---------------------------------------------------
: > "$LOG"
nohup bash "$REPO/scripts/factory-runner/verifier-watchdog.sh" "$PROMPT" "$LOG" "$INDEX_SHA" "$MAX_ATTEMPTS" "$WORKTREE" "$PINNED" \
  > "$SCRATCH/watchdog${VERIFIER}.nohup" 2>&1 &
echo "$!" > "$SCRATCH/watchdog${VERIFIER}.pid"
echo "dispatched verifier #$VERIFIER (campaign #$CAMPAIGN) as TOP_LEVEL_ISOLATED_PROCESS"
echo "  candidate  $FULL"
echo "  index.ts   $INDEX_SHA"
echo "  worktree   $WORKTREE ($BRANCH)"
echo "  watchdog   pid $(cat "$SCRATCH/watchdog${VERIFIER}.pid"), log $LOG"
