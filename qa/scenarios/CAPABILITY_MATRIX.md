# Capability Matrix (SC-117)

For each real capability (derived from the actual RLS policies), this shows
authorized-role-**succeeds** / unauthorized-role-**fails** / wrong-company-**fails**, with
the live evidence. This is the human-readable, tested companion to
`governance/capabilities/CAPABILITY_MATRIX.yaml` (the machine-readable descriptor) —
extend BOTH when a capability changes, do not fork.

Legend: ✅ verified live PASS (runner) · 📖 code-verified · ⚠️ KNOWN GAP · n/a not tested this pass.
All live results 2026-08-27, via `qa/scenarios-runner/` (rolled-back impersonation).

| Capability | Real mechanism | Authorized succeeds | Unauthorized fails | Wrong-company fails | Evidence |
|---|---|---|---|---|---|
| task.read.own | `tasks_select_scope` (creator/owner) | employee sees own task ✅ | employee cannot see others' tasks ✅ | other-company task hidden ✅ | SC-054 |
| task.read.company | `tasks_select_scope` (manager+) | manager sees all company tasks ✅ | employee sees only own ✅ | n/a | SC-118, SC-054 |
| task.create | `tasks_insert_scope` (`has_company_access`) | member creates in own company ✅ | — | insert into other company DENIED 42501 ✅ | SC-071, SC-118 |
| task.update/delete | `tasks_update/delete_scope` (owner/manager) | manager edits/deletes ✅ | employee edit/delete of other's task = 0 rows ✅ | n/a | SC-118 |
| finance.read.revenue | `financial_reports_select_scope` (founder/manager/hr_finance) | manager & hr_finance see reports ✅ | employee sees 0 ✅ | other-company reports 0 ✅ | SC-069, SC-074, SC-118, SC-056 |
| finance.read.cash | `company_sensitive_select_founder` (founder only) | founder sees ✅ | employee/manager/**CFO** all 0 ✅ | n/a (founder is global) | SC-074 |
| finance.approve.payment | `approvals_update_approver` domain=finance (founder/hr_finance) | hr_finance/founder approve 📖 | manager cannot approve finance ✅ | n/a | SC-057 |
| hr.read.salary | `salary_select_authorized` (self/hr_finance) | hr_finance/self ✅ | employee/manager 0 ✅ | n/a | SC-057, SC-069 |
| hr.modify.salary | `salary_write_hr` (hr_finance) | hr_finance writes ✅ | employee/manager 0 rows 📖 | n/a | SC-058, SC-118 |
| hr.approve.salary | `approvals_update_approver` domain=salary_hr | hr_finance/founder 📖 | manager cannot approve salary ✅ | n/a | SC-057 |
| legal.approve.contract | `approvals_update_approver` domain=legal (founder/explicit approver) | founder ✅ | manager cannot approve legal ✅ | n/a | SC-057 |
| production.approve | `approvals_update_approver` domain=production (manager+) | manager approves production ✅ | employee cannot ✅ | manager of A cannot approve B's | SC-057 |
| ownership.read/modify | `company_sensitive_*_founder` / `company_relationships_*_founder` | founder ✅ | employee/manager/CFO 0 ✅ | n/a | SC-074 |
| document.read (confidential) | `documents_select_scope` (manager+/hr_finance for confidential) | manager sees confidential ✅ | employee sees 0 ✅ | other-company doc 0 ✅ | SC-069, SC-056, SC-118 |
| document.classify (downgrade) | `documents_write_scope` (manager+) | manager 📖 | employee downgrade = unchanged ✅ | n/a | SC-073 |
| memory.read (confidential) | `memories_select_scope` (manager+/hr_finance) | manager ✅ | employee sees 0 ✅ | other-company memory 0 ✅ | SC-069, SC-056 |
| memory.mutate.security_fields | `memories_write_scope` (manager+) | manager 📖 | employee sensitivity/company change = unchanged ✅ | n/a | SC-119 |
| audit.read | `audit_logs_select_scope` (self/manager+/founder) | founder/self ✅ | employee sees only own ✅ | n/a | SC-070 |
| audit.tamper | no UPDATE/DELETE policy (default-deny) | — | employee update/delete = unchanged ✅ | n/a | SC-103 |
| approvals.decide (idempotent) | `decide_approval` FOR UPDATE + pending guard | founder decides once ✅(logic) | — | — | SC-059, SC-063 |
| approval.payload.immutable | (none at DB layer) | — | ⚠️ approver CAN rewrite payload | — | SC-060 ⚠️ KNOWN GAP #15 |
| finance.segregation_of_duties | (none) | — | ⚠️ hr_finance self-approves own request | — | SC-058 ⚠️ KNOWN GAP #14 |
| mcp.connector.token | `get_mcp_connector_token` (founder self-check) | founder 📖 | employee raises `not authorized` ✅ | n/a | SC-093 |
| ai.context.read.restricted | `buildContext()` caller JWT (no service role) | caller sees own scope ✅ | restricted rows never in employee context ✅ | other-company rows never in context ✅ | SC-055, SC-069, SC-092 |
| ai.memory.write.sensitivity_floor | (none) | — | ⚠️ model-assigned tier, no write-time floor | — | SC-068 ⚠️ SECURITY_INVARIANTS #7 |
| service_role.request_path | (none exist) | — | no service-role client anywhere ✅ | — | SC-092 |

## Reading the gaps

Three ⚠️ rows are documented KNOWN GAPS, verified live as gaps (not passes): approval
payload immutability (#15), finance segregation of duties (#14), AI memory sensitivity
floor (SECURITY_INVARIANTS #7). Each has a fix shape in its scenario/KNOWN_FAILURE_MODES
entry; none is fixed here because each needs a schema/RLS change requiring founder-
authorized deployment. Everything else is either live-PASS (✅) or code-verified (📖) with
a runnable or code-traceable proof.
