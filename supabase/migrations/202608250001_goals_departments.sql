-- SEM Brain — Goals module + real Departments concept.
-- Ported from blankcollar-agentic-os's ops.goal/ops.key_result/ops.goal_context shape
-- (see the `blankcollar` branch), adapted to this schema's conventions: goals are
-- scoped to a `company_id` (this product is multi-company, not single-org+departments
-- like the reference), department is an optional narrower scope nested under a
-- company. Ownership reuses the same owner_type/owner_person_id/owner_agent_id triple
-- `public.tasks` already established, instead of inventing a new pattern.
--
-- Goal-linked memories reuse the existing `public.memories` polymorphic
-- entity_type/entity_id columns (entity_type='goal', entity_id=goals.id) rather than
-- adding a new column — that generalization already exists in this schema, unlike
-- blankcollar's dedicated brain.memory table.

do $$ begin
  create type goal_status as enum ('draft','active','paused','achieved','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type goal_kind as enum ('ephemeral','standing','routine','decision');
exception when duplicate_object then null; end $$;

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
  owner_type text not null default 'human', -- human or agent
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

alter table public.departments enable row level security;
alter table public.goals enable row level security;
alter table public.key_results enable row level security;
alter table public.goal_context enable row level security;

-- Same read/write shape as projects/product_specs: company-scope read, manager-gated write.
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

-- key_results / goal_context are scoped via their parent goal's company.
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
