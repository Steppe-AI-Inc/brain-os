-- SECURITY FIX — BUG-004 follow-on, invite-only signup (founder decision, 2026-08-31).
--
-- Prior state (closed by 202608310008, but the underlying model was still wrong):
-- handle_new_auth_user() granted every new Supabase auth account a real, active
-- role='employee' profile immediately - AUTH ACCOUNT EXISTS implied ACTIVE EMPLOYMENT
-- implied (before 202608310008) WORKSPACE ACCESS. The founder's explicit decision:
-- these must be separate concepts. Creating an auth user must never automatically grant
-- employee access, company membership, or any Brain OS authority.
--
-- New model: auth identity -> pending/unbound (active=false, zero company_memberships)
-- -> invite/membership validation (accept_company_invitation, SECURITY DEFINER, binds
-- EXACTLY the company_id/role the inviter specified server-side - never a client-
-- supplied value) -> authorized workspace/company access.
--
-- Invitations are: tied to an exact company (company_id not null), tied to an intended
-- email, single-use (accepted_at/status transition, a unique partial index blocks a
-- second live invite for the same email+company while one is still pending), expiring
-- (expires_at, default 7 days), revocable (status='revoked'), role-scoped (invited_role,
-- constrained to the same real app_role values as profiles.role), auditable
-- (invited_by_profile_id, accepted_by_profile_id, created_at, accepted_at).

begin;

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  invited_role text not null default 'employee' check (invited_role in (
    'holding_admin', 'hr_finance', 'company_manager', 'team_lead', 'employee', 'contractor', 'investor_viewer'
  )),
  -- Opaque, single-use, unguessable token - the ONLY thing a signup flow ever presents
  -- back to accept_company_invitation(). Never the row id (sequential-ish UUIDs are not
  -- meant to double as bearer tokens) and never the email alone (guessable).
  token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_profile_id uuid references public.profiles(id),
  accepted_by_profile_id uuid references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (token)
);

-- Single-use enforcement, real: at most one live (pending, unexpired) invitation per
-- email+company at a time - re-inviting the same person replaces the old row's
-- usefulness rather than letting two valid tokens exist simultaneously for one target.
create unique index if not exists company_invitations_one_pending_per_email_company
  on public.company_invitations (company_id, email)
  where status = 'pending';

create index if not exists company_invitations_token_idx on public.company_invitations (token) where status = 'pending';

alter table public.company_invitations enable row level security;

-- Founder/admin or a manager of the target company may create/view/revoke invitations
-- for that company - never a bare employee. The token itself is never selectable by a
-- browser session at all (accept_company_invitation reads it via SECURITY DEFINER, not
-- a client SELECT) - RLS here governs management visibility, not token redemption.
drop policy if exists "company_invitations_manage_scope" on public.company_invitations;
create policy "company_invitations_manage_scope" on public.company_invitations for all using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
) with check (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- Real, canonical creation path - never a raw client INSERT into company_invitations
-- (the RLS above already restricts who could, but a single narrow RPC keeps the
-- token-generation/expiry defaults authoritative in one place).
create or replace function public.create_company_invitation(
  p_company_id uuid,
  p_email text,
  p_invited_role text default 'employee'
) returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if not (public.is_founder_or_admin() or public.is_company_manager(p_company_id)) then
    raise exception 'not authorized to invite members to this company';
  end if;
  return query
  insert into public.company_invitations (company_id, email, invited_role, invited_by_profile_id)
  values (p_company_id, lower(trim(p_email)), coalesce(p_invited_role, 'employee'), public.current_profile_id())
  on conflict (company_id, email) where status = 'pending'
  do update set invited_role = excluded.invited_role, expires_at = now() + interval '7 days', token = encode(extensions.gen_random_bytes(32), 'hex')
  returning company_invitations.id, company_invitations.token, company_invitations.expires_at;
end;
$$;

revoke all on function public.create_company_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_company_invitation(uuid, text, text) to authenticated;

-- Real, canonical acceptance path. SECURITY DEFINER because an unbound/inert new
-- profile has no company_memberships row yet and thus no RLS access to write one
-- itself - this function is the one narrow, audited gate that grants it, and grants
-- EXACTLY the company_id/invited_role read from the stored invitation row, never a
-- caller-supplied value (the function signature deliberately takes no company_id/role
-- parameter at all - client payload manipulation cannot change the outcome).
create or replace function public.accept_company_invitation(p_token text)
returns table (company_id uuid, role text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invitation public.company_invitations%rowtype;
  v_profile_id uuid;
  v_caller_email text;
begin
  select * into v_invitation from public.company_invitations
  where token = p_token and status = 'pending'
  for update;

  if not found then
    raise exception 'invitation not found or already used';
  end if;

  if v_invitation.expires_at < now() then
    update public.company_invitations set status = 'expired' where id = v_invitation.id;
    raise exception 'invitation expired';
  end if;

  select p.id, p.email into v_profile_id, v_caller_email
  from public.profiles p where p.auth_user_id = auth.uid();

  if v_profile_id is null then
    raise exception 'no profile bound to the current auth session';
  end if;

  if lower(v_caller_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was issued to a different email address';
  end if;

  update public.profiles set role = v_invitation.invited_role::public.app_role, active = true, updated_at = now()
  where id = v_profile_id;

  insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values (v_invitation.company_id, v_profile_id, v_invitation.invited_role, true)
  on conflict (company_id, profile_id) do update set active = true;

  update public.company_invitations
  set status = 'accepted', accepted_at = now(), accepted_by_profile_id = v_profile_id
  where id = v_invitation.id;

  return query select v_invitation.company_id, v_invitation.invited_role;
end;
$$;

revoke all on function public.accept_company_invitation(text) from public, anon;
grant execute on function public.accept_company_invitation(text) to authenticated;

-- The trigger itself: a brand-new self-signup lands genuinely inert now
-- (active=false, zero company_memberships) regardless of invite status - workspace
-- access is granted ONLY by accept_company_invitation(), never as a signup side effect.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (auth_user_id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'employee',
    false
  )
  on conflict (email) do update set auth_user_id = excluded.auth_user_id
  where public.profiles.auth_user_id is null;
  return new;
end;
$$;

commit;
