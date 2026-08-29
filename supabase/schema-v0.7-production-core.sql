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
  create type company_relationship_type as enum ('parent_of','owned_by_percentage','business_unit_of','brand_of','subsidiary_of','department_of');
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
  -- See 202608280013_frictionless_company_delete.sql: "delete" = archive (status ->
  -- 'archived'). Constrained below; the companies_lifecycle_guard trigger (also that
  -- migration) additionally blocks any status write into/out of 'archived' that didn't
  -- go through archive_company()/restore_company() - this column alone doesn't tell the
  -- whole story, the trigger is the real enforcement.
  status text default 'active'
    check (status in ('active','planning','paused','closed','archived')),
  description text,
  strategic_priority int default 5,
  risk_score int default 0,
  is_seed_data boolean default false,
  -- Distinguishes a real legal company from a business unit/brand/department that just
  -- happens to live in the same table - see 202608280006_organization_graph_fixes.sql.
  -- Without this, "CLIX GPS is a business unit, not a company" had nowhere to go.
  organization_type text not null default 'legal_entity'
    check (organization_type in ('legal_entity','holding_company','subsidiary','business_unit','brand','department','country_operation')),
  -- Unconditionally server-set by the companies_force_creator trigger (same migration) -
  -- never trust a client-supplied value. Nullable, never backfilled for legacy rows:
  -- every company created before this column existed was created by an account that was
  -- always founder/admin anyway, so is_founder_or_admin() already covers them without
  -- fabricating provenance.
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A `default` clause alone doesn't stop a client from explicitly supplying the column in
-- an INSERT, so this trigger unconditionally overwrites it regardless of what was
-- supplied - cannot be bypassed by any INSERT shape, present or future.
create or replace function public.force_company_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by_profile_id := public.current_profile_id();
  return new;
end;
$$;

drop trigger if exists companies_force_creator on public.companies;
create trigger companies_force_creator
  before insert on public.companies
  for each row execute function public.force_company_creator();

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
  -- See 202608290001_task_goal_archive_restore.sql: stores the exact status a task had
  -- right before archive_task() archived it (a task has no single "active" state to
  -- restore to the way companies do), so restore_task() can put it back precisely
  -- instead of guessing.
  previous_status work_status,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- force_task_creator: unconditional BEFORE INSERT, same pattern as force_company_creator
-- above - closes a real gap where createTask() (manual UI path) never set this column at
-- all, while the AI-creation RPC path did, leaving it inconsistently populated.
create or replace function public.force_task_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by_profile_id := public.current_profile_id();
  return new;
end;
$$;
drop trigger if exists tasks_force_creator on public.tasks;
create trigger tasks_force_creator
  before insert on public.tasks
  for each row execute function public.force_task_creator();

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
  service_fee_monthly numeric default 0,
  warranty text,
  delivery_timeline text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- unit_cost lives here, not on product_lines — RLS is row-level, not column-level, and a
-- "safe view without the sensitive column" doesn't protect anything if the base table
-- itself remains directly queryable. Manager+-only, both read and write.
create table if not exists public.product_costs (
  product_line_id uuid primary key references public.product_lines(id) on delete cascade,
  unit_cost numeric,
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
  payment_terms text,
  status text default 'draft',
  version int default 1,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- internal_margin lives here, not on proposals — same reasoning as product_costs above.
-- safe_proposals (below) already omitted this column from its view, but that only
-- matters once the base table itself stops being directly queryable by non-managers.
create table if not exists public.proposal_financials (
  proposal_id uuid primary key references public.proposals(id) on delete cascade,
  internal_margin numeric,
  updated_at timestamptz default now()
);

create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete cascade,
  product_line_id uuid references public.product_lines(id) on delete set null,
  description text,
  quantity numeric default 1,
  unit_price numeric default 0,
  line_total numeric default 0,
  created_at timestamptz default now()
);

-- unit_cost lives here, not on proposal_items — same reasoning as product_costs.
create table if not exists public.proposal_item_costs (
  proposal_item_id uuid primary key references public.proposal_items(id) on delete cascade,
  unit_cost numeric,
  updated_at timestamptz default now()
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

-- force_goal_creator: unconditional BEFORE INSERT, same pattern as force_company_creator/
-- force_task_creator - createGoal() (manual UI path) and the AI-creation RPC path both
-- previously left this column null on every real goal.
create or replace function public.force_goal_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by_profile_id := public.current_profile_id();
  return new;
end;
$$;
drop trigger if exists goals_force_creator on public.goals;
create trigger goals_force_creator
  before insert on public.goals
  for each row execute function public.force_goal_creator();

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
        and p.role <> 'investor_viewer'
    );
$$;

-- investor_viewer gets a curated, narrower read scope than a real member — see
-- migration 202608280004 for the "why" (was previously identical to employee, verified
-- live, 100% unrestricted).
create or replace function public.is_investor_viewer_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_memberships m
    join public.profiles p on p.id = m.profile_id
    where p.auth_user_id = auth.uid()
      and m.company_id = cid
      and m.active = true
      and p.role = 'investor_viewer'
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
  p_memory_candidates jsonb default '[]'::jsonb,
  p_primary_company_id uuid default null
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
    set status = 'done', output = p_output, token_estimate = p_token_estimate, updated_at = now(),
        company_id = coalesce(p_primary_company_id, company_id)
    where id = p_work_order_id
    returning id into v_work_order_id;
  end if;

  if v_work_order_id is null then
    insert into public.work_orders (command, status, context_pack, output, token_estimate, created_by_profile_id, company_id)
    values (p_command, 'done', p_context_pack, p_output, p_token_estimate, v_profile_id, p_primary_company_id)
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
    insert into public.companies (name, country, legal_entity_name, description, organization_type)
    values (
      v_company->>'name',
      nullif(v_company->>'country',''),
      nullif(v_company->>'legalEntityName',''),
      nullif(v_company->>'description',''),
      coalesce(nullif(v_company->>'organizationType',''), 'legal_entity')
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

    v_new_relationship_id := null;
    if v_entry_company_id is not null
       and ((v_entry_related_company_id is not null)::int + (v_entry_owner_profile_id is not null)::int = 1)
    then
      -- A 'current' company-to-company relationship goes through the idempotent RPC
      -- (202608280006_organization_graph_fixes.sql) - this is exactly the case that
      -- produced a live duplicate row when the founder repeated "make SEM GRT owned by
      -- SEM LLC." 'planned'/'historical'/'under_restructuring' rows and personal
      -- (owner_profile_id) ownership keep the richer raw insert (notes, effective_date,
      -- states set_company_relationship doesn't model) - the integrity trigger still
      -- applies to those either way. Wrapped in its own sub-transaction: a cycle or
      -- >100%-ownership violation must skip just this one relationship (same silent-skip
      -- discipline as every other entry in this function), never abort the founder's
      -- entire chat command - tasks/companies/etc. from the same turn must still commit.
      begin
        if v_entry_related_company_id is not null
           and coalesce((v_relationship->>'state')::relationship_state,'planned'::relationship_state) = 'current'::relationship_state
        then
          v_new_relationship_id := public.set_company_relationship(
            v_entry_company_id,
            v_entry_related_company_id,
            coalesce((v_relationship->>'relationshipType')::company_relationship_type,'parent_of'::company_relationship_type),
            nullif(v_relationship->>'ownershipPct','')::numeric,
            'current'
          );
        else
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
        end if;
      exception when others then
        v_new_relationship_id := null;
      end;
    end if;

    if v_new_relationship_id is not null then
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

    v_new_assignment_id := null;
    if v_new_person_id is not null then
      -- A 'current' + primary assignment (the default, and the shape of a real "move X
      -- to Y" command) goes through the idempotent RPC (202608280011) - same rationale
      -- as company_relationships: repeating the same move must be a no-op, not a
      -- duplicate, and this is also what keeps people.company_id (what every other page
      -- actually reads) in sync. Non-primary/planned/historical rows keep the raw insert
      -- (a genuine secondary assignment, or explicitly-not-yet-real intent). Wrapped so a
      -- bad entry skips just this one assignment, never the whole chat command.
      begin
        if v_entry_related_company_id is not null
           and coalesce((v_assignment->>'state')::assignment_state,'current'::assignment_state) = 'current'::assignment_state
           and coalesce((v_assignment->>'isPrimary')::boolean, true)
        then
          v_new_assignment_id := public.set_person_assignment(
            v_new_person_id,
            v_entry_related_company_id,
            v_entry_company_id,
            nullif(v_assignment->>'departmentId','')::uuid,
            nullif(v_assignment->>'jobTitle',''),
            v_entry_manager_id,
            coalesce(v_assignment->>'employmentType','full_time'),
            coalesce(nullif(v_assignment->>'allocationPct','')::numeric, 100),
            nullif(v_assignment->>'responsibilities',''),
            true,
            'current'
          );
        else
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
        end if;
      exception when others then
        v_new_assignment_id := null;
      end;
    end if;

    if v_new_assignment_id is not null then
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

  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id, message, metadata)
  values (
    v_profile_id, public.current_role(), 'ai_command_executed', 'work_order', v_work_order_id, p_primary_company_id,
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

revoke all on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, uuid) from public, anon;
grant execute on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, uuid) to authenticated;

-- chat_channels backfilled after-the-fact, mirroring the existing "rename from the AI's
-- understanding once the stream finishes" pattern (KNOWN_FAILURE_MODES.md #7) -- the
-- channel is created before the model responds, so its company can only be known after.
create or replace function public.set_channel_company_id(p_channel_id uuid, p_company_id uuid)
returns void
language sql
security invoker
as $$
  update public.chat_channels set company_id = p_company_id, updated_at = now()
  where id = p_channel_id and company_id is null;
$$;
revoke all on function public.set_channel_company_id(uuid, uuid) from public, anon;
grant execute on function public.set_channel_company_id(uuid, uuid) to authenticated;

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
alter table public.product_costs enable row level security;
alter table public.proposal_financials enable row level security;
alter table public.proposal_item_costs enable row level security;

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
create policy "companies_select_member" on public.companies for select using (public.has_company_access(id) or public.is_investor_viewer_of(id));
-- See 202608280013_frictionless_company_delete.sql: RLS matches archive_company/
-- restore_company's authorization exactly (including the membership-expiry rule for
-- creators) so there is no surface where direct-write behavior differs from the RPCs.
-- INSERT is split out separately: "creator has active membership on this company" can
-- never be satisfied for a brand-new row (nobody can be a member of a company before it
-- exists), so that clause only applies to UPDATE/DELETE of an existing row - creating a
-- new top-level company stays founder/admin-only, unchanged from original behavior.
drop policy if exists "companies_write_admin" on public.companies;
drop policy if exists "companies_write_scope" on public.companies;
drop policy if exists "companies_insert_admin" on public.companies;
drop policy if exists "companies_update_delete_scope" on public.companies;
create policy "companies_insert_admin" on public.companies for insert with check (public.is_founder_or_admin());
create policy "companies_update_delete_scope" on public.companies for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(id)
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = companies.id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(id)
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = companies.id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
);
create policy "companies_delete_admin" on public.companies for delete using (public.is_founder_or_admin());

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
-- Direct writes are founder/admin only (KNOWN_FAILURE_MODES.md #14, migration
-- 202608280003) -- an hr_finance caller proposes via propose_salary_change(), which
-- creates a real approval; decide_approval() applies it, and denies the same person who
-- proposed it from also deciding it (see decide_approval() below).
create policy "salary_write_hr" on public.salary_private for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

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
-- See 202608290001_task_goal_archive_restore.sql: creator+active-membership tier added,
-- same rule as companies - a company_id IS NULL task's creator needs no membership check
-- (nothing to have been removed from).
create policy "tasks_update_scope" on public.tasks for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and (
      company_id is null
      or exists (
        select 1 from public.company_memberships m
        where m.company_id = tasks.company_id and m.profile_id = public.current_profile_id() and m.active = true
      )
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and (
      company_id is null
      or exists (
        select 1 from public.company_memberships m
        where m.company_id = tasks.company_id and m.profile_id = public.current_profile_id() and m.active = true
      )
    )
  )
);
-- Delete is manager+/admin only, deliberately narrower than update (no owner
-- self-service) — deleting is harder to undo than editing. Migration 202608260003.
drop policy if exists "tasks_delete_scope" on public.tasks;
create policy "tasks_delete_scope" on public.tasks for delete using (public.is_founder_or_admin() or public.is_company_manager(company_id));

-- Memories: restricted/founder_only visible only to admins; confidential requires
-- manager/HR-finance; public/internal are general company scope.
drop policy if exists "memories_select_scope" on public.memories;
create policy "memories_select_scope" on public.memories for select using (
  public.is_founder_or_admin()
  or (sensitivity = 'public' and (company_id is null or public.has_company_access(company_id) or public.is_investor_viewer_of(company_id)))
  or (sensitivity = 'internal' and (company_id is null or public.has_company_access(company_id)))
  or (sensitivity = 'confidential' and (company_id is null or public.is_company_manager(company_id) or public.is_hr_finance()))
);
drop policy if exists "memories_write_scope" on public.memories;
create policy "memories_write_scope" on public.memories for all using (public.is_founder_or_admin() or company_id is null or public.is_company_manager(company_id)) with check (public.is_founder_or_admin() or company_id is null or public.is_company_manager(company_id));

-- Documents: same sensitivity rule as memories.
drop policy if exists "documents_select_scope" on public.documents;
create policy "documents_select_scope" on public.documents for select using (
  public.is_founder_or_admin()
  or (sensitivity = 'public' and (company_id is null or public.has_company_access(company_id) or public.is_investor_viewer_of(company_id)))
  or (sensitivity = 'internal' and (company_id is null or public.has_company_access(company_id)))
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
  public.is_founder_or_admin() or public.is_company_manager(company_id) or public.is_hr_finance() or public.is_investor_viewer_of(company_id)
);
drop policy if exists "financial_reports_write_scope" on public.financial_reports;
create policy "financial_reports_write_scope" on public.financial_reports for all using (
  public.is_founder_or_admin() or public.is_company_manager(company_id) or public.is_hr_finance()
) with check (
  public.is_founder_or_admin() or public.is_company_manager(company_id) or public.is_hr_finance()
);

-- Storage: the `documents` bucket stores uploaded artifacts (financial statements etc.)
-- at path `{company_id}/{document_id}.ext`. RLS must join back to documents.sensitivity,
-- not just the company folder — a confidential file's bytes must be as restricted as its
-- table row, or the row-level restriction is theater (folder-only access was a real,
-- confirmed-live gap: a technician blocked from a confidential document's row could
-- still fetch the file itself via a signed URL).
drop policy if exists "documents_bucket_select" on storage.objects;
create policy "documents_bucket_select" on storage.objects for select using (
  bucket_id = 'documents'
  and (
    public.is_founder_or_admin()
    or exists (
      select 1 from public.documents d
      where d.storage_path = objects.name
        and (
          (d.sensitivity in ('public', 'internal') and ((d.company_id is null) or public.has_company_access(d.company_id)))
          or (d.sensitivity = 'confidential' and ((d.company_id is null) or public.is_company_manager(d.company_id) or public.is_hr_finance()))
        )
    )
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
-- stock data — not general-employee-writable). Cost/margin columns live in their own
-- companion tables (product_costs, proposal_financials, proposal_item_costs), each with
-- their own manager+-only RLS — column-level sensitivity can't be expressed as RLS, so
-- the sensitive figure simply isn't in the row a non-manager can query.
drop policy if exists "product_lines_company_scope" on public.product_lines;
create policy "product_lines_select_scope" on public.product_lines for select using (public.has_company_access(company_id));
drop policy if exists "product_lines_write_manager" on public.product_lines;
create policy "product_lines_write_manager" on public.product_lines for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists "product_costs_select" on public.product_costs;
create policy "product_costs_select" on public.product_costs for select using (
  public.is_founder_or_admin()
  or exists (select 1 from public.product_lines pl where pl.id = product_costs.product_line_id and public.is_company_manager(pl.company_id))
);
drop policy if exists "product_costs_write" on public.product_costs;
create policy "product_costs_write" on public.product_costs for all using (
  public.is_founder_or_admin()
  or exists (select 1 from public.product_lines pl where pl.id = product_costs.product_line_id and public.is_company_manager(pl.company_id))
) with check (
  public.is_founder_or_admin()
  or exists (select 1 from public.product_lines pl where pl.id = product_costs.product_line_id and public.is_company_manager(pl.company_id))
);

drop policy if exists "inventory_company_scope" on public.inventory_items;
create policy "inventory_select_scope" on public.inventory_items for select using (public.has_company_access(company_id));
drop policy if exists "inventory_write_manager" on public.inventory_items;
create policy "inventory_write_manager" on public.inventory_items for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

-- Sales leads: any company member can create/work leads they own (normal CRM usage);
-- managers can manage all; delete is manager-only.
drop policy if exists "sales_leads_company_scope" on public.sales_leads;
create policy "sales_leads_select_scope" on public.sales_leads for select using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = sales_leads.owner_person_id and pe.profile_id = public.current_profile_id())
);
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

drop policy if exists "proposal_financials_select" on public.proposal_financials;
create policy "proposal_financials_select" on public.proposal_financials for select using (
  public.is_founder_or_admin()
  or exists (select 1 from public.proposals p where p.id = proposal_financials.proposal_id and public.is_company_manager(p.company_id))
);
drop policy if exists "proposal_financials_write" on public.proposal_financials;
create policy "proposal_financials_write" on public.proposal_financials for all using (
  public.is_founder_or_admin()
  or exists (select 1 from public.proposals p where p.id = proposal_financials.proposal_id and public.is_company_manager(p.company_id))
) with check (
  public.is_founder_or_admin()
  or exists (select 1 from public.proposals p where p.id = proposal_financials.proposal_id and public.is_company_manager(p.company_id))
);

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

drop policy if exists "proposal_item_costs_select" on public.proposal_item_costs;
create policy "proposal_item_costs_select" on public.proposal_item_costs for select using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.proposal_items pi join public.proposals p on p.id = pi.proposal_id
    where pi.id = proposal_item_costs.proposal_item_id and public.is_company_manager(p.company_id)
  )
);
drop policy if exists "proposal_item_costs_write" on public.proposal_item_costs;
create policy "proposal_item_costs_write" on public.proposal_item_costs for all using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.proposal_items pi join public.proposals p on p.id = pi.proposal_id
    where pi.id = proposal_item_costs.proposal_item_id and public.is_company_manager(p.company_id)
  )
) with check (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.proposal_items pi join public.proposals p on p.id = pi.proposal_id
    where pi.id = proposal_item_costs.proposal_item_id and public.is_company_manager(p.company_id)
  )
);

-- Approvals: company managers/admins and requested/approver profile.
-- Read authority and approve authority are separate rules: salary_hr/finance/legal
-- domains need manager+/HR-finance tier to even read (not just company membership),
-- since the row can describe a salary/discount/HR decision. Requester/approver can
-- always see their own regardless of domain.
drop policy if exists "approvals_select_scope" on public.approvals;
create policy "approvals_select_scope" on public.approvals for select using (
  public.is_founder_or_admin()
  or (requested_by_profile_id = public.current_profile_id())
  or (approver_profile_id = public.current_profile_id())
  or (domain in ('salary_hr', 'finance', 'legal') and (public.is_hr_finance() or public.is_company_manager(company_id)))
  or (domain not in ('salary_hr', 'finance', 'legal') and public.has_company_access(company_id))
);
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
-- Deleting the record outright (not deciding it) is administrative housekeeping, same
-- tier as tasks_delete_scope, not the domain-gated decide tier above.
drop policy if exists "approvals_delete_scope" on public.approvals;
create policy "approvals_delete_scope" on public.approvals for delete using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- approval_payload/title/domain/company_id are immutable after creation
-- (KNOWN_FAILURE_MODES.md #15, migration 202608280003) -- nothing legitimately updates
-- them post-insert (decide_approval() only ever touches status/decided_at/
-- decision_notes/approver_profile_id), so this is a hard, table-level guarantee rather
-- than a convention future code has to remember. domain/company_id included, not just
-- the payload: rewriting domain from 'finance' to 'general' post-creation would let a
-- requester dodge hr_finance gating entirely.
create or replace function public.prevent_approval_payload_mutation() returns trigger
language plpgsql as $$
begin
  if new.approval_payload is distinct from old.approval_payload
     or new.title is distinct from old.title
     or new.domain is distinct from old.domain
     or new.company_id is distinct from old.company_id then
    raise exception 'approval_payload/title/domain/company_id are immutable after creation (qa/KNOWN_FAILURE_MODES.md #15)';
  end if;
  return new;
end;
$$;
drop trigger if exists approvals_payload_immutable on public.approvals;
create trigger approvals_payload_immutable
before update on public.approvals
for each row execute function public.prevent_approval_payload_mutation();

-- Plain approval-record deletion had no audit trail (decide_approval() writes one for a
-- decision; a bare DELETE never did) -- a trigger covers every current and future
-- deletion path uniformly.
create or replace function public.audit_approval_deletion() returns trigger
language plpgsql as $$
begin
  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id, message, metadata)
  values (
    public.current_profile_id(), public.current_role(), 'approval_deleted', 'approval', old.id, old.company_id,
    format('Approval record deleted: %s', old.title),
    jsonb_build_object('status_at_deletion', old.status, 'domain', old.domain)
  );
  return old;
end;
$$;
drop trigger if exists approvals_audit_deletion on public.approvals;
create trigger approvals_audit_deletion
after delete on public.approvals
for each row execute function public.audit_approval_deletion();

-- Segregation of duties for salary/finance (KNOWN_FAILURE_MODES.md #14): salary_write_hr
-- above is founder/admin only for direct writes; an hr_finance caller proposes a change
-- here, which creates a real 'salary_hr' approval that decide_approval() applies once
-- decided by someone OTHER than the proposer.
create or replace function public.propose_salary_change(
  p_person_id uuid,
  p_base_salary numeric,
  p_currency text default 'USD',
  p_compensation_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
  v_approval_id uuid;
begin
  if v_profile_id is null then
    raise exception 'No profile found for the authenticated user';
  end if;
  if not (public.is_hr_finance() or public.is_founder_or_admin()) then
    raise exception 'Not authorized to propose salary changes';
  end if;

  select company_id into v_company_id from public.people where id = p_person_id;

  insert into public.approvals (
    company_id, title, reason, risk_level, domain, requested_by_profile_id, approval_payload
  ) values (
    v_company_id,
    'Salary change proposal',
    format('Proposed base salary change to %s %s.', p_base_salary, coalesce(p_currency, 'USD')),
    'high', 'salary_hr', v_profile_id,
    jsonb_build_object('execute', jsonb_build_object(
      'action', 'update_salary', 'personId', p_person_id, 'baseSalary', p_base_salary,
      'currency', coalesce(p_currency, 'USD'), 'compensationNotes', p_compensation_notes
    ))
  )
  returning id into v_approval_id;

  return v_approval_id;
end;
$$;
revoke all on function public.propose_salary_change(uuid, numeric, text, text) from public, anon;
grant execute on function public.propose_salary_change(uuid, numeric, text, text) to authenticated;

-- decide_approval(): domain-gated decision + resume/execute, same authority as
-- approvals_update_approver, plus segregation of duties (the requester cannot also be the
-- decider, except founder/admin) and an 'update_salary' execute action alongside the
-- existing delete_tasks/delete_channels ones. Full history: migration 202608270005
-- (original), 202608280003 (segregation of duties + update_salary).
create or replace function public.decide_approval(
  p_approval_id uuid,
  p_decision approval_status,
  p_decision_notes text default null
) returns table (
  decided boolean,
  task_resumed boolean,
  deletion_summary text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval public.approvals%rowtype;
  v_can_decide boolean;
  v_task_resumed boolean := false;
  v_deletion_summary text := null;
  v_execute jsonb;
  v_action text;
  v_task_ids uuid[];
  v_channel_ids uuid[];
  v_deleted_count int;
  v_notes text;
  v_actor_profile_id uuid := public.current_profile_id();
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decide_approval only accepts approved or rejected, got %', p_decision;
  end if;

  if v_actor_profile_id is null then
    return query select false, false, null::text;
    return;
  end if;

  select * into v_approval from public.approvals where id = p_approval_id for update;
  if not found then
    return query select false, false, null::text;
    return;
  end if;

  -- Self-approval is only blocked for salary_hr/finance -- see migration 202608280003
  -- for why general/production/external_comms deliberately keep the original,
  -- self-service-allowed behavior.
  v_can_decide :=
    public.is_founder_or_admin()
    or (v_approval.approver_profile_id = v_actor_profile_id and v_approval.requested_by_profile_id is distinct from v_actor_profile_id)
    or (v_approval.domain in ('salary_hr', 'finance') and public.is_hr_finance() and v_approval.requested_by_profile_id is distinct from v_actor_profile_id)
    or (v_approval.domain in ('general', 'production', 'external_comms') and public.is_company_manager(v_approval.company_id));

  if not v_can_decide or v_approval.status <> 'pending' then
    return query select false, false, null::text;
    return;
  end if;

  if p_decision = 'approved' then
    if v_approval.task_id is not null then
      update public.tasks set status = 'queued', updated_at = now()
      where id = v_approval.task_id and status = 'needs_approval';
      v_task_resumed := found;
    end if;

    v_execute := v_approval.approval_payload -> 'execute';
    if v_execute is not null then
      v_action := v_execute ->> 'action';

      if v_action = 'delete_tasks' then
        select array_agg(x::uuid) into v_task_ids
        from jsonb_array_elements_text(coalesce(v_execute -> 'taskIds', '[]'::jsonb)) x;
        if v_task_ids is not null and array_length(v_task_ids, 1) > 0 then
          delete from public.tasks
          where id = any(v_task_ids) and company_id is not distinct from v_approval.company_id;
          get diagnostics v_deleted_count = row_count;
          v_deletion_summary := v_deleted_count || ' task(s) deleted.';
        end if;

      elsif v_action = 'delete_channels' then
        select array_agg(x::uuid) into v_channel_ids
        from jsonb_array_elements_text(coalesce(v_execute -> 'channelIds', '[]'::jsonb)) x;
        if v_channel_ids is not null and array_length(v_channel_ids, 1) > 0 then
          delete from public.chat_channels
          where id = any(v_channel_ids) and company_id is not distinct from v_approval.company_id;
          get diagnostics v_deleted_count = row_count;
          v_deletion_summary := v_deleted_count || ' channel(s) deleted.';
        end if;

      elsif v_action = 'update_salary' then
        -- Upsert, not a plain UPDATE (migration 202608280005 fixed a real bug found by
        -- re-running SC-058 after this went live): person_id is salary_private's primary
        -- key, not auto-created per person, so a person's first-ever salary proposal
        -- must be able to create the row, not just update one that may not exist yet.
        insert into public.salary_private (person_id, base_salary, currency, compensation_notes, updated_at)
        values (
          nullif(v_execute ->> 'personId', '')::uuid,
          (v_execute ->> 'baseSalary')::numeric,
          coalesce(v_execute ->> 'currency', 'USD'),
          v_execute ->> 'compensationNotes',
          now()
        )
        on conflict (person_id) do update set
          base_salary = coalesce(excluded.base_salary, public.salary_private.base_salary),
          currency = coalesce(excluded.currency, public.salary_private.currency),
          compensation_notes = coalesce(excluded.compensation_notes, public.salary_private.compensation_notes),
          updated_at = now();
        v_deletion_summary := 'Salary updated.';
      end if;
    end if;
  else
    if v_approval.task_id is not null then
      update public.tasks set status = 'rejected', updated_at = now()
      where id = v_approval.task_id and status = 'needs_approval';
      v_task_resumed := found;
    end if;
  end if;

  if p_decision_notes is not null then
    v_notes := p_decision_notes;
  else
    v_notes := null;
    if v_task_resumed then
      v_notes := case when p_decision = 'approved' then 'Linked task resumed (queued).' else 'Linked task marked rejected.' end;
    end if;
    if v_deletion_summary is not null then
      v_notes := trim(both ' ' from coalesce(v_notes, '') || ' ' || v_deletion_summary);
    end if;
  end if;

  update public.approvals
  set status = p_decision, decided_at = now(), decision_notes = v_notes,
      approver_profile_id = coalesce(approver_profile_id, v_actor_profile_id)
  where id = p_approval_id;

  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id, message, metadata)
  values (
    v_actor_profile_id, public.current_role(), 'approval_decided', 'approval', p_approval_id, v_approval.company_id,
    format('Approval %s: %s', p_decision, v_approval.title),
    jsonb_build_object('decision', p_decision, 'taskResumed', v_task_resumed, 'deletionSummary', v_deletion_summary)
  );

  return query select true, v_task_resumed, v_deletion_summary;
end;
$$;
revoke all on function public.decide_approval(uuid, approval_status, text) from public, anon;
grant execute on function public.decide_approval(uuid, approval_status, text) to authenticated;

-- Work orders/model usage/audit logs.
-- command/context_pack/output is a snapshot of what the AI knew and said during one
-- exchange — company membership alone is too weak a rule for that (no channel-
-- membership model exists yet, so this tightens to creator + manager+).
drop policy if exists "work_orders_select_scope" on public.work_orders;
create policy "work_orders_select_scope" on public.work_orders for select using (public.is_founder_or_admin() or created_by_profile_id = public.current_profile_id() or public.is_company_manager(company_id));
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

-- Payloads can carry email bodies, customer communications, document exports, external
-- recipients — company membership alone is too weak a rule; needs manager+.
drop policy if exists "integration_queue_select_scope" on public.integration_queue;
create policy "integration_queue_select_scope" on public.integration_queue for select using (public.is_founder_or_admin() or public.is_company_manager(company_id) or created_by_profile_id = public.current_profile_id());
drop policy if exists "integration_queue_insert_scope" on public.integration_queue;
create policy "integration_queue_insert_scope" on public.integration_queue for insert with check (auth.uid() is not null and (company_id is null or public.has_company_access(company_id)));
drop policy if exists "integration_queue_update_admin" on public.integration_queue;
create policy "integration_queue_update_admin" on public.integration_queue for update using (public.is_founder_or_admin() or public.is_company_manager(company_id));

drop policy if exists "model_usage_select_own_or_admin" on public.model_usage;
create policy "model_usage_select_own_or_admin" on public.model_usage for select using (public.is_founder_or_admin() or profile_id = public.current_profile_id());
drop policy if exists "model_usage_insert_auth" on public.model_usage;
create policy "model_usage_insert_auth" on public.model_usage for insert with check (auth.uid() is not null);

-- An audit row can describe a salary/discount/HR decision — company membership alone is
-- too broad for non-actor visibility; needs manager+.
drop policy if exists "audit_logs_select_scope" on public.audit_logs;
create policy "audit_logs_select_scope" on public.audit_logs for select using (public.is_founder_or_admin() or actor_profile_id = public.current_profile_id() or public.is_company_manager(company_id));
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
  or public.is_investor_viewer_of(company_id)
  or exists (select 1 from public.people pe where pe.id = goals.owner_person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "goals_insert_scope" on public.goals;
create policy "goals_insert_scope" on public.goals for insert with check (
  public.is_founder_or_admin() or public.has_company_access(company_id)
);
-- See 202608290001_task_goal_archive_restore.sql: creator+active-membership tier added,
-- same rule as companies/tasks. goals.company_id is NOT NULL, so no null-company branch
-- is needed here the way tasks required.
drop policy if exists "goals_update_scope" on public.goals;
create policy "goals_update_scope" on public.goals for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = goals.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = goals.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = goals.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = goals.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
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

-- See 202608280006_organization_graph_fixes.sql for the real-world defect this closes:
-- a repeated "move CLIX GPS under SEM LLC" created duplicate rows with no idempotency,
-- and nothing enforced ownership <=100% or blocked ownership cycles.
create unique index if not exists company_relationships_current_unique
  on public.company_relationships (company_id, related_company_id, relationship_type)
  where state = 'current' and related_company_id is not null;

create or replace function public.check_company_relationship_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cyclic boolean;
begin
  if new.state = 'current' and new.related_company_id is not null then
    -- Company-to-company ownership is 'parent_of' + ownership_pct (the existing,
    -- already-correct production convention: SEM LLC's 100% ownership of SEM GRT is
    -- recorded exactly this way) - 'owned_by_percentage' is a different case entirely
    -- (an individual's personal stake, owner_profile_id set, related_company_id always
    -- null, so it can never even reach this branch). Multiple different company_id
    -- owners can each hold a stake in the SAME related_company_id, so the sum must group
    -- by related_company_id (the owned company), not company_id (one specific owner).
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

drop trigger if exists company_relationships_integrity on public.company_relationships;
create trigger company_relationships_integrity
  before insert or update on public.company_relationships
  for each row execute function public.check_company_relationship_integrity();

create or replace function public.set_company_relationship(
  p_company_id uuid,
  p_related_company_id uuid,
  p_relationship_type public.company_relationship_type,
  p_ownership_pct numeric default null,
  p_state text default 'current'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_founder_or_admin() then
    raise exception 'Only the founder or an admin can restructure the organization graph';
  end if;
  if p_company_id = p_related_company_id then
    raise exception 'A company cannot be related to itself';
  end if;
  if p_state not in ('current', 'planned', 'historical', 'under_restructuring') then
    raise exception 'Unknown state %', p_state;
  end if;

  if p_state = 'current' and p_relationship_type <> 'owned_by_percentage' then
    update public.company_relationships
      set state = 'historical'
      where company_id = p_company_id
        and relationship_type <> 'owned_by_percentage'
        and state = 'current'
        and not (related_company_id = p_related_company_id and relationship_type = p_relationship_type);
  end if;

  insert into public.company_relationships (company_id, related_company_id, relationship_type, ownership_pct, state, created_by_profile_id)
  values (p_company_id, p_related_company_id, p_relationship_type, p_ownership_pct, p_state::public.relationship_state, public.current_profile_id())
  on conflict (company_id, related_company_id, relationship_type) where state = 'current' and related_company_id is not null
  do update set ownership_pct = coalesce(excluded.ownership_pct, public.company_relationships.ownership_pct)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.set_company_relationship(uuid, uuid, public.company_relationship_type, numeric, text) to authenticated;

-- Org effective-active propagation (Bug 6) - see
-- 202608290009_org_effective_active.sql for the full incident and live-schema
-- verification notes. Archiving a parent company/business-unit does not touch any
-- child row's status - "effectively active" means the child itself is active AND every
-- ancestor is active. Reuses the recursive-ancestor-walk shape already proven twice
-- (check_company_relationship_integrity, validate_organization_graph's own cycle CTE
-- just below). No separate view - a view would duplicate the recursion logic for no
-- benefit when every consumer wants a single boolean or a filtered row set.
create or replace function public.is_company_effectively_active(p_company_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_result boolean;
begin
  -- parent_of reverses direction relative to business_unit_of/brand_of/subsidiary_of/
  -- department_of (same DIRECTION MATTERS rule documented in the sem-ai-command system
  -- prompt): for parent_of, company_id is the PARENT and related_company_id is the
  -- child; for the other four, company_id is the SUBORDINATE and related_company_id is
  -- the container.
  with recursive up(id) as (
    select p_company_id
    union
    select case when r.relationship_type = 'parent_of' then r.company_id else r.related_company_id end
    from public.company_relationships r
    join up on (
      (r.relationship_type = 'parent_of' and r.related_company_id = up.id)
      or (r.relationship_type in ('business_unit_of','brand_of','subsidiary_of','department_of') and r.company_id = up.id)
    )
    where r.state = 'current'
  )
  -- FIXED by 202608300001_fix_effective_active_status_check.sql: this originally
  -- required bool_and(c.status = 'active'), which flagged any 'planning'/'paused'
  -- company (even a standalone one with zero ancestors) as "not effectively active" -
  -- confirmed live to produce false positives on 2 real production companies with no
  -- archived ancestor at all. "Effectively active" for this feature's actual purpose
  -- (Bug 6 - an ARCHIVED ancestor propagating down) only requires that neither the
  -- company itself nor any ancestor is 'archived' - 'planning'/'paused' are legitimate
  -- non-archived statuses, same as get_effectively_active_companies()'s own
  -- (active,planning,paused) selectability filter already treats them.
  select coalesce(bool_and(c.status <> 'archived'), true) into v_result
  from public.companies c where c.id in (select id from up);
  return v_result;
end; $$;

create or replace function public.get_effectively_active_companies()
returns table(id uuid, name text, status text)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.status from public.companies c
  where c.status in ('active','planning','paused') and public.is_company_effectively_active(c.id)
  order by c.name;
$$;

revoke all on function public.is_company_effectively_active(uuid) from public, anon;
revoke all on function public.get_effectively_active_companies() from public, anon;
grant execute on function public.is_company_effectively_active(uuid) to authenticated;
grant execute on function public.get_effectively_active_companies() to authenticated;

-- Master-prompt spec §19-20: a reusable validateOrganizationGraph() the founder can
-- invoke by name ("check SEM LLC structure and fix inconsistent company references").
-- Read-only, founder/admin gated. The write-time trigger (above) already blocks NEW
-- cycles/over-ownership going forward; this audits committed state for the same
-- invariants plus classes the trigger can't see (duplicate names, business units with no
-- parent edge, people with no company, relationships left 'planned' too long, and - added
-- by 202608290009_org_effective_active.sql - a company whose own status reads
-- active-ish but sits under an archived ancestor).
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

grant execute on function public.validate_organization_graph(uuid) to authenticated;

-- Master-prompt spec §25-26, §43: batch employee moves must be idempotent, and every
-- module a person's company shows up in must reflect the current truth. Two real gaps,
-- same class as KNOWN_FAILURE_MODES.md #19 just in the employee-move capability instead
-- of company-reclassification: person_assignments had no unique constraint (repeating a
-- move would insert a duplicate every time), and nothing synced people.company_id (what
-- the People page and everything else actually reads) when an assignment was created.
create unique index if not exists person_assignments_current_primary_unique
  on public.person_assignments (person_id)
  where state = 'current' and is_primary = true;

create or replace function public.set_person_assignment(
  p_person_id uuid,
  p_operating_company_id uuid,
  p_legal_employer_company_id uuid default null,
  p_department_id uuid default null,
  p_job_title text default null,
  p_manager_person_id uuid default null,
  p_employment_type text default 'full_time',
  p_allocation_pct numeric default 100,
  p_responsibilities text default null,
  p_is_primary boolean default true,
  p_state text default 'current'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (public.is_founder_or_admin() or public.is_company_manager(p_operating_company_id)) then
    raise exception 'Only the founder, an admin, or a manager of the target company can assign this person';
  end if;
  if p_state not in ('current', 'planned', 'historical') then
    raise exception 'Unknown state %', p_state;
  end if;
  -- Redundant explicit check (see person_assignments_enforce_department_company trigger
  -- below, added by 202608290008_person_lifecycle_end_employment_and_delete.sql) -
  -- specific, immediate error message, not instead of the trigger.
  if p_department_id is not null and not exists (
    select 1 from public.departments d where d.id = p_department_id and d.company_id = p_operating_company_id
  ) then
    raise exception 'set_person_assignment: department % does not belong to company % (cross-company department reference rejected)', p_department_id, p_operating_company_id
      using errcode = '23514';
  end if;

  if p_state = 'current' and p_is_primary then
    select id into v_id from public.person_assignments
      where person_id = p_person_id and state = 'current' and is_primary = true
        and operating_company_id = p_operating_company_id
      limit 1;
    if v_id is not null then
      update public.person_assignments
        set legal_employer_company_id = coalesce(p_legal_employer_company_id, legal_employer_company_id),
            department_id = coalesce(p_department_id, department_id),
            job_title = coalesce(p_job_title, job_title),
            manager_person_id = coalesce(p_manager_person_id, manager_person_id),
            employment_type = coalesce(p_employment_type::public.employment_type, employment_type),
            allocation_pct = coalesce(p_allocation_pct, allocation_pct),
            responsibilities = coalesce(p_responsibilities, responsibilities),
            updated_at = now()
        where id = v_id;
      update public.people set company_id = p_operating_company_id, updated_at = now() where id = p_person_id;
      return v_id;
    end if;

    update public.person_assignments
      set state = 'historical', end_date = coalesce(end_date, current_date), updated_at = now()
      where person_id = p_person_id and state = 'current' and is_primary = true;
  end if;

  insert into public.person_assignments (
    person_id, operating_company_id, legal_employer_company_id, department_id,
    job_title, manager_person_id, employment_type, allocation_pct, responsibilities,
    is_primary, state, created_by_profile_id
  ) values (
    p_person_id, p_operating_company_id, p_legal_employer_company_id, p_department_id,
    p_job_title, p_manager_person_id, coalesce(p_employment_type, 'full_time')::public.employment_type,
    p_allocation_pct, p_responsibilities, p_is_primary, p_state::public.assignment_state, public.current_profile_id()
  )
  returning id into v_id;

  if p_state = 'current' and p_is_primary then
    update public.people set company_id = p_operating_company_id, updated_at = now() where id = p_person_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.set_person_assignment(uuid, uuid, uuid, uuid, text, uuid, text, numeric, text, boolean, text) to authenticated;

-- Two-layer defense-in-depth for a real gap: nothing checked a person_assignments row's
-- department_id belongs to its operating_company_id. Same shape as
-- enforce_canonical_work_order_goal_company. See
-- 202608290008_person_lifecycle_end_employment_and_delete.sql.
create or replace function public.enforce_person_assignment_department_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.company_id = new.operating_company_id
  ) then
    raise exception 'person_assignments: department_id % does not belong to operating_company_id % (cross-company department reference rejected)', new.department_id, new.operating_company_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists person_assignments_enforce_department_company on public.person_assignments;
create trigger person_assignments_enforce_department_company
  before insert or update on public.person_assignments
  for each row execute function public.enforce_person_assignment_department_company();

-- Person/Employment lifecycle (Bug 5) - see
-- 202608290008_person_lifecycle_end_employment_and_delete.sql for the full incident and
-- live-schema verification notes. Same three-piece shape as archive_company/
-- restore_company below: SECURITY DEFINER, search_path = '', authorization re-derived
-- inside the function, session-local GUC-flag lifecycle guard (set true immediately
-- before the RPC's own UPDATE, reset to false immediately after), structured jsonb
-- return. Only two authorization tiers - founder/admin, company manager - matching
-- set_person_assignment's own check exactly (no creator-tier concept for person
-- employment).
create or replace function public.end_person_employment(p_person_id uuid, p_end_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_active boolean;
  v_authorized boolean;
  v_historicized int;
begin
  select company_id, active into v_company_id, v_active from public.people where id = p_person_id;
  if not found then
    return jsonb_build_object('operation','person.endEmployment','personId',p_person_id,
      'changed',false,'authorized',false,'assignmentsHistoricized',0,
      'postconditionPassed',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin()
    or (v_company_id is not null and public.is_company_manager(v_company_id));

  if not v_authorized then
    return jsonb_build_object('operation','person.endEmployment','personId',p_person_id,
      'changed',false,'authorized',false,'assignmentsHistoricized',0,
      'postconditionPassed',false,'reason','denied');
  end if;

  if coalesce(v_active, true) = false then
    return jsonb_build_object('operation','person.endEmployment','personId',p_person_id,
      'changed',false,'authorized',true,'assignmentsHistoricized',0,
      'postconditionPassed',true,'reason','already_inactive');
  end if;

  update public.person_assignments
    set state = 'historical', end_date = coalesce(p_end_date, current_date), updated_at = now()
    where person_id = p_person_id and state = 'current';
  get diagnostics v_historicized = row_count;

  perform set_config('app.person_lifecycle_rpc', 'true', true);
  update public.people set active = false, updated_at = now() where id = p_person_id;
  perform set_config('app.person_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','person.endEmployment','personId',p_person_id,
    'changed',true,'authorized',true,'assignmentsHistoricized',v_historicized,
    'postconditionPassed',(select active = false from public.people where id = p_person_id),
    'reason','employment_ended');
end;
$$;

create or replace function public.restore_person_employment(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_active boolean;
  v_authorized boolean;
begin
  select company_id, active into v_company_id, v_active from public.people where id = p_person_id;
  if not found then
    return jsonb_build_object('operation','person.restoreEmployment','personId',p_person_id,
      'changed',false,'authorized',false,'assignmentsHistoricized',0,
      'postconditionPassed',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin()
    or (v_company_id is not null and public.is_company_manager(v_company_id));

  if not v_authorized then
    return jsonb_build_object('operation','person.restoreEmployment','personId',p_person_id,
      'changed',false,'authorized',false,'assignmentsHistoricized',0,
      'postconditionPassed',false,'reason','denied');
  end if;

  if coalesce(v_active, true) = true then
    return jsonb_build_object('operation','person.restoreEmployment','personId',p_person_id,
      'changed',false,'authorized',true,'assignmentsHistoricized',0,
      'postconditionPassed',true,'reason','already_active');
  end if;

  perform set_config('app.person_lifecycle_rpc', 'true', true);
  update public.people set active = true, updated_at = now() where id = p_person_id;
  perform set_config('app.person_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','person.restoreEmployment','personId',p_person_id,
    'changed',true,'authorized',true,'assignmentsHistoricized',0,
    'postconditionPassed',(select active = true from public.people where id = p_person_id),
    'reason','restored');
end;
$$;

revoke all on function public.end_person_employment(uuid, date) from public, anon;
revoke all on function public.restore_person_employment(uuid) from public, anon;
grant execute on function public.end_person_employment(uuid, date) to authenticated;
grant execute on function public.restore_person_employment(uuid) to authenticated;

create or replace function public.enforce_person_lifecycle_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.active = false and coalesce(old.active, true) is distinct from false)
     or (coalesce(old.active, true) = false and new.active is distinct from false)
  then
    if coalesce(current_setting('app.person_lifecycle_rpc', true), 'false') <> 'true' then
      raise exception 'Person employment end/restore must go through end_person_employment()/restore_person_employment() - direct active writes are blocked';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists people_lifecycle_guard on public.people;
create trigger people_lifecycle_guard
  before update on public.people
  for each row execute function public.enforce_person_lifecycle_via_rpc();

-- delete_person - the tightly-controlled real hard delete. Founder/admin only, not
-- reachable from AI chat at all (UI-only, same asymmetry the org already has for
-- permanentlyDeleteCompany). Pre-checks every owner_person_id/manager_person_id-
-- referencing table with no ON DELETE clause and returns reason:'has_dependents' instead
-- of a raw FK error; only if clear, hard-deletes and returns destroyedCounts.
create or replace function public.delete_person(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
  v_authorized boolean;
  v_manager_count int;
  v_projects_count int;
  v_tasks_count int;
  v_leads_count int;
  v_goals_count int;
  v_cwo_count int;
  v_dependents jsonb;
  v_salary_count int;
  v_kpi_count int;
  v_policy_count int;
  v_assignments_count int;
  v_destroyed jsonb;
begin
  select exists(select 1 from public.people where id = p_person_id) into v_exists;
  if not v_exists then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',false,'reason','denied');
  end if;

  select count(*) into v_manager_count from public.people where manager_person_id = p_person_id;
  select count(*) into v_projects_count from public.projects where owner_person_id = p_person_id;
  select count(*) into v_tasks_count from public.tasks where owner_person_id = p_person_id;
  select count(*) into v_leads_count from public.sales_leads where owner_person_id = p_person_id;
  select count(*) into v_goals_count from public.goals where owner_person_id = p_person_id;
  select count(*) into v_cwo_count from public.canonical_work_orders where owner_person_id = p_person_id;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_dependents from (
    select 'people.manager_person_id' as "table", v_manager_count as count where v_manager_count > 0
    union all select 'projects.owner_person_id', v_projects_count where v_projects_count > 0
    union all select 'tasks.owner_person_id', v_tasks_count where v_tasks_count > 0
    union all select 'sales_leads.owner_person_id', v_leads_count where v_leads_count > 0
    union all select 'goals.owner_person_id', v_goals_count where v_goals_count > 0
    union all select 'canonical_work_orders.owner_person_id', v_cwo_count where v_cwo_count > 0
  ) x;

  if jsonb_array_length(v_dependents) > 0 then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',true,'reason','has_dependents','dependents',v_dependents);
  end if;

  select count(*) into v_salary_count from public.salary_private where person_id = p_person_id;
  select count(*) into v_kpi_count from public.kpi_records where person_id = p_person_id;
  select count(*) into v_policy_count from public.person_ai_policy where person_id = p_person_id;
  select count(*) into v_assignments_count from public.person_assignments where person_id = p_person_id;

  delete from public.people where id = p_person_id;

  v_destroyed := jsonb_build_object(
    'people', 1,
    'salary_private', v_salary_count,
    'kpi_records', v_kpi_count,
    'person_ai_policy', v_policy_count,
    'person_assignments', v_assignments_count
  );

  return jsonb_build_object('operation','person.delete','personId',p_person_id,
    'changed',true,'authorized',true,'reason','deleted','destroyedCounts',v_destroyed);
end;
$$;

revoke all on function public.delete_person(uuid) from public, anon;
grant execute on function public.delete_person(uuid) to authenticated;

-- See 202608280013_frictionless_company_delete.sql for the full incident: the founder
-- asked Brain AI to delete a company, it claimed success with zero mechanism, then the
-- real Delete button hit a raw dependency-blocking error. Fix: "delete" = archive
-- (nothing destroyed/reassigned, so no dependency check needed - that's what makes it
-- fast and unconditional for an authorized actor). One shared RPC is the ONLY path for
-- chat and the UI, enforced by the companies_lifecycle_guard trigger below, not
-- developer convention.
create or replace function public.archive_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_is_creator_with_membership boolean;
  v_authorized boolean;
begin
  select status into v_previous_status from public.companies where id = p_company_id;
  if v_previous_status is null then
    return jsonb_build_object('operation','company.archive','companyId',p_company_id,
      'previousStatus',null,'newStatus',null,'changed',false,'authorized',false,
      'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_with_membership := exists (
    select 1 from public.companies c
    join public.company_memberships m on m.company_id = c.id
      and m.profile_id = public.current_profile_id() and m.active = true
    where c.id = p_company_id and c.created_by_profile_id = public.current_profile_id()
  );
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(p_company_id)
    or v_is_creator_with_membership;

  if not v_authorized then
    return jsonb_build_object('operation','company.archive','companyId',p_company_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status = 'archived' then
    return jsonb_build_object('operation','company.archive','companyId',p_company_id,
      'previousStatus','archived','newStatus','archived','changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_archived');
  end if;

  perform set_config('app.company_lifecycle_rpc', 'true', true);
  update public.companies set status = 'archived', updated_at = now() where id = p_company_id;
  perform set_config('app.company_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','company.archive','companyId',p_company_id,
    'previousStatus',v_previous_status,'newStatus','archived','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'archived' from public.companies where id = p_company_id),
    'reason','archived');
end;
$$;

create or replace function public.restore_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_is_creator_with_membership boolean;
  v_authorized boolean;
begin
  select status into v_previous_status from public.companies where id = p_company_id;
  if v_previous_status is null then
    return jsonb_build_object('operation','company.restore','companyId',p_company_id,
      'previousStatus',null,'newStatus',null,'changed',false,'authorized',false,
      'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_with_membership := exists (
    select 1 from public.companies c
    join public.company_memberships m on m.company_id = c.id
      and m.profile_id = public.current_profile_id() and m.active = true
    where c.id = p_company_id and c.created_by_profile_id = public.current_profile_id()
  );
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(p_company_id)
    or v_is_creator_with_membership;

  if not v_authorized then
    return jsonb_build_object('operation','company.restore','companyId',p_company_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status <> 'archived' then
    return jsonb_build_object('operation','company.restore','companyId',p_company_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_active');
  end if;

  perform set_config('app.company_lifecycle_rpc', 'true', true);
  update public.companies set status = 'active', updated_at = now() where id = p_company_id;
  perform set_config('app.company_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','company.restore','companyId',p_company_id,
    'previousStatus','archived','newStatus','active','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'active' from public.companies where id = p_company_id),
    'reason','restored');
end;
$$;

revoke all on function public.archive_company(uuid) from public, anon;
revoke all on function public.restore_company(uuid) from public, anon;
grant execute on function public.archive_company(uuid) to authenticated;
grant execute on function public.restore_company(uuid) to authenticated;

create or replace function public.enforce_company_lifecycle_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'archived' and old.status is distinct from 'archived')
     or (old.status = 'archived' and new.status is distinct from 'archived')
  then
    if coalesce(current_setting('app.company_lifecycle_rpc', true), 'false') <> 'true' then
      raise exception 'Company archive/restore must go through archive_company()/restore_company() - direct status writes into or out of archived are blocked';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_lifecycle_guard on public.companies;
create trigger companies_lifecycle_guard
  before update on public.companies
  for each row execute function public.enforce_company_lifecycle_via_rpc();

-- archive_task / restore_task -------------------------------------------------------

create or replace function public.archive_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.work_status;
  v_company_id uuid;
  v_owner_person_id uuid;
  v_created_by uuid;
  v_is_creator_authorized boolean;
  v_authorized boolean;
begin
  select status, company_id, owner_person_id, created_by_profile_id
    into v_previous_status, v_company_id, v_owner_person_id, v_created_by
    from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('operation','task.archive','taskId',p_task_id,
      'changed',false,'authorized',false,'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_authorized := v_created_by = public.current_profile_id()
    and (v_company_id is null or exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.profile_id = public.current_profile_id() and m.active = true
    ));
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
    or exists (select 1 from public.people pe where pe.id = v_owner_person_id and pe.profile_id = public.current_profile_id())
    or v_is_creator_authorized;

  if not v_authorized then
    return jsonb_build_object('operation','task.archive','taskId',p_task_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status = 'archived' then
    return jsonb_build_object('operation','task.archive','taskId',p_task_id,
      'previousStatus','archived','newStatus','archived','changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_archived');
  end if;

  perform set_config('app.task_lifecycle_rpc', 'true', true);
  update public.tasks set previous_status = v_previous_status, status = 'archived', updated_at = now() where id = p_task_id;
  perform set_config('app.task_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','task.archive','taskId',p_task_id,
    'previousStatus',v_previous_status,'newStatus','archived','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'archived' from public.tasks where id = p_task_id),
    'reason','archived');
end;
$$;

create or replace function public.restore_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status public.work_status;
  v_previous_status public.work_status;
  v_company_id uuid;
  v_owner_person_id uuid;
  v_created_by uuid;
  v_is_creator_authorized boolean;
  v_authorized boolean;
  v_target_status public.work_status;
begin
  select status, previous_status, company_id, owner_person_id, created_by_profile_id
    into v_current_status, v_previous_status, v_company_id, v_owner_person_id, v_created_by
    from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('operation','task.restore','taskId',p_task_id,
      'changed',false,'authorized',false,'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_authorized := v_created_by = public.current_profile_id()
    and (v_company_id is null or exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.profile_id = public.current_profile_id() and m.active = true
    ));
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
    or exists (select 1 from public.people pe where pe.id = v_owner_person_id and pe.profile_id = public.current_profile_id())
    or v_is_creator_authorized;

  if not v_authorized then
    return jsonb_build_object('operation','task.restore','taskId',p_task_id,
      'previousStatus',v_current_status,'newStatus',v_current_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_current_status <> 'archived' then
    return jsonb_build_object('operation','task.restore','taskId',p_task_id,
      'previousStatus',v_current_status,'newStatus',v_current_status,'changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_active');
  end if;

  -- No recorded prior status (shouldn't happen via archive_task, but a directly-created
  -- 'archived' row via seed/import could lack one) - fall back to 'queued', the column's
  -- own default, rather than leaving status unset.
  v_target_status := coalesce(v_previous_status, 'queued'::public.work_status);

  perform set_config('app.task_lifecycle_rpc', 'true', true);
  update public.tasks set status = v_target_status, previous_status = null, updated_at = now() where id = p_task_id;
  perform set_config('app.task_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','task.restore','taskId',p_task_id,
    'previousStatus','archived','newStatus',v_target_status,'changed',true,
    'authorized',true,
    'postconditionPassed',(select status = v_target_status from public.tasks where id = p_task_id),
    'reason','restored');
end;
$$;

revoke all on function public.archive_task(uuid) from public, anon;
revoke all on function public.restore_task(uuid) from public, anon;
grant execute on function public.archive_task(uuid) to authenticated;
grant execute on function public.restore_task(uuid) to authenticated;

create or replace function public.enforce_task_lifecycle_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'archived' and old.status is distinct from 'archived')
     or (old.status = 'archived' and new.status is distinct from 'archived')
  then
    if coalesce(current_setting('app.task_lifecycle_rpc', true), 'false') <> 'true' then
      raise exception 'Task archive/restore must go through archive_task()/restore_task()';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_lifecycle_guard on public.tasks;
create trigger tasks_lifecycle_guard
  before update on public.tasks
  for each row execute function public.enforce_task_lifecycle_via_rpc();

-- archive_goal / restore_goal --------------------------------------------------------

create or replace function public.archive_goal(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.goal_status;
  v_company_id uuid;
  v_owner_person_id uuid;
  v_created_by uuid;
  v_is_creator_authorized boolean;
  v_authorized boolean;
begin
  select status, company_id, owner_person_id, created_by_profile_id
    into v_previous_status, v_company_id, v_owner_person_id, v_created_by
    from public.goals where id = p_goal_id;
  if not found then
    return jsonb_build_object('operation','goal.archive','goalId',p_goal_id,
      'changed',false,'authorized',false,'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_authorized := v_created_by = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.profile_id = public.current_profile_id() and m.active = true
    );
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
    or exists (select 1 from public.people pe where pe.id = v_owner_person_id and pe.profile_id = public.current_profile_id())
    or v_is_creator_authorized;

  if not v_authorized then
    return jsonb_build_object('operation','goal.archive','goalId',p_goal_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status = 'archived' then
    return jsonb_build_object('operation','goal.archive','goalId',p_goal_id,
      'previousStatus','archived','newStatus','archived','changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_archived');
  end if;

  perform set_config('app.goal_lifecycle_rpc', 'true', true);
  update public.goals set status = 'archived', updated_at = now() where id = p_goal_id;
  perform set_config('app.goal_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','goal.archive','goalId',p_goal_id,
    'previousStatus',v_previous_status,'newStatus','archived','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'archived' from public.goals where id = p_goal_id),
    'reason','archived');
end;
$$;

create or replace function public.restore_goal(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.goal_status;
  v_company_id uuid;
  v_owner_person_id uuid;
  v_created_by uuid;
  v_is_creator_authorized boolean;
  v_authorized boolean;
begin
  select status, company_id, owner_person_id, created_by_profile_id
    into v_previous_status, v_company_id, v_owner_person_id, v_created_by
    from public.goals where id = p_goal_id;
  if not found then
    return jsonb_build_object('operation','goal.restore','goalId',p_goal_id,
      'changed',false,'authorized',false,'postconditionPassed',false,'reason','not_found');
  end if;

  v_is_creator_authorized := v_created_by = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = v_company_id and m.profile_id = public.current_profile_id() and m.active = true
    );
  v_authorized := public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
    or exists (select 1 from public.people pe where pe.id = v_owner_person_id and pe.profile_id = public.current_profile_id())
    or v_is_creator_authorized;

  if not v_authorized then
    return jsonb_build_object('operation','goal.restore','goalId',p_goal_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',false,'postconditionPassed',false,'reason','denied');
  end if;

  if v_previous_status <> 'archived' then
    return jsonb_build_object('operation','goal.restore','goalId',p_goal_id,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,'changed',false,
      'authorized',true,'postconditionPassed',true,'reason','already_active');
  end if;

  perform set_config('app.goal_lifecycle_rpc', 'true', true);
  update public.goals set status = 'active', updated_at = now() where id = p_goal_id;
  perform set_config('app.goal_lifecycle_rpc', 'false', true);

  return jsonb_build_object('operation','goal.restore','goalId',p_goal_id,
    'previousStatus','archived','newStatus','active','changed',true,
    'authorized',true,
    'postconditionPassed',(select status = 'active' from public.goals where id = p_goal_id),
    'reason','restored');
end;
$$;

revoke all on function public.archive_goal(uuid) from public, anon;
revoke all on function public.restore_goal(uuid) from public, anon;
grant execute on function public.archive_goal(uuid) to authenticated;
grant execute on function public.restore_goal(uuid) to authenticated;

create or replace function public.enforce_goal_lifecycle_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'archived' and old.status is distinct from 'archived')
     or (old.status = 'archived' and new.status is distinct from 'archived')
  then
    if coalesce(current_setting('app.goal_lifecycle_rpc', true), 'false') <> 'true' then
      raise exception 'Goal archive/restore must go through archive_goal()/restore_goal()';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists goals_lifecycle_guard on public.goals;
create trigger goals_lifecycle_guard
  before update on public.goals
  for each row execute function public.enforce_goal_lifecycle_via_rpc();


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
-- No channel-membership model exists yet, so this tightens from "any company member" to
-- creator + manager+, same pattern as work_orders above.
drop policy if exists "chat_channels_select_scope" on public.chat_channels;
create policy "chat_channels_select_scope" on public.chat_channels for select using (
  public.is_founder_or_admin()
  or created_by_profile_id = public.current_profile_id()
  or (company_id is not null and public.is_company_manager(company_id))
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

-- ---------- CANONICAL WORK ORDER MODEL (Deployment A, expand-only) ----------
-- see supabase/migrations/202608290002_canonical_work_order_model.sql
--
-- Company -> Goal -> Work Order -> Task (temporarily named canonical_work_orders — the
-- `work_orders` name stays exactly what it is above, the AI chat-command audit log,
-- until a later, coordinated Deployment B/C rename cutover; see
-- docs/software-factory/CANONICAL_WORK_ORDER_MIGRATION.md). Appended here rather than
-- folded into the tasks/work_orders table definitions above because canonical_work_orders
-- must exist before anything can reference it, and this file is meant to run top to
-- bottom (line 3 above: "Run in Supabase SQL Editor after creating a new project") — the
-- real migration itself uses the same ALTER TABLE ADD COLUMN approach for this reason.

create table public.canonical_work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  title text not null,
  objective text,
  -- Extensible classification, not a rigid enum — generic Brain OS infrastructure usable
  -- by software development, sales, operations, service, finance, engineering, and future
  -- AI-managed business processes. Adding a new work_type is a one-line check-constraint
  -- migration, not a schema redesign.
  work_type text not null default 'general' check (work_type in (
    'general','software_development','sales','operations','service','finance','engineering'
  )),
  status work_status not null default 'draft',
  priority priority_level not null default 'medium',
  risk_level risk_level not null default 'low',
  acceptance_criteria jsonb not null default '[]'::jsonb,
  owner_type text not null default 'human' check (owner_type in ('human','agent')),
  owner_person_id uuid references public.people(id),
  owner_agent_id uuid references public.agents(id),
  requested_by_profile_id uuid references public.profiles(id),
  created_by_profile_id uuid references public.profiles(id),
  previous_status work_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index canonical_work_orders_company_status_idx on public.canonical_work_orders (company_id, status);
create index canonical_work_orders_goal_idx on public.canonical_work_orders (goal_id);

-- Same "unconditional BEFORE INSERT force-creator" pattern as force_task_creator/
-- force_goal_creator/force_company_creator — those were each added after a real bug where
-- both the manual UI path and the AI-creation RPC path left created_by_profile_id null.
create or replace function public.force_canonical_work_order_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by_profile_id := public.current_profile_id();
  return new;
end;
$$;
create trigger canonical_work_orders_force_creator
  before insert on public.canonical_work_orders
  for each row execute function public.force_canonical_work_order_creator();

alter table public.canonical_work_orders enable row level security;

-- Exact three-tier pattern already proven on tasks/goals/companies: founder/admin,
-- company manager, creator-with-active-membership, plus an owner-person self-view branch
-- (mirrors tasks_select_scope's owner_person_id EXISTS clause).
create policy "canonical_work_orders_select_scope" on public.canonical_work_orders for select using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or created_by_profile_id = public.current_profile_id()
  or exists (select 1 from public.people pe where pe.id = canonical_work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
);

create policy "canonical_work_orders_insert_scope" on public.canonical_work_orders for insert with check (
  public.is_founder_or_admin() or public.has_company_access(company_id)
);

create policy "canonical_work_orders_update_scope" on public.canonical_work_orders for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = canonical_work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = canonical_work_orders.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = canonical_work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = canonical_work_orders.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
);

-- Delete is manager+/admin only, deliberately narrower than update — same rule as
-- tasks_delete_scope.
create policy "canonical_work_orders_delete_scope" on public.canonical_work_orders for delete using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- Additive only: a brand new nullable column on the LIVE, unchanged tasks table. Old code
-- never selects it, never references it — this is invisible to every currently deployed
-- process. Real FK, not free-text association (tasks.parent_goal was free text — this
-- deliberately does not repeat that gap for the new relationship).
alter table public.tasks add column canonical_work_order_id uuid references public.canonical_work_orders(id) on delete set null;
create index tasks_canonical_work_order_idx on public.tasks (canonical_work_order_id);

-- Additive only: a brand new nullable column on the LIVE, unchanged work_orders table
-- (today's AI chat-command audit log — untouched otherwise by this migration). This is
-- how "AI Command Run -> optional canonical Work Order" is expressed without renaming
-- work_orders or forcing informational chat commands to create one — nullable, set only
-- when a command actually creates/executes a persistent canonical Work Order (not wired
-- up by this migration; that's later application-code work, sequenced after this schema
-- exists and is proven).
alter table public.work_orders add column canonical_work_order_id uuid references public.canonical_work_orders(id) on delete set null;
create index work_orders_canonical_work_order_idx on public.work_orders (canonical_work_order_id);

-- ============================================================================
-- public.agent_runs (Task -> Agent Assignment -> Agent Run)
-- ============================================================================
-- An Agent Definition (public.agents, already exists) and one execution of that agent are
-- genuinely different concepts. This is the one real gap with no canonical equivalent.
-- Execution EVENTS reuse audit_logs (entity_type = 'agent_run') rather than a new table —
-- audit_logs already models append-only entity/event/metadata exactly. Brand new table,
-- zero collision risk with anything live.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  canonical_work_order_id uuid references public.canonical_work_orders(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  agent_id uuid references public.agents(id),
  agent_definition_path text,
  agent_definition_hash text,
  execution_provider text not null default 'claude_code_background' check (execution_provider in ('claude_code_background','claude_code_local')),
  provider_run_id text,
  status work_status not null default 'queued',
  branch text,
  base_commit text,
  head_commit text,
  summary text,
  error text,
  verification_status text check (verification_status in ('pending','live_verified','e2e_verified','failed','blocked')),
  started_at timestamptz,
  finished_at timestamptz,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_runs_task_idx on public.agent_runs (task_id);
create index agent_runs_canonical_work_order_idx on public.agent_runs (canonical_work_order_id);
create index agent_runs_provider_run_idx on public.agent_runs (provider_run_id);

-- No force-creator trigger here, deliberately: the intended real insert path is the
-- trusted Runner process (service role, bypasses RLS already) — not a user-facing form —
-- so an unconditional BEFORE INSERT override (force_task_creator's pattern) would fight
-- the Runner's own explicit attribution instead of helping. That intent is NOT, on its
-- own, an RLS-enforced guarantee — an earlier version of agent_runs_insert_scope let any
-- authenticated session insert with company_id left null and a spoofed
-- created_by_profile_id (real defect, caught by independent review, fixed below: the
-- policy now requires created_by_profile_id to be null or the caller's own profile).
-- created_by_profile_id is left for the Runner to set explicitly (e.g. to whoever's chat
-- command originated the Work Order, if known) or leave null for an unattributed
-- background bootstrap run.

alter table public.agent_runs enable row level security;

create policy "agent_runs_select_scope" on public.agent_runs for select using (
  public.is_founder_or_admin()
  or (company_id is not null and public.is_company_manager(company_id))
  or created_by_profile_id = public.current_profile_id()
);

-- Independent DB/Security Engineer review (2026-08-29, first pass) found a real defect:
-- `company_id is null or has_company_access(company_id)` alone let ANY authenticated
-- session insert an agent_runs row with company_id left null and an arbitrary spoofed
-- created_by_profile_id (including a fabricated verification_status = 'live_verified').
-- Fixed once by additionally requiring created_by_profile_id to be null or the caller's
-- own profile — but a SECOND independent review (same day, reviewing Phase 6's new
-- public.agents_with_live_status view) found that fix was still insufficient: an
-- authenticated user could still fabricate an UNATTRIBUTED (created_by_profile_id left
-- null) agent_runs row against any real Software Factory agent, which the new view would
-- then surface as a genuine-looking RUNNING/FAILED status. See
-- 202608290004_agent_runs_insert_scope_tighten.sql: the only real insert path today is
-- the trusted service-role Runner (bypasses RLS entirely, completely unaffected by this),
-- so the policy is now founder/admin-only outright — no legitimate non-admin, non-
-- service-role flow inserts agent_runs rows directly today. A future legitimate
-- non-admin insert path should get its own properly-scoped branch when actually built,
-- not have this one left open on spec.
create policy "agent_runs_insert_scope" on public.agent_runs for insert with check (
  public.is_founder_or_admin()
);

create policy "agent_runs_update_scope" on public.agent_runs for update using (
  public.is_founder_or_admin() or (company_id is not null and public.is_company_manager(company_id))
) with check (
  public.is_founder_or_admin() or (company_id is not null and public.is_company_manager(company_id))
);

create policy "agent_runs_delete_scope" on public.agent_runs for delete using (public.is_founder_or_admin());

-- ---------- FACTORY AGENT REGISTRY (Phase 6, expand-only) ----------
-- see supabase/migrations/202608290003_factory_agent_registry.sql
--
-- Purely additive: new nullable columns on the EXISTING, live public.agents table
-- (already RLS-restricted to founder/admin for all writes via agents_write_admin,
-- defined earlier in this file — confirmed live, no new RLS policy needed for the
-- requirement that ordinary users cannot change execution/security configuration) plus
-- one real view computing live run status from actual public.agent_runs rows, never a
-- stored/fakeable status. Appended here (needs public.agent_runs, defined above) rather
-- than folded into the original `agents` table definition, for the same forward-
-- reference reason as the canonical Work Order section above.

alter table public.agents add column display_name text;
alter table public.agents add column category text check (category in (
  'SOFTWARE_FACTORY','SECURITY','INTEGRATION','VERIFICATION','RELEASE'
));
alter table public.agents add column definition_path text;
alter table public.agents add column definition_hash text;
alter table public.agents add column execution_provider text check (execution_provider is null or execution_provider in (
  'claude_code_background','claude_code_local'
));
alter table public.agents add column permission_mode text;
alter table public.agents add column has_production_authority boolean not null default false;
alter table public.agents add column provenance jsonb;

alter table public.agents add constraint agents_name_unique unique (name);

create or replace view public.agents_with_live_status as
select
  a.*,
  case
    when a.execution_provider is null then 'UNKNOWN'
    when exists (
      select 1 from public.agent_runs ar
      where ar.agent_id = a.id and ar.status in ('queued'::work_status,'in_progress'::work_status)
    ) then 'RUNNING'
    when (
      select ar.status from public.agent_runs ar
      where ar.agent_id = a.id order by ar.created_at desc limit 1
    ) = 'rejected'::work_status then 'FAILED'
    else 'IDLE'
  end as live_status,
  (select ar.id from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_id,
  (select ar.created_at from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_at,
  (select ar.status from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_status,
  (select ar.summary from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_summary,
  (select ar.head_commit from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_head_commit,
  (select ar.provider_run_id from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_provider_run_id
from public.agents a;

alter view public.agents_with_live_status set (security_invoker = true);

-- ---------- CREATE FACTORY WORK ORDER RPC (Phase 8) ----------
-- see supabase/migrations/202608290005_create_factory_work_order_rpc.sql and
-- 202608290006_factory_work_order_cross_company_fix.sql
--
-- Standalone RPC so a founder chat command can create a real, queued
-- public.canonical_work_orders row. Kept OUT of sem_execute_ai_command's own
-- transaction, matching the same precedent already used for departments/leads/
-- documents/product lines in that function's TypeScript caller. security invoker: RLS
-- applies exactly as it already does for canonical_work_orders_insert_scope - this RPC
-- grants no authority beyond what a caller already has.
--
-- SECURITY INCIDENT (2026-08-29, see docs/software-factory/PHASE_8_SECURITY_INCIDENT.md):
-- the first live version of this RPC accepted p_goal_id with no check that the
-- referenced goal actually belonged to p_company_id - RLS alone did not catch this (a FK
-- existence check does not enforce which company the referenced row belongs to). Fixed
-- with two layers: a real BEFORE INSERT OR UPDATE trigger on canonical_work_orders
-- itself (structural, holds for any future code path, not just this RPC) plus an
-- explicit check inside this RPC too (specific, immediate error message - redundant with
-- the trigger by design, not instead of it).

create or replace function public.enforce_canonical_work_order_goal_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.goal_id is not null and not exists (
    select 1 from public.goals g where g.id = new.goal_id and g.company_id = new.company_id
  ) then
    raise exception 'canonical_work_orders: goal_id % does not belong to company_id % (cross-company goal reference rejected)', new.goal_id, new.company_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists canonical_work_orders_enforce_goal_company on public.canonical_work_orders;
create trigger canonical_work_orders_enforce_goal_company
  before insert or update on public.canonical_work_orders
  for each row execute function public.enforce_canonical_work_order_goal_company();

create or replace function public.create_factory_work_order(
  p_title text,
  p_objective text,
  p_company_id uuid,
  p_goal_id uuid default null,
  p_work_type text default 'software_development',
  p_priority text default 'medium',
  p_acceptance_criteria jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  if p_goal_id is not null and not exists (
    select 1 from public.goals g where g.id = p_goal_id and g.company_id = p_company_id
  ) then
    raise exception 'create_factory_work_order: goal % does not belong to company % (cross-company goal reference rejected)', p_goal_id, p_company_id
      using errcode = '23514';
  end if;

  insert into public.canonical_work_orders (
    title, objective, company_id, goal_id, work_type, priority, acceptance_criteria,
    status, requested_by_profile_id
  ) values (
    p_title, p_objective, p_company_id, p_goal_id,
    coalesce(p_work_type, 'software_development'),
    coalesce(p_priority, 'medium')::priority_level,
    coalesce(p_acceptance_criteria, '[]'::jsonb),
    'queued',
    public.current_profile_id()
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_factory_work_order(text, text, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_factory_work_order(text, text, uuid, uuid, text, text, jsonb) to authenticated;

-- ---------- CREATE FACTORY TASK RPC (Phase 8 continuation) ----------
-- see supabase/migrations/202608290007_create_factory_task_rpc.sql
--
-- Real Task creation under a canonical Work Order, for brain-os-factory-director to use
-- when decomposing a dispatched Work Order. Built with the company-consistency invariant
-- enforced from the start (qa/KNOWN_FAILURE_MODES.md #24's explicit PRE-EXPOSURE
-- BLOCKER): p_company_id is not a parameter at all - company_id is always derived
-- server-side from the real Work Order row, never caller-supplied, so a cross-company
-- mismatch is impossible by construction. A table-level trigger is added too anyway
-- (defense in depth, mirroring 202608290006's two-layer pattern).

create or replace function public.enforce_task_work_order_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.canonical_work_order_id is not null and not exists (
    select 1 from public.canonical_work_orders wo
    where wo.id = new.canonical_work_order_id and wo.company_id = new.company_id
  ) then
    raise exception 'tasks: canonical_work_order_id % does not belong to company_id % (cross-company work order reference rejected)', new.canonical_work_order_id, new.company_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_enforce_work_order_company on public.tasks;
create trigger tasks_enforce_work_order_company
  before insert or update on public.tasks
  for each row execute function public.enforce_task_work_order_company();

create or replace function public.create_factory_task(
  p_work_order_id uuid,
  p_title text,
  p_description text default null,
  p_owner_agent_id uuid default null,
  p_acceptance_criteria jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_company_id uuid;
  v_id uuid;
begin
  select company_id into v_company_id from public.canonical_work_orders where id = p_work_order_id;
  if v_company_id is null then
    raise exception 'create_factory_task: no canonical_work_orders row % (or it has no company_id)', p_work_order_id
      using errcode = '23503';
  end if;

  insert into public.tasks (
    company_id, title, description, canonical_work_order_id,
    owner_type, owner_agent_id, acceptance_criteria, status, source
  ) values (
    v_company_id, p_title, coalesce(p_description, ''), p_work_order_id,
    case when p_owner_agent_id is not null then 'agent' else 'human' end,
    p_owner_agent_id, coalesce(p_acceptance_criteria, '[]'::jsonb),
    'queued', 'factory_director'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_factory_task(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_factory_task(uuid, text, text, uuid, jsonb) to authenticated;

-- ---------- COMPLETE AGENT RUN RPC ----------
-- see supabase/migrations/202608290010_agent_run_completion.sql
--
-- Closes a real gap found during independent verification of Phase 8 Work Order
-- 3b28e447-4a9c-4f79-9419-80638a39e457 (docs/software-factory/PHASE_8_SECURITY_INCIDENT.md):
-- today, nothing completes an agent_runs row except raw SQL run directly against
-- production. This is the one narrow, auditable, founder/admin-gated path to record a
-- background specialist agent's independently-verified real completion instead.
-- agent_runs.status and tasks.status are the exact same public.work_status enum
-- (verified live) so propagating p_status onto a linked task needs no cast/mapping.
create or replace function public.complete_agent_run(
  p_agent_run_id uuid,
  p_status public.work_status,
  p_head_commit text default null,
  p_verification_status text default null,
  p_summary text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.work_status;
  v_previous_head_commit text;
  v_previous_verification_status text;
  v_task_id uuid;
  v_authorized boolean;
  v_previous_task_status public.work_status;
  v_task_updated boolean := false;
begin
  select status, head_commit, verification_status, task_id
    into v_previous_status, v_previous_head_commit, v_previous_verification_status, v_task_id
    from public.agent_runs where id = p_agent_run_id;
  if not found then
    return jsonb_build_object('operation','agent_run.complete','agentRunId',p_agent_run_id,
      'changed',false,'authorized',false,'taskUpdated',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('operation','agent_run.complete','agentRunId',p_agent_run_id,
      'changed',false,'authorized',false,'taskUpdated',false,'reason','denied');
  end if;

  if p_verification_status is not null
     and p_verification_status not in ('pending','live_verified','e2e_verified','failed','blocked')
  then
    raise exception 'complete_agent_run: unknown verification_status % (must be pending/live_verified/e2e_verified/failed/blocked)', p_verification_status;
  end if;

  if v_previous_status = p_status
     and v_previous_head_commit is not distinct from p_head_commit
     and v_previous_verification_status is not distinct from p_verification_status
  then
    return jsonb_build_object('operation','agent_run.complete','agentRunId',p_agent_run_id,
      'changed',false,'authorized',true,'taskUpdated',false,
      'previousStatus',v_previous_status,'newStatus',v_previous_status,
      'reason','already_recorded');
  end if;

  update public.agent_runs
    set status = p_status,
        head_commit = coalesce(p_head_commit, head_commit),
        verification_status = coalesce(p_verification_status, verification_status),
        summary = coalesce(p_summary, summary),
        finished_at = now(),
        updated_at = now()
    where id = p_agent_run_id;

  if v_task_id is not null then
    select status into v_previous_task_status from public.tasks where id = v_task_id;
    if v_previous_task_status is not null and v_previous_task_status is distinct from p_status then
      perform set_config('app.task_lifecycle_rpc', 'true', true);
      update public.tasks set status = p_status, updated_at = now() where id = v_task_id;
      perform set_config('app.task_lifecycle_rpc', 'false', true);
      v_task_updated := true;
    end if;
  end if;

  return jsonb_build_object('operation','agent_run.complete','agentRunId',p_agent_run_id,
    'changed',true,'authorized',true,'taskUpdated',v_task_updated,
    'previousStatus',v_previous_status,'newStatus',p_status,
    'reason','completed');
end;
$$;

revoke all on function public.complete_agent_run(uuid, public.work_status, text, text, text) from public, anon;
grant execute on function public.complete_agent_run(uuid, public.work_status, text, text, text) to authenticated;

-- 202608300002_complete_work_order.sql mirror

create or replace function public.enforce_work_order_completion_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'done' and coalesce(old.status, 'draft') is distinct from 'done')
     or (coalesce(old.status, 'draft') = 'done' and new.status is distinct from 'done')
  then
    if coalesce(current_setting('app.work_order_completion_rpc', true), 'false') <> 'true' then
      raise exception 'canonical_work_orders.status may only transition into/out of ''done'' through complete_work_order() - direct writes are blocked';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists canonical_work_orders_completion_guard on public.canonical_work_orders;
create trigger canonical_work_orders_completion_guard
  before insert or update on public.canonical_work_orders
  for each row execute function public.enforce_work_order_completion_via_rpc();

create or replace function public.complete_work_order(p_work_order_id uuid, p_summary text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.work_status;
  v_company_id uuid;
  v_authorized boolean;
  v_incomplete_task record;
  v_incomplete_task_count int;
  v_failed_run record;
  v_incomplete_run_count int;
  v_unverified_commit_exists boolean;
  v_verified_run_id uuid;
  v_verified_commit_run_count int;
  v_cross_company_task record;
  v_task_count int;
  v_run_count int;
begin
  select status, company_id into v_status, v_company_id
    from public.canonical_work_orders where id = p_work_order_id;
  if not found then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',false,'currentStatus',v_status,'reason','denied');
  end if;

  if v_status = 'done' then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus','done',
      'completedAt',(select completed_at from public.canonical_work_orders where id = p_work_order_id),
      'reason','already_completed');
  end if;

  if v_status in ('rejected','archived') then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','invalid_state_for_completion');
  end if;

  select count(*) into v_task_count from public.tasks where canonical_work_order_id = p_work_order_id;
  select count(*) into v_run_count from public.agent_runs where canonical_work_order_id = p_work_order_id;
  if v_task_count = 0 then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','no_tasks_to_complete');
  end if;
  if v_run_count = 0 then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','no_agent_runs_recorded');
  end if;

  select count(*) into v_incomplete_task_count
    from public.tasks where canonical_work_order_id = p_work_order_id and status not in ('done','archived');
  if v_incomplete_task_count > 0 then
    select id, title, status into v_incomplete_task
      from public.tasks where canonical_work_order_id = p_work_order_id and status not in ('done','archived')
      order by created_at limit 1;
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','incomplete_task',
      'incompleteTaskId',v_incomplete_task.id,'incompleteTaskTitle',v_incomplete_task.title,
      'incompleteTaskStatus',v_incomplete_task.status,'incompleteTaskCount',v_incomplete_task_count);
  end if;

  select count(*) into v_incomplete_run_count
    from public.agent_runs where canonical_work_order_id = p_work_order_id and status <> 'done';
  if v_incomplete_run_count > 0 then
    select id, status into v_failed_run
      from public.agent_runs where canonical_work_order_id = p_work_order_id and status <> 'done'
      order by started_at limit 1;
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','incomplete_or_failed_run',
      'incompleteRunId',v_failed_run.id,'incompleteRunStatus',v_failed_run.status,
      'incompleteRunCount',v_incomplete_run_count);
  end if;

  select exists(
    select 1 from public.agent_runs
    where canonical_work_order_id = p_work_order_id
      and head_commit is not null
      and (status <> 'done'
           or (verification_status is distinct from 'live_verified' and verification_status is distinct from 'e2e_verified'))
  ) into v_unverified_commit_exists;

  if v_unverified_commit_exists then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','verification_required_not_found');
  end if;

  select id into v_verified_run_id
    from public.agent_runs
    where canonical_work_order_id = p_work_order_id
      and head_commit is not null
      and status = 'done'
      and verification_status in ('live_verified','e2e_verified')
    order by started_at desc limit 1;

  select count(*) into v_verified_commit_run_count
    from public.agent_runs
    where canonical_work_order_id = p_work_order_id
      and head_commit is not null
      and status = 'done'
      and verification_status in ('live_verified','e2e_verified');

  select id, company_id into v_cross_company_task
    from public.tasks where canonical_work_order_id = p_work_order_id and company_id is distinct from v_company_id
    limit 1;
  if v_cross_company_task.id is not null then
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,'currentStatus',v_status,'reason','cross_company_task_reference',
      'conflictingTaskId',v_cross_company_task.id);
  end if;

  perform set_config('app.work_order_completion_rpc', 'true', true);
  update public.canonical_work_orders
    set status = 'done', previous_status = v_status, completed_at = now(), updated_at = now()
    where id = p_work_order_id and status = v_status;
  if not found then
    perform set_config('app.work_order_completion_rpc', 'false', true);
    return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
      'changed',false,'authorized',true,
      'currentStatus',(select status from public.canonical_work_orders where id = p_work_order_id),
      'completedAt',(select completed_at from public.canonical_work_orders where id = p_work_order_id),
      'reason','concurrent_completion');
  end if;
  perform set_config('app.work_order_completion_rpc', 'false', true);

  return jsonb_build_object('operation','work_order.complete','workOrderId',p_work_order_id,
    'changed',true,'authorized',true,'previousStatus',v_status,'newStatus','done',
    'completedAt',(select completed_at from public.canonical_work_orders where id = p_work_order_id),
    'taskCount',v_task_count,'agentRunCount',v_run_count,'verifiedByAgentRunId',v_verified_run_id,
    'verifiedCommitRunCount',v_verified_commit_run_count,'summary',p_summary,'reason','completed');
end;
$$;

revoke all on function public.complete_work_order(uuid, text) from public, anon;
grant execute on function public.complete_work_order(uuid, text) to authenticated;
