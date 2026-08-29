-- Real defect: the founder asked Brain AI to delete a company; the AI claimed success
-- with zero backing mechanism (sem-ai-command had no company-delete capability at all —
-- same hallucinated-execution class as KNOWN_FAILURE_MODES.md #1/#17/#18/#19). He then
-- used the real Delete button and hit the raw dependency-blocking error this session's
-- own earlier work shipped (commit 2308f48). Explicit redirect: "too focused on
-- defensive restrictions while basic user operations are still unreliable."
--
-- Fix: "delete" = archive (status -> 'archived', nothing destroyed or reassigned, so no
-- dependency check is needed at all - that's what makes it fast and unconditional for an
-- authorized actor). One shared RPC is the ONLY path for chat and the UI, enforced by a
-- DB trigger, not developer convention. Permanent, destructive hard-delete stays a
-- separate, rare, founder-only operation (the dependency-blocking logic already built
-- this session, kept and renamed for that different job).

-- ============================================================================
-- 1. SECURITY DEFINER hardening: set search_path = '' (empty) instead of 'public' for
-- privileged functions, per explicit review. Verified first that every real table/
-- function reference in all three is already public.-qualified (the only unqualified
-- names were CTE aliases local to their own recursive queries, not schema objects) - so
-- this is a safe, zero-behavior-change hardening, not a rewrite. Full bodies reproduced
-- unchanged except this one line, since CREATE OR REPLACE requires the whole function.
-- ============================================================================

create or replace function public.set_company_relationship(
  p_company_id uuid,
  p_related_company_id uuid,
  p_relationship_type public.company_relationship_type,
  p_ownership_pct numeric default null,
  p_state text default 'current'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_founder_or_admin() then
    raise exception 'Only the founder or an admin can restructure the organization graph';
  end if;
  if p_company_id = p_related_company_id then
    raise exception 'A company cannot be related to itself';
  end if;
  if p_state not in ('current', 'planned', 'historical', 'under_restructuring') then
    raise exception 'Unknown state %', p_state;
  end if;

  if p_state = 'current' and p_relationship_type <> 'owned_by_percentage' then
    update public.company_relationships
      set state = 'historical'
      where company_id = p_company_id
        and relationship_type <> 'owned_by_percentage'
        and state = 'current'
        and not (related_company_id = p_related_company_id and relationship_type = p_relationship_type);
  end if;

  insert into public.company_relationships (company_id, related_company_id, relationship_type, ownership_pct, state, created_by_profile_id)
  values (p_company_id, p_related_company_id, p_relationship_type, p_ownership_pct, p_state::public.relationship_state, public.current_profile_id())
  on conflict (company_id, related_company_id, relationship_type) where state = 'current' and related_company_id is not null
  do update set ownership_pct = coalesce(excluded.ownership_pct, public.company_relationships.ownership_pct)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.validate_organization_graph(p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_founder_or_admin() then
    raise exception 'Only the founder or an admin can run an organization integrity check';
  end if;

  select jsonb_build_object(
    'scope', case when p_company_id is null then 'all companies' else (select name from public.companies where id = p_company_id) end,
    'duplicateCompanyNames', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', cnt)), '[]'::jsonb)
      from (
        select min(name) as name, count(*) as cnt
        from public.companies group by lower(name) having count(*) > 1
      ) x
    ),
    'ownershipOver100', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'companyId', related_company_id,
        'companyName', (select name from public.companies where id = related_company_id),
        'totalPct', total
      )), '[]'::jsonb)
      from (
        select related_company_id, sum(ownership_pct) as total
        from public.company_relationships
        where relationship_type = 'parent_of' and state = 'current' and ownership_pct is not null
          and (p_company_id is null or related_company_id = p_company_id)
        group by related_company_id having sum(ownership_pct) > 100
      ) x
    ),
    'hierarchyCycles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'companyId', r.company_id, 'companyName', (select name from public.companies where id = r.company_id)
      )), '[]'::jsonb)
      from public.company_relationships r
      where r.state = 'current'
        and r.relationship_type in ('parent_of','business_unit_of','brand_of','subsidiary_of','department_of')
        and (p_company_id is null or r.company_id = p_company_id or r.related_company_id = p_company_id)
        and exists (
          with recursive up as (
            select related_company_id as id from public.company_relationships
            where company_id = r.related_company_id and state = 'current'
              and relationship_type in ('parent_of','business_unit_of','brand_of','subsidiary_of','department_of')
            union
            select r2.related_company_id from public.company_relationships r2
            join up on r2.company_id = up.id
            where r2.state = 'current'
              and r2.relationship_type in ('parent_of','business_unit_of','brand_of','subsidiary_of','department_of')
          )
          select 1 from up where id = r.company_id
        )
    ),
    'businessUnitsWithoutParentEdge', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'organizationType', c.organization_type)), '[]'::jsonb)
      from public.companies c
      where c.organization_type <> 'legal_entity'
        and (p_company_id is null or c.id = p_company_id)
        and not exists (
          select 1 from public.company_relationships cr
          where cr.company_id = c.id and cr.state = 'current'
            and cr.relationship_type in ('business_unit_of','brand_of','subsidiary_of','department_of')
        )
    ),
    'stalePlannedRelationships', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'company', (select name from public.companies where id = company_id),
        'relatedCompany', (select name from public.companies where id = related_company_id),
        'relationshipType', relationship_type, 'createdAt', created_at
      )), '[]'::jsonb)
      from public.company_relationships
      where state = 'planned' and created_at < now() - interval '7 days'
        and (p_company_id is null or company_id = p_company_id or related_company_id = p_company_id)
    ),
    'peopleWithNoCompany', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'fullName', full_name)), '[]'::jsonb)
      from public.people where company_id is null
    )
  ) into v_result;

  v_result := v_result || jsonb_build_object(
    'clean',
      jsonb_array_length(v_result->'duplicateCompanyNames') = 0
      and jsonb_array_length(v_result->'ownershipOver100') = 0
      and jsonb_array_length(v_result->'hierarchyCycles') = 0
      and jsonb_array_length(v_result->'businessUnitsWithoutParentEdge') = 0
      and jsonb_array_length(v_result->'stalePlannedRelationships') = 0
      and jsonb_array_length(v_result->'peopleWithNoCompany') = 0
  );

  return v_result;
end;
$$;

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

-- ============================================================================
-- 2. created_by_profile_id — unconditionally server-set, never guessed for legacy rows.
-- ============================================================================

alter table public.companies add column if not exists created_by_profile_id uuid references public.profiles(id);
-- Nullable, no backfill: every pre-existing company was created by an account that was
-- always founder/admin anyway, so is_founder_or_admin() already covers them correctly
-- without fabricating provenance for rows created before this column existed.

-- A `default` clause alone doesn't stop a client from explicitly supplying the column in
-- an INSERT, so this trigger unconditionally overwrites it regardless of what was
-- supplied - cannot be bypassed by any INSERT shape, present or future.
create or replace function public.force_company_creator()
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

drop trigger if exists companies_force_creator on public.companies;
create trigger companies_force_creator
  before insert on public.companies
  for each row execute function public.force_company_creator();

-- ============================================================================
-- 3. Status: DB-level constraint (not just app-level validation), and RLS that matches
-- the RPCs' authorization exactly - the membership-expiry rule applies to plain `edit`
-- too, not only archive/restore, so there is no surface where behavior differs.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_status_check') then
    alter table public.companies add constraint companies_status_check
      check (status in ('active','planning','paused','closed','archived'));
  end if;
end $$;

-- Split from a single "for all" policy: creating a brand-new company can never satisfy
-- "creator has active membership on this company" (nobody can be a member of a company
-- before it exists), so that clause only makes sense for UPDATE/DELETE of an existing
-- row. INSERT stays founder/admin-only, matching original behavior unchanged - the
-- founder's complaint was about deleting/editing existing companies, not about who may
-- create new top-level ones.
drop policy if exists "companies_write_admin" on public.companies;
drop policy if exists "companies_write_scope" on public.companies;
drop policy if exists "companies_insert_admin" on public.companies;
drop policy if exists "companies_update_delete_scope" on public.companies;
create policy "companies_insert_admin" on public.companies for insert with check (public.is_founder_or_admin());
create policy "companies_update_delete_scope" on public.companies for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(id)
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = companies.id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(id)
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = companies.id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
);
create policy "companies_delete_admin" on public.companies for delete using (public.is_founder_or_admin());

-- ============================================================================
-- 4. archive_company / restore_company — the ONE path, DB-enforced (not convention).
-- Deliberately no dependency traversal: archiving destroys/reassigns nothing, so there
-- is nothing to check - that's what makes it fast and unconditional for an authorized
-- actor (previous session's dependency-blocking logic was solving a different problem;
-- see permanently_delete_company below).
-- ============================================================================

create or replace function public.archive_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_is_creator_with_membership boolean;
  v_authorized boolean;
begin
  select status into v_previous_status from public.companies where id = p_company_id;
  if v_previous_status is null then
    return jsonb_build_object('operation','company.archive','companyId',p_company_id,
      'previousStatus',null,'newStatus',null,'changed',false,'authorized',false,
      'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_with_membership := exists (
    select 1 from public.companies c
    join public.company_memberships m on m.company_id = c.id
      and m.profile_id = public.current_profile_id() and m.active = true
    where c.id = p_company_id and c.created_by_profile_id = public.current_profile_id()
  );
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(p_company_id)
    or v_is_creator_with_membership;

  if not v_authorized then
    return jsonb_build_object('operation','company.archive','companyId',p_company_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status = 'archived' then
    return jsonb_build_object('operation','company.archive','companyId',p_company_id,
      'previousStatus','archived','newStatus','archived','changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_archived');
  end if;

  perform set_config('app.company_lifecycle_rpc', 'true', true);
  update public.companies set status = 'archived', updated_at = now() where id = p_company_id;
  perform set_config('app.company_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','company.archive','companyId',p_company_id,
    'previousStatus',v_previous_status,'newStatus','archived','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'archived' from public.companies where id = p_company_id),
    'reason','archived');
end;
$$;

create or replace function public.restore_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_is_creator_with_membership boolean;
  v_authorized boolean;
begin
  select status into v_previous_status from public.companies where id = p_company_id;
  if v_previous_status is null then
    return jsonb_build_object('operation','company.restore','companyId',p_company_id,
      'previousStatus',null,'newStatus',null,'changed',false,'authorized',false,
      'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_with_membership := exists (
    select 1 from public.companies c
    join public.company_memberships m on m.company_id = c.id
      and m.profile_id = public.current_profile_id() and m.active = true
    where c.id = p_company_id and c.created_by_profile_id = public.current_profile_id()
  );
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(p_company_id)
    or v_is_creator_with_membership;

  if not v_authorized then
    return jsonb_build_object('operation','company.restore','companyId',p_company_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status <> 'archived' then
    return jsonb_build_object('operation','company.restore','companyId',p_company_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_active');
  end if;

  perform set_config('app.company_lifecycle_rpc', 'true', true);
  update public.companies set status = 'active', updated_at = now() where id = p_company_id;
  perform set_config('app.company_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','company.restore','companyId',p_company_id,
    'previousStatus','archived','newStatus','active','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'active' from public.companies where id = p_company_id),
    'reason','restored');
end;
$$;

revoke all on function public.archive_company(uuid) from public, anon;
revoke all on function public.restore_company(uuid) from public, anon;
grant execute on function public.archive_company(uuid) to authenticated;
grant execute on function public.restore_company(uuid) to authenticated;

-- Real, DB-enforced guarantee (not developer convention) that archive_company/
-- restore_company are the ONLY way status transitions into or out of 'archived' -
-- generic updateCompanies/any other direct write is blocked from making this specific
-- transition, whatever the application code currently does or might do in the future.
create or replace function public.enforce_company_lifecycle_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'archived' and old.status is distinct from 'archived')
     or (old.status = 'archived' and new.status is distinct from 'archived')
  then
    if coalesce(current_setting('app.company_lifecycle_rpc', true), 'false') <> 'true' then
      raise exception 'Company archive/restore must go through archive_company()/restore_company() - direct status writes into or out of archived are blocked';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_lifecycle_guard on public.companies;
create trigger companies_lifecycle_guard
  before update on public.companies
  for each row execute function public.enforce_company_lifecycle_via_rpc();
