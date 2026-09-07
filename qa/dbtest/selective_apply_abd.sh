#!/usr/bin/env bash
# SELECTIVE PRODUCTION APPLY — founder-authorized batch A/B/D ONLY (202609020001, 202609020002, 202609030001).
# EXCLUDED and must stay untouched: C 202609020003, 202609040001, and every other pending migration.
#
# Why selective: the approved set is NON-CONTIGUOUS (C sits between B and D in version order), so a plain
# `supabase db push` would apply C and 040001 too. This script curates a TEMP workdir whose migrations dir
# contains only (already-applied versions) ∪ {A,B,D}, so the CLI can physically apply at most A/B/D — and it
# refuses to push unless the dry-run apply set is EXACTLY {A,B,D}. Gap-safety (D applies without C; C/040001
# still apply cleanly afterwards) was proven on PGlite: qa/dbtest/selective_abd_gap_safety.mjs (8/8).
#
# DEFAULT IS DRY-RUN. Nothing is written to production unless APPLY=1 is set explicitly.
#
# Required env (founder-supplied; never committed):
#   SUPABASE_ACCESS_TOKEN   management-API token (migration list / db push)
#   SUPABASE_DB_PASSWORD    production DB password (db push connects to the DB)
#   DBTEST_PG_URL           production session-pooler URL, READ-ONLY role — for live_preflight_abd.mjs
# Usage:
#   bash qa/dbtest/selective_apply_abd.sh            # steps 0-3: list, pre-preflight, curate, DRY-RUN + exact-set proof
#   APPLY=1 bash qa/dbtest/selective_apply_abd.sh    # + step 4 push (only if the proof passed) + step 5 post-preflight
set -euo pipefail
PROJECT_REF="${PROJECT_REF:-pvphxgrtdfrudejjhzjk}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
A=202609020001; B=202609020002; D=202609030001
APPROVED="$A $B $D"
EXCLUDED_C=202609020003; EXCLUDED_X=202609040001
EXPECTED_PKG=e7c943e   # the independently reviewed round-7 package (migration bytes must match this commit)

say() { printf '\n=== %s ===\n' "$*"; }
die() { printf '\nSTOP: %s\n' "$*" >&2; exit 1; }
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required (founder boundary — never stored in the repo)}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required (founder boundary — never stored in the repo)}"

say "0a. migration bytes == reviewed package $EXPECTED_PKG ?"
for v in $APPROVED; do
  f=$(ls "$REPO"/supabase/migrations/${v}_*.sql); base=$(basename "$f")
  if ! git -C "$REPO" diff --quiet "$EXPECTED_PKG" -- "supabase/migrations/$base"; then die "$base differs from the reviewed package $EXPECTED_PKG — re-review required before any production write"; fi
  echo "  ok  $base  == $EXPECTED_PKG  sha256 $(sha256sum "$f" | cut -c1-16)"
done

say "0b. linked project + remote migration history (read-only)"
npx --yes supabase projects list 2>/dev/null | grep -E "$PROJECT_REF" || echo "  (projects list unavailable — continuing with explicit --project-ref)"
LIST=$(npx --yes supabase migration list --linked --project-ref "$PROJECT_REF" 2>&1) || die "migration list failed: $LIST"
echo "$LIST"
# Remote-applied versions = 2nd column of the table where it carries a version.
APPLIED=$(echo "$LIST" | awk -F'|' 'NF>=2 { gsub(/ /,"",$2); if ($2 ~ /^[0-9]{12,14}$/) print $2 }' | sort -u)
[ -n "$APPLIED" ] || die "could not parse any remote-applied version from migration list — refusing to curate blind"
echo "  remote-applied versions: $(echo "$APPLIED" | wc -l)"
for v in $APPROVED; do echo "$APPLIED" | grep -q "^$v$" && die "$v is ALREADY applied remotely — the authorization conditions changed; stop and re-check"; done
for v in $EXCLUDED_C $EXCLUDED_X; do echo "$APPLIED" | grep -q "^$v$" && die "EXCLUDED $v is already applied remotely — unexpected state; stop"; done

say "1. PRE-apply live preflight (read-only; needs DBTEST_PG_URL)"
if [ -n "${DBTEST_PG_URL:-}" ]; then (cd "$REPO/qa/dbtest" && node live_preflight_abd.mjs --pre) || die "pre-apply preflight failed"; else echo "  DBTEST_PG_URL unset — pre-preflight SKIPPED (set it for the LIVE VERIFIED verdict path)"; fi

say "2. curate a temp workdir: keep (applied ∪ A/B/D), remove every other pending file"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
cp -r "$REPO/supabase" "$WORK/supabase"
REMOVED=0; KEPT=0
for f in "$WORK"/supabase/migrations/*.sql; do
  v=$(basename "$f" | cut -c1-12)
  if echo "$APPLIED" | grep -q "^$v$" || [[ " $APPROVED " == *" $v "* ]]; then KEPT=$((KEPT+1)); else rm -f "$f"; REMOVED=$((REMOVED+1)); echo "  removed pending/unapproved: $(basename "$f")"; fi
done
echo "  kept $KEPT (applied + A/B/D), removed $REMOVED"
for v in $EXCLUDED_C $EXCLUDED_X; do ls "$WORK"/supabase/migrations/${v}_*.sql >/dev/null 2>&1 && die "EXCLUDED $v still present in the curated dir"; done

say "3. DRY-RUN from the curated workdir — the apply set must be EXACTLY A, B, D"
DRY=$(cd "$WORK" && npx --yes supabase db push --dry-run --project-ref "$PROJECT_REF" 2>&1) || true
echo "$DRY"
SET=$(echo "$DRY" | grep -oE '\b2026[0-9]{8}\b' | sort -u | tr '\n' ' ' | sed 's/ $//')
echo "  dry-run apply set: [$SET]"
[ "$SET" = "$(echo $APPROVED | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/ $//')" ] || die "dry-run apply set [$SET] != exactly [A B D] — DO NOT PUSH. Founder condition not satisfied."
echo "  PROOF: apply set == exactly {A,B,D}"

if [ "${APPLY:-0}" != "1" ]; then say "DRY-RUN COMPLETE — nothing written. Re-run with APPLY=1 to push (authorization: founder, A/B/D only)."; exit 0; fi

say "4. PUSH (APPLY=1) — A, B, D only, from the curated workdir"
(cd "$WORK" && npx --yes supabase db push --project-ref "$PROJECT_REF" 2>&1) || die "db push reported failure — verify live state before anything else"
echo "  push returned. (exit status is NOT evidence — the post-preflight below is.)"

say "5. POST-apply live preflight — per-migration LIVE VERIFIED / FAILED, C/040001 must be UNTOUCHED"
[ -n "${DBTEST_PG_URL:-}" ] || die "DBTEST_PG_URL unset — cannot produce LIVE VERIFIED verdicts; run: DBTEST_PG_URL=... node qa/dbtest/live_preflight_abd.mjs --post"
(cd "$REPO/qa/dbtest" && node live_preflight_abd.mjs --post)
say "6. remote history after apply"
npx --yes supabase migration list --linked --project-ref "$PROJECT_REF" 2>&1 | grep -E "$A|$B|$D|$EXCLUDED_C|$EXCLUDED_X" || true
echo; echo "Persona / cross-org / retry-claim semantics: run the real-PostgreSQL suites against a production-SCHEMA clone (CI job), NOT against production data."
