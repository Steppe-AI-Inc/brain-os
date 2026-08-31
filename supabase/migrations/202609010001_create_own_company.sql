-- Overnight multi-org milestone, Priority 1 — "employee creates their own company" as a
-- first-class supported scenario (founder's explicit requirement).
--
-- companies_insert_admin (202608??) currently requires is_founder_or_admin() - an
-- ordinary employee cannot create ANY company today, blocking this scenario entirely.
-- Rather than loosening that RLS policy (which would need broader review of every other
-- INSERT-time invariant on companies), this is a narrow, real, canonical RPC: any
-- authenticated profile may create a new company and becomes its sole owner - nothing
-- about their existing employment elsewhere changes, and nothing about the new
-- company grants anyone else access.
--
-- Explicit non-goals, matching the founder's exact "NOT" list:
--   - the new company does NOT become a subsidiary/business-unit of any employer
--     (no company_relationships row is created);
--   - the creator's employer's admins do NOT automatically gain access (no membership
--     is granted to anyone but the creator);
--   - existing employer company_memberships are NOT copied, touched, or referenced.

begin;

create or replace function public.create_own_company(
  p_name text,
  p_organization_type text default 'legal_entity',
  p_country text default null,
  p_legal_entity_name text default null
) returns table (id uuid, name text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
begin
  if v_profile_id is null then
    raise exception 'no profile bound to the current auth session';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'company name is required';
  end if;

  insert into public.companies (name, organization_type, country, legal_entity_name, created_by_profile_id, status)
  values (trim(p_name), coalesce(p_organization_type, 'legal_entity'), p_country, p_legal_entity_name, v_profile_id, 'active')
  returning companies.id into v_company_id;

  -- The creator becomes the sole owner of exactly this one company - matches
  -- is_company_manager()'s own real role_in_company vocabulary ('owner','manager',
  -- 'team_lead'), so ordinary manager-scoped authority (edit the company, manage its
  -- own memberships/departments/projects) works immediately without any extra grant.
  insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values (v_company_id, v_profile_id, 'owner', true);

  return query select companies.id, companies.name from public.companies where companies.id = v_company_id;
end;
$$;

revoke all on function public.create_own_company(text, text, text, text) from public, anon;
grant execute on function public.create_own_company(text, text, text, text) to authenticated;

commit;
