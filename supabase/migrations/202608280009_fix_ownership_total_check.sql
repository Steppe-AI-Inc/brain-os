-- Real bug found by running the QA regression script written to cover this exact
-- migration (qa/scenarios-runner/organization_graph_integrity.sql), before it was ever
-- relied on: check_company_relationship_integrity()'s ownership-sum guard checked
-- relationship_type = 'owned_by_percentage', but that type always has related_company_id
-- NULL (it's for an individual's personal stake, not company-to-company ownership) - so
-- the branch was dead code and could never fire. The real convention for company-to-
-- company ownership is 'parent_of' + ownership_pct (confirmed against production: SEM
-- LLC's 100% ownership of SEM Global Robotics Technologies is recorded exactly this
-- way). It also grouped the sum by the wrong column (company_id, one specific owner)
-- instead of related_company_id (the owned company, whose total across ALL owners must
-- stay <=100%). Both fixed; verified in a rolled-back transaction against production
-- before this push: a second owner taking the company over 100% is now rejected, while
-- topping out at exactly 100% across two owners is correctly allowed.

create or replace function public.check_company_relationship_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cyclic boolean;
begin
  if new.state = 'current' and new.related_company_id is not null then
    if new.relationship_type = 'parent_of' and new.ownership_pct is not null then
      if (
        select coalesce(sum(ownership_pct), 0)
        from public.company_relationships
        where related_company_id = new.related_company_id
          and relationship_type = 'parent_of'
          and state = 'current'
          and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) + new.ownership_pct > 100 then
        raise exception 'Total current ownership of company % would exceed 100%%', new.related_company_id;
      end if;
    end if;

    if new.relationship_type in ('parent_of', 'business_unit_of', 'brand_of', 'subsidiary_of', 'department_of') then
      with recursive ancestors as (
        select company_id as id from public.company_relationships
        where related_company_id = new.company_id
          and state = 'current'
          and relationship_type in ('parent_of', 'business_unit_of', 'brand_of', 'subsidiary_of', 'department_of')
        union
        select r.company_id from public.company_relationships r
        join ancestors a on r.related_company_id = a.id
        where r.state = 'current'
          and r.relationship_type in ('parent_of', 'business_unit_of', 'brand_of', 'subsidiary_of', 'department_of')
      )
      select exists(select 1 from ancestors where id = new.related_company_id) into cyclic;
      if cyclic or new.company_id = new.related_company_id then
        raise exception 'This relationship would create a cycle in the organization hierarchy';
      end if;
    end if;
  end if;
  return new;
end;
$$;
