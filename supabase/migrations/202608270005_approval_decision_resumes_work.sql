-- Fixes the approvals execution gap, confirmed live tonight: a real approval (68-task
-- bulk deletion) had neither a task_id nor any target ids in approval_payload, so even
-- though decideApproval() correctly flipped its status to 'approved', nothing was ever
-- actually deleted — the founder had to use the "Clear all" UI buttons separately. More
-- generally, decideApproval() has only ever updated the approval row's own status; it has
-- never resumed the task that was paused for it, nor executed anything a deferred
-- deletion promised. See qa/ACCEPTANCE_TESTS.md #7 ("Authorized approver approves an
-- immutable payload; correct work-order step resumes exactly once").
--
-- This migration adds a single SECURITY DEFINER RPC, decide_approval(), that atomically:
--   1. Re-checks the SAME domain-gated authority as the approvals_update_approver RLS
--      policy (founder/admin, the explicit approver, HR-finance for salary_hr/finance,
--      company manager for general/production/external_comms) — SECURITY DEFINER bypasses
--      table RLS, so this function re-implements that exact check itself rather than
--      relying on it, and denies (no-op) if the caller doesn't have it.
--   2. Only transitions status when it is currently 'pending' (.eq'd inside the update),
--      so approving/rejecting an already-decided approval is a safe, idempotent no-op —
--      it can never execute twice.
--   3. If the approval is linked to a real task (task_id, set when the model's taskIndex
--      pointed at a task created in the same command), resumes it: 'needs_approval' ->
--      'queued' on approval, -> 'rejected' on rejection. This is the general mechanism —
--      it covers every task-linked approval (salary recommendations, proposal reviews,
--      anything with approvalRequired:true), not just deletions.
--   4. If approval_payload has an "execute" action (currently: delete_tasks/delete_channels
--      — the two deletion mechanisms that already exist and are validated against real
--      context ids server-side in sem-ai-command before an approval is ever created),
--      performs it now, scoped to the approval's own company_id as defense in depth.
--   5. Writes an audit_logs row and returns what actually happened so the UI can show a
--      real confirmation instead of a bare "approved" flip.
--
-- decide_approval() is SECURITY DEFINER specifically so it can resume a task an
-- HR-finance approver lacks tasks_update_scope rights over (that RLS policy only lists
-- founder/admin, company manager, and the task's own owner_person — not HR-finance) even
-- though approvals_update_approver already grants that same approver the right to decide
-- a salary_hr/finance approval. Re-deriving the identical authority check inside the
-- function (step 1) is what keeps this a narrow, audited exception rather than an open
-- bypass.

create or replace function public.decide_approval(
  p_approval_id uuid,
  p_decision approval_status,
  p_decision_notes text default null
) returns table (
  decided boolean,
  task_resumed boolean,
  deletion_summary text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval public.approvals%rowtype;
  v_can_decide boolean;
  v_task_resumed boolean := false;
  v_deletion_summary text := null;
  v_execute jsonb;
  v_action text;
  v_task_ids uuid[];
  v_channel_ids uuid[];
  v_deleted_count int;
  v_notes text;
  v_actor_profile_id uuid := public.current_profile_id();
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decide_approval only accepts approved or rejected, got %', p_decision;
  end if;

  if v_actor_profile_id is null then
    return query select false, false, null::text;
    return;
  end if;

  select * into v_approval from public.approvals where id = p_approval_id for update;
  if not found then
    return query select false, false, null::text;
    return;
  end if;

  v_can_decide :=
    public.is_founder_or_admin()
    or v_approval.approver_profile_id = v_actor_profile_id
    or (v_approval.domain in ('salary_hr', 'finance') and public.is_hr_finance())
    or (v_approval.domain in ('general', 'production', 'external_comms') and public.is_company_manager(v_approval.company_id));

  if not v_can_decide or v_approval.status <> 'pending' then
    return query select false, false, null::text;
    return;
  end if;

  if p_decision = 'approved' then
    if v_approval.task_id is not null then
      update public.tasks set status = 'queued', updated_at = now()
      where id = v_approval.task_id and status = 'needs_approval';
      v_task_resumed := found;
    end if;

    v_execute := v_approval.approval_payload -> 'execute';
    if v_execute is not null then
      v_action := v_execute ->> 'action';

      if v_action = 'delete_tasks' then
        select array_agg(x::uuid) into v_task_ids
        from jsonb_array_elements_text(coalesce(v_execute -> 'taskIds', '[]'::jsonb)) x;
        if v_task_ids is not null and array_length(v_task_ids, 1) > 0 then
          delete from public.tasks
          where id = any(v_task_ids) and company_id is not distinct from v_approval.company_id;
          get diagnostics v_deleted_count = row_count;
          v_deletion_summary := v_deleted_count || ' task(s) deleted.';
        end if;

      elsif v_action = 'delete_channels' then
        select array_agg(x::uuid) into v_channel_ids
        from jsonb_array_elements_text(coalesce(v_execute -> 'channelIds', '[]'::jsonb)) x;
        if v_channel_ids is not null and array_length(v_channel_ids, 1) > 0 then
          delete from public.chat_channels
          where id = any(v_channel_ids) and company_id is not distinct from v_approval.company_id;
          get diagnostics v_deleted_count = row_count;
          v_deletion_summary := v_deleted_count || ' channel(s) deleted.';
        end if;
      end if;
    end if;
  else
    if v_approval.task_id is not null then
      update public.tasks set status = 'rejected', updated_at = now()
      where id = v_approval.task_id and status = 'needs_approval';
      v_task_resumed := found;
    end if;
  end if;

  if p_decision_notes is not null then
    v_notes := p_decision_notes;
  else
    v_notes := null;
    if v_task_resumed then
      v_notes := case when p_decision = 'approved' then 'Linked task resumed (queued).' else 'Linked task marked rejected.' end;
    end if;
    if v_deletion_summary is not null then
      v_notes := trim(both ' ' from coalesce(v_notes, '') || ' ' || v_deletion_summary);
    end if;
  end if;

  update public.approvals
  set status = p_decision, decided_at = now(), decision_notes = v_notes,
      approver_profile_id = coalesce(approver_profile_id, v_actor_profile_id)
  where id = p_approval_id;

  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id, message, metadata)
  values (
    v_actor_profile_id,
    public.current_role(),
    'approval_decided',
    'approval',
    p_approval_id,
    v_approval.company_id,
    format('Approval %s: %s', p_decision, v_approval.title),
    jsonb_build_object('decision', p_decision, 'taskResumed', v_task_resumed, 'deletionSummary', v_deletion_summary)
  );

  return query select true, v_task_resumed, v_deletion_summary;
end;
$$;

revoke all on function public.decide_approval(uuid, approval_status, text) from public, anon;
grant execute on function public.decide_approval(uuid, approval_status, text) to authenticated;
