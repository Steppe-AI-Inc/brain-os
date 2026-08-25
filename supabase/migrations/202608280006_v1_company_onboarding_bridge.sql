-- SEM Brain v1 — company onboarding bridge
-- Lets existing founder/company data be adopted into a v1 organization and lets a public
-- SaaS workspace create its first real company without relying on legacy global roles.
begin;

create or replace function public.create_company_in_organization(
  p_organization_id uuid,
  p_name text,
  p_country text default null,
  p_description text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  pid uuid;
  cid uuid;
begin
  pid := public.current_profile_id();
  if pid is null or not public.can_manage_organization(p_organization_id) then
    raise exception 'not authorized to create company in organization';
  end if;
  if length(trim(p_name)) < 2 then raise exception 'company name is required'; end if;

  insert into public.companies(name,country,description,organization_id,status)
  values (trim(p_name),nullif(trim(coalesce(p_country,'')),''),nullif(trim(coalesce(p_description,'')),''),p_organization_id,'active')
  returning id into cid;

  insert into public.company_memberships(company_id,profile_id,role_in_company,active)
  values (cid,pid,'owner',true)
  on conflict (company_id,profile_id) do update set role_in_company='owner', active=true;

  return cid;
end;
$$;

-- Adopt an existing pre-v1 company into a workspace the caller owns/administers. Caller
-- must already be authorized for the legacy company, so a new SaaS user cannot "claim"
-- someone else's unassigned company. People assigned to that company are bridged too.
create or replace function public.adopt_legacy_company(
  p_organization_id uuid,
  p_company_id uuid,
  p_include_people boolean default true
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  existing_org uuid;
begin
  if not public.can_manage_organization(p_organization_id) then
    raise exception 'not authorized to manage organization';
  end if;
  if not public.has_company_access(p_company_id) then
    raise exception 'caller does not have legacy company access';
  end if;

  select organization_id into existing_org from public.companies where id = p_company_id for update;
  if existing_org is not null and existing_org is distinct from p_organization_id then
    raise exception 'company already belongs to another organization';
  end if;

  update public.companies set organization_id = p_organization_id, updated_at = now()
  where id = p_company_id;

  if p_include_people then
    update public.people
    set organization_id = p_organization_id, updated_at = now()
    where company_id = p_company_id and organization_id is null;
  end if;

  return p_company_id;
end;
$$;

-- For v1-aware rows, use organization authorization. Legacy unadopted rows continue to
-- use the existing access helper until they are migrated; this avoids locking the founder
-- out during staged rollout while preventing tenant rows from inheriting global-role access.
create or replace function public.has_company_access_v1(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when c.organization_id is not null then
      public.can_manage_organization(c.organization_id)
      or exists (
        select 1 from public.company_memberships cm
        join public.profiles p on p.id = cm.profile_id
        where p.auth_user_id = auth.uid()
          and cm.company_id = c.id
          and cm.active = true
      )
    else public.has_company_access(c.id)
  end
  from public.companies c
  where c.id = cid;
$$;

revoke all on function public.create_company_in_organization(uuid,text,text,text) from public;
grant execute on function public.create_company_in_organization(uuid,text,text,text) to authenticated;
revoke all on function public.adopt_legacy_company(uuid,uuid,boolean) from public;
grant execute on function public.adopt_legacy_company(uuid,uuid,boolean) to authenticated;

commit;
