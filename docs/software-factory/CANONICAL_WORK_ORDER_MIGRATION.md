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

## 7. Item 8 — Independent review

Dispatched as genuinely separate `claude --agent ... --bg` processes (never in-app
subagents of this session), per the project's established independent-verification
discipline:

- `brain-os-db-security-engineer` — independent inspection of the final migration file,
  with no access to this document's own reasoning, asked to find real problems rather
  than confirm this analysis.
- `brain-os-verifier` — regression pass after the DB engineer's review, per the same
  truth-verification methodology already proven this session.

Results recorded in §8 once both complete.

## 8. Independent review results

*(filled in after dispatch — see chat for the live update)*

## 9. Decision gate

Pending §8's independent results. Current self-assessed status based on the evidence
above: **ZERO-DOWNTIME COMPATIBILITY VERIFIED** for Deployment A specifically (not for
the deferred rename cutover in Deployment C, which remains a distinct, not-yet-designed,
future decision point requiring its own review when scheduled).
