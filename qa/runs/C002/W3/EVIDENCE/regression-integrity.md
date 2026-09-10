# C002 / W3 — Regression Artifact Integrity Audit (read-only)

Scenario: C002-P3-regression-artifact-integrity  Capability: CAP-REGRESSION-ARTIFACT-INTEGRITY
Worker: W3 (Web Product lane)  Started: 2026-09-10T02:59:51Z
Branch audited: qa/work-pc @ 24e4fb2 (working tree). No browser, no DB, no mutation.
Method: parsed qa/BUG_QUEUE.json (40 records, 1 observation); extracted every string matching
`qa/scenarios-runner/...` anywhere in each record plus every key containing "regression";
os.path.exists per path; listed all 62 files under qa/scenarios-runner/; keyword-scanned each
file for assertion / failure statements and read the weak-signal files by hand.

## Summary table

| Check | Result |
|---|---|
| Bugs with a declared regression_path | 9 paths (BUG-001,002,003,004,007,010,029,030 + BUG-002 regression_path_expanded) |
| Declared regression_path values with NO file on disk | 0 |
| Regression files cited in other closure fields but MISSING | 2 (BUG-006, ANON-INVESTOR-RLS-HELPER) |
| Files in qa/scenarios-runner not referenced by any bug | 47 of 62 |
| Files referenced by nothing (no bug, no catalog, no README) | 13 |
| CLOSED bugs with regression_state EXPECTED_FAIL | 0 |
| CLOSED bugs whose last recorded regression result is all_pass=false | 2 (BUG-001, BUG-003) |
| Regression files with no assertion / no failure condition | 2 hard, 1 soft |

## (1) Declared regression_path values with no corresponding file

Every regression_path and regression_path_expanded value resolves to a file on disk:

- BUG-001 qa/scenarios-runner/departments_hide_or_mark_archived_parent.sql — EXISTS
- BUG-002 qa/scenarios-runner/chat_must_not_fabricate_approval_decision.md — EXISTS
- BUG-002 (expanded) qa/scenarios-runner/bug002_completion_claim_phrasing_matrix.md — EXISTS
- BUG-003 qa/scenarios-runner/dashboard_company_count_excludes_archived.sql — EXISTS
- BUG-004 qa/scenarios-runner/memories_null_company_scope_not_a_bypass.sql — EXISTS
- BUG-007 qa/scenarios-runner/context_pack_shown_total_pairs.md — EXISTS
- BUG-010 qa/scenarios-runner/bug010_clarification_branch_grounding.md — EXISTS
- BUG-029 qa/scenarios-runner/bug029_resolution_failure_must_not_be_reported_as_nonexistence.md — EXISTS
- BUG-030 qa/scenarios-runner/bug030_no_fabricated_grounding_citation.md — EXISTS

MISSING (referenced outside regression_path):

- BUG-006 (CLOSED, regression_state EXPECTED_PASS, no regression_path field).
  closure_evidence.drift_guard and fix_includes_home_pc_authored_qa_artifact cite
  qa/scenarios-runner/company_ref_no_bare_name_join.mjs as the drift guard "run INDEPENDENTLY
  by the Work PC ... 8/8 pass". The file is absent from the qa/work-pc working tree, absent
  from local master and absent from origin/qa/work-pc. It is present only on origin/master
  (git ls-tree origin/master). The closure of BUG-006 is guarded by a file the QA branch cannot
  execute, and the bug has no regression_path pointing at it.
- ANON-INVESTOR-RLS-HELPER (CLOSED). closure_evidence cites
  is_investor_viewer_of_anon_grant_fix.sql. find over the whole repo returns nothing.
- BUG-001 regression_pending cites qa/playwright/regression/BUG-001-departments-archived-parent.spec.ts
  as the "authoritative UI assertion". qa/playwright/regression/ exists but is EMPTY. The record
  says it is blocked on harness install, so this is a declared gap rather than a broken pointer,
  but a CLOSED bug currently has no executable UI regression.

## (2) Regression files on disk that no bug references

47 of 62 files are not referenced by any record in BUG_QUEUE.json. Most are pre-queue
regressions tied to qa/KNOWN_FAILURE_MODES.md / REGRESSION_CATALOG.md rather than to a BUG id.
That is a legitimate ownership model, but BUG_QUEUE.json alone cannot locate them.

Referenced by REGRESSION_CATALOG.md and/or scenarios-runner/README.md (34):
_policy_drift_signature.sql, approval_deletion_audit_trail.sql, chat_history_ordering.sql,
complete_agent_run_lifecycle.sql, complete_work_order_lifecycle.sql,
factory_notification_lifecycle_truth.sql, factory_realtime_rls_truth.sql,
factory_rpc_privilege_sweep.sql, investor_viewer_scope.sql, org_effective_active.sql,
org_effective_active_status_check_fix.sql, organization_graph_integrity.sql,
person_lifecycle_ai_routing.sql, plugin_registry_and_agent_telemetry_truth.sql,
pre_push_hook_blocks_function_deploy.sh, privileged_rpc_anon_public_grant_sweep.sql,
sc054, sc056, sc057, sc058, sc059, sc059b, sc060, sc069, sc070, sc071, sc072_073, sc074,
sc093, sc103, sc118, sc119, sem_ai_command_company_restore_truth.mjs,
sem_ai_command_confirmation_truth.mjs, sem_ai_command_context_budget.sql,
sem_ai_command_execution_plan_truth.mjs, sem_ai_command_factory_verification_selection.mjs.

Referenced by NOTHING (no bug, no catalog, no README) — 13 true orphans:
- company_archive_ownership.sql
- create_factory_task_adversarial.sql
- create_factory_work_order_adversarial.sql
- factory_agent_registry_dispatchability_truth.sql
- founder_notification_no_anon_exploit.sql
- permanent_fixture_company_cleanup.sql
- sc088_091_access_revocation.sql
- sem_ai_command_execution_plan_rpc_truth.sql
- task_goal_archive_ownership.sql
- task_goal_archive_ownership_extended.sql
- bug005_destructive_substitute_requires_explicit_target.md and
  issue5_channel_state_layer_probe.sql: both are BUG-005 artifacts, cited only inside prose
  fields; BUG-005 has NO regression_path / regression_state despite a
  regression_paths_required list of 10 items.
- sem_ai_command_named_person_lookup_truth.mjs: cited only as a template inside BUG-017's
  regression_requirement, not as a guard for any bug.

COVERAGE_LEDGER.json and CAPABILITY_INVENTORY.json name no scenarios-runner path (checked by
substring for every filename).

## (3) Status vs regression_state contradictions

CLOSED + EXPECTED_FAIL: none. OPEN/REOPENED + EXPECTED_PASS: none. Consistent pairs:
BUG-002 REOPENED/EXPECTED_FAIL, BUG-007 REGRESSION_CREATED/EXPECTED_FAIL, BUG-010/029/030
OPEN/EXPECTED_FAIL, BUG-001/003/004 CLOSED/EXPECTED_PASS.

Contradictions of the same kind in adjacent fields:

- BUG-001 CLOSED / EXPECTED_PASS but regression_last_result.all_pass=false
  (contradiction_present: true, departments_query_returns_row: true). The 2026-09-07
  reconciliation closes it on the browser axis only and states the SQL "was NOT re-executed ...
  if it still reports contradiction_present=true, REOPEN". The recorded SQL result still says
  fail. A CLOSED bug whose only executable regression last reported FAIL.
- BUG-003 CLOSED / EXPECTED_PASS but regression_last_result.all_pass=false (dashboard
  expression counted 18 vs 8 non-archived, overstatement 125%). Same pattern: closed on browser
  evidence, SQL axis explicitly "NOT re-executed", last SQL result = fail.
- BUG-004 regression_reconciliation_2026_09_07.reason says "regression_state stays
  EXPECTED_FAIL" while the same object's status and the record's regression_state say
  EXPECTED_PASS (run live 13:12Z, all_pass=true). Stale prose only; structured fields agree.
- BUG-006 CLOSED / EXPECTED_PASS with no regression_path: the state has nothing to point at.
- ANON-INVESTOR-RLS-HELPER CLOSED with no regression_path and no regression_state; its cited
  guard file does not exist in the repo.
- Lifecycle drift, not a contradiction: BUG-010, BUG-029, BUG-030 carry a regression artifact
  plus EXPECTED_FAIL but status OPEN rather than REGRESSION_CREATED. Only BUG-007 uses that
  state.

## (4) Regression files that do not state what they assert or how they fail

Hard findings (no assertion, no pass/fail criterion anywhere in the file):
- _policy_drift_signature.sql: emits the policy signature set as a SELECT. The header says
  "spot-checks" but the body has no expected values, no comparison, no all_pass. It cannot fail
  except by SQL error; a reader must diff output by eye against an unstated baseline.
- sc088_091_access_revocation.sql: records counts before/after termination into a temp table
  and selects them. No expected value, no all_pass, no comment stating which count must be 0.
  Cannot fail on its own.

Soft finding:
- sc118_resource_operations_matrix.sql: emits an ALLOWED/DENIED/AFFECTED/ZERO-ROWS matrix as
  verdict JSON but does not encode which cells are expected DENIED. The pass criterion lives in
  the reader's head.

All other 59 files state an invariant in the header and contain an explicit assertion mechanism
(all_pass boolean, RAISE EXCEPTION, assert()/process.exit(1), or a numbered "## Assertions"
section for the .md chat regressions). The two .md files flagged weak by keyword scan
(bug002 matrix, bug030) were read by hand and do carry "## Assertions" sections.
bug002_completion_claim_phrasing_matrix.md honestly records rows 3-5 as NOT_TESTED.

## Verdict input (not a verdict)

Integrity of declared regression_path pointers: intact (9/9). Integrity of the closure chain
for CLOSED bugs: broken in 4 of 5 (BUG-001 and BUG-003 last result = fail; BUG-006 guard file
absent from the QA branch; ANON-INVESTOR-RLS-HELPER guard file absent from the repo). BUG-004 is
the only CLOSED bug with an existing regression whose last recorded run passed.

## Resume note (2026-09-10T03:07:26Z)

Run resumed from CHECKPOINT.json after budget cut-off. All audit steps (cross_reference_paths,
orphan_files, status_state_contradictions, assertion_statement_scan, write_evidence) were
already complete above. Re-verified on resume, read-only: 62 files under qa/scenarios-runner;
company_ref_no_bare_name_join.mjs and is_investor_viewer_of_anon_grant_fix.sql absent from the
working tree (find, excluding node_modules); qa/playwright/regression/ empty. No new findings.
