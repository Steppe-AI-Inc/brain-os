-- SEM Brain v0.7 Production Core Schema + RLS (FIXED ORDER)
-- Fix: helper functions are created after tables so Supabase SQL Editor can run cleanly.
-- Run in Supabase SQL Editor after creating a new project.
-- Design goal: real multi-user access, employee data isolation, founder-only sensitive ownership/cash/salary, auditability.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------- ENUMS ----------
do $$ begin
  create type app_role as enum ('founder','holding_admin','hr_finance','company_manager','team_lead','employee','contractor','investor_viewer','ai_agent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type visibility_level as enum ('public','internal','confidential','restricted','founder_only');
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
  parent_task_id uuid references public.tasks(id),
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
  created_at timestamptz default now()
);

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
  status approval_status default 'pending',
  approval_payload jsonb default '{}'::jsonb,
  requested_by_profile_id uuid references public.profiles(id),
  approver_profile_id uuid references public.profiles(id),
  decision_notes text,
  created_at timestamptz default now(),
  decided_at timestamptz
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  command text not null,
  company_id uuid references public.companies(id) on delete set null,
  assigned_agent_id uuid references public.agents(id),
  status work_status default 'queued',
  context_pack jsonb default '{}'::jsonb,
  output jsonb default '{}'::jsonb,
  token_estimate int default 0,
  cost_estimate_usd numeric default 0,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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
  task_id uuid references public.tasks(id),
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


-- ---------- HELPERS ----------
create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where auth_user_id = auth.uid() limit 1;
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

-- Tasks: owner/person, company scope, managers/admin.
drop policy if exists "tasks_select_scope" on public.tasks;
create policy "tasks_select_scope" on public.tasks for select using (
  public.is_founder_or_admin()
  or public.has_company_access(company_id)
  or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "tasks_insert_scope" on public.tasks;
create policy "tasks_insert_scope" on public.tasks for insert with check (public.is_founder_or_admin() or company_id is null or public.has_company_access(company_id));
drop policy if exists "tasks_update_scope" on public.tasks;
create policy "tasks_update_scope" on public.tasks for update using (public.is_founder_or_admin() or public.is_company_manager(company_id) or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id()));

-- Memories: restricted/founder_only visible only to admins; otherwise company scope.
drop policy if exists "memories_select_scope" on public.memories;
create policy "memories_select_scope" on public.memories for select using (
  public.is_founder_or_admin()
  or (sensitivity in ('public','internal','confidential') and (company_id is null or public.has_company_access(company_id)))
);
drop policy if exists "memories_write_scope" on public.memories;
create policy "memories_write_scope" on public.memories for all using (public.is_founder_or_admin() or company_id is null or public.is_company_manager(company_id)) with check (public.is_founder_or_admin() or company_id is null or public.is_company_manager(company_id));

-- Documents: same sensitivity rule as memories.
drop policy if exists "documents_select_scope" on public.documents;
create policy "documents_select_scope" on public.documents for select using (
  public.is_founder_or_admin()
  or (sensitivity in ('public','internal','confidential') and (company_id is null or public.has_company_access(company_id)))
);
drop policy if exists "documents_write_scope" on public.documents;
create policy "documents_write_scope" on public.documents for all using (public.is_founder_or_admin() or public.is_company_manager(company_id)) with check (public.is_founder_or_admin() or public.is_company_manager(company_id));

-- Product/inventory/sales/proposals by company scope; proposal internal margin is column-level sensitive, so hide via views in production UI.
drop policy if exists "product_lines_company_scope" on public.product_lines;
create policy "product_lines_company_scope" on public.product_lines for all using (public.has_company_access(company_id)) with check (public.has_company_access(company_id));
drop policy if exists "inventory_company_scope" on public.inventory_items;
create policy "inventory_company_scope" on public.inventory_items for all using (public.has_company_access(company_id)) with check (public.has_company_access(company_id));
drop policy if exists "sales_leads_company_scope" on public.sales_leads;
create policy "sales_leads_company_scope" on public.sales_leads for all using (public.has_company_access(company_id)) with check (public.has_company_access(company_id));
drop policy if exists "proposals_company_scope" on public.proposals;
create policy "proposals_company_scope" on public.proposals for all using (public.has_company_access(company_id)) with check (public.has_company_access(company_id));
drop policy if exists "proposal_items_scope" on public.proposal_items;
create policy "proposal_items_scope" on public.proposal_items for all using (exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and public.has_company_access(p.company_id))) with check (exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and public.has_company_access(p.company_id)));

-- Approvals: company managers/admins and requested/approver profile.
drop policy if exists "approvals_select_scope" on public.approvals;
create policy "approvals_select_scope" on public.approvals for select using (public.is_founder_or_admin() or public.has_company_access(company_id) or requested_by_profile_id = public.current_profile_id() or approver_profile_id = public.current_profile_id());
drop policy if exists "approvals_insert_scope" on public.approvals;
create policy "approvals_insert_scope" on public.approvals for insert with check (public.is_founder_or_admin() or company_id is null or public.has_company_access(company_id));
drop policy if exists "approvals_update_approver" on public.approvals;
create policy "approvals_update_approver" on public.approvals for update using (public.is_founder_or_admin() or approver_profile_id = public.current_profile_id() or public.is_company_manager(company_id));

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

-- ---------- SAFE VIEWS ----------
create or replace view public.safe_companies as
select id, name, country, legal_entity_name, status, description, strategic_priority, risk_score, created_at, updated_at
from public.companies;

create or replace view public.safe_proposals as
select id, company_id, lead_id, title, language, currency, subtotal, discount_pct, total, payment_terms, status, version, created_by_profile_id, created_at, updated_at
from public.proposals;

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
