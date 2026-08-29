# qa/scenarios-runner — executable RLS regression scripts

Real, runnable SQL regression scripts for the scenarios in `qa/scenarios/` that map to
**actually-existing** tables, RLS policies, and functions. Each script uses the
established live-impersonation method and is **fully self-cleaning**: every fixture write
happens inside a single `begin; … rollback;` transaction, so nothing is ever left in
production tables and no real founder/company data is mutated.

## How to run

```bash
cd C:/Users/Dell/dev/brain-os
npx supabase db query --linked --file qa/scenarios-runner/<script>.sql
```

The `--linked` connection is a superuser (`postgres`) connection; the `set local role
authenticated` + `set_config('request.jwt.claims', …)` downgrade inside each script is
what makes RLS actually apply, exactly reproducing what a real logged-in user of that
persona would experience. Each script ends with a single `SELECT` returning a JSON
`verdict` object — `pass: true/false` per assertion plus an overall `all_pass`.

### Gotcha: the CLI splits inline `--query` strings on newlines

`supabase db query --linked "<multi-line string>"` splits on newlines and runs each line
as a separate statement (returning only the last result). **Always use `--file`** for
multi-statement scripts — a `.sql` file is parsed correctly (statement boundaries on `;`,
multi-line statements preserved). Inline strings are fine only for a single one-line query.

## Fixture identities (see `qa/scenarios/personas/README.md`)

- FOUNDER (positive control): auth `cbcc41cf-830d-4600-8545-3b9e22c8297f`.
- EMPLOYEE (negative control): profile `66ef2052-d002-4592-b841-82cd2171b51a`, auth
  `9c92a8d5-853c-4ef3-846a-f4fe8c42d97a`. Zero memberships by default.
- Companies: CLIX GPS `ed8ae510-ddbc-4be6-9d9e-d1f725b1381d` ("Mongolia"), SEM Global
  Robotics `773210d1-1203-4910-b18a-eab4cc7c3d9c` ("the other company").

## Impersonation helpers used in every script

- **Employee at a company:** insert a temp `company_memberships` row with
  `role_in_company='employee'`, then assume the employee JWT.
- **Manager at a company:** same, `role_in_company='manager'`.
- **hr_finance (CFO):** `update public.profiles set role='hr_finance' where id='66ef2052-…'`
  inside the transaction (rolled back — never committed).
- Always `reset role;` before `rollback;`.

## Scripts and what they prove

| Script | Scenario(s) | Proves | Last run |
|---|---|---|---|
| `sc054_employee_task_visibility.sql` | SC-054 | employee sees only own tasks, not other/founder/finance/other-company tasks | 2026-08-27 |
| `sc056_cross_company_isolation.sql` | SC-056 | employee/manager of company A sees 0 rows of company B across tables | 2026-08-27 |
| `sc057_manager_not_cfo.sql` | SC-057 | company manager cannot approve salary/finance/legal, cannot read salary/cash | 2026-08-27 |
| `sc058_bookkeeper_sod_gap.sql` | SC-058 | FIXED (migrations 202608280003, 202608280005): direct salary_private writes are founder/admin only, hr_finance must use `propose_salary_change()`, self-approval on salary_hr/finance is denied, a different decider (founder) still can | 2026-08-28 |
| `sc059_approval_execution.sql` | SC-059, SC-094 | logic-level check of `decide_approval()`'s delete_tasks execute path against the committed migration body | 2026-08-27 |
| `sc059b_live_decide_approval.sql` | SC-059, SC-094 | same, called live against the deployed `decide_approval()` function | 2026-08-28 |
| `sc060_payload_immutability_gap.sql` | SC-060 | FIXED (migration 202608280003): a `BEFORE UPDATE` trigger rejects any change to `approval_payload`/`title`/`domain`/`company_id` once set; `decide_approval()` itself still works normally | 2026-08-28 |
| `sc069_search_leakage.sql` | SC-069 | employee gets 0 rows for salary/financial/ownership/confidential content | 2026-08-27 |
| `sc070_audit_log_leak.sql` | SC-070 | employee sees only own audit rows, not others' | 2026-08-27 |
| `sc071_create_wrong_company.sql` | SC-071 | employee cannot insert a task/lead into a company they are not a member of | 2026-08-27 |
| `sc072_073_security_field_mutation.sql` | SC-072, SC-073 | employee cannot change task company/owner, cannot downgrade document sensitivity | 2026-08-27 |
| `sc074_founder_only_data.sql` | SC-074 | employee/manager/hr_finance all get 0 rows of company_sensitive; only founder reads it | 2026-08-27 |
| `sc092_service_role_paths.sql` | SC-092 | inventory of service-role usage + confirms MCP-token RPCs self-check `is_founder_or_admin()` | 2026-08-27 |
| `sc093_security_definer_audit.sql` | SC-093 | enumerates every live SECURITY DEFINER function and its guard, including `propose_salary_change`/`is_investor_viewer_of`/`decide_approval` added 2026-08-28 | 2026-08-28 |
| `investor_viewer_scope.sql` | (new fix, no SC-#) | `investor_viewer` sees companies/goals/financial_reports/public-tier docs, denied people/projects/product_lines/task-insert, `has_company_access` correctly excludes it | 2026-08-28 |
| `approval_deletion_audit_trail.sql` | (new fix, no SC-#) | deleting an approval record writes a real `audit_logs` row (`approval_deleted`, correct entity/company/metadata) | 2026-08-28 |
| `organization_graph_integrity.sql` | (new fix, no SC-#) | KNOWN_FAILURE_MODES.md #19 — `set_company_relationship()` idempotency, hierarchy cycle rejection, ownership >100% rejection (incl. exact-100% boundary), non-founder/admin denial | 2026-08-29 |
| `chat_history_ordering.sql` | (new fix, no SC-#) | CHAT_HISTORY_NEWEST_SURVIVES_NAVIGATION / CHAT_HISTORY_CHANNEL_CACHE_ISOLATED — `order by created_at desc limit N` returns the N most recent turns (not the oldest N) and reverses back to true chronological order; a channel-scoped query never leaks another channel's rows and returns a short channel's full history untruncated. Not an RLS test (pure query-shape defect) — runs as the connecting superuser, no persona impersonation needed | 2026-08-29 |
| `person_lifecycle_ai_routing.sql` | (new fix, no SC-#) | quiet-wiggling-biscuit plan Bug 5 — `end_person_employment()`/`restore_person_employment()`/`delete_person()` auth tiers, idempotency, lifecycle-guard direct-bypass block, dependency pre-check + real cascade destroyedCounts, never touches `companies.status`. Migration `202608290008` | 2026-08-29 |
| `org_effective_active.sql` | (new fix, no SC-#) | quiet-wiggling-biscuit plan Bug 6 — `is_company_effectively_active()`/`get_effectively_active_companies()`/`validate_organization_graph()`'s `archivedAncestorActive` check, both relationship directions, selector exclusion, employer-truthfulness without rewriting `people.company_id`. Migration `202608290009` | 2026-08-29 |
| `org_effective_active_status_check_fix.sql` | (new fix, no SC-#) | KNOWN_FAILURE_MODES.md #28 — `is_company_effectively_active()` distinguishes an archived ancestor from a merely non-'active' legitimate status (planning/paused); real production false positives (Trade-book.ai, NexPass LLC/FuelMetrix) confirmed resolved with their real status unchanged. Migration `202608300001` | 2026-08-30 |
| `complete_agent_run_lifecycle.sql` | (new fix, no SC-#, found during Phase 8 verification) | `complete_agent_run()` — founder-only completion RPC narrower than `agent_runs_update_scope` RLS, idempotency, linked-task status propagation, null-task_id no-error, bad verification_status rejected. Migration `202608290010` | 2026-08-29 |
| `sc103_audit_integrity.sql` | SC-103 | audit_logs has no UPDATE/DELETE policy (default-deny); employee cannot modify an audit row | 2026-08-27 |
| `sc118_resource_operations_matrix.sql` | SC-118 | SELECT/INSERT/UPDATE/DELETE tested separately per table for employee vs manager | 2026-08-27 |
| `sc119_security_fields.sql` | SC-119 | unauthorized mutation attempts on security columns are denied | 2026-08-27 |
| `_policy_drift_signature.sql` | REGRESSION_RULE | signature-diff of live policies vs schema file (the #8/#11 drift-class guard) | 2026-08-27 |
| `pre_push_hook_blocks_function_deploy.sh` | (new fix, no SC-#) | SHELL, not SQL (see `qa/REGRESSION_CATALOG.md`) — KNOWN_FAILURE_MODES.md #27: `.githooks/pre-push` blocks a `supabase/functions/**` push without `ALLOW_FUNCTIONS_DEPLOY=1` for both an existing-branch update and a brand-new branch's first push (the latter was a real live-found bug, fixed same day); a functions-free new branch is never false-positive-blocked. Runs in a throwaway sandbox repo, never touches this repo's history | 2026-08-29 |

Results are recorded in each scenario doc's `AUTOMATION STATUS` / `LAST VERIFIED DATE`
and summarized in `qa/scenarios/RESULTS.md`.
