# Runner results — live execution log

Every row here was executed for real against the **production** Supabase project
`pvphxgrtdfrudejjhzjk` on **2026-08-27** via `supabase db query --linked --file …`, using
the live-impersonation method inside a rolled-back transaction (zero residue — verified:
after all runs the EMPLOYEE fixture had role `employee` and 0 memberships, and no `SC0*`
fixture rows remained). These are honest results, not aspirations.

| Script | Scenario(s) | Result | Notes |
|---|---|---|---|
| `sc054_employee_task_visibility.sql` | SC-054 | **PASS** | employee saw 1 of 5 seeded tasks (only their own); other-tech/strategic/finance/other-company all hidden |
| `sc056_cross_company_isolation.sql` | SC-056 | **PASS** | Company-A manager saw 0 rows of Company-B tasks/projects/documents/financial_reports/memories/leads/company |
| `sc057_manager_not_cfo.sql` | SC-057 | **PASS** | manager approved `production` only; `salary_hr`/`finance`/`legal` stayed pending; salary & cash reads = 0 |
| `sc058_bookkeeper_sod_gap.sql` | SC-058 | **GAP REPRODUCED** | hr_finance wrote salary directly AND self-approved a self-requested finance approval. **Not a pass** — see KNOWN_FAILURE_MODES.md #14 |
| `sc059_approval_execution.sql` | SC-059, SC-094, SC-063 | **LOGIC VERIFIED** | flagship `decide_approval`: first call deleted exactly A,B,C; D survived; 2nd call noop; status approved; audit written. Function loaded into a rolled-back txn (migration 202608270005 committed but NOT pushed — deployment pending founder authorization) |
| `sc060_payload_immutability_gap.sql` | SC-060 | **GAP REPRODUCED** | a manager rewrote a pending approval's `approval_payload` (offerPrice 2200→1200). **Not a pass** — see KNOWN_FAILURE_MODES.md #15 |
| `sc088_091_access_revocation.sql` | SC-088/089/090/091 | **PASS** | deactivating the membership dropped company access from 1→0 on the SAME JWT (RLS re-evaluated live) |
| `sc069_search_leakage.sql` | SC-069 | **PASS** | employee got 0 rows for confidential docs/memories, financial_reports, salary — via direct SELECT and ILIKE search |
| `sc070_audit_log_leak.sql` | SC-070 | **PASS** | employee saw own audit row only; founder salary/ownership audit events hidden |
| `sc074_founder_only_data.sql` | SC-074 | **PASS** | employee, manager, AND hr_finance (CFO) each saw 0 `company_sensitive` rows — CFO ≠ founder |
| `sc071_create_wrong_company.sql` | SC-071 | **PASS** | task & lead inserts into a non-member company DENIED (42501); own-company insert allowed |
| `sc072_073_security_field_mutation.sql` | SC-072, SC-073 | **PASS** | owned-task company move and confidential→internal downgrade both left the field unchanged (RLS 0-rows) |
| `sc093_security_definer_audit.sql` | SC-093 | **PASS** | every helper returned the safe value for employee (`is_founder_or_admin`=false, `has_company_access(other)`=false, `try_uuid('garbage')`=NULL) and the correct value for founder; MCP-secret RPC self-denied |
| `sc103_audit_integrity.sql` | SC-103 | **PASS** | employee UPDATE/DELETE on own audit row left message unchanged and row present (no UPDATE/DELETE policy = default-deny) |
| `sc118_resource_operations_matrix.sql` | SC-118 | **PASS** | S/I/U/D differ per table per role exactly as intended (employee: tasks INSERT allowed but UPDATE/DELETE 0-rows; documents/financial_reports write DENIED; manager: all allowed) |
| `sc119_security_fields.sql` | SC-119 | **PASS** | employee could not change memory.sensitivity/company_id, approval.approver_profile_id, approval.status |
| `_policy_drift_signature.sql` | REGRESSION_RULE | **PASS** | the 4 previously-drifted policies still carry their correct authorization-function signatures live |

## SC-092 (service-role abuse) — verified by code inspection, not SQL

Grep across `supabase/functions/**` and `web/**` (excluding `node_modules`/`.next`/
generated `database.ts`): **no `SERVICE_ROLE_KEY` / service-role client exists in any
request path.** All 6 Edge Functions construct their client with `SUPABASE_ANON_KEY` +
the caller's `Authorization` header, so RLS applies to every query as the caller. The
only privileged surface is the MCP-connector vault RPCs (`create/get/delete_mcp_connector_secret`),
which are SECURITY DEFINER but each self-check `is_founder_or_admin()` and raise otherwise
— confirmed denied for an employee in `sc093`. **Result: PASS** (no frontend-route-equals-
authorization gap found).

## ⚠️ decide_approval() unexpectedly LIVE — see INCIDENT note

`decide_approval` was ABSENT from production at session start but is now LIVE as the full
committed migration 202608270005 body — applied by a mechanism NOT initiated by this work
(no `db push` was run; the only CI workflow failed every run). `sc059b_live_decide_approval.sql`
verified the LIVE function works correctly (2 targets deleted, control survived, idempotent,
status approved). **See `qa/scenarios/INCIDENT-2026-08-28-decide_approval-live.md` — the
founder must confirm whether this deployment is intended.** The live body is byte-identical
to the reviewed committed migration, so functionally it is the intended fix; the process
irregularity (reached prod without an authorized push) is the open item.

## Other honest accounting
- **All `messaging/` scenarios** — no subsystem exists; `NOT APPLICABLE`.
- **Storage-object sensitivity (SC-087)** — the RLS is real but exercising it needs a Storage
  binary + signed URL, out of scope for a pure-SQL runner tonight; `MANUAL VERIFICATION ONLY`.
- **AI adversarial prompts (SC-065..068, 101, 102, 120)** — the RLS-before-LLM boundary is
  live-verified by the context-security scripts above (restricted rows never reach the model
  because they never leave the DB); the model's own refusal behavior is `MANUAL VERIFICATION`
  via the live `/chat` UI (see `qa/REGRESSION_CATALOG.md` "AI adversarial prompt-injection").
