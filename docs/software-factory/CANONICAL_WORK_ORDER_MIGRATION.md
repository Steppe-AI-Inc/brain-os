# Canonical Work Order Migration — Inspection, Design, and Rollback-Test Evidence

## 1. Why this migration exists

The Software Factory master plan originally assumed a `Goal -> Work Order -> Task` chain
already existed in Brain OS and could be reused as-is. Direct schema inspection (this
document) proved that assumption wrong: `public.work_orders` has **zero** FK relationship
to `goals` or `tasks`. Real evidence:

- `work_orders` columns (schema-v0.7-production-core.sql:433-447): `id, command,
  company_id, assigned_agent_id, channel_id, status, context_pack, output,
  token_estimate, cost_estimate_usd, created_by_profile_id, created_at, updated_at`. No
  `goal_id`. No DELETE policy (append-only). Populated exclusively by
  `create_pending_work_order()` / `sem_execute_ai_command()` — one row per AI chat
  command/turn.
- `tasks.parent_goal` is free **text**, not a FK to `goals.id`. `tasks` has no
  `work_order_id` column.
- `goals` has no relationship back to `work_orders` or `tasks`.
- The only place a work order and its tasks were ever correlated was inside
  `sem_execute_ai_command`'s single transaction (both inserted in the same RPC call) —
  never a persisted, queryable FK.
- `approvals` attach to `tasks.task_id`, never to `work_orders`. `documents` attach to
  `department_id`/`project_id`/`company_id`, never to `work_orders` or `tasks`.
- App-layer usage (`web/`) touches `work_orders` only from chat/chat-history/
  chat-channels/dashboard code — it is genuinely the AI chat-command audit log, never a
  project-management concept anywhere in the UI.

**Conclusion, confirmed by direct inspection, not assumption**: `work_orders` is an AI
command/execution audit record (`chat command -> work_orders row -> AI execution/output/
audit`), not a canonical business Work Order. Overloading it for the Software Factory's
`Goal -> Work Order -> Task` chain would create a bad semantic model where "what's our
revenue?" and "Build Partner Revenue Dashboard" are the same entity type.

Founder direction (2026-08-29): semantic separation, staged and compatibility-safe — not
a reckless rename, and not `factory_work_orders` as a second competing system. The
canonical Work Order must be generic Brain OS infrastructure (usable by software
development, sales, operations, service, finance, engineering, and future AI-managed
business processes), not a Software-Factory-only concept.

## 2. Dependency inventory (real, grep-verified — see commands in this session)

Every real touch point of `public.work_orders` before this migration:

- **Functions/RPCs**: `create_pending_work_order`, `mark_work_order_failed`,
  `sem_execute_ai_command` (parameter `p_work_order_id`, variable `v_work_order_id`).
- **RLS**: `work_orders_select_scope`, `work_orders_insert_auth`,
  `work_orders_update_admin`.
- **Generated types**: `web/types/database.ts` (Tables.work_orders, Functions entries).
- **Edge Function**: `supabase/functions/sem-ai-command/index.ts` — 3 RPC call sites, 2
  `audit_logs` inserts tagged `entity_type: 'work_order'`, 1 direct `.from('work_orders')`
  read (conversation history) + 1 update (persisting grounded summaries), the SSE stream
  emits `{ type: 'work_order', id }` and a `workOrder` field on `done`.
- **Web queries**: `web/lib/data/chat-history.ts` (`getChatHistory`, `ChatHistoryMessage.
  workOrderId`), `web/lib/data/chat-channels.ts` (sidebar "General" bucket detection,
  delete-channel comment), `web/app/(app)/dashboard/page.tsx` (14-day "recent runs"
  count).
- **Other FKs**: `model_usage.work_order_id`, `ai_reply_log.work_order_id` — both real FKs
  to `work_orders`, but internal token/cost-tracking columns, not user-facing "Work
  Order" concepts.
- **Docs/QA**: `qa/scenarios/core/work_orders/README.md`, `qa/SECURITY_MATRIX.md`,
  `qa/RELEASE_EVIDENCE.md`, `governance/DATA_CLASSIFICATION.md`, `governance/roles/*.md`
  — live-state references (updated where they describe current behavior).
  `qa/KNOWN_FAILURE_MODES.md` #7 references are dated historical incident records and are
  deliberately left unchanged — they describe what was true when that incident occurred.

## 3. Staged design (Stage A / B / C)

**Stage A — rename, zero behavioral change.** `public.work_orders` -> `public.
ai_command_runs` (table, primary key + all 4 FK constraints, the one index, all 3 RLS
policies). `create_pending_work_order` -> `create_pending_ai_command_run`,
`mark_work_order_failed` -> `mark_ai_command_run_failed` (both dropped and recreated —
function renames can't go through `create or replace`). `sem_execute_ai_command` keeps
its name (it genuinely does "execute an AI command") but its `p_work_order_id` parameter
becomes `p_ai_command_run_id`, its internal `public.work_orders` references become
`public.ai_command_runs`, its `audit_logs.entity_type` tag becomes `'ai_command_run'`,
and its returned jsonb key becomes `aiCommandRunId`. Every other branch (tasks/approvals/
companies/people/projects/goals/relationships/assignments/memories/deleted tasks) is
byte-identical to the version this replaces.

**Deliberately NOT renamed**: `model_usage.work_order_id` / `ai_reply_log.work_order_id`
column names. Both are internal billing/audit FKs, not user-facing "Work Order"
concepts — nobody confuses them with the canonical business Work Order in practice, and
the FK itself continues to correctly reference `ai_command_runs.id` after Stage A (a
table rename doesn't change what a foreign key points to). This keeps the blast radius
scoped to the real ambiguity, not every internal column that happens to share two words.

**Stage B — the new canonical `public.work_orders`.** `Company -> Goal -> Work Order ->
Task`. Real FK `work_orders.goal_id -> goals.id` (nullable — not every work order need
have a goal recorded, matching a generality requirement across sales/ops/service/finance
use cases). Real FK `tasks.work_order_id -> work_orders.id` (replacing the free-text
`parent_goal` pattern with a real FK for this new relationship — `parent_goal` itself is
untouched). Real FK `ai_command_runs.work_order_id -> work_orders.id`, nullable — a
simple informational chat command legitimately has `work_order_id = null`; it's set only
when a command actually creates/executes a persistent Work Order (not wired up by this
migration — that's Phase 8's Brain-Chat-to-Factory job).

`work_type` is an extensible text + check-constraint classification (`general`,
`software_development`, `sales`, `operations`, `service`, `finance`, `engineering`) —
adding a new type later is a one-line migration, not a schema redesign. Every other
column reuses existing Brain OS types rather than inventing new ones: `status`/
`previous_status` reuse `work_status` (the same enum tasks already use — draft/queued/
in_progress/blocked/needs_approval/qa_review/done/rejected/archived, a natural fit for a
business work order's own lifecycle), `priority` reuses `priority_level`, `risk_level`
reuses `risk_level`, `owner_type`/`owner_person_id`/`owner_agent_id` mirror tasks'
ownership pattern exactly. RLS is the exact three-tier pattern already proven on
tasks/goals/companies (founder/admin, company manager, creator-with-active-membership,
plus an owner-person self-view branch) — no new authorization shape invented. A
`force_work_order_creator` BEFORE INSERT trigger reuses the same pattern as
`force_task_creator`/`force_goal_creator`/`force_company_creator` (each added after a
real bug where both the manual UI path and the AI-creation RPC path left
`created_by_profile_id` null).

No archive/restore RPCs or lifecycle-guard trigger yet — a deliberately minimal v1
(real canonical chain, real RLS, real FKs) scoped to what Phase 5's bootstrap
acceptance test actually needs. The proven archive/restore pattern is a natural,
low-risk follow-up once this base model is proven live, not a blocker for it.

**Stage C — `public.agent_runs`.** `Task -> Agent Assignment -> Agent Run`. An Agent
Definition (`public.agents`, already exists) and one execution of that agent are
genuinely different concepts — this is the one real gap with no canonical equivalent
anywhere in the existing schema. Columns: `task_id`, `work_order_id` (denormalized for
single-index querying, matching `model_usage`'s own precedent of keeping both
`work_order_id` and `task_id` side by side), `company_id`, `agent_id`,
`agent_definition_path`/`agent_definition_hash` (drift detection against the real
`.claude/agents/*.md` file), `execution_provider`, `provider_run_id`, `status`
(reuses `work_status`), `branch`/`base_commit`/`head_commit`, `summary`/`error`,
`verification_status`, `started_at`/`finished_at`. RLS mirrors the same three-tier shape,
scoped through its own `company_id` column (denormalized, matching `approvals.company_id`
/`documents.company_id`'s own precedent) rather than a join through tasks.

**Execution events deliberately do NOT get a new table.** The existing append-only
`audit_logs` (`entity_type`/`entity_id`/`event_type`/`metadata`) already models exactly
this shape and is reused unchanged (`entity_type = 'agent_run'` once the Runner starts
writing them) — per "inspect existing models before adding them."

No force-creator trigger on `agent_runs`, deliberately: its only real insert path is the
trusted Runner process (service role, already bypasses RLS) — not a user-facing form —
so the spoofing-prevention rationale behind the other force-creator triggers doesn't
apply the same way.

## 4. Rollback-test evidence (real, against production, every run ended in ROLLBACK)

Tooling: `npx supabase db query --linked -f <file>` (Management API SQL execution against
the linked production project `pvphxgrtdfrudejjhzjk`), every test file wrapped
`BEGIN; ... ROLLBACK;` so nothing was ever persisted. Confirmed clean before and after
every run via `select table_name from information_schema.tables where table_name in
('work_orders','ai_command_runs','agent_runs')` — only the original `work_orders` ever
present.

**Real bug caught by the first rollback-test run**: Postgres refuses `CREATE OR REPLACE
FUNCTION` when a parameter's *name* changes, even with an identical type signature
(`ERROR 42P13: cannot change name of input parameter "p_work_order_id" ... Use DROP
FUNCTION ... first`). Fixed by adding an explicit `DROP FUNCTION` before redefining
`sem_execute_ai_command`.

**Real bug caught by the first verification-query design**: a data-modifying CTE's
sibling CTE that re-reads the real base table (`from public.tasks` rather than `from
new_task`) does not see that sibling's own just-inserted row — all CTEs in one `WITH`
clause share a snapshot taken before any of them run. This was a test-script artifact,
not a migration defect; fixed by joining the CTEs' own `RETURNING` outputs directly.

**Comprehensive verification run, all real, all inside one rolled-back transaction that
also ran the full migration**:

| Check | Result |
|---|---|
| Real `agent_run -> task -> work_order -> goal` FK chain resolves | 1 (pass) |
| `ai_command_runs` row count (old data preserved) | 209 (pre-existing production rows, untouched) |
| Real INSERT into renamed `ai_command_runs` table succeeds | real UUID returned |
| `work_orders` columns | `id,company_id,goal_id,title,objective,work_type,status,priority,risk_level,acceptance_criteria,owner_type,owner_person_id,owner_agent_id,requested_by_profile_id,created_by_profile_id,previous_status,created_at,updated_at,completed_at` |
| `agent_runs` columns | `id,task_id,work_order_id,company_id,agent_id,agent_definition_path,agent_definition_hash,execution_provider,provider_run_id,status,branch,base_commit,head_commit,summary,error,verification_status,started_at,finished_at,created_by_profile_id,created_at,updated_at` |
| `tasks.work_order_id` exists | yes |
| `model_usage.work_order_id` FK target | `REFERENCES ai_command_runs(id)` (correct — table rename propagated automatically) |
| `ai_reply_log.work_order_id` FK target | `REFERENCES ai_command_runs(id) ON DELETE SET NULL` (correct) |
| `work_orders` RLS policy count | 4 (select/insert/update/delete) |
| `agent_runs` RLS policy count | 4 |
| `ai_command_runs` RLS policy names preserved (renamed) | `ai_command_runs_insert_auth,ai_command_runs_select_scope,ai_command_runs_update_admin` |
| `sem_execute_ai_command` exists post-redefine | yes |
| `create_pending_ai_command_run` exists | yes |
| `create_pending_work_order` dropped | yes (0 remaining) |
| `mark_ai_command_run_failed` exists | yes |

**Existing regression scenarios re-run against the new schema in the same rolled-back
transaction** (SC-070 audit log leak, SC-103 audit integrity, SC-093 security-definer
audit, approval-deletion audit trail) — all four ran to completion with no error; the
final one's real output showed `all_pass: true`. Since any earlier scenario's SQL
failing would have aborted the entire transaction before reaching the last statement,
reaching a real `all_pass: true` result is direct evidence all four passed.

**Application-layer verification**: `web/` — `npx tsc --noEmit` clean (exit 0),
`npx eslint` clean on every touched file, after updating `web/types/database.ts`
(hand-authored to match what `supabase gen types typescript` would produce — no local
Docker/Postgres available in this environment to run the generator directly against a
live post-migration schema; this file should be regenerated for real via `npx supabase
gen types typescript --linked > web/types/database.ts` immediately after the migration
is pushed, as a final confirmation step). `supabase/functions/sem-ai-command/index.ts` —
`node --check` clean (Node 24 has native TS syntax stripping; validates syntax, not
Deno-specific resolution).

## 5. What changed in application code (already committed, NOT yet deployable)

- `supabase/functions/sem-ai-command/index.ts`: every RPC call site, table reference,
  `audit_logs.entity_type` tag, and the SSE `type`/`workOrder` field renamed to match.
  (Confirmed via `mcp__playwright`-free static check: `chat-client.tsx` never consumes
  the `work_order`/`workOrder` SSE fields by name — this file is the only real consumer
  and it doesn't switch on them — so this rename carries zero frontend runtime risk.)
- `web/lib/data/chat-history.ts`, `web/lib/data/chat-channels.ts`,
  `web/app/(app)/dashboard/page.tsx`, `web/lib/chat-stream.ts`: table/field names updated
  to match.
- `web/types/database.ts`: hand-updated (see caveat above — regenerate for real
  post-push).

**These application-code changes reference tables/RPCs that do not exist in production
yet.** They must not be deployed (Vercel push for `web/`, `supabase functions deploy` for
the Edge Function) until the migration below is authorized and pushed — deploying first
would break the live chat command pipeline. This is why this document ends in a request
for authorization rather than a deploy step.

## 6. What this migration does NOT do (explicitly out of scope)

- No archive/restore RPCs for the new `work_orders` (a natural follow-up, not required
  for Phase 5's bootstrap).
- No `factory_work_orders`/`factory_tasks`/`factory_goals`/`factory_approvals` — the
  canonical chain reuses `goals`/`work_orders`/`tasks`/`approvals` throughout.
- No wiring of `ai_command_runs.work_order_id` from live chat commands yet (Phase 8).
- No rename of `model_usage.work_order_id`/`ai_reply_log.work_order_id` columns
  (deliberate scope decision, §3 above).
- No Runner/execution-provider changes — `scripts/factory-runner/provider.mjs` (Phase 4,
  already committed) is unaffected by this migration; Phase 5's bootstrap test will now
  target these real canonical tables instead of the factory-specific ones originally
  planned.

## 7. Request for founder authorization

The migration file (`supabase/migrations/202608290002_canonical_work_order_model.sql`)
is prepared, rollback-tested twice against real production (once alone, once combined
with 4 existing security/audit regression scenarios), and both OLD and NEW behavior are
verified passing per the evidence table above. Per the standing project rule (`CLAUDE.md`
§22 and every agent definition's own hard-stop clause), **no autonomous `supabase db
push` will be run** — this requires your explicit authorization.

Once authorized: (1) `supabase db push`, (2) regenerate `web/types/database.ts` for real
via the CLI against the now-live schema and re-run `tsc`/`eslint` to confirm no drift
from the hand-authored version, (3) `supabase functions deploy sem-ai-command` with
byte-verification, (4) deploy `web/` (Vercel), (5) re-run the SC-070/SC-103/SC-093/
approval-deletion regressions live (not rollback-tested) as a final confirmation, (6)
resume the Software Factory master plan's Phase 5 bootstrap acceptance test using these
real canonical resources (`Goal -> Work Order -> Task -> registered Agent -> detached
Claude execution -> Agent Run -> repository mutation -> commit -> artifacts/evidence ->
independent Verifier Run -> verification result`), per the corrected chain the founder
directed.
