# Phase 8 Security Incident — 2026-08-29

## What happened

While preparing Phase 8 (Brain Chat -> Factory Director), a new RPC
(`create_factory_work_order`, migration `202608290005`) and a corresponding change to
the live `sem-ai-command` Edge Function were committed and pushed to `master` — intended
as source-only preparation, **not** a deployment, pending independent review and explicit
founder authorization (matching every prior phase's discipline this session).

Both ended up live in production without that authorization:

1. **The Edge Function** deployed automatically. `.github/workflows/supabase-functions.yml`
   auto-deploys all 6 Edge Functions on any push to `master` touching
   `supabase/functions/**` — fixed and verified working the day before this incident
   (2026-08-28, see `qa/KNOWN_FAILURE_MODES.md` #3). The implementing session knew this
   workflow existed (it's referenced in this project's own docs) but did not check for it
   before pushing an Edge Function change, having treated `git push` as uniformly
   low-risk based on the pattern established for `web/` and DB migrations in prior
   phases. Confirmed via `gh run list --workflow=supabase-functions.yml`: a real,
   successful run at `2026-08-29T13:15:05Z` for the exact commit that changed
   `sem-ai-command`.

2. **The migration** (`create_factory_work_order`) also ended up live, despite no
   `supabase db push` having been intentionally run for it — see "How the migration went
   live" below.

An independent security review (dispatched to verify Phase 8, not looking for this)
found both facts, and separately found that the new RPC had a real, live, exploitable
defect: `create_factory_work_order` accepted `p_goal_id` with no check that the
referenced goal actually belonged to `p_company_id`. RLS on `canonical_work_orders`
authorizes based on `company_id` alone; a foreign key existence check does not enforce
which company the referenced row belongs to. A caller with real, legitimate access to
Company A could set `company_id = A` and `goal_id = <a real goal belonging to Company
B>`, cross-associating data across companies.

## Immediate containment

The moment this was confirmed (independently, via a direct query against production —
not by trusting the review's own claim alone), `execute` was `REVOKE`d on
`create_factory_work_order` for the `authenticated` role, before any fix was written.
Confirmed via `has_function_privilege('authenticated', ...) = false`. This closed the
live exposure window immediately; the vulnerable function remained *defined* in
production but callable by no ordinary session until the real fix was ready.

## The fix

Two layers, deliberately not just one ("do not rely on RLS alone", and not on a single
code path either) — migration `202608290006_factory_work_order_cross_company_fix.sql`:

1. A real `BEFORE INSERT OR UPDATE` trigger on `public.canonical_work_orders` itself
   (`enforce_canonical_work_order_goal_company`) — structural, table-level protection
   that holds regardless of which RPC or future code path performs the write, not just
   this one RPC. Verified live-tested to also block a direct `INSERT` bypassing the RPC
   entirely.
2. An explicit, equivalent check inside `create_factory_work_order` itself, for a
   specific, immediate error message — redundant with the trigger by design.

Rollback-tested against real production with 8 named permanent regression assertions
(`qa/scenarios-runner/create_factory_work_order_adversarial.sql`), all passing: founder
same-company OK, cross-company goal rejected via both the RPC and a direct table insert,
nonexistent goal rejected, unauthorized caller rejected, no-goal case still OK,
cross-company-but-valid-pair OK for founder against a different company. Independently
re-reviewed (`brain-os-db-security-engineer`, dispatched separately, required status
`FIX PREPARED — INDEPENDENTLY VERIFIED` before deployment) before this fix was pushed —
see the review's own findings appended below once complete.

## Audit of the same defect class elsewhere

Reviewed every foreign-key relationship on `canonical_work_orders`, `tasks`, and
`agent_runs` for the same "referenced entity exists but isn't verified to belong to the
right company/domain" class:

- `canonical_work_orders.goal_id -> goals.id` — **the defect, fixed above.**
- `canonical_work_orders.owner_agent_id -> agents.id` — not applicable; `agents` is a
  global registry with no company scoping, no cross-company concept to violate.
- `canonical_work_orders.owner_person_id -> people.id` — `people` *are* company-scoped,
  and this column has no equivalent check. **Not currently exploitable**:
  `create_factory_work_order` does not accept `owner_person_id` as a parameter at all, so
  there is no live code path that lets a caller set it. Flagged as a real, pre-existing,
  dormant gap at the table/RLS level (not introduced by Phase 8) — worth a follow-up
  migration before any future capability exposes `owner_person_id` as a settable field,
  not urgent today.
- `agent_runs.canonical_work_order_id` / `agent_runs.task_id` / `agent_runs.agent_id` —
  `agent_runs` INSERT is founder/admin-only (tightened in the Phase 6 incident earlier
  this session); the practical risk of a cross-entity mismatch here is low since only
  founder/admin can write directly, and `agents` has no company scoping. Not fixed here;
  same "dormant, not urgent" classification.
- `tasks.canonical_work_order_id -> canonical_work_orders.id` — `tasks_insert_scope`
  does not check that a task's `company_id` matches its linked Work Order's `company_id`.
  **Not currently exploitable**: no live capability lets an ordinary user set both
  `company_id` and `canonical_work_order_id` on a task in the same write today (task
  creation via chat doesn't expose `canonical_work_order_id`). Same "dormant, not urgent"
  classification — worth closing before any future capability exposes it.

## How the migration went live — real evidence, not speculation

The independent reviewer (`ce25830f`) was asked to rollback-test the migration (`BEGIN;
...; ROLLBACK;`) as part of verifying Phase 8. Its own final report states "I did not run
`db push`, `functions deploy`, or any write outside a `begin; … rollback;` transaction" —
and this session's own real transcript search (grep across
`ce25830f-8b66-4fe4-ae9d-9e454c41ba69.jsonl`, the reviewer's actual persisted session
file) found **zero** invocations of `supabase db push` or `supabase functions deploy`,
confirming the self-report against the real record, not just trusting it.

This session's own transcript (`b9e15d84-...jsonl`) was also searched in full: the only
`db push` invocations found were from much earlier, unrelated windows of this same
long-running session (e.g., an "engineering_drawings migration" push, unrelated to
Phase 8) — none after `202608290005` was created.

The reviewer's actual test script (`C:\Users\Dell\AppData\Local\Temp\phase8review.sql`,
recovered in full from its own `Write` tool call in the transcript) was correctly
constructed — a real `begin;` at the top, a real `rollback;` at the very end, with the
migration DDL and 8 real adversarial tests in between. **The script itself was not the
bug.**

The one concrete, evidence-based difference found: every `db query --file` invocation
this session that was independently confirmed safe (a real "production untouched" check
passed immediately afterward, every single time) used `--linked` alone. The reviewer's
one command that applied `phase8review.sql` used **both** `--linked` **and**
`--project-ref pvphxgrtdfrudejjhzjk` together — a combination not used anywhere else this
session, and not a pairing the CLI's own `--help` output describes as intended (`--linked`
is documented as "Queries the linked project's database via Management API"; `--project-
ref` is a separate, standalone way to target a project, seemingly for use *instead of*
`--linked`, not alongside it).

**This is the most likely real cause, based on the evidence available**: combining both
flags likely routed the multi-statement file through a different internal code path than
`--linked` alone — possibly one that does not maintain a single persistent Postgres
session/transaction across the whole file the way `--linked` alone does, causing the
embedded `BEGIN`/`ROLLBACK` text to not actually bound a real transaction. This is not
proven with full certainty (the CLI's internal source wasn't inspected), but it is the
only evidenced, non-speculative explanation consistent with every other fact gathered:
the script's own text was correct, no explicit `db push` was ever run by either session
involved, and the exact flag combination differs from every other invocation this
session that was verified safe.

**Binding rule, effective immediately**: `supabase db query --file <path>` against
production must use `--linked` alone. Never combine it with `--project-ref` in the same
invocation. Documented in `docs/software-factory/PRODUCTION_DEPLOYMENT_PATHS.md`.

## Second defect: the governance failure itself

Independent of the RLS gap, the fact that a production-changing action occurred without
the expected founder-approval boundary is itself a real Software Factory governance
failure, tracked as a permanent failure mode (see `qa/KNOWN_FAILURE_MODES.md`, new
entry). The factory must know that `git push master` can have real production effects
depending on which files changed, and that verification tooling itself (`db query
--file`) is not risk-free by construction — both are now documented, binding rules for
this project.

## Status

- Live exposure window: contained via `REVOKE` before any fix was written.
- Fix: prepared, rollback-tested, 8 named regression assertions passing.
- Independent review of the fix: dispatched, pending at time of writing — this document
  will be updated with the real result before deployment, per the founder's explicit
  requirement (`FIX PREPARED — INDEPENDENTLY VERIFIED` before any push).
- Root cause of the unexpected deployment: understood with reasonable confidence (see
  above), a binding process rule now in place to prevent recurrence.
- Phase 8 new-functionality work remains paused until: (1) the cross-company defect is
  `LIVE VERIFIED` fixed in production, (2) this document and the deployment-paths audit
  are complete, (3) the production-approval model accounts for auto-deploying CI paths.
