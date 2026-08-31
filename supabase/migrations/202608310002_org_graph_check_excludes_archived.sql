-- Real gap found and fixed 2026-08-31, while reconciling a dormant fixture flagged by an
-- earlier independent verifier: validate_organization_graph()'s businessUnitsWithoutParentEdge
-- check has NO status filter at all - it flags ANY non-legal-entity company with no parent
-- relationship, including one that has already been correctly archived via archive_company().
-- Confirmed live: archiving the flagged fixture (QA-LIFECYCLE-BU) did not clear the warning,
-- because this specific sub-check never considered status in the first place - a real
-- false-positive integrity signal for any archived business unit going forward, not just
-- this one fixture.
--
-- Minimal, surgical fix: add `and c.status <> 'archived'` to this one sub-check only. Every
-- other sub-check in this function is left untouched - this migration does not attempt a
-- broader audit of the whole integrity checker, only the specific gap actually found and
-- verified live.

begin;

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
        and c.status <> 'archived'
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

commit;
