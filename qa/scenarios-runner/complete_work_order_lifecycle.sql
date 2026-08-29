-- complete_work_order — permanent regression for the final factory-state gap flagged
-- honestly by both the Factory Director and the independent brain-os-verifier during the
-- master bug-fix campaign: complete_agent_run() only ever propagates a completion result to
-- a linked TASK, never to the parent canonical_work_orders row, and nothing anywhere closed
-- a Work Order itself. See migration 202608300002_complete_work_order.sql (not redefined
-- here, same convention as every other scenarios-runner script — this proves behavior of
-- the already-deployed/rollback-tested function).
--
-- Proves, against real fixture companies/tasks/agent_runs/canonical_work_orders rows in a
-- rolled-back transaction:
--   1. FACTORY_WORK_ORDER_COMPLETES_AFTER_ALL_REQUIRED_TASKS — all tasks done, all runs
--      done, at least one run with a real commit independently verified -> completes.
--   2. FACTORY_WORK_ORDER_REJECTS_COMPLETION_WITH_RUNNING_TASK — a still-running task blocks.
--   3. FACTORY_WORK_ORDER_REJECTS_COMPLETION_WITH_FAILED_RUN — a rejected/failed run blocks.
--   4. FACTORY_WORK_ORDER_REJECTS_COMPLETION_WITHOUT_REQUIRED_VERIFICATION — a real commit
--      with no passing verification_status anywhere blocks.
--   5. FACTORY_WORK_ORDER_REJECTS_COMPLETION_AFTER_VERIFICATION_FAILURE — a real commit
--      whose only verification attempt failed blocks (same rejection bucket as #4 — a failed
--      attempt is not silently treated as passing).
--   6. FACTORY_WORK_ORDER_COMPLETION_IDEMPOTENT — re-completing an already-done Work Order
--      is changed:false, reason already_completed, same completedAt both times.
--   7. FACTORY_WORK_ORDER_COMPLETION_PERSISTS_COMPLETED_AT — completed_at is a real
--      non-null timestamp after completion, not just an in-memory response field.
--   8. FACTORY_WORK_ORDER_TERMINAL_STATE_DOES_NOT_REGRESS — even a fully-authorized founder
--      cannot move a 'done' Work Order back to a non-terminal status via a raw UPDATE outside
--      complete_work_order() — the lifecycle-guard trigger blocks it regardless of RLS.
--   9. FACTORY_WORK_ORDER_COMPLETION_REJECTS_CROSS_COMPANY_RELATIONSHIP — proves the
--      structural protection this RPC's own redundant check depends on: the existing
--      enforce_task_work_order_company trigger already makes a cross-company task-to-Work-
--      Order reference impossible to create in the first place (two-layer defense-in-depth
--      — same pattern as every other guarded relationship in this codebase — so the RPC's
--      own cross-company branch is a redundant safety net for a state that cannot exist
--      today, not dead code covering a reachable path).
--  10. FACTORY_CLIENT_CANNOT_DIRECTLY_FORCE_COMPLETED_STATUS — even a fully-authorized
--      founder cannot set status='done' directly via a raw UPDATE, on a fresh Work Order
--      that never went through complete_work_order() at all — the lifecycle-guard trigger
--      blocks the write regardless of how far along the real requirements are.
--
-- Plus two regressions added after independent review (brain-os-db-security-engineer,
-- live-reproduced both exploits against an earlier version of this migration, rolled back):
--  11. FACTORY_WORK_ORDER_REJECTS_UNRELATED_RUN_VERIFICATION_GAMING — a real, unverified
--      commit on one run cannot be "vouched for" by a passing verification_status on a
--      SEPARATE, unrelated run under the same Work Order. The original check split "any
--      run has a commit" and "any run is verified" across two independent queries with no
--      row binding — fixed by requiring head_commit + status='done' + a passing
--      verification_status on the SAME row.
--  12. FACTORY_WORK_ORDER_COMPLETION_GUARD_BLOCKS_DIRECT_INSERT — a fresh
--      canonical_work_orders row cannot be INSERTed with status='done' from the start,
--      bypassing the RPC entirely. The guard trigger was originally BEFORE UPDATE only;
--      canonical_work_orders_insert_scope allows any user with has_company_access (not
--      just founder/admin) to INSERT, so this was a real bypass, not merely theoretical.
--
-- Plus a third regression added after a SECOND independent review pass (same reviewer role,
-- fresh session, re-reviewing the fix above — live-reproduced against the real, documented
-- multi-task dispatch shape, rolled back):
--  13. FACTORY_WORK_ORDER_REQUIRES_EVERY_COMMIT_VERIFIED — same-row binding (regression #11)
--      closed the cross-row exploit, but still only required ONE commit-carrying run to be
--      verified to close the WHOLE Work Order. A real multi-task Work Order (one agent_runs
--      row per task, per dispatch-task.mjs) with two separate commits — one verified, one
--      never verified at all — still completed. Fixed by inverting the check to a NOT
--      EXISTS "any commit-carrying run that is NOT properly verified" — every commit must
--      now individually clear the bar, not just one.
--
-- Plus a fourth regression added after a THIRD independent review pass (fresh session,
-- extended adversarial fourth-pass testing, rolled back):
--  14. FACTORY_WORK_ORDER_REJECTS_VACUOUS_COMPLETION — a Work Order with zero linked tasks
--      and zero linked agent_runs at all could still reach 'done', because every prior
--      check only rejects an INCOMPLETE task/run; none required at least one to actually
--      exist. Live-reproduced both as a trivially empty Work Order and as the realistic
--      exploit chain (tasks force-completed some other way outside the real agent-dispatch
--      pipeline, given a separate, pre-existing gap in tasks_update_scope RLS, with zero
--      agent_runs ever created) — either way, "done" with no real work ever verified.
--      Fixed by requiring at least one task and at least one agent_run to exist before any
--      of the "is everything done/verified" checks are even reached.

begin;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

-- ================== FIXTURES ==================

insert into public.companies (id, name, status) values
  ('cccc2001-0000-0000-0000-000000000001','CWO Co','active'),
  ('cccc2001-0000-0000-0000-000000000002','CWO Other Co','active');
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('cccc2001-0000-0000-0000-000000000001','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);

-- WO1: the happy-path Work Order — two done tasks, two done runs, one carries a real
-- verified commit (mirrors the real e35219b8 shape: an Implementation Engineer run with a
-- commit, and a separate Verifier run with no commit of its own).
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000001','cccc2001-0000-0000-0000-000000000001','CWO Happy Path','in_progress');
insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
  ('cccc2003-0000-0000-0000-000000000001','cccc2001-0000-0000-0000-000000000001','CWO Task 1a','done','cccc2002-0000-0000-0000-000000000001'),
  ('cccc2003-0000-0000-0000-000000000002','cccc2001-0000-0000-0000-000000000001','CWO Task 1b','done','cccc2002-0000-0000-0000-000000000001');
insert into public.agent_runs (id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, head_commit, verification_status, started_at) values
  ('cccc2004-0000-0000-0000-000000000001','cccc2002-0000-0000-0000-000000000001','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-1a','done'::work_status,'deadbeef1','live_verified',now()),
  ('cccc2004-0000-0000-0000-000000000002','cccc2002-0000-0000-0000-000000000001','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-1b','done'::work_status,null,null,now());

-- WO2: a still-running task blocks completion. Carries a done run (irrelevant to what's
-- being tested) purely so the new zero-run guard (regression #14) doesn't preempt this
-- fixture's own point before the incomplete_task check is ever reached.
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000002','cccc2001-0000-0000-0000-000000000001','CWO Running Task','in_progress');
insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
  ('cccc2003-0000-0000-0000-000000000003','cccc2001-0000-0000-0000-000000000001','CWO Task 2a','in_progress','cccc2002-0000-0000-0000-000000000002');
insert into public.agent_runs (id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, started_at) values
  ('cccc2004-0000-0000-0000-000000000011','cccc2002-0000-0000-0000-000000000002','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-2a','done'::work_status,now());

-- WO3: a failed/rejected run blocks completion even though its linked task is done.
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000003','cccc2001-0000-0000-0000-000000000001','CWO Failed Run','in_progress');
insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
  ('cccc2003-0000-0000-0000-000000000004','cccc2001-0000-0000-0000-000000000001','CWO Task 3a','done','cccc2002-0000-0000-0000-000000000003');
insert into public.agent_runs (id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, started_at) values
  ('cccc2004-0000-0000-0000-000000000003','cccc2002-0000-0000-0000-000000000003','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-3a','rejected'::work_status,now());

-- WO4: a real commit with no verification anywhere blocks completion.
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000004','cccc2001-0000-0000-0000-000000000001','CWO Missing Verification','in_progress');
insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
  ('cccc2003-0000-0000-0000-000000000005','cccc2001-0000-0000-0000-000000000001','CWO Task 4a','done','cccc2002-0000-0000-0000-000000000004');
insert into public.agent_runs (id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, head_commit, verification_status, started_at) values
  ('cccc2004-0000-0000-0000-000000000004','cccc2002-0000-0000-0000-000000000004','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-4a','done'::work_status,'cafebabe1',null,now());

-- WO5: a real commit whose only verification attempt failed blocks completion.
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000005','cccc2001-0000-0000-0000-000000000001','CWO Verification Failed','in_progress');
insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
  ('cccc2003-0000-0000-0000-000000000006','cccc2001-0000-0000-0000-000000000001','CWO Task 5a','done','cccc2002-0000-0000-0000-000000000005');
insert into public.agent_runs (id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, head_commit, verification_status, started_at) values
  ('cccc2004-0000-0000-0000-000000000005','cccc2002-0000-0000-0000-000000000005','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-5a','done'::work_status,'fadeface1','failed',now());

-- WO6: fresh, no tasks/runs at all — used only for the direct-write-blocked test (#10).
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000006','cccc2001-0000-0000-0000-000000000001','CWO Fresh','in_progress');

-- WO7: the exact verification-gaming shape independent review confirmed exploitable
-- against the earlier version of this migration — a real, unverified commit (Run7a) sits
-- alongside a completely unrelated, verified, commit-less run (Run7b) under the same WO.
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000007','cccc2001-0000-0000-0000-000000000001','CWO Verification Gaming','in_progress');
insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
  ('cccc2003-0000-0000-0000-000000000007','cccc2001-0000-0000-0000-000000000001','CWO Task 7a','done','cccc2002-0000-0000-0000-000000000007');
insert into public.agent_runs (id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, head_commit, verification_status, started_at) values
  ('cccc2004-0000-0000-0000-000000000007','cccc2002-0000-0000-0000-000000000007','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-7a-unverified-commit','done'::work_status,'exploitcommit1',null,now()),
  ('cccc2004-0000-0000-0000-000000000008','cccc2002-0000-0000-0000-000000000007','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-7b-unrelated-verified','done'::work_status,null,'live_verified',now());

-- WO8: the exact partial-verification shape independent review's second pass confirmed
-- exploitable — a real multi-task Work Order (two tasks, one agent_runs row per task, the
-- actual dispatch-task.mjs shape), where Run8a's OWN commit is genuinely verified but
-- Run8b's OWN, different commit was never verified at all.
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000008','cccc2001-0000-0000-0000-000000000001','CWO Partial Verification','in_progress');
insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
  ('cccc2003-0000-0000-0000-000000000008','cccc2001-0000-0000-0000-000000000001','CWO Task 8a','done','cccc2002-0000-0000-0000-000000000008'),
  ('cccc2003-0000-0000-0000-000000000009','cccc2001-0000-0000-0000-000000000001','CWO Task 8b','done','cccc2002-0000-0000-0000-000000000008');
insert into public.agent_runs (id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, head_commit, verification_status, started_at) values
  ('cccc2004-0000-0000-0000-000000000009','cccc2002-0000-0000-0000-000000000008','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-8a-verified','done'::work_status,'partialcommita','live_verified',now()),
  ('cccc2004-0000-0000-0000-000000000010','cccc2002-0000-0000-0000-000000000008','cccc2001-0000-0000-0000-000000000001','claude_code_background','cwo-run-8b-unverified','done'::work_status,'partialcommitb',null,now());

-- WO9: the exact vacuous-completion shape independent review's third pass confirmed
-- exploitable — a trivially empty Work Order, zero tasks and zero agent_runs at all.
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000009','cccc2001-0000-0000-0000-000000000001','CWO Empty','in_progress');

-- WO10: the realistic exploit chain for the same defect — a task force-completed some
-- other way outside the real agent-dispatch pipeline (a separate, pre-existing gap in
-- tasks_update_scope RLS, unrelated to this migration), with zero agent_runs ever created.
insert into public.canonical_work_orders (id, company_id, title, status) values
  ('cccc2002-0000-0000-0000-000000000010','cccc2001-0000-0000-0000-000000000001','CWO Tasks Without Runs','in_progress');
insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
  ('cccc2003-0000-0000-0000-00000000000a','cccc2001-0000-0000-0000-000000000001','CWO Task 10a','done','cccc2002-0000-0000-0000-000000000010');

-- ================== TESTS ==================

-- TEST 1 (regression #1, #7): happy path completes; verifiedByAgentRunId points at the
-- run that actually carries the commit + passing verification, not the other one.
select set_config('cwo.complete_wo1',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000001'::uuid, 'QA happy path completion'))::text, true);
select set_config('cwo.wo1_completed_at', (select completed_at::text from public.canonical_work_orders where id='cccc2002-0000-0000-0000-000000000001'), true);
select set_config('cwo.wo1_status', (select status::text from public.canonical_work_orders where id='cccc2002-0000-0000-0000-000000000001'), true);

-- TEST 6 (regression #6): idempotent re-complete.
select set_config('cwo.complete_wo1_again',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000001'::uuid))::text, true);

-- TEST 2 (regression #2): running task blocks.
select set_config('cwo.complete_wo2',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000002'::uuid))::text, true);

-- TEST 3 (regression #3): failed run blocks.
select set_config('cwo.complete_wo3',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000003'::uuid))::text, true);

-- TEST 4 (regression #4): missing verification blocks.
select set_config('cwo.complete_wo4',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000004'::uuid))::text, true);

-- TEST 5 (regression #5): failed verification blocks.
select set_config('cwo.complete_wo5',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000005'::uuid))::text, true);

-- TEST 8 (regression #8): a 'done' Work Order cannot regress via a raw UPDATE, even as founder.
do $$
begin
  begin
    update public.canonical_work_orders set status = 'in_progress' where id = 'cccc2002-0000-0000-0000-000000000001';
    perform set_config('cwo.terminal_regression_blocked', 'false', true);
  exception when others then
    perform set_config('cwo.terminal_regression_blocked', 'true', true);
  end;
end $$;
select set_config('cwo.wo1_status_after_regression_attempt', (select status::text from public.canonical_work_orders where id='cccc2002-0000-0000-0000-000000000001'), true);

-- TEST 9 (regression #9): a cross-company task-to-Work-Order reference is structurally
-- impossible to create at all — the existing enforce_task_work_order_company trigger
-- (not this migration) is what actually protects complete_work_order's own invariant.
do $$
begin
  begin
    insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values
      ('cccc2003-0000-0000-0000-000000000099','cccc2001-0000-0000-0000-000000000002','CWO Cross Company Task','done','cccc2002-0000-0000-0000-000000000001');
    perform set_config('cwo.cross_company_task_blocked', 'false', true);
  exception when others then
    perform set_config('cwo.cross_company_task_blocked', 'true', true);
  end;
end $$;

-- TEST 10 (regression #10): status cannot be forced directly to 'done', even as founder,
-- even before any of complete_work_order's own requirements would be met.
do $$
begin
  begin
    update public.canonical_work_orders set status = 'done' where id = 'cccc2002-0000-0000-0000-000000000006';
    perform set_config('cwo.direct_done_blocked', 'false', true);
  exception when others then
    perform set_config('cwo.direct_done_blocked', 'true', true);
  end;
end $$;
select set_config('cwo.wo6_status_after_direct_attempt', (select status::text from public.canonical_work_orders where id='cccc2002-0000-0000-0000-000000000006'), true);

-- TEST 11 (regression #11): unrelated-run verification gaming is rejected.
select set_config('cwo.complete_wo7',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000007'::uuid))::text, true);

-- TEST 12 (regression #12): a fresh row cannot be INSERTed directly as status='done'.
do $$
begin
  begin
    insert into public.canonical_work_orders (id, company_id, title, status) values
      ('cccc2002-0000-0000-0000-000000000099','cccc2001-0000-0000-0000-000000000001','CWO Direct Insert Done','done');
    perform set_config('cwo.direct_insert_done_blocked', 'false', true);
  exception when others then
    perform set_config('cwo.direct_insert_done_blocked', 'true', true);
  end;
end $$;

-- TEST 13 (regression #13): partial verification (one commit verified, one not) is rejected.
select set_config('cwo.complete_wo8',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000008'::uuid))::text, true);

-- TEST 14a (regression #14): a trivially empty Work Order cannot vacuously complete.
select set_config('cwo.complete_wo9',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000009'::uuid))::text, true);

-- TEST 14b (regression #14): tasks force-done with zero agent_runs cannot vacuously complete.
select set_config('cwo.complete_wo10',
  (public.complete_work_order('cccc2002-0000-0000-0000-000000000010'::uuid))::text, true);

reset role;

select json_build_object(
  'scenario', 'COMPLETE-WORK-ORDER-LIFECYCLE',
  'classification', 'FIXED — final factory-state gap (see migration 202608300002_complete_work_order.sql)',
  'complete_wo1', current_setting('cwo.complete_wo1', true)::jsonb,
  'wo1_completed_at', current_setting('cwo.wo1_completed_at', true),
  'wo1_status', current_setting('cwo.wo1_status', true),
  'complete_wo1_again', current_setting('cwo.complete_wo1_again', true)::jsonb,
  'complete_wo2', current_setting('cwo.complete_wo2', true)::jsonb,
  'complete_wo3', current_setting('cwo.complete_wo3', true)::jsonb,
  'complete_wo4', current_setting('cwo.complete_wo4', true)::jsonb,
  'complete_wo5', current_setting('cwo.complete_wo5', true)::jsonb,
  'terminal_regression_blocked', current_setting('cwo.terminal_regression_blocked', true) = 'true',
  'wo1_status_after_regression_attempt', current_setting('cwo.wo1_status_after_regression_attempt', true),
  'cross_company_task_blocked', current_setting('cwo.cross_company_task_blocked', true) = 'true',
  'direct_done_blocked', current_setting('cwo.direct_done_blocked', true) = 'true',
  'wo6_status_after_direct_attempt', current_setting('cwo.wo6_status_after_direct_attempt', true),
  'complete_wo7', current_setting('cwo.complete_wo7', true)::jsonb,
  'direct_insert_done_blocked', current_setting('cwo.direct_insert_done_blocked', true) = 'true',
  'complete_wo8', current_setting('cwo.complete_wo8', true)::jsonb,
  'complete_wo9', current_setting('cwo.complete_wo9', true)::jsonb,
  'complete_wo10', current_setting('cwo.complete_wo10', true)::jsonb,
  'all_pass', (
        (current_setting('cwo.complete_wo1', true)::jsonb->>'changed') = 'true'
    and (current_setting('cwo.complete_wo1', true)::jsonb->>'authorized') = 'true'
    and (current_setting('cwo.complete_wo1', true)::jsonb->>'newStatus') = 'done'
    and (current_setting('cwo.complete_wo1', true)::jsonb->>'verifiedByAgentRunId') = 'cccc2004-0000-0000-0000-000000000001'
    and (current_setting('cwo.complete_wo1', true)::jsonb->>'taskCount') = '2'
    and (current_setting('cwo.complete_wo1', true)::jsonb->>'agentRunCount') = '2'
    and current_setting('cwo.wo1_completed_at', true) is not null
    and current_setting('cwo.wo1_status', true) = 'done'
    and (current_setting('cwo.complete_wo1_again', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo1_again', true)::jsonb->>'reason') = 'already_completed'
    and (current_setting('cwo.complete_wo1_again', true)::jsonb->>'completedAt')::timestamptz = current_setting('cwo.wo1_completed_at', true)::timestamptz
    and (current_setting('cwo.complete_wo2', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo2', true)::jsonb->>'reason') = 'incomplete_task'
    and (current_setting('cwo.complete_wo2', true)::jsonb->>'incompleteTaskId') = 'cccc2003-0000-0000-0000-000000000003'
    and (current_setting('cwo.complete_wo3', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo3', true)::jsonb->>'reason') = 'incomplete_or_failed_run'
    and (current_setting('cwo.complete_wo3', true)::jsonb->>'incompleteRunId') = 'cccc2004-0000-0000-0000-000000000003'
    and (current_setting('cwo.complete_wo4', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo4', true)::jsonb->>'reason') = 'verification_required_not_found'
    and (current_setting('cwo.complete_wo5', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo5', true)::jsonb->>'reason') = 'verification_required_not_found'
    and current_setting('cwo.terminal_regression_blocked', true) = 'true'
    and current_setting('cwo.wo1_status_after_regression_attempt', true) = 'done'
    and current_setting('cwo.cross_company_task_blocked', true) = 'true'
    and current_setting('cwo.direct_done_blocked', true) = 'true'
    and current_setting('cwo.wo6_status_after_direct_attempt', true) = 'in_progress'
    and (current_setting('cwo.complete_wo7', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo7', true)::jsonb->>'reason') = 'verification_required_not_found'
    and current_setting('cwo.direct_insert_done_blocked', true) = 'true'
    and (current_setting('cwo.complete_wo8', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo8', true)::jsonb->>'reason') = 'verification_required_not_found'
    and (current_setting('cwo.complete_wo9', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo9', true)::jsonb->>'reason') = 'no_tasks_to_complete'
    and (current_setting('cwo.complete_wo10', true)::jsonb->>'changed') = 'false'
    and (current_setting('cwo.complete_wo10', true)::jsonb->>'reason') = 'no_agent_runs_recorded'
  )
) as verdict;

rollback;
