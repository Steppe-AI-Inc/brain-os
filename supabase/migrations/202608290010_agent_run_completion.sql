-- complete_agent_run RPC - closes a real gap found during independent verification of
-- the already-running Phase 8 Work Order 3b28e447-4a9c-4f79-9419-80638a39e457 (not in the
-- quiet-wiggling-biscuit plan file - a gap found after that plan was written). See
-- docs/software-factory/PHASE_8_SECURITY_INCIDENT.md: today, nothing completes an
-- agent_runs row except raw SQL run directly against production (confirmed live - the
-- only `update public.agent_runs set status = ...` in the whole repo are inside
-- qa/scenarios-runner test fixtures; scripts/factory-runner/{dispatch-task,
-- poll-and-dispatch}.mjs only ever INSERT a row at 'in_progress', never complete one).
-- That means a background specialist agent's independently-verified real completion (a
-- real git commit, confirmed via git ancestry check, never self-reported) has no path
-- back into Brain OS without an agent touching raw SQL directly - exactly the class of
-- gap PHASE_8_SECURITY_INCIDENT.md warns about (an agent session running arbitrary SQL
-- against production is how that incident happened in the first place). This RPC is the
-- one narrow, auditable, founder/admin-gated path to record that result instead.
--
-- Verified live against the real schema before writing this: public.agent_runs.status is
-- public.work_status (draft/queued/in_progress/blocked/needs_approval/qa_review/done/
-- rejected/archived) - the EXACT SAME enum type as public.tasks.status, confirmed via
-- both tables' `create table` definitions in schema-v0.7-production-core.sql - so
-- propagating p_status onto a linked task needs no cast, no enum-to-enum mapping table,
-- and no separate validation (an invalid value is rejected by the column type itself).
-- verification_status is a free `text` column with its own CHECK constraint
-- ('pending','live_verified','e2e_verified','failed','blocked'), not an enum - the check
-- below re-validates the same list so an invalid value fails inside this function with a
-- clear message rather than a bare constraint-violation from the UPDATE. agent_runs.
-- task_id is nullable (references public.tasks(id) on delete set null) - a background
-- bootstrap/Work-Order-level run genuinely has none, so "no task_id -> no error" is a
-- first-class, expected case, not an edge case to special-case away.
--
-- Auth: is_founder_or_admin() only - deliberately narrower than agent_runs_update_scope
-- RLS (which also allows a company manager of a non-null company_id), because this
-- records an authoritative completion result, not a routine write - matching the plan's
-- own instruction for this RPC specifically ("this records an authoritative completion
-- result, not a routine write").

create or replace function public.complete_agent_run(
  p_agent_run_id uuid,
  p_status public.work_status,
  p_head_commit text default null,
  p_verification_status text default null,
  p_summary text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.work_status;
  v_previous_head_commit text;
  v_previous_verification_status text;
  v_task_id uuid;
  v_authorized boolean;
  v_previous_task_status public.work_status;
  v_task_updated boolean := false;
begin
  select status, head_commit, verification_status, task_id
    into v_previous_status, v_previous_head_commit, v_previous_verification_status, v_task_id
    from public.agent_runs where id = p_agent_run_id;
  if not found then
    return jsonb_build_object('operation','agent_run.complete','agentRunId',p_agent_run_id,
      'changed',false,'authorized',false,'taskUpdated',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('operation','agent_run.complete','agentRunId',p_agent_run_id,
      'changed',false,'authorized',false,'taskUpdated',false,'reason','denied');
  end if;

  if p_verification_status is not null
     and p_verification_status not in ('pending','live_verified','e2e_verified','failed','blocked')
  then
    raise exception 'complete_agent_run: unknown verification_status % (must be pending/live_verified/e2e_verified/failed/blocked)', p_verification_status;
  end if;

  -- Idempotent: re-completing with the exact same status/head_commit/verification_status
  -- is a no-op, not an error - a specialist agent's completion call may legitimately be
  -- retried (network blip, duplicate webhook) without producing a false "changed" claim
  -- or a spurious second task-status write.
  if v_previous_status = p_status
     and v_previous_head_commit is not distinct from p_head_commit
     and v_previous_verification_status is not distinct from p_verification_status
  then
    return jsonb_build_object('operation','agent_run.complete','agentRunId',p_agent_run_id,
      'changed',false,'authorized',true,'taskUpdated',false,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,
      'reason','already_recorded');
  end if;

  update public.agent_runs
    set status = p_status,
        head_commit = coalesce(p_head_commit, head_commit),
        verification_status = coalesce(p_verification_status, verification_status),
        summary = coalesce(p_summary, summary),
        finished_at = now(),
        updated_at = now()
    where id = p_agent_run_id;

  if v_task_id is not null then
    select status into v_previous_task_status from public.tasks where id = v_task_id;
    if v_previous_task_status is not null and v_previous_task_status is distinct from p_status then
      -- Same GUC-flag pattern as every other lifecycle RPC in this schema: set
      -- immediately before the UPDATE, reset immediately after - never left set for the
      -- rest of the transaction (the exact stale-flag class 202608280013 already found
      -- and fixed once). Harmless when p_status/the task's current status don't involve
      -- 'archived' at all (the trigger only raises on that specific transition) and
      -- correctly permits it on the rare case they do.
      perform set_config('app.task_lifecycle_rpc', 'true', true);
      update public.tasks set status = p_status, updated_at = now() where id = v_task_id;
      perform set_config('app.task_lifecycle_rpc', 'false', true);
      v_task_updated := true;
    end if;
  end if;

  return jsonb_build_object('operation','agent_run.complete','agentRunId',p_agent_run_id,
    'changed',true,'authorized',true,'taskUpdated',v_task_updated,
    'previousStatus',v_previous_status,'newStatus',p_status,
    'reason','completed');
end;
$$;

revoke all on function public.complete_agent_run(uuid, public.work_status, text, text, text) from public, anon;
grant execute on function public.complete_agent_run(uuid, public.work_status, text, text, text) to authenticated;
