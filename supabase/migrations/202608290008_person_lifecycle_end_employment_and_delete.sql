-- Person/Employment lifecycle (Bug 5, quiet-wiggling-biscuit plan Workstream 1a).
--
-- Root problem (confirmed live, web/lib/data/people.ts:146-153): people.company_id
-- conflates person identity with current employment, and the only "delete" today is a
-- literal `DELETE FROM people`, gated only by RLS `people_write_manager` (for-all,
-- is_company_manager(company_id)) - cascading away compensation history
-- (salary_private, on delete cascade), KPI history (kpi_records, cascade),
-- person_ai_policy (cascade), and the entire employment audit trail
-- (person_assignments, cascade). A proper person_assignments table already exists
-- (state: current/planned/historical, see 202608260006_relationships_assignments.sql)
-- but its only writer, set_person_assignment(), is a move/reassign operation with no
-- standalone "end employment, no replacement" mode.
--
-- Verified live against the real schema before writing this (not trusted from the plan's
-- claimed line numbers): people.active boolean default true already exists and is
-- unused by any writer today; the following FK columns reference public.people(id) with
-- NO ON DELETE clause (default NO ACTION -> raw FK-violation 500 on a hard delete):
--   people.manager_person_id, projects.owner_person_id, tasks.owner_person_id,
--   sales_leads.owner_person_id, goals.owner_person_id,
--   canonical_work_orders.owner_person_id
-- (projects.owner_person_id was not named explicitly in the plan's prose but is real and
-- in the same shape - included here since the whole point of this step is verifying
-- against the live schema, not trusting a possibly-stale list.) The four tables the plan
-- names as ON DELETE CASCADE from people are confirmed exactly as described:
-- salary_private.person_id, kpi_records.person_id, person_ai_policy.person_id,
-- person_assignments.person_id. ai_reply_log.person_id is ON DELETE SET NULL (neither a
-- dependent-block nor a "destroyed" cascade - left alone, not part of destroyedCounts).
--
-- Same three-piece shape as archive_company/restore_company (202608280013) and
-- archive_task/restore_task/archive_goal/restore_goal (202608290001): SECURITY DEFINER,
-- set search_path = '', authorization re-derived inside the function (not trusted from
-- RLS alone), a session-local GUC-flag lifecycle guard trigger (set true immediately
-- before the RPC's own UPDATE, reset to false immediately after - the exact stale-flag
-- bug that pattern already produced once, applied correctly here from the start), and a
-- structured jsonb return. Only two authorization tiers here (founder/admin, company
-- manager) - no creator-tier, matching set_person_assignment's own existing check
-- exactly ("same tier as set_person_assignment" per the plan), since person employment
-- lifecycle has never had a "creator" concept the way companies/tasks/goals do.

-- ============================================================================
-- 1. end_person_employment / restore_person_employment - soft lifecycle on people.active.
-- ============================================================================

create or replace function public.end_person_employment(p_person_id uuid, p_end_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_active boolean;
  v_authorized boolean;
  v_historicized int;
begin
  select company_id, active into v_company_id, v_active from public.people where id = p_person_id;
  if not found then
    return jsonb_build_object('operation','person.endEmployment','personId',p_person_id,
      'changed',false,'authorized',false,'assignmentsHistoricized',0,
      'postconditionPassed',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin()
    or (v_company_id is not null and public.is_company_manager(v_company_id));

  if not v_authorized then
    return jsonb_build_object('operation','person.endEmployment','personId',p_person_id,
      'changed',false,'authorized',false,'assignmentsHistoricized',0,
      'postconditionPassed',false,'reason','denied');
  end if;

  if coalesce(v_active, true) = false then
    return jsonb_build_object('operation','person.endEmployment','personId',p_person_id,
      'changed',false,'authorized',true,'assignmentsHistoricized',0,
      'postconditionPassed',true,'reason','already_inactive');
  end if;

  update public.person_assignments
    set state = 'historical', end_date = coalesce(p_end_date, current_date), updated_at = now()
    where person_id = p_person_id and state = 'current';
  get diagnostics v_historicized = row_count;

  -- company_id is deliberately untouched - history stays inspectable (matches
  -- restore_company's "only flip status" behavior, not a data-erasing operation).
  perform set_config('app.person_lifecycle_rpc', 'true', true);
  update public.people set active = false, updated_at = now() where id = p_person_id;
  perform set_config('app.person_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','person.endEmployment','personId',p_person_id,
    'changed',true,'authorized',true,'assignmentsHistoricized',v_historicized,
    'postconditionPassed',(select active = false from public.people where id = p_person_id),
    'reason','employment_ended');
end;
$$;

create or replace function public.restore_person_employment(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_active boolean;
  v_authorized boolean;
begin
  select company_id, active into v_company_id, v_active from public.people where id = p_person_id;
  if not found then
    return jsonb_build_object('operation','person.restoreEmployment','personId',p_person_id,
      'changed',false,'authorized',false,'assignmentsHistoricized',0,
      'postconditionPassed',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin()
    or (v_company_id is not null and public.is_company_manager(v_company_id));

  if not v_authorized then
    return jsonb_build_object('operation','person.restoreEmployment','personId',p_person_id,
      'changed',false,'authorized',false,'assignmentsHistoricized',0,
      'postconditionPassed',false,'reason','denied');
  end if;

  if coalesce(v_active, true) = true then
    return jsonb_build_object('operation','person.restoreEmployment','personId',p_person_id,
      'changed',false,'authorized',true,'assignmentsHistoricized',0,
      'postconditionPassed',true,'reason','already_active');
  end if;

  -- Does NOT resurrect historicized person_assignments rows - matches how
  -- restore_company only flips status, never rewrites what archive already recorded.
  perform set_config('app.person_lifecycle_rpc', 'true', true);
  update public.people set active = true, updated_at = now() where id = p_person_id;
  perform set_config('app.person_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','person.restoreEmployment','personId',p_person_id,
    'changed',true,'authorized',true,'assignmentsHistoricized',0,
    'postconditionPassed',(select active = true from public.people where id = p_person_id),
    'reason','restored');
end;
$$;

revoke all on function public.end_person_employment(uuid, date) from public, anon;
revoke all on function public.restore_person_employment(uuid) from public, anon;
grant execute on function public.end_person_employment(uuid, date) to authenticated;
grant execute on function public.restore_person_employment(uuid) to authenticated;

-- Real, DB-enforced guarantee (not developer convention) that end_person_employment()/
-- restore_person_employment() are the ONLY way people.active transitions - a generic
-- updatePerson()/any other direct write is blocked from making this specific change,
-- whatever application code currently does or might do in the future. Mirrors
-- enforce_company_lifecycle_via_rpc exactly, applied to the boolean `active` column
-- instead of a `status` enum.
create or replace function public.enforce_person_lifecycle_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.active = false and coalesce(old.active, true) is distinct from false)
     or (coalesce(old.active, true) = false and new.active is distinct from false)
  then
    if coalesce(current_setting('app.person_lifecycle_rpc', true), 'false') <> 'true' then
      raise exception 'Person employment end/restore must go through end_person_employment()/restore_person_employment() - direct active writes are blocked';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists people_lifecycle_guard on public.people;
create trigger people_lifecycle_guard
  before update on public.people
  for each row execute function public.enforce_person_lifecycle_via_rpc();

-- ============================================================================
-- 2. delete_person - the tightly-controlled real hard delete. Founder/admin only,
-- not reachable from AI chat at all (no JSON-schema field exists for it, by design -
-- see the plan's 1c: "deliberately no deletePersonIds, hard-delete stays UI-only").
-- Pre-checks every owner_person_id/manager_person_id-referencing table that has no ON
-- DELETE clause and returns reason:'has_dependents' instead of letting a raw FK error
-- surface (same asymmetry the org already has for permanentlyDeleteCompany). Only once
-- clear does it hard-delete, returning destroyedCounts for what the ON DELETE CASCADE
-- columns actually destroyed - stated, not hidden.
-- ============================================================================

create or replace function public.delete_person(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
  v_authorized boolean;
  v_manager_count int;
  v_projects_count int;
  v_tasks_count int;
  v_leads_count int;
  v_goals_count int;
  v_cwo_count int;
  v_dependents jsonb;
  v_salary_count int;
  v_kpi_count int;
  v_policy_count int;
  v_assignments_count int;
  v_destroyed jsonb;
begin
  select exists(select 1 from public.people where id = p_person_id) into v_exists;
  if not v_exists then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',false,'reason','denied');
  end if;

  select count(*) into v_manager_count from public.people where manager_person_id = p_person_id;
  select count(*) into v_projects_count from public.projects where owner_person_id = p_person_id;
  select count(*) into v_tasks_count from public.tasks where owner_person_id = p_person_id;
  select count(*) into v_leads_count from public.sales_leads where owner_person_id = p_person_id;
  select count(*) into v_goals_count from public.goals where owner_person_id = p_person_id;
  select count(*) into v_cwo_count from public.canonical_work_orders where owner_person_id = p_person_id;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_dependents from (
    select 'people.manager_person_id' as "table", v_manager_count as count where v_manager_count > 0
    union all select 'projects.owner_person_id', v_projects_count where v_projects_count > 0
    union all select 'tasks.owner_person_id', v_tasks_count where v_tasks_count > 0
    union all select 'sales_leads.owner_person_id', v_leads_count where v_leads_count > 0
    union all select 'goals.owner_person_id', v_goals_count where v_goals_count > 0
    union all select 'canonical_work_orders.owner_person_id', v_cwo_count where v_cwo_count > 0
  ) x;

  if jsonb_array_length(v_dependents) > 0 then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',true,'reason','has_dependents','dependents',v_dependents);
  end if;

  select count(*) into v_salary_count from public.salary_private where person_id = p_person_id;
  select count(*) into v_kpi_count from public.kpi_records where person_id = p_person_id;
  select count(*) into v_policy_count from public.person_ai_policy where person_id = p_person_id;
  select count(*) into v_assignments_count from public.person_assignments where person_id = p_person_id;

  delete from public.people where id = p_person_id;

  v_destroyed := jsonb_build_object(
    'people', 1,
    'salary_private', v_salary_count,
    'kpi_records', v_kpi_count,
    'person_ai_policy', v_policy_count,
    'person_assignments', v_assignments_count
  );

  return jsonb_build_object('operation','person.delete','personId',p_person_id,
    'changed',true,'authorized',true,'reason','deleted','destroyedCounts',v_destroyed);
end;
$$;

revoke all on function public.delete_person(uuid) from public, anon;
grant execute on function public.delete_person(uuid) to authenticated;

-- ============================================================================
-- 3. Two-layer defense-in-depth: nothing today checks a person_assignments row's
-- department_id actually belongs to its operating_company_id. Same shape as
-- enforce_canonical_work_order_goal_company (202608290005) - a real BEFORE INSERT OR
-- UPDATE trigger (structural, holds for any future code path) plus a redundant explicit
-- check inside set_person_assignment() itself (specific, immediate error message -
-- redundant with the trigger by design, not instead of it, per the same PHASE_8
-- SECURITY_INCIDENT two-layer precedent).
-- ============================================================================

create or replace function public.enforce_person_assignment_department_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.company_id = new.operating_company_id
  ) then
    raise exception 'person_assignments: department_id % does not belong to operating_company_id % (cross-company department reference rejected)', new.department_id, new.operating_company_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists person_assignments_enforce_department_company on public.person_assignments;
create trigger person_assignments_enforce_department_company
  before insert or update on public.person_assignments
  for each row execute function public.enforce_person_assignment_department_company();

-- set_person_assignment() reproduced in full (CREATE OR REPLACE requires the whole
-- function body) with exactly one addition: the redundant explicit department/company
-- check, inserted right after the existing p_state validation, before any write.
create or replace function public.set_person_assignment(
  p_person_id uuid,
  p_operating_company_id uuid,
  p_legal_employer_company_id uuid default null,
  p_department_id uuid default null,
  p_job_title text default null,
  p_manager_person_id uuid default null,
  p_employment_type text default 'full_time',
  p_allocation_pct numeric default 100,
  p_responsibilities text default null,
  p_is_primary boolean default true,
  p_state text default 'current'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (public.is_founder_or_admin() or public.is_company_manager(p_operating_company_id)) then
    raise exception 'Only the founder, an admin, or a manager of the target company can assign this person';
  end if;
  if p_state not in ('current', 'planned', 'historical') then
    raise exception 'Unknown state %', p_state;
  end if;
  if p_department_id is not null and not exists (
    select 1 from public.departments d where d.id = p_department_id and d.company_id = p_operating_company_id
  ) then
    raise exception 'set_person_assignment: department % does not belong to company % (cross-company department reference rejected)', p_department_id, p_operating_company_id
      using errcode = '23514';
  end if;

  if p_state = 'current' and p_is_primary then
    select id into v_id from public.person_assignments
      where person_id = p_person_id and state = 'current' and is_primary = true
        and operating_company_id = p_operating_company_id
      limit 1;
    if v_id is not null then
      update public.person_assignments
        set legal_employer_company_id = coalesce(p_legal_employer_company_id, legal_employer_company_id),
            department_id = coalesce(p_department_id, department_id),
            job_title = coalesce(p_job_title, job_title),
            manager_person_id = coalesce(p_manager_person_id, manager_person_id),
            employment_type = coalesce(p_employment_type::public.employment_type, employment_type),
            allocation_pct = coalesce(p_allocation_pct, allocation_pct),
            responsibilities = coalesce(p_responsibilities, responsibilities),
            updated_at = now()
        where id = v_id;
      update public.people set company_id = p_operating_company_id, updated_at = now() where id = p_person_id;
      return v_id;
    end if;

    update public.person_assignments
      set state = 'historical', end_date = coalesce(end_date, current_date), updated_at = now()
      where person_id = p_person_id and state = 'current' and is_primary = true;
  end if;

  insert into public.person_assignments (
    person_id, operating_company_id, legal_employer_company_id, department_id,
    job_title, manager_person_id, employment_type, allocation_pct, responsibilities,
    is_primary, state, created_by_profile_id
  ) values (
    p_person_id, p_operating_company_id, p_legal_employer_company_id, p_department_id,
    p_job_title, p_manager_person_id, coalesce(p_employment_type, 'full_time')::public.employment_type,
    p_allocation_pct, p_responsibilities, p_is_primary, p_state::public.assignment_state, public.current_profile_id()
  )
  returning id into v_id;

  if p_state = 'current' and p_is_primary then
    update public.people set company_id = p_operating_company_id, updated_at = now() where id = p_person_id;
  end if;

  return v_id;
end;
$$;
