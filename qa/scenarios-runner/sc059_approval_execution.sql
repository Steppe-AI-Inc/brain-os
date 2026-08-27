-- SC-059 / SC-094 Approval must EXECUTE (flagship). Tests the decide_approval() fix
-- (migration 202608270005) end to end: approving a deferred bulk-deletion approval must
-- actually delete exactly the targeted tasks, leave others untouched, flip status once,
-- and be idempotent on re-run.
--
-- IMPORTANT: migration 202608270005 is committed to git but NOT pushed to production
-- (confirmed: decide_approval is absent from the live SECURITY DEFINER list). This script
-- therefore LOADS the function's exact committed definition into a rolled-back transaction
-- and tests THAT — it is a logic verification of the committed fix, NOT a test of the
-- deployed database, and it creates nothing permanent (the function and all fixtures
-- vanish at rollback). Re-run this after the founder authorizes `db push` to confirm the
-- deployed function matches.
begin;

-- ---- committed definition, copied verbatim from 202608270005_approval_decision_resumes_work.sql ----
create or replace function public.decide_approval(
  p_approval_id uuid, p_decision approval_status, p_decision_notes text default null
) returns table (decided boolean, task_resumed boolean, deletion_summary text)
language plpgsql security definer set search_path = public as $$
declare
  v_approval public.approvals%rowtype; v_can_decide boolean; v_task_resumed boolean := false;
  v_deletion_summary text := null; v_execute jsonb; v_action text; v_task_ids uuid[];
  v_channel_ids uuid[]; v_deleted_count int; v_notes text;
  v_actor_profile_id uuid := public.current_profile_id();
begin
  if p_decision not in ('approved','rejected') then raise exception 'bad decision %', p_decision; end if;
  if v_actor_profile_id is null then return query select false,false,null::text; return; end if;
  select * into v_approval from public.approvals where id=p_approval_id for update;
  if not found then return query select false,false,null::text; return; end if;
  v_can_decide := public.is_founder_or_admin()
    or v_approval.approver_profile_id = v_actor_profile_id
    or (v_approval.domain in ('salary_hr','finance') and public.is_hr_finance())
    or (v_approval.domain in ('general','production','external_comms') and public.is_company_manager(v_approval.company_id));
  if not v_can_decide or v_approval.status <> 'pending' then return query select false,false,null::text; return; end if;
  if p_decision='approved' then
    if v_approval.task_id is not null then
      update public.tasks set status='queued', updated_at=now() where id=v_approval.task_id and status='needs_approval';
      v_task_resumed := found;
    end if;
    v_execute := v_approval.approval_payload -> 'execute';
    if v_execute is not null then
      v_action := v_execute ->> 'action';
      if v_action='delete_tasks' then
        select array_agg(x::uuid) into v_task_ids from jsonb_array_elements_text(coalesce(v_execute->'taskIds','[]'::jsonb)) x;
        if v_task_ids is not null and array_length(v_task_ids,1)>0 then
          delete from public.tasks where id=any(v_task_ids) and company_id is not distinct from v_approval.company_id;
          get diagnostics v_deleted_count = row_count;
          v_deletion_summary := v_deleted_count || ' task(s) deleted.';
        end if;
      elsif v_action='delete_channels' then
        select array_agg(x::uuid) into v_channel_ids from jsonb_array_elements_text(coalesce(v_execute->'channelIds','[]'::jsonb)) x;
        if v_channel_ids is not null and array_length(v_channel_ids,1)>0 then
          delete from public.chat_channels where id=any(v_channel_ids) and company_id is not distinct from v_approval.company_id;
          get diagnostics v_deleted_count = row_count;
          v_deletion_summary := v_deleted_count || ' channel(s) deleted.';
        end if;
      end if;
    end if;
  else
    if v_approval.task_id is not null then
      update public.tasks set status='rejected', updated_at=now() where id=v_approval.task_id and status='needs_approval';
      v_task_resumed := found;
    end if;
  end if;
  update public.approvals set status=p_decision, decided_at=now(),
    approver_profile_id=coalesce(approver_profile_id, v_actor_profile_id) where id=p_approval_id;
  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id, message)
  values (v_actor_profile_id, public.current_role(), 'approval_decided', 'approval', p_approval_id, v_approval.company_id,
    format('Approval %s: %s', p_decision, v_approval.title));
  return query select true, v_task_resumed, v_deletion_summary;
end $$;

-- ---- fixtures: tasks A,B,C (to delete) + D (control, must survive) in CLIX GPS ----
insert into public.tasks (id, company_id, title, status, created_by_profile_id) values
 ('05900000-0000-0000-0000-00000000000a','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059 task A','done','46bf57d3-33b3-47b4-8302-126726a92775'),
 ('05900000-0000-0000-0000-00000000000b','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059 task B','done','46bf57d3-33b3-47b4-8302-126726a92775'),
 ('05900000-0000-0000-0000-00000000000c','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059 task C','done','46bf57d3-33b3-47b4-8302-126726a92775'),
 ('05900000-0000-0000-0000-00000000000d','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059 task D KEEP','queued','46bf57d3-33b3-47b4-8302-126726a92775');

insert into public.approvals (id, company_id, title, domain, status, risk_level, approval_payload) values
 ('05900001-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059 delete A,B,C','production','pending','high',
  '{"execute":{"action":"delete_tasks","taskIds":["05900000-0000-0000-0000-00000000000a","05900000-0000-0000-0000-00000000000b","05900000-0000-0000-0000-00000000000c"]}}'::jsonb);

create temp table sc059 (k text, v text) on commit drop;
grant insert, select on sc059 to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

-- First approval: should delete exactly A,B,C.
insert into sc059 select 'first_call', deletion_summary from public.decide_approval('05900001-0000-0000-0000-000000000001','approved');
-- Idempotent re-run: approval is now 'approved', so guard makes this a no-op (deletes nothing).
insert into sc059 select 'second_call', coalesce(deletion_summary,'noop') from public.decide_approval('05900001-0000-0000-0000-000000000001','approved');
reset role;

select json_build_object(
  'scenario','SC-059 / SC-094',
  'status','LOGIC VERIFIED against committed migration 202608270005; deployment PENDING founder db push',
  'first_call_summary', (select v from sc059 where k='first_call'),
  'second_call_summary', (select v from sc059 where k='second_call'),
  'A_deleted', not exists(select 1 from public.tasks where id='05900000-0000-0000-0000-00000000000a'),
  'B_deleted', not exists(select 1 from public.tasks where id='05900000-0000-0000-0000-00000000000b'),
  'C_deleted', not exists(select 1 from public.tasks where id='05900000-0000-0000-0000-00000000000c'),
  'D_survived', exists(select 1 from public.tasks where id='05900000-0000-0000-0000-00000000000d'),
  'approval_status', (select status from public.approvals where id='05900001-0000-0000-0000-000000000001'),
  'audit_written', exists(select 1 from public.audit_logs where entity_id='05900001-0000-0000-0000-000000000001' and event_type='approval_decided'),
  'all_pass', (
        (select v from sc059 where k='first_call')='3 task(s) deleted.'
    and not exists(select 1 from public.tasks where id in ('05900000-0000-0000-0000-00000000000a','05900000-0000-0000-0000-00000000000b','05900000-0000-0000-0000-00000000000c'))
    and exists(select 1 from public.tasks where id='05900000-0000-0000-0000-00000000000d')
    and (select status from public.approvals where id='05900001-0000-0000-0000-000000000001')='approved'
  )
) as verdict;

rollback;
