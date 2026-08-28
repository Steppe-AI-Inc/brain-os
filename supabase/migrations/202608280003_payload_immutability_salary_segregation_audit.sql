-- Three related governance fixes, all closing OPEN items in qa/KNOWN_FAILURE_MODES.md.

-- ============================================================================
-- 1. #15 — approval_payload is not immutable after creation (SC-060)
-- ============================================================================
-- Nothing ever legitimately updates approval_payload/title/domain/company_id after
-- insert: sem_execute_ai_command writes them once at creation, decide_approval() only
-- ever touches status/decided_at/decision_notes/approver_profile_id. A trigger is a
-- hard, table-level guarantee — not a convention any future code has to remember to
-- respect. domain/company_id are included, not just approval_payload: rewriting domain
-- from 'finance' to 'general' after creation would let a requester dodge hr_finance
-- gating entirely, the same class of bypass as rewriting the payload content itself.
create or replace function public.prevent_approval_payload_mutation() returns trigger
language plpgsql as $$
begin
  if new.approval_payload is distinct from old.approval_payload
     or new.title is distinct from old.title
     or new.domain is distinct from old.domain
     or new.company_id is distinct from old.company_id then
    raise exception 'approval_payload/title/domain/company_id are immutable after creation (qa/KNOWN_FAILURE_MODES.md #15)';
  end if;
  return new;
end;
$$;

drop trigger if exists approvals_payload_immutable on public.approvals;
create trigger approvals_payload_immutable
before update on public.approvals
for each row execute function public.prevent_approval_payload_mutation();

-- ============================================================================
-- 2. #14 — no segregation of duties for finance/salary (SC-058)
-- ============================================================================
-- salary_write_hr previously let is_hr_finance() insert/update/delete salary_private
-- directly and unilaterally — the same person could set a number and there was no one
-- else in the loop. Direct writes are now founder/admin only; an hr_finance caller must
-- go through propose_salary_change(), which creates a real 'salary_hr' approval, and
-- decide_approval() is extended with an 'update_salary' execute action. The actual
-- segregation is enforced in decide_approval() itself: an hr_finance decider who is also
-- the original requester is denied — see the updated v_can_decide check below. Founder/
-- admin is exempt from that self-approval check, same as everywhere else in this app
-- (they're the ultimate authority, not a role this control is meant to constrain).

drop policy if exists "salary_write_hr" on public.salary_private;
create policy "salary_write_hr" on public.salary_private for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

create or replace function public.propose_salary_change(
  p_person_id uuid,
  p_base_salary numeric,
  p_currency text default 'USD',
  p_compensation_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
  v_approval_id uuid;
begin
  if v_profile_id is null then
    raise exception 'No profile found for the authenticated user';
  end if;
  if not (public.is_hr_finance() or public.is_founder_or_admin()) then
    raise exception 'Not authorized to propose salary changes';
  end if;

  select company_id into v_company_id from public.people where id = p_person_id;

  insert into public.approvals (
    company_id, title, reason, risk_level, domain, requested_by_profile_id, approval_payload
  ) values (
    v_company_id,
    'Salary change proposal',
    format('Proposed base salary change to %s %s.', p_base_salary, coalesce(p_currency, 'USD')),
    'high',
    'salary_hr',
    v_profile_id,
    jsonb_build_object(
      'execute', jsonb_build_object(
        'action', 'update_salary',
        'personId', p_person_id,
        'baseSalary', p_base_salary,
        'currency', coalesce(p_currency, 'USD'),
        'compensationNotes', p_compensation_notes
      )
    )
  )
  returning id into v_approval_id;

  return v_approval_id;
end;
$$;

revoke all on function public.propose_salary_change(uuid, numeric, text, text) from public, anon;
grant execute on function public.propose_salary_change(uuid, numeric, text, text) to authenticated;

-- decide_approval() replaced in full (migration 202608270005's body) with two additions:
--   a) v_can_decide now denies an hr_finance/company_manager decider who is also the
--      approval's own requested_by_profile_id (the actual segregation-of-duties gate).
--   b) approval_payload.execute now also handles action = 'update_salary'.
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

  -- Segregation of duties (qa/KNOWN_FAILURE_MODES.md #14): the profile that requested an
  -- approval cannot also be the one who decides it, for the tiers below founder/admin.
  -- Founder/admin is exempt — same "ultimate authority, not constrained by this control"
  -- exemption used everywhere else in this app.
  -- Self-approval is only blocked for salary_hr/finance -- that's the specific
  -- fiduciary/dual-control concern KNOWN_FAILURE_MODES.md #14 is about. general/
  -- production/external_comms approvals are a "pause and confirm intent" gate, not a
  -- fraud-prevention control, and a company manager approving their own routine request
  -- in those domains is the existing, intended, unchanged flow -- broadening the
  -- self-approval block to those domains too was scoped back out deliberately, not an
  -- oversight, to avoid an unrequested regression in ordinary manager workflows.
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
        update public.salary_private
        set base_salary = coalesce((v_execute ->> 'baseSalary')::numeric, base_salary),
            currency = coalesce(v_execute ->> 'currency', currency),
            compensation_notes = coalesce(v_execute ->> 'compensationNotes', compensation_notes),
            updated_at = now()
        where person_id = nullif(v_execute ->> 'personId', '')::uuid;
        get diagnostics v_deleted_count = row_count;
        v_deletion_summary := case when v_deleted_count > 0 then 'Salary updated.' else 'Salary update failed — person record not found.' end;
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

-- ============================================================================
-- 3. Plain approval-record deletion had no audit trail at all (SC-132 follow-up)
-- ============================================================================
-- decide_approval() writes an audit_logs row for a decision; a bare DELETE on approvals
-- (the per-row/"Clear all" UI paths, or a future deleteApprovalIds chat path) never did.
-- A trigger is the right layer — it covers every current and future deletion path
-- uniformly, the same reasoning as the payload-immutability trigger above.
create or replace function public.audit_approval_deletion() returns trigger
language plpgsql as $$
begin
  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id, message, metadata)
  values (
    public.current_profile_id(),
    public.current_role(),
    'approval_deleted',
    'approval',
    old.id,
    old.company_id,
    format('Approval record deleted: %s', old.title),
    jsonb_build_object('status_at_deletion', old.status, 'domain', old.domain)
  );
  return old;
end;
$$;

drop trigger if exists approvals_audit_deletion on public.approvals;
create trigger approvals_audit_deletion
after delete on public.approvals
for each row execute function public.audit_approval_deletion();
