#!/bin/sh
# verifier #8: run every behavioral suite in qa/scenarios-runner on e8678ec as committed
cd "$(dirname "$0")/../../scenarios-runner" || exit 1
fail=0
for f in *.mjs; do
  [ "$f" = "_gate_extract.mjs" ] && continue
  printf '=== %s === ' "$f"
  if out=$(node "$f" 2>&1); then
    echo "PASS | $(printf '%s' "$out" | tail -1)"
  else
    fail=1
    echo "FAIL"
    printf '%s\n' "$out" | tail -10
  fi
done
exit $fail
