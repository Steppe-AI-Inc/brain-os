-- Real bug found by re-running qa/scenarios-runner/sc058_bookkeeper_sod_gap.sql after
-- migration 202608280003 landed: decide_approval()'s 'update_salary' execute action did
-- a plain UPDATE on salary_private, which matches zero rows for a person who has never
-- had a salary_private row before (person_id is that table's primary key, not
-- auto-created per person) — since direct writes are now founder/admin only, the very
-- first salary proposal for any given person would always silently do nothing, even
-- though decide_approval() reported the approval as successfully decided. Fixed with a
-- real upsert. Everything else in decide_approval() is unchanged from 202608280003.

drop function if exists public.decide_approval(uuid, approval_status, text);

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
    or (v_approval.approver_profile_id = v_actor_profile_id and v_approval.requested_by_profile_id is distinct from v_actor_profile_id)
    or (v_approval.domain in ('salary_hr', 'finance') and public.is_hr_finance() and v_approval.requested_by_profile_id is distinct from v_actor_profile_id)
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

      elsif v_action = 'update_salary' then
        -- Upsert, not a plain UPDATE (the bug): person_id is salary_private's primary
        -- key, not auto-created per person, so a person's first-ever salary proposal
        -- must be able to create the row, not just update one that may not exist yet.
        insert into public.salary_private (person_id, base_salary, currency, compensation_notes, updated_at)
        values (
          nullif(v_execute ->> 'personId', '')::uuid,
          (v_execute ->> 'baseSalary')::numeric,
          coalesce(v_execute ->> 'currency', 'USD'),
          v_execute ->> 'compensationNotes',
          now()
        )
        on conflict (person_id) do update set
          base_salary = coalesce(excluded.base_salary, public.salary_private.base_salary),
          currency = coalesce(excluded.currency, public.salary_private.currency),
          compensation_notes = coalesce(excluded.compensation_notes, public.salary_private.compensation_notes),
          updated_at = now();
        v_deletion_summary := 'Salary updated.';
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
    v_actor_profile_id, public.current_role(), 'approval_decided', 'approval', p_approval_id, v_approval.company_id,
    format('Approval %s: %s', p_decision, v_approval.title),
    jsonb_build_object('decision', p_decision, 'taskResumed', v_task_resumed, 'deletionSummary', v_deletion_summary)
  );

  return query select true, v_task_resumed, v_deletion_summary;
end;
$$;
revoke all on function public.decide_approval(uuid, approval_status, text) from public, anon;
grant execute on function public.decide_approval(uuid, approval_status, text) to authenticated;
