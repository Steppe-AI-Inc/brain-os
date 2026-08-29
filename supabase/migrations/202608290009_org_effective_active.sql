-- Org effective-active propagation (Bug 6, quiet-wiggling-biscuit plan Workstream 2a).
--
-- Root problem (confirmed live): archiving a parent company/business-unit does not touch
-- any child row's status. No view/function anywhere computes "effectively active" (child
-- active AND every ancestor active) - confirmed absent in archive_company/restore_company,
-- company_relationships, validate_organization_graph(), the People-page employer picker,
-- and sem-ai-command's buildContext().
--
-- Verified live against the real schema before writing this (not trusted verbatim from
-- the plan's starting-point SQL): public.company_relationship_type is exactly
-- ('parent_of','owned_by_percentage','business_unit_of','brand_of','subsidiary_of',
-- 'department_of') and public.relationship_state is exactly
-- ('current','planned','historical','under_restructuring') - matches the plan's SQL
-- verbatim, no drift found. DIRECTION MATTERS confirmed against both existing DB logic
-- (validate_organization_graph's ownershipOver100/hierarchyCycles checks,
-- set_company_relationship's own test fixtures in
-- qa/scenarios-runner/organization_graph_integrity.sql) and the sem-ai-command system
-- prompt's own explicit rule (supabase/functions/sem-ai-command/index.ts:414-421): for
-- "parent_of", company_id is the PARENT/owner and related_company_id is the child/owned;
-- for "business_unit_of"/"brand_of"/"subsidiary_of"/"department_of", company_id is the
-- SUBORDINATE one and related_company_id is the container/parent. The plan's recursive
-- CTE already encodes this correctly - reused verbatim below. companies.status filter
-- ('active','planning','paused') matches web/lib/data/companies.ts's existing
-- getCompaniesForSelection() row-status-only filter exactly (verified live), so
-- get_effectively_active_companies() is a drop-in same-shape replacement per the plan's
-- 2b (not part of this gated migration - application-code wiring is NOT gated and is out
-- of this DB/Security Engineer's scope; this migration only adds the new DB primitives).

create or replace function public.is_company_effectively_active(p_company_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_result boolean;
begin
  -- parent_of reverses direction relative to business_unit_of/brand_of/subsidiary_of/
  -- department_of (same DIRECTION MATTERS rule already documented in the system prompt).
  with recursive up(id) as (
    select p_company_id
    union
    select case when r.relationship_type = 'parent_of' then r.company_id else r.related_company_id end
    from public.company_relationships r
    join up on (
      (r.relationship_type = 'parent_of' and r.related_company_id = up.id)
      or (r.relationship_type in ('business_unit_of','brand_of','subsidiary_of','department_of') and r.company_id = up.id)
    )
    where r.state = 'current'
  )
  select coalesce(bool_and(c.status = 'active'), true) into v_result
  from public.companies c where c.id in (select id from up);
  return v_result;
end; $$;

create or replace function public.get_effectively_active_companies()
returns table(id uuid, name text, status text)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.status from public.companies c
  where c.status in ('active','planning','paused') and public.is_company_effectively_active(c.id)
  order by c.name;
$$;

revoke all on function public.is_company_effectively_active(uuid) from public, anon;
revoke all on function public.get_effectively_active_companies() from public, anon;
grant execute on function public.is_company_effectively_active(uuid) to authenticated;
grant execute on function public.get_effectively_active_companies() to authenticated;

-- No separate view - a view would duplicate the recursion logic for no benefit when
-- every consumer wants a single boolean or a filtered row set (per the plan).

-- Wire into validate_organization_graph() as a new archivedAncestorActive check, same
-- jsonb_agg/clean pattern as its existing checks. Reproduced in full (CREATE OR REPLACE
-- requires the whole function body) with exactly one new key added to the result object
-- and to the `clean` computation - every other check byte-for-byte unchanged from
-- 202608280013_frictionless_company_delete.sql.
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
    ),
    -- NEW: a company whose own status reads active-ish but sits under an archived
    -- ancestor - the exact "archived business unit still reads as active employer"
    -- defect (Bug 6). A company that is itself already 'archived'/'closed' is not
    -- flagged here (it's already correctly non-active on its own status).
    'archivedAncestorActive', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status)), '[]'::jsonb)
      from public.companies c
      where c.status in ('active','planning','paused')
        and (p_company_id is null or c.id = p_company_id)
        and not public.is_company_effectively_active(c.id)
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
      and jsonb_array_length(v_result->'archivedAncestorActive') = 0
  );

  return v_result;
end;
$$;
