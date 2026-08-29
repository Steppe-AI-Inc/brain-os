# Canonical Work Order Migration — Deployment-Safety Review

## 0. What changed since the first version of this document

The first version of this migration renamed the live `public.work_orders` table to
`ai_command_runs` in the same migration that introduced a new canonical table under the
freed-up `work_orders` name, and updated the Edge Function/web app to match. A
deployment-safety review (founder-requested, 2026-08-29) found this unsafe: `supabase db
push` (DB), `supabase functions deploy` (Edge Function), and the Vercel deploy (web/) are
three separate, non-atomic operations. During the real window between them, the
currently-deployed Edge Function/web code — still calling `create_pending_work_order`/
`mark_work_order_failed`, still selecting `command`/`output`/`channel_id` from
`work_orders` — would have hit the new canonical table (wrong columns) or a dropped
function, breaking the core chat product for the length of that window. Rollback-testing
the migration in isolation never exercised this: it proved the DDL was internally
consistent, not that a currently-running process survives the rollout.

**Redesign**: expand -> migrate -> contract. This document now describes and evidences
**Deployment A only** — a pure-expand migration with zero renames, zero drops, and zero
changes to anything the live app currently depends on. The Edge Function and web app code
changes from the first version were reverted (`git checkout df0a532 -- ...`) — they are
not needed for Deployment A and are deferred to a future, independent Deployment B/C (§6).

## 1. Real schema inspection (unchanged from the first version, still the reason this
migration exists)

`public.work_orders` today has zero FK relationship to `goals` or `tasks` — it is
exclusively the AI chat-command audit log (`chat command -> work_orders row -> AI
execution/output/audit`), never a business Work Order. `tasks.parent_goal` is free text,
not a FK. Full grep-verified dependency inventory (functions/RPCs, RLS, generated types,
Edge Functions, web queries, `model_usage`/`ai_reply_log` FKs, docs/QA, plus this pass's
additional checks for views/triggers/cron jobs — none found referencing `work_orders`):
see the original inventory in git history (commit `2a3b3ef`) — unchanged by the redesign,
since the redesign doesn't touch any of those dependencies at all.

## 2. Deployment A — the actual migration (`202608290002_canonical_work_order_model.sql`)

Pure expand, nothing renamed or dropped:

- New table `public.canonical_work_orders` — deliberately NOT named `work_orders` yet.
  That name stays exactly what it is today (the AI chat-command audit log) until a later,
  coordinated cutover (§6). Real `Company -> Goal -> Work Order -> Task` chain: real FK
  `canonical_work_orders.goal_id -> goals.id` (nullable), reuses existing `work_status`/
  `priority_level`/`risk_level` enums, the proven three-tier RLS pattern, and the
  `force_*_creator` trigger pattern (all unchanged from the first version's design
  rationale).
- `public.tasks` gains a new nullable `canonical_work_order_id` column (real FK,
  replacing free-text association for this new relationship only — `parent_goal` itself
  is untouched). Purely additive: old code never selects or references it.
- The **existing, unchanged** `public.work_orders` gains a new nullable
  `canonical_work_order_id` column. This is how "AI Command Run -> optional canonical
  Work Order" is expressed without renaming anything or forcing informational chat
  commands to create one — nullable, wiring it up from live chat commands is deferred
  application-code work (§6), not part of this migration.
- New table `public.agent_runs` (`Task -> Agent Assignment -> Agent Run`) — brand new
  concept, zero collision risk. Execution events reuse `audit_logs` unchanged rather than
  a new table.

## 3. Item 1 — Old-code compatibility test (real, rollback-tested against production)

Every one of the checklist's named flows was exercised for real, inside a transaction
that also applied the full migration and ended in `ROLLBACK` (nothing ever persisted),
using the **exact call shapes the currently-deployed Edge Function and web/ issue**:

| Flow | Test | Result |
|---|---|---|
| `create_pending_work_order` RPC | Called with the exact production argument shape | Produced a real row — function still exists under its original name |
| `mark_work_order_failed` RPC | Called against that row | Ran without error — function still exists under its original name |
| Chat history query shape | `select id, command, status, output, created_at from work_orders` (exact `chat-history.ts` column list) + `model_usage` embed | All columns present, query succeeds |
| Chat channel "General" bucket | `select created_at from work_orders where channel_id is null order by created_at desc limit 1` (exact `chat-channels.ts` shape) | Succeeds |
| Dashboard 14-day count | `select count(*) from work_orders where created_at >= now() - interval '14 days'` (exact `dashboard/page.tsx` shape) | Returns a real count (214) — **still counts real AI command runs**, not silently redirected to the new canonical table (the exact silent-data-corruption failure mode this review exists to catch) |
| `model_usage`/`ai_reply_log` FKs | Unaffected — neither table nor its FK columns were touched by this migration at all | N/A — nothing to verify, nothing changed |
| RLS behavior | `work_orders` RLS policies checked by name post-migration | Exactly the original 3: `work_orders_insert_auth`, `work_orders_select_scope`, `work_orders_update_admin` — untouched |
| `sem_execute_ai_command` | Not called in this pass (its shape is provably unaffected — Deployment A never redefines it, confirmed by `pg_proc` lookup showing no change) | N/A — untouched |

**Existing-data proof (checklist item 5)**: 3 real pre-existing `work_orders` rows
snapshotted (`id, command, status, company_id, created_by_profile_id, channel_id, output,
created_at`) before the migration and re-read after — **0 mismatches**. `work_orders` has
exactly 14 columns post-migration (13 original + 1 new nullable
`canonical_work_order_id`) — proves nothing was dropped, renamed, or retyped.

## 4. Item 6 — New-model proof (real, rollback-tested)

Real `INSERT`s chained through `Company -> Goal -> canonical_work_orders -> Task ->
agent_runs` via data-modifying CTEs (joined CTE-to-CTE, not fresh table reads — a
snapshot-visibility lesson learned earlier this session and reapplied here), confirmed
resolving correctly (`agent_run -> task -> canonical_work_order -> goal`, expect-1 check
returned 1). Separately verified: an **existing** `work_orders` row can have its new
`canonical_work_order_id` column set to link it to a canonical Work Order — proving the
"AI Command Run -> optional canonical Work Order" relationship works without forcing
every chat command to create one (nullable, opt-in).

## 5. Item 2/3 — Zero-downtime model and expand/migrate/contract

```text
T0  old web + old Edge + old DB                         (current state)
T1  DB migration (Deployment A) applied                 <- this migration
    old web may still be serving  -> UNCHANGED BEHAVIOR (proven §3)
    old Edge may still be serving -> UNCHANGED BEHAVIOR (proven §3)
T2  (no Edge deployment required for Deployment A)
T3  (no Vercel deployment required for Deployment A)
T4  (no new code activation required for Deployment A)
```

Because Deployment A renames nothing, drops nothing, and changes the shape of nothing the
live app already depends on, **no application-tier deployment is coupled to it at all** —
correctness at every stage T0-T4 reduces to "T1 changes nothing observable to old code,"
which is what §3's evidence table proves directly, not by careful timing or a narrow
deploy window, but by construction (there is no code path in the currently deployed Edge
Function or web app that touches `canonical_work_orders`, `agent_runs`, or the new
`canonical_work_order_id` columns — they don't exist in that code, so it cannot reference
them, so nothing it does can behave differently before vs. after this migration).

**Deferred Deployment B** (not part of this migration, no timeline commitment yet):
update Edge Function + web code to reference the new canonical concept explicitly where a
real feature needs it (starting with Phase 5's bootstrap test, which talks to the DB
directly via scripts — not through the deployed app — so it doesn't even require
Deployment B). Verified live before merge, same as any other release.

**Deferred Deployment C** (not part of this migration, no timeline commitment yet): the
actual rename cutover — `work_orders` (old, AI-command log) -> `ai_command_runs`,
`canonical_work_orders` -> `work_orders` (final canonical name) — only once no deployed
code depends on the old name for the old meaning. This is the genuinely risky step the
first version of this migration attempted prematurely; it needs its own dedicated
deployment-safety review when it's actually scheduled, likely using one of: a brief
real maintenance window for chat, or an intermediate step where the app code is updated
to handle both names simultaneously before the DB rename lands. Not designed in detail
here since it isn't needed yet — Phase 5's bootstrap test only needs the canonical chain
to exist, not to carry its final name.

## 6. Item 7 — Rollback strategy for Deployment A

Because Deployment A is purely additive and requires no coordinated app deploy, its
rollback is correspondingly simple and low-risk:

- **If the DB migration itself needs to be reverted** (e.g., a design flaw discovered
  after push): `drop table public.agent_runs cascade; drop table public.
  canonical_work_orders cascade; alter table public.tasks drop column
  canonical_work_order_id; alter table public.work_orders drop column
  canonical_work_order_id; drop trigger canonical_work_orders_force_creator on public.
  canonical_work_orders; drop function public.force_canonical_work_order_creator();` —
  none of this touches any pre-existing row or any object the live app depends on, since
  nothing live ever depended on the new objects (they didn't exist in old code).
- **"Edge deployment fails" / "Vercel deployment fails" / "new Edge has a runtime
  error"**: not applicable to Deployment A — no Edge or Vercel deployment occurs as part
  of this migration, so there is nothing to roll back on the app tier and no scenario
  where a failed app deploy leaves the DB and app tiers mismatched. This is the direct
  benefit of decoupling the expand step from any app cutover. Deployment B/C, whenever
  they're scheduled, will need their own rollback plan addressing exactly these
  scenarios, since those steps do involve coordinated app deploys.

## 7. Item 8 — Independent review (both real, both dispatched as genuinely separate
`claude --agent ... --bg` top-level processes, never in-app subagents)

**Pass 1 — `brain-os-db-security-engineer`** (real dispatch, provider run id `50e0371c`,
~5m33s). Independently confirmed item 1 (old-code compatibility) solid and independently
reproducible. Found one real, genuine defect: `agent_runs_insert_scope`'s `company_id is
null or has_company_access(company_id)` branch let any authenticated session insert an
`agent_runs` row with `company_id` left null and an arbitrary **spoofed**
`created_by_profile_id` — including a fabricated `verification_status = 'live_verified'`.
The migration's own comment claiming "only the trusted service-role Runner inserts here"
was true about *intent*, not an RLS-enforced guarantee. Also found a real process gap:
this project's own migration-then-mirror-into-`schema-v0.7-production-core.sql`
convention had been skipped.

**Both fixed** (commit `6a8310e`): `agent_runs_insert_scope` now additionally requires
`created_by_profile_id is null or created_by_profile_id = current_profile_id()` — the
service-role Runner is unaffected (bypasses RLS entirely); an ordinary authenticated
session can only attribute a row to itself or leave it unattributed, never spoof someone
else's identity. Re-verified via a real rollback-tested adversarial insert attempt as the
exact exploited persona (an ordinary authenticated employee, `company_id = null`,
`created_by_profile_id` set to a different real profile) — the insert now genuinely fails
with `insufficient_privilege`, caught and asserted inside a `DO` block that would itself
raise `SECURITY REGRESSION` if the spoofed insert had NOT been blocked. The full
old-code-compatibility/new-chain/regression suite (§3-4) was re-run against the fixed
migration and still passes in full. The migration was also mirrored into
`supabase/schema-v0.7-production-core.sql` (appended after the file's existing end, using
`ALTER TABLE ADD COLUMN` for the two new columns rather than folding them into the
original `CREATE TABLE tasks`/`work_orders` statements — that file runs top-to-bottom on
a fresh project, so `canonical_work_orders` must exist before anything can reference it,
the same reason the real migration itself uses `ALTER TABLE` there).

**Pass 2 — `brain-os-verifier`** (real dispatch, provider run id `7d3318ed`, ~23m,
re-dispatched once after a shell-quoting mishap on the first attempt risked corrupting
its prompt — confirmed the corrupted session's actual received prompt before trusting
the clean redispatch). Did not simply trust Pass 1's fix — independently re-derived and
re-confirmed the spoofing defect is genuinely blocked, then went further: **26/26
adversarial RLS assertions** across 7 personas (founder, company manager, plain member,
outsider, cross-company member, investor_viewer, former member), covering cross-company
isolation in both directions, `investor_viewer` exclusion, select-scope precedent
matching, update-with-check company-reassignment blocking, and delete-scope tier
differences between the two new tables — all correct. Found 16 scenarios beyond the
already-known defect, all passing. Confirmed FK on-delete semantics (`goal_id`,
`canonical_work_order_id` on both `tasks` and `work_orders` — all `SET NULL`, never
blocking or cascading unexpectedly). Re-ran the 4 existing named regressions
(SC-070/SC-103/SC-093/approval-deletion) in the same rolled-back transaction as the
migration — all `all_pass: true`.

Self-disclosed one real finding about its own process: its first draft of one adversarial
test (its own "TEST 18") reported a false FAIL — root-caused via an isolated debug
transaction to a bug in the test itself (reading the "was it blocked" outcome through the
same denied actor's own RLS-blind `SELECT`, which correctly can't see the row either way
regardless of whether the write was actually blocked) — not a real product defect. Fixed
the test, reran, confirmed. Documented as a general methodology lesson in
`qa/KNOWN_FAILURE_MODES.md` #22 (verification-methodology entry, not a new product
defect).

Confirmed production untouched before/during/after all of this testing (`canonical_work_
orders`/`agent_runs` absent from `information_schema.tables`, zero leftover synthetic
rows anywhere, zero `profiles.role` drift on the reused real employee profile used for
persona testing).

**New permanent regression test added**: `qa/scenarios-runner/
canonical_work_order_model_adversarial.sql` (26 assertions) — committed locally
(`c2b6a0c`, `brain-os-verifier`'s own commit; not pushed to the remote — the session's own
auto-mode classifier correctly blocked `git push origin master` outright, and the
verifier did not attempt to work around it, per this project's standing rule that pushing
requires explicit authorization).

## 8. Decision gate

**ZERO-DOWNTIME COMPATIBILITY VERIFIED** for Deployment A, with evidence:

1. Old-code compatibility — real, rollback-tested, independently reproduced by both
   reviewers (§3, §7).
2. Zero-downtime deployment model — no application-tier deploy is coupled to this
   migration at all (§5); T0-T4 correctness reduces to "T1 changes nothing observable to
   old code," proven directly rather than by timing.
3. Expand/migrate/contract — this migration is Deployment A only; Deployment B/C
   (the actual rename cutover) are explicitly deferred, not designed in detail here (§5).
4. Dependency inventory — complete (functions/RPCs, RLS, generated types, Edge
   Functions, web queries, `model_usage`/`ai_reply_log`, docs/QA, views, triggers, cron —
   none of the latter three exist referencing `work_orders`).
5. Existing-data proof — 3 real pre-existing rows byte-identical pre/post migration;
   `work_orders` has exactly 14 columns (13 original + 1 new nullable) post-migration.
6. New-model proof — real FK traversal `Company -> Goal -> canonical_work_orders ->
   Task -> agent_runs` confirmed; `work_orders.canonical_work_order_id` optional-link
   confirmed settable without forcing every chat command to create one.
7. Rollback strategy — trivial and low-risk for Deployment A specifically (pure
   `DROP`/`ALTER ... DROP COLUMN`, nothing live depends on the new objects); Deployment
   B/C will need their own rollback plan when scheduled, since those steps do involve
   coordinated app deploys.
8. Independent review — two full passes, one real defect found and fixed and
   re-verified by both reviewers independently, 26/26 adversarial RLS assertions pass,
   all 4 existing regressions still pass, production confirmed untouched throughout.

**Two things need your explicit go-ahead, separately** (per this project's standing
rule — neither was done autonomously):
- `git push origin master` — pushes 3 new local commits (`df8e41d` the expand-only
  redesign, `c2b6a0c` the verifier's new adversarial regression test, `6a8310e` the
  security fix + schema mirror). Safe, reversible, no production database impact by
  itself — these are source-controlled files only.
- `supabase db push` for `202608290002_canonical_work_order_model.sql` — the actual
  production schema change. Per all the evidence above, both independent reviewers'
  conclusion, and this document's own analysis: safe to push.
