-- Master-prompt spec §19-20: a reusable validateOrganizationGraph() the founder can
-- invoke by name ("check SEM LLC structure and fix inconsistent company references").
-- Read-only, founder/admin gated. The write-time trigger (202608280006/09) already
-- blocks NEW cycles/over-ownership going forward; this audits committed state for the
-- same invariants plus classes the trigger can't see (duplicate names, business units
-- with no parent edge, people with no company, relationships left 'planned' too long).
create or replace function public.validate_organization_graph(p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
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

grant execute on function public.validate_organization_graph(uuid) to authenticated;
