-- SEM Brain v1 platform core
-- Additive migration: SaaS tenancy, invitations, role knowledge/certification,
-- person AI assistants, communication automation, prepaid service-credit billing,
-- and a real software-factory execution lifecycle.
--
-- IMPORTANT:
-- * This migration is intentionally additive and does not drop legacy v0.7 tables.
-- * Existing global profile.role remains for backwards compatibility, but v1 authorization
--   should use organization/company memberships + explicit capabilities.
-- * Platform-admin status is NOT a generic tenant RLS bypass.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) PLATFORM IDENTITY + TENANCY
-- -----------------------------------------------------------------------------

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
    select 1
    from public.organization_memberships om
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

-- v1 company access helper. Owners/admins of the tenant can access all companies in that
-- tenant; ordinary members still require an explicit company membership.
create or replace function public.has_company_access_v1(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.companies c
    where c.id = cid
      and c.organization_id is not null
      and public.can_manage_organization(c.organization_id)
  )
  or exists (
    select 1
    from public.company_memberships cm
    join public.profiles p on p.id = cm.profile_id
    where p.auth_user_id = auth.uid()
      and cm.company_id = cid
      and cm.active = true
  );
$$;

-- Public signup bootstrap. Creates/links a profile plus a personal workspace.
-- Existing SEM accounts remain compatible; this does not attach public users to SEM orgs.
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
  if pid is null then
    return new;
  end if;

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

-- Invitation RPCs use opaque raw tokens; only hashes are persisted.
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
  if p_role not in ('admin','manager','member','guest') then
    raise exception 'invalid role';
  end if;

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
  on conflict (organization_id, profile_id) do update
    set role = excluded.role, active = true;

  update public.organization_invitations
  set accepted_by_profile_id = pid, accepted_at = now()
  where id = inv.id and accepted_at is null;

  return inv.organization_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) ROLE KNOWLEDGE PACKS + CERTIFICATION
-- -----------------------------------------------------------------------------

create table if not exists public.role_knowledge_packs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  role_title text not null,
  level int not null default 1,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','review','approved','archived')),
  required_score numeric not null default 80,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_knowledge_requirements (
  id uuid primary key default gen_random_uuid(),
  knowledge_pack_id uuid not null references public.role_knowledge_packs(id) on delete cascade,
  category text not null,
  title text not null,
  editable_source_required boolean not null default false,
  required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.role_certifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  knowledge_pack_id uuid not null references public.role_knowledge_packs(id) on delete cascade,
  level int not null default 1,
  score numeric,
  status text not null default 'assigned' check (status in ('assigned','in_progress','passed','failed','expired')),
  evidence jsonb not null default '[]'::jsonb,
  assessed_by_profile_id uuid references public.profiles(id) on delete set null,
  passed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id, knowledge_pack_id, level)
);

alter table public.documents
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists knowledge_pack_id uuid references public.role_knowledge_packs(id) on delete set null,
  add column if not exists role_title text,
  add column if not exists source_format text,
  add column if not exists editable_source_required boolean not null default false,
  add column if not exists editable_source_document_id uuid references public.documents(id) on delete set null,
  add column if not exists artifact_version int not null default 1,
  add column if not exists approval_status text not null default 'draft'
    check (approval_status in ('draft','review','approved','superseded','archived'));

create index if not exists role_knowledge_pack_org_idx on public.role_knowledge_packs(organization_id, role_title, level);
create index if not exists role_certification_person_idx on public.role_certifications(person_id, status, updated_at desc);
create index if not exists documents_knowledge_pack_idx on public.documents(knowledge_pack_id, approval_status);

-- Expand existing private artifact bucket to support editable originals such as PPT/PPTX.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/markdown','text/csv','application/json',
  'image/png','image/jpeg','image/webp'
]
where id = 'company-artifacts';

-- -----------------------------------------------------------------------------
-- 3) PAIRED EMPLOYEE AI ASSISTANTS + COMMUNICATION AUTOMATION
-- -----------------------------------------------------------------------------

create table if not exists public.assistant_automation_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  name text not null,
  mode text not null default 'draft'
    check (mode in ('manual','draft','auto_routine','fallback_after_timeout')),
  fallback_sla_minutes int not null default 60 check (fallback_sla_minutes >= 1),
  allowed_categories jsonb not null default '[]'::jsonb,
  blocked_categories jsonb not null default '["legal","finance_commitment","salary","discount","contract_signature","production_change"]'::jsonb,
  max_sensitivity visibility_level not null default 'internal',
  version int not null default 1,
  active boolean not null default true,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_ai_assistants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  policy_id uuid references public.assistant_automation_policies(id) on delete set null,
  display_name text not null,
  status text not null default 'active' check (status in ('active','paused','retired')),
  disclosure_label text not null default 'AI Assistant',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id)
);

create table if not exists public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  assigned_person_id uuid references public.people(id) on delete set null,
  assistant_id uuid references public.person_ai_assistants(id) on delete set null,
  channel text not null default 'brain',
  external_thread_ref text,
  subject text,
  status text not null default 'open' check (status in ('open','waiting_human','ai_handling','closed')),
  sensitivity visibility_level not null default 'internal',
  last_human_reply_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.communication_threads(id) on delete cascade,
  author_type text not null check (author_type in ('human','ai','external','system')),
  author_profile_id uuid references public.profiles(id) on delete set null,
  author_person_id uuid references public.people(id) on delete set null,
  assistant_id uuid references public.person_ai_assistants(id) on delete set null,
  content text not null,
  ai_disclosure boolean not null default false,
  knowledge_refs jsonb not null default '[]'::jsonb,
  automation_policy_snapshot jsonb not null default '{}'::jsonb,
  approval_id uuid references public.approvals(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_policy_org_idx on public.assistant_automation_policies(organization_id, active);
create index if not exists person_ai_assistant_org_idx on public.person_ai_assistants(organization_id, status);
create index if not exists communication_thread_assignee_idx on public.communication_threads(assigned_person_id, status, last_message_at desc);
create index if not exists communication_messages_thread_idx on public.communication_messages(thread_id, created_at);

create or replace function public.assistant_takeover_ready(p_thread_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select case
        when ap.mode = 'auto_routine' then true
        when ap.mode = 'fallback_after_timeout' then
          coalesce(ct.last_human_reply_at, ct.created_at) <= now() - make_interval(mins => ap.fallback_sla_minutes)
        else false
      end
      from public.communication_threads ct
      join public.person_ai_assistants pa on pa.id = ct.assistant_id and pa.status = 'active'
      join public.assistant_automation_policies ap on ap.id = pa.policy_id and ap.active = true
      where ct.id = p_thread_id
    ), false
  );
$$;

-- -----------------------------------------------------------------------------
-- 4) PREPAID SEM BRAIN SERVICE CREDITS + AI ECONOMICS
-- -----------------------------------------------------------------------------

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active','suspended','closed')),
  hard_stop_when_empty boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_deposits (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  external_payment_ref text unique,
  amount numeric(18,6) not null check (amount > 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending','settled','failed','refunded')),
  payment_method text,
  metadata jsonb not null default '{}'::jsonb,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Customer-visible usage. Provider internal cost is deliberately separated below.
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  provider text not null,
  model_name text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  customer_charge numeric(18,6) not null default 0 check (customer_charge >= 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_private (
  usage_event_id uuid primary key references public.ai_usage_events(id) on delete cascade,
  provider_cost numeric(18,6) not null default 0 check (provider_cost >= 0),
  gross_margin numeric(18,6) generated always as (
    (select 0::numeric)
  ) stored
);

-- PostgreSQL generated columns cannot reference another table. Replace the placeholder
-- with a normal gross_margin column maintained by a trigger.
alter table public.ai_usage_private drop column if exists gross_margin;
alter table public.ai_usage_private add column if not exists gross_margin numeric(18,6) not null default 0;

create table if not exists public.service_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_type text not null check (entry_type in ('deposit','usage','promotion','adjustment','refund')),
  amount numeric(18,6) not null,
  currency text not null default 'USD',
  deposit_id uuid unique references public.billing_deposits(id) on delete restrict,
  usage_event_id uuid unique references public.ai_usage_events(id) on delete restrict,
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_org_created_idx on public.ai_usage_events(organization_id, created_at desc);
create index if not exists ledger_account_created_idx on public.service_credit_ledger(billing_account_id, created_at desc);

create or replace function public.billing_balance(p_account_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::numeric
  from public.service_credit_ledger
  where billing_account_id = p_account_id;
$$;

create or replace function public.enforce_append_only_service_credit_ledger()
returns trigger
language plpgsql as $$
begin
  raise exception 'service_credit_ledger is append-only; post a reversing/adjustment entry instead';
end;
$$;

drop trigger if exists service_credit_ledger_no_update on public.service_credit_ledger;
create trigger service_credit_ledger_no_update
before update or delete on public.service_credit_ledger
for each row execute function public.enforce_append_only_service_credit_ledger();

create or replace function public.post_settled_deposit_credit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  oid uuid;
begin
  if new.status = 'settled' and (tg_op = 'INSERT' or old.status is distinct from 'settled') then
    select organization_id into oid from public.billing_accounts where id = new.billing_account_id;
    insert into public.service_credit_ledger(
      billing_account_id, organization_id, entry_type, amount, currency, deposit_id, reference
    ) values (
      new.billing_account_id, oid, 'deposit', new.amount, new.currency, new.id,
      coalesce(new.external_payment_ref, 'deposit:' || new.id::text)
    ) on conflict (deposit_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists billing_deposit_post_credit on public.billing_deposits;
create trigger billing_deposit_post_credit
after insert or update of status on public.billing_deposits
for each row execute function public.post_settled_deposit_credit();

create or replace function public.post_usage_debit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.service_credit_ledger(
    billing_account_id, organization_id, entry_type, amount, currency, usage_event_id, reference
  ) values (
    new.billing_account_id, new.organization_id, 'usage', -abs(new.customer_charge), 'USD', new.id,
    new.provider || ':' || new.model_name
  ) on conflict (usage_event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ai_usage_post_debit on public.ai_usage_events;
create trigger ai_usage_post_debit
after insert on public.ai_usage_events
for each row execute function public.post_usage_debit();

create or replace function public.set_usage_margin()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  charge numeric;
begin
  select customer_charge into charge from public.ai_usage_events where id = new.usage_event_id;
  new.gross_margin := coalesce(charge,0) - coalesce(new.provider_cost,0);
  return new;
end;
$$;

drop trigger if exists ai_usage_private_margin on public.ai_usage_private;
create trigger ai_usage_private_margin
before insert or update of provider_cost on public.ai_usage_private
for each row execute function public.set_usage_margin();

-- -----------------------------------------------------------------------------
-- 5) REAL SOFTWARE FACTORY ORCHESTRATION STATE
-- -----------------------------------------------------------------------------

create table if not exists public.software_factory_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  problem_statement text not null,
  template_key text,
  target_stack jsonb not null default '{"frontend":"Next.js","backend":"Supabase","deploy":"Vercel"}'::jsonb,
  repository_url text,
  preview_url text,
  status text not null default 'planning'
    check (status in ('planning','approved_to_build','building','testing','preview_ready','blocked','release_pending','released','cancelled')),
  current_stage text not null default 'product_brief',
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.software_factory_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.software_factory_runs(id) on delete cascade,
  stage_key text not null,
  sort_order int not null,
  status text not null default 'queued' check (status in ('queued','running','passed','failed','blocked','approval_required','skipped')),
  acceptance_criteria jsonb not null default '[]'::jsonb,
  artifact_document_id uuid references public.documents(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  evidence jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(run_id, stage_key)
);

create index if not exists software_factory_runs_org_idx on public.software_factory_runs(organization_id, created_at desc);
create index if not exists software_factory_stages_run_idx on public.software_factory_stages(run_id, sort_order);

create or replace function public.seed_software_factory_stages(p_run_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.software_factory_stages(run_id, stage_key, sort_order, acceptance_criteria)
  values
    (p_run_id,'product_brief',10,'["problem and target users defined","business outcome defined"]'),
    (p_run_id,'prd',20,'["functional requirements defined","acceptance criteria defined"]'),
    (p_run_id,'architecture',30,'["system boundaries defined","security/RLS model defined"]'),
    (p_run_id,'schema',40,'["migration designed","rollback documented"]'),
    (p_run_id,'ux',50,'["critical user flows defined","mobile behavior defined"]'),
    (p_run_id,'tickets',60,'["atomic implementation tickets created"]'),
    (p_run_id,'implementation',70,'["code committed on isolated branch","no secrets committed"]'),
    (p_run_id,'unit_integration_tests',80,'["unit tests pass","integration tests pass"]'),
    (p_run_id,'rls_security_tests',90,'["cross-tenant access denied","restricted fields denied"]'),
    (p_run_id,'browser_tests',100,'["critical Playwright flows pass"]'),
    (p_run_id,'preview_deploy',110,'["Vercel preview available"]'),
    (p_run_id,'autonomous_qa',120,'["acceptance criteria verified against preview"]'),
    (p_run_id,'release_approval',130,'["authorized human approves immutable release payload"]'),
    (p_run_id,'release',140,'["release completed","post-release verification passed"]')
  on conflict (run_id, stage_key) do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) RLS
-- -----------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.role_knowledge_packs enable row level security;
alter table public.role_knowledge_requirements enable row level security;
alter table public.role_certifications enable row level security;
alter table public.assistant_automation_policies enable row level security;
alter table public.person_ai_assistants enable row level security;
alter table public.communication_threads enable row level security;
alter table public.communication_messages enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.billing_deposits enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_private enable row level security;
alter table public.service_credit_ledger enable row level security;
alter table public.software_factory_runs enable row level security;
alter table public.software_factory_stages enable row level security;

-- Organizations: membership-bound. Platform admin is deliberately NOT a blanket bypass.
drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations for select
using (public.has_organization_access(id));

drop policy if exists "organizations_update_owner_admin" on public.organizations;
create policy "organizations_update_owner_admin" on public.organizations for update
using (public.can_manage_organization(id)) with check (public.can_manage_organization(id));

drop policy if exists "organizations_insert_authenticated" on public.organizations;
create policy "organizations_insert_authenticated" on public.organizations for insert
with check (auth.uid() is not null and owner_profile_id = public.current_profile_id());

-- Memberships
drop policy if exists "organization_memberships_select_scope" on public.organization_memberships;
create policy "organization_memberships_select_scope" on public.organization_memberships for select
using (profile_id = public.current_profile_id() or public.can_manage_organization(organization_id));

drop policy if exists "organization_memberships_write_owner_admin" on public.organization_memberships;
create policy "organization_memberships_write_owner_admin" on public.organization_memberships for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

-- Invitations
drop policy if exists "organization_invitations_select_owner_admin" on public.organization_invitations;
create policy "organization_invitations_select_owner_admin" on public.organization_invitations for select
using (public.can_manage_organization(organization_id));

-- Direct writes are intentionally denied; use the invitation RPCs above.

-- Role knowledge
drop policy if exists "knowledge_packs_select_member" on public.role_knowledge_packs;
create policy "knowledge_packs_select_member" on public.role_knowledge_packs for select
using (public.has_organization_access(organization_id));

drop policy if exists "knowledge_packs_write_manager" on public.role_knowledge_packs;
create policy "knowledge_packs_write_manager" on public.role_knowledge_packs for all
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

drop policy if exists "knowledge_requirements_select_member" on public.role_knowledge_requirements;
create policy "knowledge_requirements_select_member" on public.role_knowledge_requirements for select
using (exists(select 1 from public.role_knowledge_packs p where p.id = knowledge_pack_id and public.has_organization_access(p.organization_id)));

drop policy if exists "knowledge_requirements_write_manager" on public.role_knowledge_requirements;
create policy "knowledge_requirements_write_manager" on public.role_knowledge_requirements for all
using (exists(select 1 from public.role_knowledge_packs p where p.id = knowledge_pack_id and public.can_manage_organization_people(p.organization_id)))
with check (exists(select 1 from public.role_knowledge_packs p where p.id = knowledge_pack_id and public.can_manage_organization_people(p.organization_id)));

drop policy if exists "role_certifications_select_scope" on public.role_certifications;
create policy "role_certifications_select_scope" on public.role_certifications for select
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "role_certifications_write_manager" on public.role_certifications;
create policy "role_certifications_write_manager" on public.role_certifications for all
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

-- Assistant policies: members can read; only org owner/admin can change automation authority.
drop policy if exists "assistant_policies_select_member" on public.assistant_automation_policies;
create policy "assistant_policies_select_member" on public.assistant_automation_policies for select
using (public.has_organization_access(organization_id));

drop policy if exists "assistant_policies_write_owner_admin" on public.assistant_automation_policies;
create policy "assistant_policies_write_owner_admin" on public.assistant_automation_policies for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "person_ai_assistants_select_member" on public.person_ai_assistants;
create policy "person_ai_assistants_select_member" on public.person_ai_assistants for select
using (public.has_organization_access(organization_id));

drop policy if exists "person_ai_assistants_write_owner_admin" on public.person_ai_assistants;
create policy "person_ai_assistants_write_owner_admin" on public.person_ai_assistants for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

-- Threads/messages: assigned human, organization managers/owners/admins. AI/external messages
-- are expected to be inserted by trusted server/Edge functions using service credentials.
drop policy if exists "communication_threads_select_scope" on public.communication_threads;
create policy "communication_threads_select_scope" on public.communication_threads for select
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = assigned_person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "communication_threads_write_scope" on public.communication_threads;
create policy "communication_threads_write_scope" on public.communication_threads for update
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = assigned_person_id and pe.profile_id = public.current_profile_id())
)
with check (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = assigned_person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "communication_messages_select_scope" on public.communication_messages;
create policy "communication_messages_select_scope" on public.communication_messages for select
using (exists(
  select 1 from public.communication_threads ct
  where ct.id = thread_id
    and (
      public.can_manage_organization_people(ct.organization_id)
      or exists(select 1 from public.people pe where pe.id = ct.assigned_person_id and pe.profile_id = public.current_profile_id())
    )
));

drop policy if exists "communication_messages_insert_human" on public.communication_messages;
create policy "communication_messages_insert_human" on public.communication_messages for insert
with check (
  author_type = 'human'
  and author_profile_id = public.current_profile_id()
  and exists(
    select 1 from public.communication_threads ct
    where ct.id = thread_id
      and (
        public.can_manage_organization_people(ct.organization_id)
        or exists(select 1 from public.people pe where pe.id = ct.assigned_person_id and pe.profile_id = public.current_profile_id())
      )
  )
);

-- Billing: customer owners/admins can see their account, deposits, ledger and customer charges.
drop policy if exists "billing_accounts_select_owner_admin" on public.billing_accounts;
create policy "billing_accounts_select_owner_admin" on public.billing_accounts for select
using (public.can_manage_organization(organization_id));

drop policy if exists "billing_deposits_select_owner_admin" on public.billing_deposits;
create policy "billing_deposits_select_owner_admin" on public.billing_deposits for select
using (exists(select 1 from public.billing_accounts ba where ba.id = billing_account_id and public.can_manage_organization(ba.organization_id)));

drop policy if exists "ai_usage_events_select_owner_admin" on public.ai_usage_events;
create policy "ai_usage_events_select_owner_admin" on public.ai_usage_events for select
using (public.can_manage_organization(organization_id));

drop policy if exists "service_credit_ledger_select_owner_admin" on public.service_credit_ledger;
create policy "service_credit_ledger_select_owner_admin" on public.service_credit_ledger for select
using (public.can_manage_organization(organization_id));

-- Provider cost/margin is explicit platform-billing authority, not generic tenant bypass.
drop policy if exists "ai_usage_private_platform_billing" on public.ai_usage_private;
create policy "ai_usage_private_platform_billing" on public.ai_usage_private for select
using (public.is_platform_billing_admin());

-- No browser/client insert policies for usage/deposit settlement/ledger/private cost.
-- Trusted payment/provider webhooks or server functions should perform those writes.

-- Software factory
drop policy if exists "software_factory_runs_select_member" on public.software_factory_runs;
create policy "software_factory_runs_select_member" on public.software_factory_runs for select
using (public.has_organization_access(organization_id));

drop policy if exists "software_factory_runs_insert_manager" on public.software_factory_runs;
create policy "software_factory_runs_insert_manager" on public.software_factory_runs for insert
with check (
  requested_by_profile_id = public.current_profile_id()
  and public.can_manage_organization_people(organization_id)
);

drop policy if exists "software_factory_runs_update_manager" on public.software_factory_runs;
create policy "software_factory_runs_update_manager" on public.software_factory_runs for update
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

drop policy if exists "software_factory_stages_select_member" on public.software_factory_stages;
create policy "software_factory_stages_select_member" on public.software_factory_stages for select
using (exists(select 1 from public.software_factory_runs r where r.id = run_id and public.has_organization_access(r.organization_id)));

drop policy if exists "software_factory_stages_write_manager" on public.software_factory_stages;
create policy "software_factory_stages_write_manager" on public.software_factory_stages for all
using (exists(select 1 from public.software_factory_runs r where r.id = run_id and public.can_manage_organization_people(r.organization_id)))
with check (exists(select 1 from public.software_factory_runs r where r.id = run_id and public.can_manage_organization_people(r.organization_id)));

-- Grants for RPCs.
revoke all on function public.create_organization_invitation(uuid,text,text,int) from public;
grant execute on function public.create_organization_invitation(uuid,text,text,int) to authenticated;
revoke all on function public.accept_organization_invitation(text) from public;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.billing_balance(uuid) to authenticated;
grant execute on function public.assistant_takeover_ready(uuid) to authenticated;
grant execute on function public.seed_software_factory_stages(uuid) to authenticated;

commit;
