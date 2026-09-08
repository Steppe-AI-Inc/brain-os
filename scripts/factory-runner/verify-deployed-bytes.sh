#!/usr/bin/env bash
# Download the LIVE Edge Function source and compare it byte-for-byte against a git ref.
#
# WHY THIS EXISTS. For this whole campaign the link "deployed v92 == git c9dfab5bd433" rested on the
# version number, the CI entrypoint path and timestamps. Every verifier said so plainly and none
# could do better: `supabase functions download` and `supabase link` are refused by the verifier
# sessions' command classifier. Verifiers #41, #42 and the promotion notes all record it as
# INTEGRATION-LEVEL, not byte-direct, and #42 said a deploy decision should close it with one
# download from an unrestricted shell. This is that download, kept as a script so it is repeatable
# rather than a thing someone did once.
#
# It is also the POST-DEPLOY check: after any deploy, run it against the newly deployed commit. The
# standing rule is that a deploy is not "done" until the deployed bytes are re-downloaded and hashed
# against the certified bytes — never trusted from the deploy command's own exit status.
#
# Usage: verify-deployed-bytes.sh <git-ref> [function-slug] [project-ref]
set -euo pipefail

REF="${1:?usage: verify-deployed-bytes.sh <git-ref> [slug] [project-ref]}"
SLUG="${2:-sem-ai-command}"
PROJECT="${3:-pvphxgrtdfrudejjhzjk}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$REPO/qa/verification/scratch/deployed-check-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$OUT"
cd "$OUT"
echo "downloading live $SLUG from $PROJECT ..."
npx --yes supabase@latest functions download "$SLUG" --project-ref "$PROJECT" >/dev/null

LIVE="$OUT/supabase/functions/$SLUG/index.ts"
[ -f "$LIVE" ] || { echo "FAIL: download produced no $LIVE"; exit 1; }

GIT="$OUT/from-git.ts"
git -C "$REPO" show "$REF:supabase/functions/$SLUG/index.ts" > "$GIT"

live_sha="$(sha256sum "$LIVE" | cut -d' ' -f1)"
git_sha="$(sha256sum "$GIT" | cut -d' ' -f1)"

echo "live  $live_sha  ($(wc -c < "$LIVE") bytes)"
echo "git   $git_sha  ($REF, $(wc -c < "$GIT") bytes)"

# The live bundle is served from a LF tree (built in CI); a working tree may be CRLF. Compare raw
# first, and fall back to an LF-normalised comparison so a line-ending difference is reported as
# what it is rather than as a content difference.
if cmp -s "$LIVE" "$GIT"; then
  echo "RESULT: BYTE-IDENTICAL — the deployed source is exactly $REF"
  exit 0
fi
if diff -q <(tr -d '\r' < "$LIVE") <(tr -d '\r' < "$GIT") >/dev/null; then
  echo "RESULT: IDENTICAL AFTER LF NORMALISATION — same content, different line endings"
  exit 0
fi
echo "RESULT: DIFFERENT. The deployed source is NOT $REF. Do not treat any prior certification as"
echo "        applying to what is running. First 20 differing lines:"
diff <(tr -d '\r' < "$LIVE") <(tr -d '\r' < "$GIT") | head -20
exit 1
