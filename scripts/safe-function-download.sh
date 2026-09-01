#!/usr/bin/env bash
# SUPABASE_FUNCTION_DOWNLOAD_CANNOT_SILENTLY_REPLACE_IMPLEMENTATION_UNDER_TEST
#
# Standing Factory safety rule, 2026-09-01. `supabase functions download <slug>` writes
# straight into supabase/functions/<slug>/ in the CURRENT working tree. During the BUG-002
# campaign an independent verifier ran it on an implementation branch and it silently
# replaced the very index.ts under test with the DEPLOYED production copy. It was caught
# only by an incidental `git status`; without that, every subsequent "branch" test would
# have been testing v92 while reporting on the branch — a whole campaign of false results.
#
# This wrapper makes that failure impossible: the download always lands in an isolated
# temp directory, never the working tree, and the working tree is hash-verified unchanged
# afterwards.
#
# Usage:
#   scripts/safe-function-download.sh <slug> [project-ref]
# Prints the path of the downloaded copy. Compare it yourself; nothing is overwritten.

set -euo pipefail

SLUG="${1:?usage: safe-function-download.sh <slug> [project-ref]}"
PROJECT_REF="${2:-pvphxgrtdfrudejjhzjk}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
LIVE="$REPO_ROOT/supabase/functions/$SLUG/index.ts"

if [ ! -f "$LIVE" ]; then
  echo "ERROR: $LIVE does not exist — wrong slug or wrong repo." >&2
  exit 1
fi

# Record the working-tree state BEFORE, so any silent write is provable rather than assumed.
BEFORE_HASH="$(sha256sum "$LIVE" | cut -d' ' -f1)"
BEFORE_STATUS="$(cd "$REPO_ROOT" && git status --porcelain -- "supabase/functions/$SLUG/" || true)"

DEST="$(mktemp -d -t fndl-XXXXXX)"
echo "Downloading $SLUG into isolated dir: $DEST" >&2

# Run the download with the temp dir as cwd so the CLI writes THERE, not into the repo.
(
  cd "$DEST"
  npx supabase functions download "$SLUG" --project-ref "$PROJECT_REF" >&2
)

DOWNLOADED="$DEST/supabase/functions/$SLUG/index.ts"
if [ ! -f "$DOWNLOADED" ]; then
  echo "ERROR: download did not produce $DOWNLOADED" >&2
  exit 1
fi

# Prove the working tree is untouched. If this ever fails, the CLI reached outside its cwd
# and the run must be treated as compromised — do not trust any test executed after it.
AFTER_HASH="$(sha256sum "$LIVE" | cut -d' ' -f1)"
AFTER_STATUS="$(cd "$REPO_ROOT" && git status --porcelain -- "supabase/functions/$SLUG/" || true)"

if [ "$BEFORE_HASH" != "$AFTER_HASH" ] || [ "$BEFORE_STATUS" != "$AFTER_STATUS" ]; then
  echo "FATAL: the download MODIFIED the working tree despite running in an isolated cwd." >&2
  echo "  before sha256: $BEFORE_HASH" >&2
  echo "  after  sha256: $AFTER_HASH" >&2
  echo "  Restore with: git checkout -- supabase/functions/$SLUG/" >&2
  echo "  Treat every test run after this point as INVALID." >&2
  exit 2
fi

echo "working tree verified unchanged (sha256 $AFTER_HASH)" >&2
echo "$DOWNLOADED"
