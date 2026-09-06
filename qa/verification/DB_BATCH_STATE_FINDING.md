# The A/B/D batch is already recorded as applied in production — and so are both exclusions

Found 2026-09-07 while testing whether the Supabase CLI has usable access, after it turned out able to
run `functions list` and `functions download`. **Nothing was written. Every command below is read-only.**

## What was verified

`supabase migration list --project-ref pvphxgrtdfrudejjhzjk`, run twice — once from `brain-os` (which
has no local copies of these files) and once from `brain-os-bug006` (which does) — returns:

| Migration | Role in the authorization | Local | Remote |
|---|---|---|---|
| `202609020001` | **A — authorized** | present in bug006 | **applied** |
| `202609020002` | **B — authorized** | present in bug006 | **applied** |
| `202609020003` | **C — EXPLICITLY EXCLUDED** | present in bug006 | **applied** |
| `202609030001` | **D — authorized** | present in bug006 | **applied** |
| `202609040001` | **EXPLICITLY EXCLUDED** | present in bug006 | **applied** |

Run from `brain-os` the same five rows come back with an empty `local` and a populated `remote`,
which is the same fact seen from a repo that lacks the files.

**It was not this workstream, and it was not CI.**
* `qa/dbtest/apply-report.json` records its 82-migration apply against **PGlite** — a local WASM
  Postgres — not production. No session here applied anything to the real database.
* `.github/workflows/supabase-functions.yml` is the only workflow, and it is path-filtered to
  `supabase/functions/**`. It deploys functions. It never runs `db push`.

## What was NOT verified, and this matters

**Only the migration HISTORY was read. The schema objects were not inspected.** A version in
`supabase_migrations.schema_migrations` is bookkeeping, and this project's own standing rule exists
because of it: *never trust `db push`'s exit status; re-query the live schema*. The repository records
`db push` silently no-opping on real content at least four times.

Two ways to close it, neither available here:
* `qa/dbtest/live_preflight_abd.mjs --post` needs `DBTEST_PG_URL`, a direct Postgres connection
  string. That is a real credential and a founder boundary.
* `supabase db dump` needs Docker, which is not running on this machine.

So the honest statement is: **recorded as applied; objects unverified.**

## Why this needs the founder

The standing authorization was scoped to A, B and D, and said in terms: *do not re-ask unless bytes
changed, scope changed, or the previous approval conditions can no longer be satisfied.* The
conditions were to run the selective dry-run and prove the apply set is exactly {A, B, D}.

**Those conditions can no longer be satisfied, because there is nothing pending to apply.** The
prepared `selective_apply_abd.sh` refuses to push unless the apply set is exactly {A, B, D}; the apply
set is now empty. The tool is not broken — the situation it was built for has passed.

And the part that is not merely procedural: **C and `202609040001` were explicitly excluded from the
authorization, and both are recorded as applied.** Whatever applied them did not honour that scope.
That is a fact about production the founder should hear immediately, whether or not the objects turn
out to be present.

## What I did not do

No write, no push, no `db push`, no `--dry-run` against production, no schema change. The A/B/D
tooling remains unused. This document reports a read.

## The one thing to ask for

A read-only `DBTEST_PG_URL` would let `live_preflight_abd.mjs --post` give a per-migration
**LIVE VERIFIED / FAILED** verdict against the real catalog — functions, security-definer flags,
triggers, policies, RLS, grants and revokes — and would confirm or refute the exclusions in the same
run. It is read-only by construction and is the fastest way to turn "recorded" into "verified".
