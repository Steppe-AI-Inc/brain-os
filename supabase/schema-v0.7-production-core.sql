-- SEM Brain v0.7 Production Core Schema + RLS (FIXED ORDER)
-- Fix: helper functions are created after tables so Supabase SQL Editor can run cleanly.
-- Run in Supabase SQL Editor after creating a new project.
-- Design goal: real multi-user access, employee data isolation, founder-only sensitive ownership/cash/salary, auditability.
--
-- This file already includes the fixes from:
--   supabase/migrations/202608230001_security_hardening_rls.sql (safe view security_invoker,
--     approval domains, tasks/confidential/product-write RLS narrowing)
--   supabase/migrations/202608230002_transactional_ai_command_rpc.sql (sem_execute_ai_command RPC)
-- so a fresh project bootstrapped from this single file does not start from the pre-hardening state.
-- If this project was already deployed from an earlier version of this file, run those migrations
-- instead of re-running this whole script.

create extension if not exists pgcrypto;
create extension if not exists vector;
do $$ begin
  create extension if not exists supabase_vault cascade;
exception when others then null; end $$;

-- ---------- ENUMS ----------
do $$ begin
  create type app_role as enum ('founder','holding_admin','hr_finance','company_manager','team_lead','employee','contractor','investor_viewer','ai_agent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type visibility_level as enum ('public','internal','confidential','restricted','founder_only');
exception when duplicate_object then null; end $$;
do $$ begin
  create type financial_health_status as enum ('healthy', 'watch', 'at_risk', 'unknown');
exception when duplicate_object then null; end $$;
do $$ begin
  create type work_status as enum ('draft','queued','in_progress','blocked','needs_approval','qa_review','done','rejected','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type priority_level as enum ('low','medium','high','critical');
exception when duplicate_object then null; end $$;
do $$ begin
  create type risk_level as enum ('low','medium','high','critical');
exception when duplicate_object then null; end $$;
do $$ begin
  create type approval_status as enum ('pending','approved','rejected','changes_requested','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type approval_domain as enum ('general','salary_hr','finance','legal','production','external_comms');
exception when duplicate_object then null; end $$;
do $$ begin
  create type goal_status as enum ('draft','active','paused','achieved','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type goal_kind as enum ('ephemeral','standing','routine','decision');
exception when duplicate_object then null; end $$;
do $$ begin
  create type mcp_transport as enum ('http','sse');
exception when duplicate_object then null; end $$;
do $$ begin
  create type relationship_state as enum ('current','planned','historical','under_restructuring');
exception when duplicate_object then null; end $$;
do $$ begin
  create type company_relationship_type as enum ('parent_of','owned_by_percentage');
exception when duplicate_object then null; end $$;
do $$ begin
  create type employment_type as enum ('full_time','part_time','contractor','advisor');
exception when duplicate_object then null; end $$;
do $$ begin
  create type assignment_state as enum ('current','planned','historical');
exception when duplicate_object then null; end $$;

-- ---------- CORE TABLES ----------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique,
  role app_role not null default 'employee',
  active boolean not null default true,
  default_company_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  legal_entity_name text,
  status text default 'active',
  description text,
  strategic_priority int default 5,
  risk_score int default 0,
  is_seed_data boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sensitive ownership/cash is separated because RLS is row-level, not column-level.
create table if not exists public.company_sensitive (
  company_id uuid primary key references public.companies(id) on delete cascade,
  parent_company_id uuid references public.companies(id),
  owner_profile_id uuid references public.profiles(id),
  cash_balance numeric default 0,
  revenue_monthly numeric default 0,
  ownership_notes text,
  investor_notes text,
  visibility visibility_level default 'founder_only',
  updated_at timestamptz default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_in_company text not null default 'member', -- owner, manager, team_lead, employee, contractor, viewer
  active boolean default true,
  created_at timestamptz default now(),
  unique(company_id, profile_id)
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  full_name text not null,
  email text,
  role_title text,
  responsibilities text,
  manager_person_id uuid references public.people(id),
  ai_manager_agent_id uuid,
  performance_score int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.salary_private (
  person_id uuid primary key references public.people(id) on delete cascade,
  base_salary numeric default 0,
  currency text default 'USD',
  compensation_notes text,
  visibility visibility_level default 'restricted',
  updated_at timestamptz default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  goal text,
  owner_person_id uuid references public.people(id),
  status text default 'active',
  deadline date,
  blockers text,
  risk_score int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  description text,
  skills jsonb default '[]'::jsonb,
  allowed_tools jsonb default '[]'::jsonb,
  forbidden_actions jsonb default '[]'::jsonb,
  cost_limit_usd numeric default 1.00,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  parent_task_id uuid references public.tasks(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text,
  parent_goal text,
  owner_type text not null default 'human', -- human or agent
  owner_person_id uuid references public.people(id),
  owner_agent_id uuid references public.agents(id),
  input jsonb default '{}'::jsonb,
  expected_output jsonb default '{}'::jsonb,
  acceptance_criteria jsonb default '[]'::jsonb,
  test_method jsonb default '[]'::jsonb,
  status work_status default 'queued',
  priority priority_level default 'medium',
  risk_level risk_level default 'low',
  approval_required boolean default false,
  deadline timestamptz,
  source text,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  fact text not null,
  source_type text,
  source_id uuid,
  confidence numeric default 0.8,
  sensitivity visibility_level default 'internal',
  review_date date,
  embedding vector(1536),
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists memories_embedding_hnsw_idx on public.memories using hnsw (embedding vector_cosine_ops);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  title text not null,
  category text,
  storage_path text,
  mime_type text,
  extracted_text text,
  summary text,
  sensitivity visibility_level default 'internal',
  uploaded_by_profile_id uuid references public.profiles(id),
  department_id uuid references public.departments(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  editable_source_status text default 'not_applicable' check (editable_source_status in ('not_applicable', 'present', 'missing')),
  created_at timestamptz default now()
);

create table if not exists public.financial_reports (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  period text,
  revenue numeric,
  expenses numeric,
  net_income numeric,
  cash_position numeric,
  health_status financial_health_status not null default 'unknown',
  notable_flags jsonb default '[]'::jsonb,
  summary text,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now()
);
create index if not exists financial_reports_company_idx on public.financial_reports (company_id, created_at desc);

create table if not exists public.product_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  description text,
  currency text default 'USD',
  unit_price numeric default 0,
  unit_cost numeric default 0,
  service_fee_monthly numeric default 0,
  warranty text,
  delivery_timeline text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  product_line_id uuid references public.product_lines(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  sku text,
  quantity_on_hand int default 0,
  reserved_quantity int default 0,
  reorder_point int default 0,
  location text,
  updated_at timestamptz default now()
);

create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  client_name text not null,
  contact_name text,
  contact_email text,
  status text default 'new',
  stage text default 'lead',
  value_estimate numeric default 0,
  next_action text,
  owner_person_id uuid references public.people(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  lead_id uuid references public.sales_leads(id) on delete set null,
  title text not null,
  language text default 'en',
  currency text default 'USD',
  subtotal numeric default 0,
  discount_pct numeric default 0,
  total numeric default 0,
  internal_margin numeric default 0,
  payment_terms text,
  status text default 'draft',
  version int default 1,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete cascade,
  product_line_id uuid references public.product_lines(id) on delete set null,
  description text,
  quantity numeric default 1,
  unit_price numeric default 0,
  unit_cost numeric default 0,
  line_total numeric default 0,
  created_at timestamptz default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  title text not null,
  reason text,
  risk_level risk_level default 'medium',
  domain approval_domain not null default 'general',
  status approval_status default 'pending',
  approval_payload jsonb default '{}'::jsonb,
  requested_by_profile_id uuid references public.profiles(id),
  approver_profile_id uuid references public.profiles(id),
  decision_notes text,
  created_at timestamptz default now(),
  decided_at timestamptz
);

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_id uuid references public.companies(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id),
  archived boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  command text not null,
  company_id uuid references public.companies(id) on delete set null,
  assigned_agent_id uuid references public.agents(id),
  channel_id uuid references public.chat_channels(id) on delete set null,
  status work_status default 'queued',
  context_pack jsonb default '{}'::jsonb,
  output jsonb default '{}'::jsonb,
  token_estimate int default 0,
  cost_estimate_usd numeric default 0,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists work_orders_channel_idx on public.work_orders (channel_id, created_at);

create table if not exists public.kpi_records (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  period text not null,
  metric text not null,
  target numeric default 0,
  actual numeric default 0,
  weight numeric default 0,
  score numeric default 0,
  salary_impact_pct numeric default 0,
  bonus_amount numeric,
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.salary_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  role_title text,
  rule_name text not null,
  formula jsonb default '{}'::jsonb,
  approval_required boolean default true,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.person_ai_policy (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people(id) on delete cascade,
  mode text not null default 'manual' check (mode in ('manual', 'draft', 'auto_routine', 'fallback_after_timeout')),
  fallback_sla_minutes integer default 60 check (fallback_sla_minutes > 0),
  allowed_categories jsonb not null default '[]'::jsonb,
  updated_by_profile_id uuid references public.profiles(id),
  updated_at timestamptz default now()
);

create table if not exists public.ai_reply_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  channel_id uuid references public.chat_channels(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  mode text not null check (mode in ('draft', 'auto_routine', 'fallback_after_timeout')),
  reply_text text not null,
  evidence_refs jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  currency text not null default 'USD',
  created_at timestamptz default now()
);

create table if not exists public.service_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  entry_type text not null check (entry_type in ('deposit', 'usage', 'promo_credit', 'refund', 'adjustment')),
  amount numeric not null,
  description text,
  related_model_usage_id uuid references public.model_usage(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  constraint service_credit_ledger_usage_once unique (related_model_usage_id)
);

create table if not exists public.ai_pricing_settings (
  id boolean primary key default true check (id),
  markup_multiplier numeric not null default 2.0 check (markup_multiplier > 0),
  updated_by_profile_id uuid references public.profiles(id),
  updated_at timestamptz default now()
);

create table if not exists public.integration_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  integration text not null, -- slack, google_drive, gmail, calendar, github
  action text not null,
  payload jsonb default '{}'::jsonb,
  status text default 'queued',
  approval_id uuid references public.approvals(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.model_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  work_order_id uuid references public.work_orders(id),
  task_id uuid references public.tasks(id) on delete set null,
  model_name text,
  input_tokens int default 0,
  output_tokens int default 0,
  estimated_cost_usd numeric default 0,
  actual_cost_usd numeric default 0,
  created_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id),
  actor_role app_role,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  company_id uuid references public.companies(id) on delete set null,
  message text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Added in the rewrite's Phase 3 (Software Factory) — see 202608240001_product_specs.sql.
create table if not exists public.product_specs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  title text not null,
  status text not null default 'draft',
  body_md text,
  owner_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added for the Goals module — see 202608250001_goals_departments.sql.
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, slug)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  description text,
  status goal_status not null default 'draft',
  kind goal_kind not null default 'ephemeral',
  cron_expr text,
  due_at timestamptz,
  progress numeric(5,2),
  target_value text,
  actual_value text,
  delta_label text,
  metadata jsonb not null default '{}'::jsonb,
  owner_type text not null default 'human',
  owner_person_id uuid references public.people(id),
  owner_agent_id uuid references public.agents(id),
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_company_status_idx on public.goals (company_id, status);
create index if not exists goals_department_idx on public.goals (department_id);

create table if not exists public.key_results (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  label text not null,
  target_value text,
  current_value text,
  unit text,
  weight numeric(6,3) not null default 1.0,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists key_results_goal_idx on public.key_results (goal_id);

create table if not exists public.goal_context (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null unique references public.goals(id) on delete cascade,
  content_md text not null default '',
  updated_at timestamptz not null default now()
);

-- Action registry step 3 — see 202608260006_relationships_assignments.sql. Reuses the
-- owner_profile_id pattern already established on company_sensitive above (an individual
-- owner, e.g. the founder personally, vs. a related company). Every relationship carries
-- an explicit state defaulting to 'planned', not 'current' — "SEM Brain must never treat
-- an intention as an already-completed legal transfer" (the founder's own words).
create table if not exists public.company_relationships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  related_company_id uuid references public.companies(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id),
  relationship_type company_relationship_type not null default 'parent_of',
  ownership_pct numeric,
  state relationship_state not null default 'planned',
  effective_date date,
  notes text,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_relationships_owner_check check (
    (case when related_company_id is not null then 1 else 0 end
     + case when owner_profile_id is not null then 1 else 0 end) = 1
  )
);

-- One person can have multiple assignments: legal employer vs operating company vs
-- product team, matching the founder's explicit field list from the org-structure
-- conversation (person_assignments project memory).
create table if not exists public.person_assignments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  legal_employer_company_id uuid references public.companies(id) on delete set null,
  operating_company_id uuid references public.companies(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  job_title text,
  manager_person_id uuid references public.people(id) on delete set null,
  employment_type employment_type default 'full_time',
  allocation_pct numeric default 100,
  start_date date,
  end_date date,
  is_primary boolean default true,
  responsibilities text,
  state assignment_state not null default 'current',
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Added for AI Providers + MCP Connectors — see 202608260001_ai_providers_mcp_connectors.sql.
-- No key column on ai_providers, ever — the real key stays a Supabase Edge Function
-- secret (OPENAI_API_KEY / ANTHROPIC_API_KEY), never a database row.
create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai','anthropic')),
  label text not null,
  model text not null,
  is_active boolean not null default false,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists ai_providers_single_active_idx
  on public.ai_providers ((is_active)) where is_active = true;

create table if not exists public.mcp_connectors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  endpoint_url text not null,
  transport mcp_transport not null default 'http',
  vault_secret_id uuid,
  last_checked_at timestamptz,
  last_status text,
  last_tool_count int,
  enabled boolean not null default true,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);


-- ---------- HELPERS ----------
create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

-- Safe uuid cast for RLS — a storage object path's first folder segment is meant to be a
-- company_id, but RLS must not hard-error on a malformed/foreign path; it should just
-- evaluate to "no match" like any other failed authorization check.
create or replace function public.try_uuid(t text) returns uuid
language sql immutable as $$
  select case when t ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then t::uuid else null end;
$$;

create or replace function public.is_founder_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('founder','holding_admin') from public.profiles where auth_user_id = auth.uid() limit 1), false);
$$;

create or replace function public.is_hr_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('founder','holding_admin','hr_finance') from public.profiles where auth_user_id = auth.uid() limit 1), false);
$$;

create or replace function public.has_company_access(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_founder_or_admin()
    or exists (
      select 1 from public.company_memberships m
      join public.profiles p on p.id = m.profile_id
      where p.auth_user_id = auth.uid()
        and m.company_id = cid
        and m.active = true
    );
$$;

create or replace function public.is_company_manager(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_founder_or_admin()
    or exists (
      select 1 from public.company_memberships m
      join public.profiles p on p.id = m.profile_id
      where p.auth_user_id = auth.uid()
        and m.company_id = cid
        and m.active = true
        and m.role_in_company in ('owner','manager','team_lead')
    );
$$;

-- ---------- SUPABASE VAULT WRAPPERS (MCP connector tokens) ----------
-- See 202608260002_mcp_vault_functions.sql. PostgREST only exposes `public`, so these
-- SECURITY DEFINER wrappers are the only path /web ever uses to touch a connector's
-- real token; each does its own founder/admin check rather than relying on RLS.
create or replace function public.create_mcp_connector_secret(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if not public.is_founder_or_admin() then
    raise exception 'not authorized';
  end if;
  v_id := vault.create_secret(p_secret, p_name);
  return v_id;
end;
$$;
revoke all on function public.create_mcp_connector_secret(text, text) from public;
grant execute on function public.create_mcp_connector_secret(text, text) to authenticated;

create or replace function public.get_mcp_connector_token(p_connector_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_token text;
begin
  if not public.is_founder_or_admin() then
    raise exception 'not authorized';
  end if;
  select vault_secret_id into v_secret_id from public.mcp_connectors where id = p_connector_id;
  if v_secret_id is null then
    return null;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where id = v_secret_id;
  return v_token;
end;
$$;
revoke all on function public.get_mcp_connector_token(uuid) from public;
grant execute on function public.get_mcp_connector_token(uuid) to authenticated;

create or replace function public.delete_mcp_connector_secret(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if not public.is_founder_or_admin() then
    raise exception 'not authorized';
  end if;
  delete from vault.secrets where id = p_secret_id;
end;
$$;
revoke all on function public.delete_mcp_connector_secret(uuid) from public;
grant execute on function public.delete_mcp_connector_secret(uuid) to authenticated;

-- ---------- TRANSACTIONAL AI COMMAND PERSISTENCE (ticket 12) ----------
-- Wraps work_order + tasks + approvals + model_usage + audit_logs in one transaction so
-- a failure partway through (RLS denial on a hallucinated company_id, a constraint
-- violation) rolls back atomically instead of leaving partial state. NOT security
-- definer — runs as the invoking role, so every RLS policy above still applies to each
-- insert exactly as it did with the Edge Function's old sequential-insert code. This
-- function is a pure persistence layer; approvalRequired/domain per task are still
-- computed in supabase/functions/sem-ai-command/index.ts (tickets 2 and 4), not here.
create or replace function public.create_pending_work_order(p_command text, p_context_pack jsonb, p_channel_id uuid default null)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  insert into public.work_orders (command, status, context_pack, created_by_profile_id, channel_id)
  values (p_command, 'queued', p_context_pack, public.current_profile_id(), p_channel_id)
  returning id into v_id;

  if p_channel_id is not null then
    update public.chat_channels set updated_at = now() where id = p_channel_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_pending_work_order(text, jsonb, uuid) from public, anon;
grant execute on function public.create_pending_work_order(text, jsonb, uuid) to authenticated;

-- Real semantic retrieval, finishing the pgvector scaffold that already existed on
-- memories.embedding. security invoker + language sql so memories RLS applies normally
-- to whatever this returns — not a bypass.
create or replace function public.match_memories(query_embedding vector(1536), match_count int default 8)
returns table (
  id uuid, fact text, entity_type text, entity_id uuid, company_id uuid,
  confidence numeric, sensitivity visibility_level, similarity float8
)
language sql
stable
security invoker
as $$
  select m.id, m.fact, m.entity_type, m.entity_id, m.company_id, m.confidence, m.sensitivity,
         1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.match_memories(vector, int) from public, anon;
grant execute on function public.match_memories(vector, int) to authenticated;

-- sem_execute_ai_command gains p_memory_candidates — same drop-and-recreate recipe as
-- every prior parameter addition (a new parameter is a new overload, not a replacement).
-- Embeddings are computed in TypeScript (supabase/functions/sem-ai-command/index.ts
-- calls OpenAI before this RPC runs) and arrive as a plain jsonb float array per
-- candidate, cast to vector here.
drop function if exists public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid);

create or replace function public.sem_execute_ai_command(
  p_command text,
  p_context_pack jsonb,
  p_output jsonb,
  p_token_estimate int,
  p_tasks jsonb,
  p_approvals jsonb,
  p_model_name text,
  p_input_tokens int,
  p_output_tokens int,
  p_estimated_cost_usd numeric,
  p_deleted_task_ids uuid[] default '{}'::uuid[],
  p_companies jsonb default '[]'::jsonb,
  p_people jsonb default '[]'::jsonb,
  p_projects jsonb default '[]'::jsonb,
  p_goals jsonb default '[]'::jsonb,
  p_company_relationships jsonb default '[]'::jsonb,
  p_person_assignments jsonb default '[]'::jsonb,
  p_work_order_id uuid default null,
  p_memory_candidates jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_work_order_id uuid;
  v_task jsonb;
  v_approval jsonb;
  v_company jsonb;
  v_person jsonb;
  v_project jsonb;
  v_goal jsonb;
  v_relationship jsonb;
  v_assignment jsonb;
  v_memory jsonb;
  v_task_ids uuid[] := '{}';
  v_task_company_ids uuid[] := '{}';
  v_company_ids uuid[] := '{}';
  v_person_ids uuid[] := '{}';
  v_created_tasks jsonb := '[]'::jsonb;
  v_created_approvals jsonb := '[]'::jsonb;
  v_created_companies jsonb := '[]'::jsonb;
  v_created_people jsonb := '[]'::jsonb;
  v_created_projects jsonb := '[]'::jsonb;
  v_created_goals jsonb := '[]'::jsonb;
  v_created_relationships jsonb := '[]'::jsonb;
  v_created_assignments jsonb := '[]'::jsonb;
  v_created_memories jsonb := '[]'::jsonb;
  v_new_task_id uuid;
  v_new_task_company_id uuid;
  v_new_approval_id uuid;
  v_new_company_id uuid;
  v_new_person_id uuid;
  v_new_project_id uuid;
  v_new_goal_id uuid;
  v_new_relationship_id uuid;
  v_new_assignment_id uuid;
  v_new_memory_id uuid;
  v_task_index int;
  v_company_index int;
  v_person_index int;
  v_entry_company_id uuid;
  v_entry_related_company_id uuid;
  v_entry_owner_profile_id uuid;
  v_entry_manager_id uuid;
  v_deleted_task_ids uuid[] := '{}';
begin
  if v_profile_id is null then
    raise exception 'No profile found for the authenticated user';
  end if;

  if p_work_order_id is not null then
    update public.work_orders
    set status = 'done', output = p_output, token_estimate = p_token_estimate, updated_at = now()
    where id = p_work_order_id
    returning id into v_work_order_id;
  end if;

  if v_work_order_id is null then
    insert into public.work_orders (command, status, context_pack, output, token_estimate, created_by_profile_id)
    values (p_command, 'done', p_context_pack, p_output, p_token_estimate, v_profile_id)
    returning id into v_work_order_id;
  end if;

  for v_task in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb))
  loop
    insert into public.tasks (
      company_id, project_id, title, description, parent_goal,
      owner_type, owner_agent_id, owner_person_id,
      acceptance_criteria, test_method,
      status, priority, risk_level, approval_required,
      source, created_by_profile_id
    ) values (
      nullif(v_task->>'companyId','')::uuid,
      nullif(v_task->>'projectId','')::uuid,
      v_task->>'title',
      coalesce(v_task->>'description',''),
      coalesce(v_task->>'parentGoal',''),
      coalesce(v_task->>'ownerType','agent'),
      nullif(v_task->>'ownerAgentId','')::uuid,
      nullif(v_task->>'ownerPersonId','')::uuid,
      coalesce(v_task->'acceptanceCriteria','[]'::jsonb),
      coalesce(v_task->'testMethod','[]'::jsonb),
      case when coalesce((v_task->>'approvalRequired')::boolean,false) then 'needs_approval'::work_status else 'queued'::work_status end,
      coalesce((v_task->>'priority')::priority_level,'medium'::priority_level),
      coalesce((v_task->>'riskLevel')::risk_level,'low'::risk_level),
      coalesce((v_task->>'approvalRequired')::boolean,false),
      'ai_command_v0.7',
      v_profile_id
    )
    returning id, company_id into v_new_task_id, v_new_task_company_id;

    v_task_ids := array_append(v_task_ids, v_new_task_id);
    v_task_company_ids := array_append(v_task_company_ids, v_new_task_company_id);
    v_created_tasks := v_created_tasks || jsonb_build_object('id', v_new_task_id, 'company_id', v_new_task_company_id);
  end loop;

  for v_approval in select * from jsonb_array_elements(coalesce(p_approvals, '[]'::jsonb))
  loop
    v_task_index := nullif(v_approval->>'taskIndex','')::int;
    insert into public.approvals (
      company_id, task_id, title, reason, risk_level, domain,
      requested_by_profile_id, approval_payload
    ) values (
      case when v_task_index is not null and v_task_index >= 0 and v_task_index < array_length(v_task_company_ids,1)
        then v_task_company_ids[v_task_index+1] else nullif(v_approval->>'companyId','')::uuid end,
      case when v_task_index is not null and v_task_index >= 0 and v_task_index < array_length(v_task_ids,1)
        then v_task_ids[v_task_index+1] else null end,
      coalesce(v_approval->>'title','Approval required'),
      coalesce(v_approval->>'reason','Risk policy requires approval'),
      coalesce((v_approval->>'riskLevel')::risk_level,'medium'::risk_level),
      coalesce((v_approval->>'domain')::approval_domain,'general'::approval_domain),
      v_profile_id,
      v_approval
    )
    returning id into v_new_approval_id;

    v_created_approvals := v_created_approvals || jsonb_build_object('id', v_new_approval_id);
  end loop;

  for v_company in select * from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb))
  loop
    insert into public.companies (name, country, legal_entity_name, description)
    values (
      v_company->>'name',
      nullif(v_company->>'country',''),
      nullif(v_company->>'legalEntityName',''),
      nullif(v_company->>'description','')
    )
    returning id into v_new_company_id;

    v_company_ids := array_append(v_company_ids, v_new_company_id);
    v_created_companies := v_created_companies || jsonb_build_object('id', v_new_company_id, 'name', v_company->>'name');
  end loop;

  for v_person in select * from jsonb_array_elements(coalesce(p_people, '[]'::jsonb))
  loop
    v_company_index := nullif(v_person->>'companyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_person->>'companyId','')::uuid
    end;

    insert into public.people (full_name, email, role_title, company_id)
    values (
      v_person->>'fullName',
      nullif(v_person->>'email',''),
      nullif(v_person->>'roleTitle',''),
      v_entry_company_id
    )
    returning id into v_new_person_id;

    v_person_ids := array_append(v_person_ids, v_new_person_id);
    v_created_people := v_created_people || jsonb_build_object('id', v_new_person_id, 'full_name', v_person->>'fullName');
  end loop;

  for v_project in select * from jsonb_array_elements(coalesce(p_projects, '[]'::jsonb))
  loop
    v_company_index := nullif(v_project->>'companyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_project->>'companyId','')::uuid
    end;

    insert into public.projects (company_id, title, goal, deadline, blockers)
    values (
      v_entry_company_id,
      v_project->>'title',
      nullif(v_project->>'goal',''),
      nullif(v_project->>'deadline','')::date,
      nullif(v_project->>'blockers','')
    )
    returning id into v_new_project_id;

    v_created_projects := v_created_projects || jsonb_build_object('id', v_new_project_id, 'title', v_project->>'title');
  end loop;

  for v_goal in select * from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb))
  loop
    v_company_index := nullif(v_goal->>'companyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_goal->>'companyId','')::uuid
    end;

    insert into public.goals (company_id, title, description, kind, status, due_at)
    values (
      v_entry_company_id,
      v_goal->>'title',
      nullif(v_goal->>'description',''),
      coalesce((v_goal->>'kind')::goal_kind,'ephemeral'::goal_kind),
      coalesce((v_goal->>'status')::goal_status,'draft'::goal_status),
      nullif(v_goal->>'dueAt','')::timestamptz
    )
    returning id into v_new_goal_id;

    v_created_goals := v_created_goals || jsonb_build_object('id', v_new_goal_id, 'title', v_goal->>'title');
  end loop;

  for v_relationship in select * from jsonb_array_elements(coalesce(p_company_relationships, '[]'::jsonb))
  loop
    v_company_index := nullif(v_relationship->>'companyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_relationship->>'companyId','')::uuid
    end;

    v_company_index := nullif(v_relationship->>'relatedCompanyIndex','')::int;
    v_entry_related_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_relationship->>'relatedCompanyId','')::uuid
    end;

    v_entry_owner_profile_id := case
      when nullif(v_relationship->>'ownerProfileId','')::uuid = v_profile_id then v_profile_id
      else null
    end;

    if v_entry_company_id is not null
       and ((v_entry_related_company_id is not null)::int + (v_entry_owner_profile_id is not null)::int = 1)
    then
      insert into public.company_relationships (
        company_id, related_company_id, owner_profile_id, relationship_type,
        ownership_pct, state, effective_date, notes, created_by_profile_id
      ) values (
        v_entry_company_id,
        v_entry_related_company_id,
        v_entry_owner_profile_id,
        coalesce((v_relationship->>'relationshipType')::company_relationship_type,'parent_of'::company_relationship_type),
        nullif(v_relationship->>'ownershipPct','')::numeric,
        coalesce((v_relationship->>'state')::relationship_state,'planned'::relationship_state),
        nullif(v_relationship->>'effectiveDate','')::date,
        nullif(v_relationship->>'notes',''),
        v_profile_id
      )
      returning id into v_new_relationship_id;

      v_created_relationships := v_created_relationships || jsonb_build_object('id', v_new_relationship_id);
    end if;
  end loop;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_person_assignments, '[]'::jsonb))
  loop
    v_person_index := nullif(v_assignment->>'personIndex','')::int;
    v_new_person_id := case
      when v_person_index is not null and v_person_index >= 0 and v_person_index < array_length(v_person_ids,1)
        then v_person_ids[v_person_index+1]
      else nullif(v_assignment->>'personId','')::uuid
    end;

    v_person_index := nullif(v_assignment->>'managerPersonIndex','')::int;
    v_entry_manager_id := case
      when v_person_index is not null and v_person_index >= 0 and v_person_index < array_length(v_person_ids,1)
        then v_person_ids[v_person_index+1]
      else nullif(v_assignment->>'managerPersonId','')::uuid
    end;

    v_company_index := nullif(v_assignment->>'legalEmployerCompanyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_assignment->>'legalEmployerCompanyId','')::uuid
    end;

    v_company_index := nullif(v_assignment->>'operatingCompanyIndex','')::int;
    v_entry_related_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_assignment->>'operatingCompanyId','')::uuid
    end;

    if v_new_person_id is not null then
      insert into public.person_assignments (
        person_id, legal_employer_company_id, operating_company_id, department_id,
        job_title, manager_person_id, employment_type, allocation_pct,
        start_date, end_date, is_primary, responsibilities, state, created_by_profile_id
      ) values (
        v_new_person_id,
        v_entry_company_id,
        v_entry_related_company_id,
        nullif(v_assignment->>'departmentId','')::uuid,
        nullif(v_assignment->>'jobTitle',''),
        v_entry_manager_id,
        coalesce((v_assignment->>'employmentType')::employment_type,'full_time'::employment_type),
        coalesce(nullif(v_assignment->>'allocationPct','')::numeric, 100),
        nullif(v_assignment->>'startDate','')::date,
        nullif(v_assignment->>'endDate','')::date,
        coalesce((v_assignment->>'isPrimary')::boolean, true),
        nullif(v_assignment->>'responsibilities',''),
        coalesce((v_assignment->>'state')::assignment_state,'current'::assignment_state),
        v_profile_id
      )
      returning id into v_new_assignment_id;

      v_created_assignments := v_created_assignments || jsonb_build_object('id', v_new_assignment_id);
    end if;
  end loop;

  -- Memory candidates arrive pre-validated + pre-embedded from TypeScript (entityType/
  -- entityId already defaulted to 'chat_channel'/the active channel when the model
  -- omitted them). A candidate with no embedding (the OpenAI call failed or was
  -- skipped) still gets the fact saved, just unsearchable until a later backfill.
  for v_memory in select * from jsonb_array_elements(coalesce(p_memory_candidates, '[]'::jsonb))
  loop
    if coalesce(v_memory->>'fact','') <> '' then
      v_company_index := nullif(v_memory->>'companyIndex','')::int;
      v_entry_company_id := case
        when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
          then v_company_ids[v_company_index+1]
        else nullif(v_memory->>'companyId','')::uuid
      end;

      insert into public.memories (
        company_id, entity_type, entity_id, fact, source_type, source_id,
        confidence, sensitivity, embedding, created_by_profile_id
      ) values (
        v_entry_company_id,
        coalesce(nullif(v_memory->>'entityType',''), 'chat_channel'),
        nullif(v_memory->>'entityId','')::uuid,
        v_memory->>'fact',
        'ai_chat',
        v_work_order_id,
        coalesce((v_memory->>'confidence')::numeric, 0.8),
        coalesce((v_memory->>'sensitivity')::visibility_level, 'internal'::visibility_level),
        case when v_memory->'embedding' is not null then (v_memory->'embedding')::text::vector else null end,
        v_profile_id
      )
      returning id into v_new_memory_id;

      v_created_memories := v_created_memories || jsonb_build_object('id', v_new_memory_id);
    end if;
  end loop;

  if p_deleted_task_ids is not null and array_length(p_deleted_task_ids, 1) > 0 then
    with removed as (
      delete from public.tasks where id = any(p_deleted_task_ids) returning id
    )
    select coalesce(array_agg(id), '{}') into v_deleted_task_ids from removed;
  end if;

  insert into public.model_usage (profile_id, work_order_id, model_name, input_tokens, output_tokens, estimated_cost_usd)
  values (v_profile_id, v_work_order_id, p_model_name, p_input_tokens, p_output_tokens, p_estimated_cost_usd);

  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, message, metadata)
  values (
    v_profile_id, public.current_role(), 'ai_command_executed', 'work_order', v_work_order_id,
    'AI command executed through v0.7 production core (transactional)',
    jsonb_build_object(
      'command', p_command, 'model', p_model_name, 'tokenEstimate', p_token_estimate,
      'tasks', jsonb_array_length(v_created_tasks), 'approvals', jsonb_array_length(v_created_approvals),
      'deletedTasks', coalesce(array_length(v_deleted_task_ids,1), 0),
      'companies', jsonb_array_length(v_created_companies), 'people', jsonb_array_length(v_created_people),
      'projects', jsonb_array_length(v_created_projects), 'goals', jsonb_array_length(v_created_goals),
      'companyRelationships', jsonb_array_length(v_created_relationships), 'personAssignments', jsonb_array_length(v_created_assignments),
      'memories', jsonb_array_length(v_created_memories)
    )
  );

  return jsonb_build_object(
    'workOrderId', v_work_order_id, 'createdTasks', v_created_tasks, 'createdApprovals', v_created_approvals,
    'deletedTaskIds', to_jsonb(v_deleted_task_ids),
    'createdCompanies', v_created_companies, 'createdPeople', v_created_people,
    'createdProjects', v_created_projects, 'createdGoals', v_created_goals,
    'createdCompanyRelationships', v_created_relationships, 'createdPersonAssignments', v_created_assignments,
    'createdMemories', v_created_memories
  );
end;
$$;

revoke all on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) to authenticated;

-- Failure path (JSON parse failure, provider error, RPC error) needs its own way to mark
-- the pending row as failed rather than leaving it stuck at 'queued' forever with no
-- record of what went wrong.
create or replace function public.mark_work_order_failed(p_work_order_id uuid, p_error text)
returns void
language plpgsql
security invoker
as $$
begin
  update public.work_orders
  set status = 'rejected', output = jsonb_build_object('error', p_error), updated_at = now()
  where id = p_work_order_id;
end;
$$;

revoke all on function public.mark_work_order_failed(uuid, text) from public, anon;
grant execute on function public.mark_work_order_failed(uuid, text) to authenticated;


-- ---------- ENABLE RLS ----------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_sensitive enable row level security;
alter table public.company_memberships enable row level security;
alter table public.people enable row level security;
alter table public.salary_private enable row level security;
alter table public.projects enable row level security;
alter table public.agents enable row level security;
alter table public.tasks enable row level security;
alter table public.memories enable row level security;
alter table public.documents enable row level security;
alter table public.product_lines enable row level security;
alter table public.inventory_items enable row level security;
alter table public.sales_leads enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.approvals enable row level security;
alter table public.work_orders enable row level security;
alter table public.kpi_records enable row level security;
alter table public.salary_rules enable row level security;
alter table public.integration_queue enable row level security;
alter table public.model_usage enable row level security;
alter table public.audit_logs enable row level security;
alter table public.product_specs enable row level security;
alter table public.person_ai_policy enable row level security;
alter table public.ai_reply_log enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.service_credit_ledger enable row level security;
alter table public.ai_pricing_settings enable row level security;

-- ---------- POLICIES ----------
-- Profiles
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles for select using (id = public.current_profile_id() or public.is_founder_or_admin());
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles for update using (id = public.current_profile_id() or public.is_founder_or_admin());
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles for insert with check (public.is_founder_or_admin());

-- Companies visible if member or admin. Sensitive fields are not in this table.
drop policy if exists "companies_select_member" on public.companies;
create policy "companies_select_member" on public.companies for select using (public.has_company_access(id));
drop policy if exists "companies_write_admin" on public.companies;
create policy "companies_write_admin" on public.companies for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

-- Company sensitive: founder/holding_admin only. HR/finance can be granted separately later through a view.
drop policy if exists "company_sensitive_select_founder" on public.company_sensitive;
create policy "company_sensitive_select_founder" on public.company_sensitive for select using (public.is_founder_or_admin());
drop policy if exists "company_sensitive_write_founder" on public.company_sensitive;
create policy "company_sensitive_write_founder" on public.company_sensitive for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

-- Memberships
drop policy if exists "memberships_select_member_scope" on public.company_memberships;
create policy "memberships_select_member_scope" on public.company_memberships for select using (public.is_founder_or_admin() or profile_id = public.current_profile_id() or public.is_company_manager(company_id));
drop policy if exists "memberships_write_admin" on public.company_memberships;
create policy "memberships_write_admin" on public.company_memberships for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

-- People visible by company scope; salary is separate.
drop policy if exists "people_select_company_scope" on public.people;
create policy "people_select_company_scope" on public.people for select using (public.has_company_access(company_id));
drop policy if exists "people_write_manager" on public.people;
create policy "people_write_manager" on public.people for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

-- Salary private: only founder/admin/hr/finance, or self can see own salary row through linked profile.
drop policy if exists "salary_select_authorized" on public.salary_private;
create policy "salary_select_authorized" on public.salary_private for select using (
  public.is_hr_finance()
  or exists (select 1 from public.people pe where pe.id = salary_private.person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "salary_write_hr" on public.salary_private;
create policy "salary_write_hr" on public.salary_private for all using (public.is_hr_finance()) with check (public.is_hr_finance());

-- Projects
drop policy if exists "projects_select_company_scope" on public.projects;
create policy "projects_select_company_scope" on public.projects for select using (public.has_company_access(company_id));
drop policy if exists "projects_write_manager" on public.projects;
create policy "projects_write_manager" on public.projects for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

-- Agents: readable to all authenticated users, writable by admin.
drop policy if exists "agents_select_authenticated" on public.agents;
create policy "agents_select_authenticated" on public.agents for select using (auth.uid() is not null);
drop policy if exists "agents_write_admin" on public.agents;
create policy "agents_write_admin" on public.agents for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

-- Tasks: own/created tasks plus managers/admin (full company task visibility is
-- manager+ only — an ordinary employee only sees tasks they created or own).
drop policy if exists "tasks_select_scope" on public.tasks;
create policy "tasks_select_scope" on public.tasks for select using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or created_by_profile_id = public.current_profile_id()
  or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "tasks_insert_scope" on public.tasks;
create policy "tasks_insert_scope" on public.tasks for insert with check (public.is_founder_or_admin() or company_id is null or public.has_company_access(company_id));
drop policy if exists "tasks_update_scope" on public.tasks;
create policy "tasks_update_scope" on public.tasks for update using (public.is_founder_or_admin() or public.is_company_manager(company_id) or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id()));
-- Delete is manager+/admin only, deliberately narrower than update (no owner
-- self-service) — deleting is harder to undo than editing. Migration 202608260003.
drop policy if exists "tasks_delete_scope" on public.tasks;
create policy "tasks_delete_scope" on public.tasks for delete using (public.is_founder_or_admin() or public.is_company_manager(company_id));

-- Memories: restricted/founder_only visible only to admins; confidential requires
-- manager/HR-finance; public/internal are general company scope.
drop policy if exists "memories_select_scope" on public.memories;
create policy "memories_select_scope" on public.memories for select using (
  public.is_founder_or_admin()
  or (sensitivity in ('public','internal') and (company_id is null or public.has_company_access(company_id)))
  or (sensitivity = 'confidential' and (company_id is null or public.is_company_manager(company_id) or public.is_hr_finance()))
);
drop policy if exists "memories_write_scope" on public.memories;
create policy "memories_write_scope" on public.memories for all using (public.is_founder_or_admin() or company_id is null or public.is_company_manager(company_id)) with check (public.is_founder_or_admin() or company_id is null or public.is_company_manager(company_id));

-- Documents: same sensitivity rule as memories.
drop policy if exists "documents_select_scope" on public.documents;
create policy "documents_select_scope" on public.documents for select using (
  public.is_founder_or_admin()
  or (sensitivity in ('public','internal') and (company_id is null or public.has_company_access(company_id)))
  or (sensitivity = 'confidential' and (company_id is null or public.is_company_manager(company_id) or public.is_hr_finance()))
);
drop policy if exists "documents_write_scope" on public.documents;
create policy "documents_write_scope" on public.documents for all using (public.is_founder_or_admin() or public.is_company_manager(company_id)) with check (public.is_founder_or_admin() or public.is_company_manager(company_id));

-- Financial reports: same sensitivity tier as documents/memories (founder or the
-- company's own manager) — revenue/expenses/margins are the "finance" sensitive domain
-- per the founder's governance doc; manager+ tier, not every company member.
alter table public.financial_reports enable row level security;
drop policy if exists "financial_reports_select_scope" on public.financial_reports;
create policy "financial_reports_select_scope" on public.financial_reports for select using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);
drop policy if exists "financial_reports_write_scope" on public.financial_reports;
create policy "financial_reports_write_scope" on public.financial_reports for all using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
) with check (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- Storage: the `documents` bucket stores uploaded artifacts (financial statements etc.)
-- at path `{company_id}/{document_id}.ext` — RLS keyed off that first path segment.
drop policy if exists "documents_bucket_select" on storage.objects;
create policy "documents_bucket_select" on storage.objects for select using (
  bucket_id = 'documents' and (
    public.is_founder_or_admin()
    or public.has_company_access(public.try_uuid((storage.foldername(name))[1]))
  )
);
drop policy if exists "documents_bucket_write" on storage.objects;
create policy "documents_bucket_write" on storage.objects for all using (
  bucket_id = 'documents' and (
    public.is_founder_or_admin()
    or public.is_company_manager(public.try_uuid((storage.foldername(name))[1]))
  )
) with check (
  bucket_id = 'documents' and (
    public.is_founder_or_admin()
    or public.is_company_manager(public.try_uuid((storage.foldername(name))[1]))
  )
);

-- Product/inventory/proposals: read is company scope, write is manager-gated (catalog,
-- stock, and pricing/margin data — not general-employee-writable). Proposal internal
-- margin is also column-level sensitive, so hide via views in production UI.
drop policy if exists "product_lines_company_scope" on public.product_lines;
create policy "product_lines_select_scope" on public.product_lines for select using (public.has_company_access(company_id));
drop policy if exists "product_lines_write_manager" on public.product_lines;
create policy "product_lines_write_manager" on public.product_lines for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists "inventory_company_scope" on public.inventory_items;
create policy "inventory_select_scope" on public.inventory_items for select using (public.has_company_access(company_id));
drop policy if exists "inventory_write_manager" on public.inventory_items;
create policy "inventory_write_manager" on public.inventory_items for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

-- Sales leads: any company member can create/work leads they own (normal CRM usage);
-- managers can manage all; delete is manager-only.
drop policy if exists "sales_leads_company_scope" on public.sales_leads;
create policy "sales_leads_select_scope" on public.sales_leads for select using (public.has_company_access(company_id));
drop policy if exists "sales_leads_insert_member" on public.sales_leads;
create policy "sales_leads_insert_member" on public.sales_leads for insert with check (public.has_company_access(company_id));
drop policy if exists "sales_leads_update_own_or_manager" on public.sales_leads;
create policy "sales_leads_update_own_or_manager" on public.sales_leads for update using (
  public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = sales_leads.owner_person_id and pe.profile_id = public.current_profile_id())
) with check (
  public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = sales_leads.owner_person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "sales_leads_delete_manager" on public.sales_leads;
create policy "sales_leads_delete_manager" on public.sales_leads for delete using (public.is_company_manager(company_id));

drop policy if exists "proposals_company_scope" on public.proposals;
create policy "proposals_select_scope" on public.proposals for select using (public.has_company_access(company_id));
drop policy if exists "proposals_write_manager" on public.proposals;
create policy "proposals_write_manager" on public.proposals for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists "proposal_items_scope" on public.proposal_items;
create policy "proposal_items_select_scope" on public.proposal_items for select using (
  exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and public.has_company_access(p.company_id))
);
drop policy if exists "proposal_items_write_manager" on public.proposal_items;
create policy "proposal_items_write_manager" on public.proposal_items for all using (
  exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and public.is_company_manager(p.company_id))
) with check (
  exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and public.is_company_manager(p.company_id))
);

-- Approvals: company managers/admins and requested/approver profile.
drop policy if exists "approvals_select_scope" on public.approvals;
create policy "approvals_select_scope" on public.approvals for select using (public.is_founder_or_admin() or public.has_company_access(company_id) or requested_by_profile_id = public.current_profile_id() or approver_profile_id = public.current_profile_id());
drop policy if exists "approvals_insert_scope" on public.approvals;
create policy "approvals_insert_scope" on public.approvals for insert with check (public.is_founder_or_admin() or company_id is null or public.has_company_access(company_id));
-- Domain-gated: salary/finance approvals require HR-finance; general/production/
-- external_comms allow the company manager; legal has no dedicated approver role yet,
-- so it falls through to founder/admin or the explicitly assigned approver only.
drop policy if exists "approvals_update_approver" on public.approvals;
create policy "approvals_update_approver" on public.approvals for update using (
  public.is_founder_or_admin()
  or approver_profile_id = public.current_profile_id()
  or (domain in ('salary_hr','finance') and public.is_hr_finance())
  or (domain in ('general','production','external_comms') and public.is_company_manager(company_id))
);

-- Work orders/model usage/audit logs.
drop policy if exists "work_orders_select_scope" on public.work_orders;
create policy "work_orders_select_scope" on public.work_orders for select using (public.is_founder_or_admin() or created_by_profile_id = public.current_profile_id() or public.has_company_access(company_id));
drop policy if exists "work_orders_insert_auth" on public.work_orders;
create policy "work_orders_insert_auth" on public.work_orders for insert with check (auth.uid() is not null);
drop policy if exists "work_orders_update_admin" on public.work_orders;
create policy "work_orders_update_admin" on public.work_orders for update using (public.is_founder_or_admin() or created_by_profile_id = public.current_profile_id());

drop policy if exists "kpi_select_authorized" on public.kpi_records;
create policy "kpi_select_authorized" on public.kpi_records for select using (public.is_hr_finance() or public.is_company_manager(company_id) or exists (select 1 from public.people pe where pe.id = kpi_records.person_id and pe.profile_id = public.current_profile_id()));
drop policy if exists "kpi_write_manager" on public.kpi_records;
create policy "kpi_write_manager" on public.kpi_records for all using (public.is_hr_finance() or public.is_company_manager(company_id)) with check (public.is_hr_finance() or public.is_company_manager(company_id));

drop policy if exists "salary_rules_select_manager" on public.salary_rules;
create policy "salary_rules_select_manager" on public.salary_rules for select using (public.is_hr_finance() or public.is_company_manager(company_id));
drop policy if exists "salary_rules_write_hr" on public.salary_rules;
create policy "salary_rules_write_hr" on public.salary_rules for all using (public.is_hr_finance()) with check (public.is_hr_finance());

drop policy if exists "person_ai_policy_select" on public.person_ai_policy;
create policy "person_ai_policy_select" on public.person_ai_policy for select using (
  public.is_founder_or_admin()
  or exists (select 1 from public.people pe where pe.id = person_ai_policy.person_id and (pe.profile_id = public.current_profile_id() or public.is_company_manager(pe.company_id)))
);
drop policy if exists "person_ai_policy_write" on public.person_ai_policy;
create policy "person_ai_policy_write" on public.person_ai_policy for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

drop policy if exists "ai_reply_log_select" on public.ai_reply_log;
create policy "ai_reply_log_select" on public.ai_reply_log for select using (
  public.is_founder_or_admin()
  or exists (select 1 from public.people pe where pe.id = ai_reply_log.person_id and (pe.profile_id = public.current_profile_id() or public.is_company_manager(pe.company_id)))
);
drop policy if exists "ai_reply_log_insert" on public.ai_reply_log;
create policy "ai_reply_log_insert" on public.ai_reply_log for insert with check (
  public.is_founder_or_admin()
  or exists (select 1 from public.people pe where pe.id = ai_reply_log.person_id and public.is_company_manager(pe.company_id))
);

drop policy if exists "billing_accounts_select" on public.billing_accounts;
create policy "billing_accounts_select" on public.billing_accounts for select using (public.is_founder_or_admin() or public.is_company_manager(company_id));
drop policy if exists "billing_accounts_write" on public.billing_accounts;
create policy "billing_accounts_write" on public.billing_accounts for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

drop policy if exists "service_credit_ledger_select" on public.service_credit_ledger;
create policy "service_credit_ledger_select" on public.service_credit_ledger for select using (
  public.is_founder_or_admin()
  or exists (select 1 from public.billing_accounts ba where ba.id = service_credit_ledger.billing_account_id and public.is_company_manager(ba.company_id))
);
drop policy if exists "service_credit_ledger_insert" on public.service_credit_ledger;
create policy "service_credit_ledger_insert" on public.service_credit_ledger for insert with check (public.is_founder_or_admin() or public.is_hr_finance());

drop policy if exists "ai_pricing_settings_select" on public.ai_pricing_settings;
create policy "ai_pricing_settings_select" on public.ai_pricing_settings for select using (public.is_founder_or_admin() or public.is_hr_finance());
drop policy if exists "ai_pricing_settings_write" on public.ai_pricing_settings;
create policy "ai_pricing_settings_write" on public.ai_pricing_settings for update using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

drop policy if exists "integration_queue_select_scope" on public.integration_queue;
create policy "integration_queue_select_scope" on public.integration_queue for select using (public.is_founder_or_admin() or public.has_company_access(company_id) or created_by_profile_id = public.current_profile_id());
drop policy if exists "integration_queue_insert_scope" on public.integration_queue;
create policy "integration_queue_insert_scope" on public.integration_queue for insert with check (auth.uid() is not null and (company_id is null or public.has_company_access(company_id)));
drop policy if exists "integration_queue_update_admin" on public.integration_queue;
create policy "integration_queue_update_admin" on public.integration_queue for update using (public.is_founder_or_admin() or public.is_company_manager(company_id));

drop policy if exists "model_usage_select_own_or_admin" on public.model_usage;
create policy "model_usage_select_own_or_admin" on public.model_usage for select using (public.is_founder_or_admin() or profile_id = public.current_profile_id());
drop policy if exists "model_usage_insert_auth" on public.model_usage;
create policy "model_usage_insert_auth" on public.model_usage for insert with check (auth.uid() is not null);

drop policy if exists "audit_logs_select_scope" on public.audit_logs;
create policy "audit_logs_select_scope" on public.audit_logs for select using (public.is_founder_or_admin() or actor_profile_id = public.current_profile_id() or public.has_company_access(company_id));
drop policy if exists "audit_logs_insert_auth" on public.audit_logs;
create policy "audit_logs_insert_auth" on public.audit_logs for insert with check (auth.uid() is not null);

-- product_specs: same shape as projects (company-scope read, manager-gated write).
drop policy if exists "product_specs_select_scope" on public.product_specs;
create policy "product_specs_select_scope" on public.product_specs for select using (
  company_id is null or public.has_company_access(company_id)
);
drop policy if exists "product_specs_write_manager" on public.product_specs;
create policy "product_specs_write_manager" on public.product_specs for all using (
  company_id is null or public.is_company_manager(company_id)
) with check (
  company_id is null or public.is_company_manager(company_id)
);

-- departments / goals / key_results / goal_context — see 202608250001_goals_departments.sql.
drop policy if exists "departments_select_scope" on public.departments;
create policy "departments_select_scope" on public.departments for select using (
  public.has_company_access(company_id)
);
drop policy if exists "departments_write_manager" on public.departments;
create policy "departments_write_manager" on public.departments for all using (
  public.is_company_manager(company_id)
) with check (
  public.is_company_manager(company_id)
);

drop policy if exists "goals_select_scope" on public.goals;
create policy "goals_select_scope" on public.goals for select using (
  public.is_founder_or_admin()
  or public.has_company_access(company_id)
  or exists (select 1 from public.people pe where pe.id = goals.owner_person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "goals_insert_scope" on public.goals;
create policy "goals_insert_scope" on public.goals for insert with check (
  public.is_founder_or_admin() or public.has_company_access(company_id)
);
drop policy if exists "goals_update_scope" on public.goals;
create policy "goals_update_scope" on public.goals for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = goals.owner_person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "goals_delete_manager" on public.goals;
create policy "goals_delete_manager" on public.goals for delete using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

drop policy if exists "key_results_select_scope" on public.key_results;
create policy "key_results_select_scope" on public.key_results for select using (
  exists (select 1 from public.goals g where g.id = key_results.goal_id and (public.is_founder_or_admin() or public.has_company_access(g.company_id)))
);
drop policy if exists "key_results_write_scope" on public.key_results;
create policy "key_results_write_scope" on public.key_results for all using (
  exists (select 1 from public.goals g where g.id = key_results.goal_id and (public.is_founder_or_admin() or public.is_company_manager(g.company_id)))
) with check (
  exists (select 1 from public.goals g where g.id = key_results.goal_id and (public.is_founder_or_admin() or public.is_company_manager(g.company_id)))
);

drop policy if exists "goal_context_select_scope" on public.goal_context;
create policy "goal_context_select_scope" on public.goal_context for select using (
  exists (select 1 from public.goals g where g.id = goal_context.goal_id and (public.is_founder_or_admin() or public.has_company_access(g.company_id)))
);
drop policy if exists "goal_context_write_scope" on public.goal_context;
create policy "goal_context_write_scope" on public.goal_context for all using (
  exists (select 1 from public.goals g where g.id = goal_context.goal_id and (public.is_founder_or_admin() or public.is_company_manager(g.company_id)))
) with check (
  exists (select 1 from public.goals g where g.id = goal_context.goal_id and (public.is_founder_or_admin() or public.is_company_manager(g.company_id)))
);

alter table public.company_relationships enable row level security;
drop policy if exists "company_relationships_select_founder" on public.company_relationships;
create policy "company_relationships_select_founder" on public.company_relationships for select using (public.is_founder_or_admin());
drop policy if exists "company_relationships_write_founder" on public.company_relationships;
create policy "company_relationships_write_founder" on public.company_relationships for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

alter table public.person_assignments enable row level security;
drop policy if exists "person_assignments_select_scope" on public.person_assignments;
create policy "person_assignments_select_scope" on public.person_assignments for select using (
  public.is_founder_or_admin()
  or public.has_company_access(operating_company_id)
  or exists (select 1 from public.people pe where pe.id = person_assignments.person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "person_assignments_write_manager" on public.person_assignments;
create policy "person_assignments_write_manager" on public.person_assignments for all using (
  public.is_founder_or_admin() or public.is_company_manager(operating_company_id)
) with check (
  public.is_founder_or_admin() or public.is_company_manager(operating_company_id)
);

alter table public.chat_channels enable row level security;
drop policy if exists "chat_channels_select_scope" on public.chat_channels;
create policy "chat_channels_select_scope" on public.chat_channels for select using (
  public.is_founder_or_admin()
  or created_by_profile_id = public.current_profile_id()
  or (company_id is not null and public.has_company_access(company_id))
);
drop policy if exists "chat_channels_write_scope" on public.chat_channels;
create policy "chat_channels_write_scope" on public.chat_channels for all using (
  public.is_founder_or_admin()
  or created_by_profile_id = public.current_profile_id()
  or (company_id is not null and public.is_company_manager(company_id))
) with check (
  public.is_founder_or_admin()
  or created_by_profile_id = public.current_profile_id()
  or (company_id is not null and public.is_company_manager(company_id))
);

alter table public.ai_providers enable row level security;
drop policy if exists "ai_providers_founder_only" on public.ai_providers;
-- Which provider is active is app-wide config every user needs to read for chat to
-- work at all (both Settings and sem-ai-command read it with the caller's own RLS-scoped
-- client) — only changing it is founder/admin-only. See 202608260013.
drop policy if exists "ai_providers_select_all" on public.ai_providers;
create policy "ai_providers_select_all" on public.ai_providers for select using (true);
drop policy if exists "ai_providers_manage_founder_only" on public.ai_providers;
create policy "ai_providers_manage_founder_only" on public.ai_providers for insert with check (
  public.is_founder_or_admin()
);
drop policy if exists "ai_providers_update_founder_only" on public.ai_providers;
create policy "ai_providers_update_founder_only" on public.ai_providers for update using (
  public.is_founder_or_admin()
);
drop policy if exists "ai_providers_delete_founder_only" on public.ai_providers;
create policy "ai_providers_delete_founder_only" on public.ai_providers for delete using (
  public.is_founder_or_admin()
);

alter table public.mcp_connectors enable row level security;
drop policy if exists "mcp_connectors_founder_only" on public.mcp_connectors;
create policy "mcp_connectors_founder_only" on public.mcp_connectors for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

-- ---------- SAFE VIEWS ----------
-- security_invoker=true is required so these views evaluate RLS as the calling user,
-- not as the view owner (who bypasses RLS as table owner) — without it these views
-- would return all rows from all companies to any caller regardless of company access.
create or replace view public.safe_companies as
select id, name, country, legal_entity_name, status, description, strategic_priority, risk_score, created_at, updated_at
from public.companies;
alter view public.safe_companies set (security_invoker = true);

create or replace view public.safe_proposals as
select id, company_id, lead_id, title, language, currency, subtotal, discount_pct, total, payment_terms, status, version, created_by_profile_id, created_at, updated_at
from public.proposals;
alter view public.safe_proposals set (security_invoker = true);

revoke all on public.safe_companies from public, anon;
revoke all on public.safe_proposals from public, anon;
grant select on public.safe_companies to authenticated;
grant select on public.safe_proposals to authenticated;

-- ---------- SEED AI AGENTS ----------
insert into public.agents (name, role, description, skills, forbidden_actions, cost_limit_usd)
values
('AI Chief of Staff','chief_of_staff','Parses founder commands and creates executive briefs','["intent_parse","daily_brief","escalation"]','["external_send","salary_change","payment","contract_sign"]',1.2),
('AI Sales Manager','sales','Creates sales tasks, CRM follow-ups and proposal actions','["crm","followups","lead_scoring"]','["external_send_without_approval","price_change_without_approval"]',1.0),
('AI Proposal Agent','proposal','Builds quote/proposal drafts and approval gates','["quotation","proposal","margin_check"]','["send_without_approval","negative_margin_approval_bypass"]',1.1),
('AI Software Factory Manager','software','Creates PRDs, tickets, QA cases and release gates','["prd","tickets","qa","release_gate"]','["production_modify_without_approval"]',1.5),
('AI HR/KPI Manager','people_ops','Reviews KPI and recommends salary-impact tasks','["kpi_review","salary_recommendation"]','["salary_change_without_approval","fire_hire_execute"]',0.8),
('AI QA Manager','qa','Checks outputs against acceptance criteria','["qa","risk_check","hallucination_check"]','[]',0.8)
on conflict do nothing;

-- ---------- AUTO PROFILE ON SIGNUP ----------
-- see supabase/migrations/202608260011_auto_profile_on_signup.sql
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'employee',
    true
  )
  on conflict (email) do update set auth_user_id = excluded.auth_user_id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
