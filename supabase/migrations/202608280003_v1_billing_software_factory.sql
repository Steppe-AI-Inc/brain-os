-- SEM Brain v1 — prepaid AI service billing + real Software Factory orchestration state
begin;

-- -----------------------------------------------------------------------------
-- BILLING / AI ECONOMICS
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

-- Customer-visible usage. Provider cost/margin is separated so tenant owners cannot
-- infer SEM Brain's supplier economics unless explicitly authorized as platform billing.
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
  gross_margin numeric(18,6) not null default 0
);

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

create table if not exists public.partner_referral_earnings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  program_name text not null,
  external_ref text,
  amount numeric(18,6) not null default 0,
  currency text not null default 'USD',
  status text not null default 'reported' check (status in ('reported','approved','paid','rejected')),
  period_start date,
  period_end date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_org_created_idx on public.ai_usage_events(organization_id, created_at desc);
create index if not exists ledger_account_created_idx on public.service_credit_ledger(billing_account_id, created_at desc);

-- Every organization receives a billing account; existing orgs are backfilled.
insert into public.billing_accounts(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create or replace function public.create_billing_account_for_organization()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.billing_accounts(organization_id) values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organization_create_billing_account on public.organizations;
create trigger organization_create_billing_account
after insert on public.organizations
for each row execute function public.create_billing_account_for_organization();

create or replace function public.billing_balance(p_account_id uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  oid uuid;
  result numeric;
begin
  select organization_id into oid from public.billing_accounts where id = p_account_id;
  if oid is null then raise exception 'billing account not found'; end if;
  if not public.can_manage_organization(oid) and not public.is_platform_billing_admin() then
    raise exception 'not authorized';
  end if;
  select coalesce(sum(amount),0) into result
  from public.service_credit_ledger where billing_account_id = p_account_id;
  return result;
end;
$$;

create or replace function public.enforce_append_only_service_credit_ledger()
returns trigger language plpgsql as $$
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
declare
  curr text;
begin
  select currency into curr from public.billing_accounts where id = new.billing_account_id;
  insert into public.service_credit_ledger(
    billing_account_id, organization_id, entry_type, amount, currency, usage_event_id, reference
  ) values (
    new.billing_account_id, new.organization_id, 'usage', -abs(new.customer_charge), coalesce(curr,'USD'), new.id,
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
-- SOFTWARE FACTORY
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
    (p_run_id,'architecture',30,'["system boundaries defined","security and RLS model defined"]'),
    (p_run_id,'schema',40,'["migration designed","rollback documented"]'),
    (p_run_id,'ux',50,'["critical user flows defined","mobile behavior defined"]'),
    (p_run_id,'tickets',60,'["atomic implementation tickets created"]'),
    (p_run_id,'repository_provision',65,'["isolated repository or branch exists","secrets excluded"]'),
    (p_run_id,'implementation',70,'["coding-agent commits exist","changes match PRD"]'),
    (p_run_id,'unit_integration_tests',80,'["unit tests pass","integration tests pass"]'),
    (p_run_id,'rls_security_tests',90,'["cross-tenant access denied","restricted fields denied"]'),
    (p_run_id,'browser_tests',100,'["critical Playwright flows pass","mobile flows pass"]'),
    (p_run_id,'preview_deploy',110,'["Vercel preview available"]'),
    (p_run_id,'autonomous_qa',120,'["acceptance criteria verified against preview"]'),
    (p_run_id,'release_approval',130,'["authorized human approves immutable release payload"]'),
    (p_run_id,'release',140,'["release completed","post-release verification passed"]')
  on conflict (run_id, stage_key) do nothing;
end;
$$;

create or replace function public.create_software_factory_run(
  p_organization_id uuid,
  p_company_id uuid,
  p_title text,
  p_problem_statement text,
  p_template_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  rid uuid;
begin
  pid := public.current_profile_id();
  if pid is null or not public.can_manage_organization_people(p_organization_id) then
    raise exception 'not authorized to start software factory';
  end if;
  if p_company_id is not null and not exists(
    select 1 from public.companies c where c.id = p_company_id and c.organization_id = p_organization_id
  ) then raise exception 'company is outside organization'; end if;

  insert into public.software_factory_runs(
    organization_id, company_id, requested_by_profile_id, title, problem_statement, template_key
  ) values (
    p_organization_id, p_company_id, pid, trim(p_title), trim(p_problem_statement), p_template_key
  ) returning id into rid;

  perform public.seed_software_factory_stages(rid);
  return rid;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.billing_accounts enable row level security;
alter table public.billing_deposits enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_private enable row level security;
alter table public.service_credit_ledger enable row level security;
alter table public.partner_referral_earnings enable row level security;
alter table public.software_factory_runs enable row level security;
alter table public.software_factory_stages enable row level security;

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

drop policy if exists "ai_usage_private_platform_billing" on public.ai_usage_private;
create policy "ai_usage_private_platform_billing" on public.ai_usage_private for select
using (public.is_platform_billing_admin());

drop policy if exists "partner_referral_platform_billing" on public.partner_referral_earnings;
create policy "partner_referral_platform_billing" on public.partner_referral_earnings for select
using (public.is_platform_billing_admin());

-- Deposit settlement, usage posting, private provider costs, ledger credits/debits and
-- referral earnings intentionally have no authenticated-client INSERT/UPDATE policy.
-- Trusted payment/provider webhooks or server-side service functions own those writes.

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

revoke all on function public.billing_balance(uuid) from public;
grant execute on function public.billing_balance(uuid) to authenticated;
revoke all on function public.seed_software_factory_stages(uuid) from public;
grant execute on function public.seed_software_factory_stages(uuid) to authenticated;
revoke all on function public.create_software_factory_run(uuid,uuid,text,text,text) from public;
grant execute on function public.create_software_factory_run(uuid,uuid,text,text,text) to authenticated;

commit;
