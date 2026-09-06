#!/bin/sh
# VERIFIER #39 — battery runner. Exit status per suite is captured DIRECTLY (no pipeline),
# because the implementing session's own "battery 33/0" was invalidated by taking $? from
# a pipeline. Output is tee'd to a log per suite.
cd "$(dirname "$0")/../../.." || exit 1
mkdir -p qa/verification/scratch/v39/battery
pass=0; fail=0; failed=""
for f in qa/scenarios-runner/*.mjs; do
  case "$f" in */_gate_extract.mjs) continue;; esac
  b=$(basename "$f" .mjs)
  node "$f" > "qa/verification/scratch/v39/battery/$b.log" 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then pass=$((pass+1)); echo "PASS  $b"; else fail=$((fail+1)); failed="$failed $b($rc)"; echo "FAIL  $b rc=$rc"; fi
done
echo "BATTERY: $pass passed, $fail failed"
[ -n "$failed" ] && echo "FAILED:$failed"
exit 0
