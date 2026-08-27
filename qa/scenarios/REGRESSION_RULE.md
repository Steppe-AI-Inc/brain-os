# Regression Rule — every bug becomes permanent (SC-126, SC-127)

## The mandatory rule

> **Every real security / authorization / workflow / approval / messaging / data-isolation
> bug found in production MUST produce a permanent regression scenario in this library
> before it is considered closed.** A fix without a regression is not a fix — it is a
> temporary patch that the next refactor silently undoes.

This is not optional and not "when there's time." A bug is closed when: (1) it is
reproduced live, (2) its root cause is found, (3) a regression scenario + runner exists
that would catch it again, (4) the failure CLASS has been searched for elsewhere, and (5)
the relevant governance file is updated. See CLAUDE.md §12/§13.

## The real bugs found this session → their permanent regression scenarios

Every entry links a real `qa/KNOWN_FAILURE_MODES.md` bug to the scenario (and runner) that
now guards against its return.

| # | Bug (KNOWN_FAILURE_MODES.md) | Regression scenario | Runner / evidence |
|---|---|---|---|
| 1 | Legacy write-bypass RLS (broad `for all` beside a narrow policy) | SC-118, SC-125 | `sc118_resource_operations_matrix.sql`; REGRESSION_CATALOG "RLS write-bypass" |
| 2 | Storage sensitivity not enforced (file bytes readable when row wasn't) | SC-087 | Storage RLS present; signed-URL test MANUAL |
| 3 | Edge Function CI/CD (wrong branch/ref, missing secret) | SC-deployment-failure | drift = functions download + git diff; **founder blocker: SUPABASE_ACCESS_TOKEN** |
| 4 | AI presented truncated arrays as totals ("20" when 75) | AI_ADVERSARIAL_PROMPT_BANK #47–49 | `context.counts` real COUNTs; REGRESSION_CATALOG live spot-check |
| 6 | Undocumented deployed Edge Function | SC-deployment-failure | `functions list` vs `ls`; drift check |
| 7 | `company_id` NULL on audit_logs/work_orders/chat_channels | SC-070, SC-088 (documented) | actor-self access verified live |
| 8 | `approvals_update_approver` drift (any manager approved finance/salary/legal) | SC-057 | `sc057_manager_not_cfo.sql` PASS; `_policy_drift_signature.sql` |
| 9 | Undocumented boards/board_columns/board_items | SC-093 | drift by table+name; recovered into git |
| 11 | `memories` confidential tier + `tasks_select_scope` + `safe_*` views drift | SC-069, SC-054 | `sc069_search_leakage.sql`, `sc054_*`; `_policy_drift_signature.sql` |
| 12 | `hr_finance` had zero `financial_reports` access | SC-074, core/finance README | `financial_reports_select_scope` now includes `is_hr_finance()` |
| 14 | **No finance/salary segregation of duties** (NEW, this session) | SC-058 | `sc058_bookkeeper_sod_gap.sql` REPRODUCES the gap |
| 15 | **Approval payload not immutable** (NEW, this session) | SC-060 | `sc060_payload_immutability_gap.sql` REPRODUCES the gap |
| — | **Approval didn't execute** (68-task bulk deletion approved, nothing deleted) | SC-059, SC-094 | `sc059_approval_execution.sql`; `decide_approval()` (migration 202608270005) — **deployment pending founder push** |

Bugs #5 (duplicate clarification tasks) and #13 (chat reply length) are prompt-level UX
regressions — guarded by the sem-ai-command SYSTEM_PROMPT rules and REGRESSION_CATALOG's
"Duplicate task/approval creation" qualitative check; noted here for completeness.

## The incident → training loop (SC-127) — worked once, for real

Applied to the flagship bug (the approval-execution gap) as the canonical example:

1. **INCIDENT** — a 68-task bulk-deletion approval was approved in the UI, but no tasks
   were deleted; the founder had to use "Clear all" separately.
2. **ROOT CAUSE** — `decideApproval()` only flipped the approval row's own `status`. It
   never resumed the linked task and never executed any deferred deletion. The approval
   payload had no target ids to execute even if it had tried.
3. **SYSTEMIC DEFECT CLASS** — "an approval is a status flag with no execution." ANY
   approval that is supposed to CAUSE an effect (a payment, a message, a deletion, a salary
   change, a task resume) could have the same shape: approved = true, effect = none.
4. **SEARCH FOR THE SAME DEFECT ELSEWHERE** — audited every approval-consuming path: task
   resume (`needs_approval` → `queued`) was also never happening; deferred deletions had no
   server-validated target ids at all. Both are the same class.
5. **FIX** — `decide_approval()` SECURITY DEFINER function (migration 202608270005) that
   re-derives the approver's domain authority, transitions only a still-`pending` approval
   (idempotent), resumes the linked task, and executes a server-built, context-validated
   `execute` payload — writing an audit row with the real affected count.
6. **NEGATIVE TEST** — an unauthorized approver / an already-decided approval / a
   second call all result in NO execution (SC-057, SC-063; verified: second call "noop").
7. **REGRESSION TEST** — `sc059_approval_execution.sql`: approve → exactly A,B,C deleted,
   D survives, idempotent re-run, status approved, audit written. Permanent (SC-059/094).
8. **UPDATE GOVERNANCE RULE** — `qa/ACCEPTANCE_TESTS.md` #7 ("approval resumes the correct
   step exactly once") is now backed by a runnable test; `governance/ACTION_RISK_LEVELS.md`
   and the approval scenarios reference it.

The remaining honest step: the fix is committed to git but **not yet pushed to
production** (confirmed: `decide_approval` absent from the live SECURITY DEFINER list).
**Founder blocker: authorize `supabase db push --linked` for migration 202608270005.**
Until then the regression is verified against the committed definition loaded into a
rolled-back transaction, not the deployed DB — stated honestly in SC-059.

## The standing instruction

When the next bug is found: reproduce it live → find the root cause → write the regression
scenario + runner FIRST → search the whole codebase for the failure class → fix the root
cause (with founder authorization for any schema/RLS push) → run the new test + the full
suite → update the governance file → add the KNOWN_FAILURE_MODES.md entry with a link to
its regression scenario here. The library gets bigger and Brain OS gets harder to break
after every single defect. That is the point.
