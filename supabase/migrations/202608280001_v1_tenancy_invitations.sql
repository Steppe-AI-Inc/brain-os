-- SEM Brain v1 — SaaS identity, tenancy and invitations
-- Additive. Existing profile.role/company_memberships remain for compatibility while v1
-- moves authorization to organization + company scoped membership.
begin;

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists platform_role text not null default 'user'
    check (platform_role in ('user','support','platform_billing_admin','platform_admin'));

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind text not null default 'company' check (kind in ('personal','company')),
  status text not null default 'active' check (status in ('active','suspended','archived')),
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  is_sem_internal boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner','admin','manager','member','guest')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member'
    check (role in ('admin','manager','member','guest')),
  token_hash text not null unique,
  invited_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by_profile_id uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.companies
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

alter table public.people
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists employment_status text not null default 'active'
    check (employment_status in ('candidate','active','leave','terminated','former')),
  add column if not exists employment_type text,
  add column if not exists role_level int not null default 1,
  add column if not exists joined_at date,
  add column if not exists left_at date;

create index if not exists organizations_owner_idx on public.organizations(owner_profile_id);
create index if not exists organization_memberships_profile_idx on public.organization_memberships(profile_id, active);
create index if not exists organization_memberships_org_idx on public.organization_memberships(organization_id, active);
create index if not exists organization_invitations_email_idx on public.organization_invitations(lower(email), expires_at desc);
create index if not exists companies_organization_idx on public.companies(organization_id);
create index if not exists people_organization_idx on public.people(organization_id);

create or replace function public.current_platform_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select platform_role from public.profiles where auth_user_id = auth.uid() limit 1), 'user');
$$;

create or replace function public.has_organization_access(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships om
    join public.profiles p on p.id = om.profile_id
    where p.auth_user_id = auth.uid()
      and om.organization_id = oid
      and om.active = true
  );
$$;

create or replace function public.organization_role(oid uuid) returns text
language sql stable security definer set search_path = public as $$
  select om.role
  from public.organization_memberships om
  join public.profiles p on p.id = om.profile_id
  where p.auth_user_id = auth.uid()
    and om.organization_id = oid
    and om.active = true
  limit 1;
$$;

create or replace function public.can_manage_organization(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.organization_role(oid) in ('owner','admin'), false);
$$;

create or replace function public.can_manage_organization_people(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.organization_role(oid) in ('owner','admin','manager'), false);
$$;

create or replace function public.is_platform_billing_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_platform_role() in ('platform_billing_admin','platform_admin');
$$;

-- Tenant owners/admins can access all companies in their workspace; other users retain
-- explicit company membership. This helper should replace broad global-role bypasses in v1.
create or replace function public.has_company_access_v1(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    where c.id = cid
      and c.organization_id is not null
      and public.can_manage_organization(c.organization_id)
  )
  or exists (
    select 1 from public.company_memberships cm
    join public.profiles p on p.id = cm.profile_id
    where p.auth_user_id = auth.uid()
      and cm.company_id = cid
      and cm.active = true
  );
$$;

-- Create a tenant from the authenticated platform account. This avoids the bootstrap
-- problem where a user cannot insert their first owner membership under RLS.
create or replace function public.create_organization(
  p_name text,
  p_kind text default 'company'
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  pid uuid;
  oid uuid;
  base_slug text;
  final_slug text;
begin
  pid := public.current_profile_id();
  if pid is null then raise exception 'authentication required'; end if;
  if p_kind not in ('personal','company') then raise exception 'invalid organization kind'; end if;
  if length(trim(p_name)) < 2 then raise exception 'organization name is required'; end if;

  base_slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then base_slug := 'workspace'; end if;
  final_slug := left(base_slug, 38) || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);

  insert into public.organizations(name, slug, kind, owner_profile_id, created_by_profile_id)
  values (trim(p_name), final_slug, p_kind, pid, pid)
  returning id into oid;

  insert into public.organization_memberships(organization_id, profile_id, role, active)
  values (oid, pid, 'owner', true);

  return oid;
end;
$$;

-- Public signup: create/link a platform profile and personal workspace. It never grants
-- access to SEM's organizations. Existing pre-created profile rows can be linked by email.
create or replace function public.handle_v1_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  pid uuid;
  oid uuid;
  display_name text;
  personal_slug text;
begin
  display_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), split_part(coalesce(new.email,''),'@',1), 'Brain OS User');

  insert into public.profiles(auth_user_id, full_name, email, role, platform_role, active)
  values (new.id, display_name, new.email, 'employee', 'user', true)
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        full_name = coalesce(nullif(public.profiles.full_name,''), excluded.full_name),
        active = true
    where public.profiles.auth_user_id is null;

  select id into pid from public.profiles where auth_user_id = new.id limit 1;
  if pid is null then return new; end if;

  if not exists (select 1 from public.organization_memberships where profile_id = pid and active = true) then
    personal_slug := 'personal-' || replace(left(new.id::text, 18), '-', '');
    insert into public.organizations(name, slug, kind, owner_profile_id, created_by_profile_id)
    values (display_name || '''s Workspace', personal_slug, 'personal', pid, pid)
    returning id into oid;

    insert into public.organization_memberships(organization_id, profile_id, role, active)
    values (oid, pid, 'owner', true);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_sem_brain_v1 on auth.users;
create trigger on_auth_user_created_sem_brain_v1
after insert on auth.users
for each row execute function public.handle_v1_new_auth_user();

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text default 'member',
  p_expires_hours int default 168
) returns table(invitation_id uuid, raw_token text)
language plpgsql security definer
set search_path = public
as $$
declare
  pid uuid;
  token text;
  iid uuid;
begin
  pid := public.current_profile_id();
  if pid is null or not public.can_manage_organization(p_organization_id) then
    raise exception 'not authorized to invite members';
  end if;
  if p_role not in ('admin','manager','member','guest') then raise exception 'invalid role'; end if;

  token := encode(gen_random_bytes(32), 'hex');
  insert into public.organization_invitations(
    organization_id, email, role, token_hash, invited_by_profile_id, expires_at
  ) values (
    p_organization_id, lower(trim(p_email)), p_role,
    encode(digest(token, 'sha256'), 'hex'), pid,
    now() + make_interval(hours => greatest(1, p_expires_hours))
  ) returning id into iid;

  return query select iid, token;
end;
$$;

create or replace function public.accept_organization_invitation(p_raw_token text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  pid uuid;
  pemail text;
  inv public.organization_invitations%rowtype;
begin
  pid := public.current_profile_id();
  if pid is null then raise exception 'authentication required'; end if;
  select lower(email) into pemail from public.profiles where id = pid;

  select * into inv
  from public.organization_invitations
  where token_hash = encode(digest(p_raw_token, 'sha256'), 'hex')
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  limit 1;

  if inv.id is null then raise exception 'invalid or expired invitation'; end if;
  if lower(inv.email) <> pemail then raise exception 'invitation email does not match signed-in account'; end if;

  insert into public.organization_memberships(organization_id, profile_id, role, active)
  values (inv.organization_id, pid, inv.role, true)
  on conflict (organization_id, profile_id) do update set role = excluded.role, active = true;

  update public.organization_invitations
  set accepted_by_profile_id = pid, accepted_at = now()
  where id = inv.id and accepted_at is null;

  return inv.organization_id;
end;
$$;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations for select
using (public.has_organization_access(id));

drop policy if exists "organizations_update_owner_admin" on public.organizations;
create policy "organizations_update_owner_admin" on public.organizations for update
using (public.can_manage_organization(id)) with check (public.can_manage_organization(id));

-- First organization creation goes through create_organization() so membership and org are atomic.
drop policy if exists "organizations_insert_direct" on public.organizations;
create policy "organizations_insert_direct" on public.organizations for insert
with check (false);

drop policy if exists "organization_memberships_select_scope" on public.organization_memberships;
create policy "organization_memberships_select_scope" on public.organization_memberships for select
using (profile_id = public.current_profile_id() or public.can_manage_organization(organization_id));

drop policy if exists "organization_memberships_write_owner_admin" on public.organization_memberships;
create policy "organization_memberships_write_owner_admin" on public.organization_memberships for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "organization_invitations_select_owner_admin" on public.organization_invitations;
create policy "organization_invitations_select_owner_admin" on public.organization_invitations for select
using (public.can_manage_organization(organization_id));

revoke all on function public.create_organization(text,text) from public;
grant execute on function public.create_organization(text,text) to authenticated;
revoke all on function public.create_organization_invitation(uuid,text,text,int) from public;
grant execute on function public.create_organization_invitation(uuid,text,text,int) to authenticated;
revoke all on function public.accept_organization_invitation(text) from public;
grant execute on function public.accept_organization_invitation(text) to authenticated;

commit;
