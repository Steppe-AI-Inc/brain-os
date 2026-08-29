-- The final factory-state gap, flagged honestly by both the Factory Director and the
-- independent brain-os-verifier during the master bug-fix campaign: complete_agent_run()
-- (202608290010) only ever propagates a real completion result to a linked TASK, never to
-- the parent canonical_work_orders row. Confirmed live: Work Order e35219b8's two agent_runs
-- and two tasks were all correctly done/live_verified, but the Work Order's own status
-- column still read 'in_progress' with no mechanism to close it.
--
-- Verified live against the real schema before writing this: canonical_work_orders already
-- has completed_at and previous_status columns (schema-v0.7-production-core.sql:3399-3411) -
-- no new columns needed. No RLS/trigger currently guards direct writes to
-- canonical_work_orders.status at all (only the ordinary three-tier update policy) - so
-- today, any caller with update access could set status='done' directly, exactly the gap
-- Bug/point #12 of this fix's own spec warns against ("do NOT let the client directly set
-- Work Order status to completed"). Confirmed via grep that the only existing code path
-- writing canonical_work_orders.status at all is scripts/factory-runner/poll-and-dispatch.mjs
-- (queued -> in_progress only) - nothing anywhere currently writes 'done'. This migration
-- makes complete_work_order() the one and only path to 'done'.
--
-- State model requested: QUEUED -> IN_PROGRESS/RUNNING -> IMPLEMENTATION_COMPLETE ->
-- VERIFYING -> COMPLETED, with RUNNING->FAILED and VERIFYING->VERIFICATION_FAILED failure
-- paths. The real work_status enum (draft/queued/in_progress/blocked/needs_approval/
-- qa_review/done/rejected/archived) has no literal IMPLEMENTATION_COMPLETE/VERIFYING/
-- VERIFICATION_FAILED values, and altering a single enum shared by companies/tasks/goals/
-- canonical_work_orders/agent_runs is a large, cross-cutting, unnecessary change - per the
-- "reuse the current schema where possible, unless it forces a simpler representation"
-- instruction, this collapses onto the existing enum exactly as the codebase's own prior
-- art already does (the real Phase 5 bootstrap Work Order reached 'qa_review' with real
-- e2e verification done, per this session's own chat history): 'in_progress' covers
-- RUNNING; 'qa_review' is the established convention for IMPLEMENTATION_COMPLETE/VERIFYING
-- combined (this codebase's schema does not distinguish "implementation just finished" from
-- "verification actively running" as separate persisted states - both collapse into one
-- linked agent_run's real, granular state, which complete_work_order reads directly rather
-- than needing a redundant Work-Order-level copy); 'done' is COMPLETED; 'rejected' is the
-- terminal FAILED/VERIFICATION_FAILED state (the specific reason - a failed run vs. a
-- failed verification - is preserved with full fidelity on the real agent_runs row that
-- caused the rejection, per agent_runs.verification_status's own 'failed'/'blocked' values -
-- not collapsed away, just not duplicated onto the Work Order's own coarser status column).

-- ============================================================================
-- 1. Lifecycle guard: canonical_work_orders.status may only ever transition INTO 'done',
-- or AWAY from 'done', through complete_work_order() itself. Same GUC-flag pattern as
-- enforce_person_lifecycle_via_rpc/companies_lifecycle_guard - set immediately before the
-- RPC's own UPDATE, reset immediately after, never left set for the rest of the
-- transaction. This is the direct, structural fix for point #12 (no client-side direct
-- completion) and point #11 (a terminal 'done' Work Order can never regress via a stale
-- execution update) simultaneously - transitions between every OTHER pair of statuses
-- (queued->in_progress, etc.) are unaffected, so poll-and-dispatch.mjs's existing
-- queued->in_progress write keeps working exactly as it does today.
-- ============================================================================

create or replace function public.enforce_work_order_completion_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'done' and coalesce(old.status, 'draft') is distinct from 'done')
     or (coalesce(old.status, 'draft') = 'done' and new.status is distinct from 'done')
  then
    if coalesce(current_setting('app.work_order_completion_rpc', true), 'false') <> 'true' then
      raise exception 'canonical_work_orders.status may only transition into/out of ''done'' through complete_work_order() - direct writes are blocked';
    end if;
  end if;
  return new;
end;
$$;

-- Independent review (brain-os-db-security-engineer, live-reproduced, rolled back) found
-- this registered as BEFORE UPDATE only, missing BEFORE INSERT — canonical_work_orders_
-- insert_scope allows any user with has_company_access(company_id) (not just founder/
-- admin), so a fresh row could be INSERTed with status='done' from the start, bypassing
-- this trigger and the RPC entirely. The guard function's own logic (coalesce(old.status,
-- 'draft')) already treats a null OLD row as 'draft' correctly for an INSERT — only the
-- trigger's event list needed fixing.
drop trigger if exists canonical_work_orders_completion_guard on public.canonical_work_orders;
create trigger canonical_work_orders_completion_guard
  before insert or update on public.canonical_work_orders
  for each row execute function public.enforce_work_order_completion_via_rpc();

-- ============================================================================
-- 2. complete_work_order - the one authoritative completion operation. Founder/admin only
-- (same tier and same reasoning as complete_agent_run: "this records an authoritative
-- completion result, not a routine write" - a higher-consequence version of that exact
-- rule, since this closes out the top-level Work Order, not just one run).
-- ============================================================================

create or replace function public.complete_work_order(p_work_order_id uuid, p_summary text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.work_status;
  v_company_id uuid;
  v_authorized boolean;
  v_incomplete_task record;
  v_incomplete_task_count int;
  v_failed_run record;
  v_incomplete_run_count int;
  v_unverified_commit_exists boolean;
  v_verified_run_id uuid;
  v_verified_commit_run_count int;
  v_cross_company_task record;
  v_task_count int;
  v_run_count int;
begin
  select status, company_id into v_status, v_company_id
    from public.canonical_work_orders where id = p_work_order_id;
  if not found then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',false,'currentStatus',v_status,'reason','denied');
  end if;

  -- Idempotent: re-completing an already-completed Work Order is a no-op success, not an
  -- error and not a fresh mutation - same reasoning as complete_agent_run's own
  -- already_recorded case (a retry, e.g. a duplicate dispatch callback, must never produce
  -- a false "changed" claim or corrupt completed_at with a second, different timestamp).
  if v_status = 'done' then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus','done',
      'completedAt',(select completed_at from public.canonical_work_orders where id = p_work_order_id),
      'reason','already_completed');
  end if;

  -- A Work Order already terminally rejected/archived cannot be silently completed - that
  -- would erase a real prior outcome. No "reopen" operation exists in this scope; a founder
  -- who genuinely wants to reverse a rejection does so through a real, separate action, not
  -- through this RPC treating it as equivalent to a fresh completion.
  if v_status in ('rejected','archived') then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','invalid_state_for_completion');
  end if;

  -- Point 4/8a: every required (non-archived) task must be done. 'archived' tasks are
  -- out-of-scope/cancelled, not required. Any task in queued/in_progress/blocked/
  -- needs_approval/rejected blocks completion - a rejected task is a real failure, not
  -- silently treated as "not required".
  select count(*) into v_incomplete_task_count
    from public.tasks where canonical_work_order_id = p_work_order_id and status not in ('done','archived');
  if v_incomplete_task_count > 0 then
    select id, title, status into v_incomplete_task
      from public.tasks where canonical_work_order_id = p_work_order_id and status not in ('done','archived')
      order by created_at limit 1;
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','incomplete_task',
      'incompleteTaskId',v_incomplete_task.id,'incompleteTaskTitle',v_incomplete_task.title,
      'incompleteTaskStatus',v_incomplete_task.status,'incompleteTaskCount',v_incomplete_task_count);
  end if;

  -- Point 5/8b: every linked agent_run must be done - covers a still-running run (blocks
  -- premature completion) and a rejected run (this codebase's terminal-failure value, since
  -- no literal 'cancelled' status exists) equally.
  select count(*) into v_incomplete_run_count
    from public.agent_runs where canonical_work_order_id = p_work_order_id and status <> 'done';
  if v_incomplete_run_count > 0 then
    select id, status into v_failed_run
      from public.agent_runs where canonical_work_order_id = p_work_order_id and status <> 'done'
      order by started_at limit 1;
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','incomplete_or_failed_run',
      'incompleteRunId',v_failed_run.id,'incompleteRunStatus',v_failed_run.status,
      'incompleteRunCount',v_incomplete_run_count);
  end if;

  -- Point 6/7/8c: if real code was mutated, independent verification is required for
  -- EVERY commit that was made - not just one. Independent review
  -- (brain-os-db-security-engineer, live-reproduced, rolled back) found two successive
  -- defects here: (1) the original form split "has a commit" and "has a passing
  -- verification" across two independent EXISTS queries with no row binding, so an
  -- unrelated verified run (e.g. a background/bootstrap run with no commit of its own)
  -- could vouch for a completely different, never-verified commit - fixed by requiring
  -- head_commit, status='done', and a passing verification_status on the SAME row; (2) a
  -- second review pass then found that binding alone still only required ONE commit-
  -- carrying run to be verified to close the WHOLE Work Order - live-reproduced against
  -- the real, documented multi-task dispatch shape (dispatch-task.mjs creates one
  -- agent_runs row per task): a Work Order with two tasks, each with its own commit, one
  -- verified and one never verified at all, still completed. Fixed by inverting the check
  -- to a NOT EXISTS "any commit-carrying run that is NOT properly verified" - every commit
  -- must clear the bar now, not just one.
  select exists(
    select 1 from public.agent_runs
    where canonical_work_order_id = p_work_order_id
      and head_commit is not null
      and (status <> 'done'
           or (verification_status is distinct from 'live_verified' and verification_status is distinct from 'e2e_verified'))
  ) into v_unverified_commit_exists;

  if v_unverified_commit_exists then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','verification_required_not_found');
  end if;

  select id into v_verified_run_id
    from public.agent_runs
    where canonical_work_order_id = p_work_order_id
      and head_commit is not null
      and status = 'done'
      and verification_status in ('live_verified','e2e_verified')
    order by started_at desc limit 1;

  select count(*) into v_verified_commit_run_count
    from public.agent_runs
    where canonical_work_order_id = p_work_order_id
      and head_commit is not null
      and status = 'done'
      and verification_status in ('live_verified','e2e_verified');

  -- Point 8d: cross-company defense-in-depth, matching the established two-layer pattern
  -- (enforce_canonical_work_order_goal_company/enforce_task_work_order_company) - structurally
  -- should already be impossible via create_factory_task's own server-derived company_id,
  -- checked here anyway rather than assumed.
  select id, company_id into v_cross_company_task
    from public.tasks where canonical_work_order_id = p_work_order_id and company_id is distinct from v_company_id
    limit 1;
  if v_cross_company_task.id is not null then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','cross_company_task_reference',
      'conflictingTaskId',v_cross_company_task.id);
  end if;

  select count(*) into v_task_count from public.tasks where canonical_work_order_id = p_work_order_id;
  select count(*) into v_run_count from public.agent_runs where canonical_work_order_id = p_work_order_id;

  perform set_config('app.work_order_completion_rpc', 'true', true);
  update public.canonical_work_orders
    set status = 'done', previous_status = v_status, completed_at = now(), updated_at = now()
    where id = p_work_order_id;
  perform set_config('app.work_order_completion_rpc', 'false', true);

  return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
    'changed',true,'authorized',true,'previousStatus',v_status,'newStatus','done',
    'completedAt',(select completed_at from public.canonical_work_orders where id = p_work_order_id),
    'taskCount',v_task_count,'agentRunCount',v_run_count,'verifiedByAgentRunId',v_verified_run_id,
    'verifiedCommitRunCount',v_verified_commit_run_count,'summary',p_summary,'reason','completed');
end;
$$;

revoke all on function public.complete_work_order(uuid, text) from public, anon;
grant execute on function public.complete_work_order(uuid, text) to authenticated;
