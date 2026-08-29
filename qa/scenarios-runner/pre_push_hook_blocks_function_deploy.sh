#!/bin/sh
# Permanent regression for .githooks/pre-push (PRODUCTION_EFFECT_CLASSIFICATION_INCLUDES_CI_DOWNSTREAM_DEPLOY).
#
# This is a SHELL-level regression, not a SQL one (see qa/REGRESSION_CATALOG.md) - the
# hook is a local git safeguard, not a database invariant, so there is nothing to assert
# with `supabase db query`. Runs entirely inside a throwaway temporary git sandbox (a
# fresh `git init` repo + a local bare "origin" on disk) - never touches this repo's own
# history, never touches production, nothing to roll back.
#
# Proves two things:
#   1. The documented/intended behavior: a push that changes supabase/functions/** to an
#      EXISTING remote branch is blocked without ALLOW_FUNCTIONS_DEPLOY=1, and allowed
#      with it.
#   2. REAL BUG found live 2026-08-29 while pushing a genuine new branch (chat pagination
#      PR): the hook's new-branch case (`remote_sha` all-zero) computed
#      `range="$local_sha"` - a single ref with no ".." - which `git diff --name-only`
#      treats as "diff this commit against the working tree", not "diff this commit
#      against its parent history". Right after a real commit the working tree always
#      matches that commit exactly, so this silently produced an EMPTY changed-file list
#      for every brand-new branch's first push, regardless of what it touched - the exact
#      push that just happened for real went through with exit 0 instead of being
#      blocked. Fixed by diffing against the merge-base with the remote's default branch
#      instead. This script proves the fix and guards against the same class regressing.
set -u
# Deliberately no `set -e`: several steps below (invoking the hook) are EXPECTED to
# return non-zero (that's what "blocked" means) and their exit codes are captured and
# asserted on explicitly via result() - `set -e` would abort the script the moment the
# first "blocked" case correctly returned non-zero, never reaching its assertion.

HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.githooks/pre-push"
if [ ! -f "$HOOK" ]; then
  echo "FAIL: cannot find .githooks/pre-push at $HOOK"
  exit 1
fi

sandbox=$(mktemp -d)
cleanup() { rm -rf "$sandbox"; }
trap cleanup EXIT

# --- Build a throwaway "origin" (bare) + a working clone, so the hook's
# `git merge-base "$local_sha" "$remote/master"` has a real refs/remotes/origin/master to
# resolve against, exactly like a real developer machine. Nothing here ever touches the
# real brain-os remote.
bare="$sandbox/origin.git"
work="$sandbox/work"
git init --bare -q "$bare"
git init -q "$work"
cd "$work"
git config user.email "regression@example.com"
git config user.name "Regression Test"
git remote add origin "$bare"

mkdir -p supabase/functions/dummy
echo "seed" > README.md
git add README.md
git commit -q -m "seed"
git branch -M master
git push -q origin master

pass=true
result() { # name expected actual
  if [ "$2" = "$3" ]; then
    echo "PASS: $1 (exit $3)"
  else
    echo "FAIL: $1 (expected exit $2, got $3)"
    pass=false
  fi
}

run_hook() { # local_ref local_sha remote_ref remote_sha allow_env
  env_val="$5"
  printf '%s %s %s %s\n' "$1" "$2" "$3" "$4" | env ALLOW_FUNCTIONS_DEPLOY="$env_val" sh "$HOOK" origin "$bare" >/dev/null 2>&1
}

# --- Case 1: existing branch update, functions/** changed -----------------------------
old_master=$(git rev-parse master)
echo "export const dummy = 1;" > supabase/functions/dummy/index.ts
git add supabase/functions/dummy/index.ts
git commit -q -m "touch functions dummy"
new_master=$(git rev-parse master)

run_hook "refs/heads/master" "$new_master" "refs/heads/master" "$old_master" ""
result "existing-branch update, fn changed, no override -> blocked" 1 $?
run_hook "refs/heads/master" "$new_master" "refs/heads/master" "$old_master" "1"
result "existing-branch update, fn changed, with override -> allowed" 0 $?

# Push this so origin/master (the remote-tracking ref the hook's new-branch path
# resolves against) reflects it, for the next cases.
git push -q origin master
git fetch -q origin

# --- Case 2: brand-new branch, functions/** changed (the real bug) --------------------
git checkout -q -b feature-touches-functions
echo "export const dummy = 2;" > supabase/functions/dummy/index.ts
git add supabase/functions/dummy/index.ts
git commit -q -m "new branch touches functions dummy"
feature_sha=$(git rev-parse HEAD)

run_hook "refs/heads/feature-touches-functions" "$feature_sha" "refs/heads/feature-touches-functions" "0000000000000000000000000000000000000000" ""
result "brand-new branch, fn changed, no override -> blocked (was the live bug: used to allow)" 1 $?
run_hook "refs/heads/feature-touches-functions" "$feature_sha" "refs/heads/feature-touches-functions" "0000000000000000000000000000000000000000" "1"
result "brand-new branch, fn changed, with override -> allowed" 0 $?

git checkout -q master

# --- Case 3: brand-new branch, NO functions/** change (must not false-positive) --------
git checkout -q -b feature-docs-only
echo "docs change" >> README.md
git add README.md
git commit -q -m "new branch, docs only"
docs_sha=$(git rev-parse HEAD)

run_hook "refs/heads/feature-docs-only" "$docs_sha" "refs/heads/feature-docs-only" "0000000000000000000000000000000000000000" ""
result "brand-new branch, no fn change -> allowed (no false positive)" 0 $?

if [ "$pass" = "true" ]; then
  echo "ALL_PASS: true"
  exit 0
else
  echo "ALL_PASS: false"
  exit 1
fi
