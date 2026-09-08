#!/usr/bin/env bash
# Verifier #52 — READ-ONLY download of the deployed sem-ai-command source into a scratch dir.
# Never writes to the working-tree supabase/functions/sem-ai-command/index.ts.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DL="$ROOT/qa/verification/scratch/v52/dl"
rm -rf "$DL"
mkdir -p "$DL"
cd "$DL" || exit 1
npx supabase functions download sem-ai-command --project-ref pvphxgrtdfrudejjhzjk 2>&1 | tail -5
echo "--- downloaded files:"
ls -la "$DL/supabase/functions/sem-ai-command/" 2>/dev/null
echo "--- sha256 / bytes of downloaded index.ts:"
sha256sum "$DL/supabase/functions/sem-ai-command/index.ts" 2>/dev/null
wc -c "$DL/supabase/functions/sem-ai-command/index.ts" 2>/dev/null
echo "--- working tree index.ts (must be unchanged):"
sha256sum "$ROOT/supabase/functions/sem-ai-command/index.ts"
