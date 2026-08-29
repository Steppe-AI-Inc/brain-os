-- Extends the frictionless-delete pattern from 202608280013 to tasks and goals — the two
-- resources KNOWN_FAILURE_MODES.md #20 flagged as closest to already having this (both
-- already carry 'archived' as a legal status enum value, but nothing enforces it as the
-- delete path: updateTaskStatus/updateGoal can set it as a plain unrestricted value, and
-- tasks.created_by_profile_id/goals.created_by_profile_id both exist as columns but are
-- never reliably populated - tasks only get it from the AI-creation RPC path, never from
-- the manual createTask() Server Action; goals never get it from any path at all).
--
-- Same three pieces as companies, adapted per-resource:
--   1. force_task_creator/force_goal_creator - BEFORE INSERT triggers, unconditional,
--      closes the "sometimes/never populated" gap regardless of which code path inserts.
--   2. archive_task/restore_task, archive_goal/restore_goal - SECURITY DEFINER,
--      search_path = '', re-derived authorization (founder/admin, company manager, the
--      task/goal's owner, OR its creator with an active membership on its company - a
--      company_id IS NULL task's creator needs no membership, since there's no workspace
--      to have been removed from). DB-trigger-enforced as the only path into/out of
--      'archived', same GUC-flag pattern as companies - including the reset-after-own-
--      UPDATE fix that pattern needed after a live test caught the flag leaking across an
--      entire transaction.
--   3. RLS (tasks_update_scope/goals_update_scope) gets the identical creator+membership
--      clause, so direct-write behavior never diverges from what the RPCs allow - same
--      "plain edit must obey it too" rule as companies.
--
-- Deliberately NOT touched: tasks_delete_scope/goals_delete_manager (real hard DELETE)
-- stay manager+/admin-only, unchanged - archiving is the new safe default "delete", real
-- destructive deletion stays rare and gated exactly like permanentlyDeleteCompany.
--
-- Restore-target differs by resource, on purpose: goals have a clean single 'active'
-- state (goal_status enum), so restore_goal mirrors restore_company exactly. Tasks do
-- not - a task could have been 'done'/'in_progress'/'blocked'/etc before archiving, and
-- guessing a fixed target would be wrong more often than not. tasks.previous_status
-- stores the exact prior value at archive time; restore_task reads it back and clears it.

alter table public.tasks add column if not exists previous_status public.work_status;

create or replace function public.force_task_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by_profile_id := public.current_profile_id();
  return new;
end;
$$;
drop trigger if exists tasks_force_creator on public.tasks;
create trigger tasks_force_creator
  before insert on public.tasks
  for each row execute function public.force_task_creator();

create or replace function public.force_goal_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by_profile_id := public.current_profile_id();
  return new;
end;
$$;
drop trigger if exists goals_force_creator on public.goals;
create trigger goals_force_creator
  before insert on public.goals
  for each row execute function public.force_goal_creator();

-- RLS: identical creator+membership clause added to the existing update policies -
-- doesn't touch tasks_select_scope (already had this clause) or the delete policies
-- (deliberately unchanged, see header).
drop policy if exists "tasks_update_scope" on public.tasks;
create policy "tasks_update_scope" on public.tasks for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and (
      company_id is null
      or exists (
        select 1 from public.company_memberships m
        where m.company_id = tasks.company_id and m.profile_id = public.current_profile_id() and m.active = true
      )
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and (
      company_id is null
      or exists (
        select 1 from public.company_memberships m
        where m.company_id = tasks.company_id and m.profile_id = public.current_profile_id() and m.active = true
      )
    )
  )
);

drop policy if exists "goals_update_scope" on public.goals;
create policy "goals_update_scope" on public.goals for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = goals.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = goals.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = goals.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = goals.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
);

-- archive_task / restore_task -------------------------------------------------------

create or replace function public.archive_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.work_status;
  v_company_id uuid;
  v_owner_person_id uuid;
  v_created_by uuid;
  v_is_creator_authorized boolean;
  v_authorized boolean;
begin
  select status, company_id, owner_person_id, created_by_profile_id
    into v_previous_status, v_company_id, v_owner_person_id, v_created_by
    from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('operation','task.archive','taskId',p_task_id,
      'changed',false,'authorized',false,'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_authorized := v_created_by = public.current_profile_id()
    and (v_company_id is null or exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.profile_id = public.current_profile_id() and m.active = true
    ));
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
    or exists (select 1 from public.people pe where pe.id = v_owner_person_id and pe.profile_id = public.current_profile_id())
    or v_is_creator_authorized;

  if not v_authorized then
    return jsonb_build_object('operation','task.archive','taskId',p_task_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status = 'archived' then
    return jsonb_build_object('operation','task.archive','taskId',p_task_id,
      'previousStatus','archived','newStatus','archived','changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_archived');
  end if;

  perform set_config('app.task_lifecycle_rpc', 'true', true);
  update public.tasks set previous_status = v_previous_status, status = 'archived', updated_at = now() where id = p_task_id;
  perform set_config('app.task_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','task.archive','taskId',p_task_id,
    'previousStatus',v_previous_status,'newStatus','archived','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'archived' from public.tasks where id = p_task_id),
    'reason','archived');
end;
$$;

create or replace function public.restore_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status public.work_status;
  v_previous_status public.work_status;
  v_company_id uuid;
  v_owner_person_id uuid;
  v_created_by uuid;
  v_is_creator_authorized boolean;
  v_authorized boolean;
  v_target_status public.work_status;
begin
  select status, previous_status, company_id, owner_person_id, created_by_profile_id
    into v_current_status, v_previous_status, v_company_id, v_owner_person_id, v_created_by
    from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('operation','task.restore','taskId',p_task_id,
      'changed',false,'authorized',false,'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_authorized := v_created_by = public.current_profile_id()
    and (v_company_id is null or exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.profile_id = public.current_profile_id() and m.active = true
    ));
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
    or exists (select 1 from public.people pe where pe.id = v_owner_person_id and pe.profile_id = public.current_profile_id())
    or v_is_creator_authorized;

  if not v_authorized then
    return jsonb_build_object('operation','task.restore','taskId',p_task_id,
      'previousStatus',v_current_status,'newStatus',v_current_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_current_status <> 'archived' then
    return jsonb_build_object('operation','task.restore','taskId',p_task_id,
      'previousStatus',v_current_status,'newStatus',v_current_status,'changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_active');
  end if;

  -- No recorded prior status (shouldn't happen via archive_task, but a directly-created
  -- 'archived' row via seed/import could lack one) - fall back to 'queued', the column's
  -- own default, rather than leaving status unset.
  v_target_status := coalesce(v_previous_status, 'queued'::public.work_status);

  perform set_config('app.task_lifecycle_rpc', 'true', true);
  update public.tasks set status = v_target_status, previous_status = null, updated_at = now() where id = p_task_id;
  perform set_config('app.task_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','task.restore','taskId',p_task_id,
    'previousStatus','archived','newStatus',v_target_status,'changed',true,
    'authorized',true,
    'postconditionPassed',(select status = v_target_status from public.tasks where id = p_task_id),
    'reason','restored');
end;
$$;

revoke all on function public.archive_task(uuid) from public, anon;
revoke all on function public.restore_task(uuid) from public, anon;
grant execute on function public.archive_task(uuid) to authenticated;
grant execute on function public.restore_task(uuid) to authenticated;

create or replace function public.enforce_task_lifecycle_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'archived' and old.status is distinct from 'archived')
     or (old.status = 'archived' and new.status is distinct from 'archived')
  then
    if coalesce(current_setting('app.task_lifecycle_rpc', true), 'false') <> 'true' then
      raise exception 'Task archive/restore must go through archive_task()/restore_task()';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_lifecycle_guard on public.tasks;
create trigger tasks_lifecycle_guard
  before update on public.tasks
  for each row execute function public.enforce_task_lifecycle_via_rpc();

-- archive_goal / restore_goal --------------------------------------------------------

create or replace function public.archive_goal(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.goal_status;
  v_company_id uuid;
  v_owner_person_id uuid;
  v_created_by uuid;
  v_is_creator_authorized boolean;
  v_authorized boolean;
begin
  select status, company_id, owner_person_id, created_by_profile_id
    into v_previous_status, v_company_id, v_owner_person_id, v_created_by
    from public.goals where id = p_goal_id;
  if not found then
    return jsonb_build_object('operation','goal.archive','goalId',p_goal_id,
      'changed',false,'authorized',false,'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_authorized := v_created_by = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.profile_id = public.current_profile_id() and m.active = true
    );
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
    or exists (select 1 from public.people pe where pe.id = v_owner_person_id and pe.profile_id = public.current_profile_id())
    or v_is_creator_authorized;

  if not v_authorized then
    return jsonb_build_object('operation','goal.archive','goalId',p_goal_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status = 'archived' then
    return jsonb_build_object('operation','goal.archive','goalId',p_goal_id,
      'previousStatus','archived','newStatus','archived','changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_archived');
  end if;

  perform set_config('app.goal_lifecycle_rpc', 'true', true);
  update public.goals set status = 'archived', updated_at = now() where id = p_goal_id;
  perform set_config('app.goal_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','goal.archive','goalId',p_goal_id,
    'previousStatus',v_previous_status,'newStatus','archived','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'archived' from public.goals where id = p_goal_id),
    'reason','archived');
end;
$$;

create or replace function public.restore_goal(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.goal_status;
  v_company_id uuid;
  v_owner_person_id uuid;
  v_created_by uuid;
  v_is_creator_authorized boolean;
  v_authorized boolean;
begin
  select status, company_id, owner_person_id, created_by_profile_id
    into v_previous_status, v_company_id, v_owner_person_id, v_created_by
    from public.goals where id = p_goal_id;
  if not found then
    return jsonb_build_object('operation','goal.restore','goalId',p_goal_id,
      'changed',false,'authorized',false,'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_authorized := v_created_by = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.profile_id = public.current_profile_id() and m.active = true
    );
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
    or exists (select 1 from public.people pe where pe.id = v_owner_person_id and pe.profile_id = public.current_profile_id())
    or v_is_creator_authorized;

  if not v_authorized then
    return jsonb_build_object('operation','goal.restore','goalId',p_goal_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status <> 'archived' then
    return jsonb_build_object('operation','goal.restore','goalId',p_goal_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_active');
  end if;

  perform set_config('app.goal_lifecycle_rpc', 'true', true);
  update public.goals set status = 'active', updated_at = now() where id = p_goal_id;
  perform set_config('app.goal_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','goal.restore','goalId',p_goal_id,
    'previousStatus','archived','newStatus','active','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'active' from public.goals where id = p_goal_id),
    'reason','restored');
end;
$$;

revoke all on function public.archive_goal(uuid) from public, anon;
revoke all on function public.restore_goal(uuid) from public, anon;
grant execute on function public.archive_goal(uuid) to authenticated;
grant execute on function public.restore_goal(uuid) to authenticated;

create or replace function public.enforce_goal_lifecycle_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'archived' and old.status is distinct from 'archived')
     or (old.status = 'archived' and new.status is distinct from 'archived')
  then
    if coalesce(current_setting('app.goal_lifecycle_rpc', true), 'false') <> 'true' then
      raise exception 'Goal archive/restore must go through archive_goal()/restore_goal()';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists goals_lifecycle_guard on public.goals;
create trigger goals_lifecycle_guard
  before update on public.goals
  for each row execute function public.enforce_goal_lifecycle_via_rpc();
