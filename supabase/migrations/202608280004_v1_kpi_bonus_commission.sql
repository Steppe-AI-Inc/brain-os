-- SEM Brain v1 — compensation governance
-- Fixed salary remains contractual. AI computes auditable bonus/commission recommendations;
-- compensation actions still require authorized human approval.
begin;

create table if not exists public.kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  role_title text,
  name text not null,
  description text,
  direction text not null default 'higher_better'
    check (direction in ('higher_better','lower_better','pass_fail')),
  weight numeric not null default 0 check (weight between 0 and 100),
  evidence_required boolean not null default true,
  quality_gate jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.compensation_policy_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  role_title text,
  version int not null,
  name text not null,
  fixed_salary_auto_change boolean not null default false check (fixed_salary_auto_change = false),
  performance_bonus_max_pct numeric not null default 30 check (performance_bonus_max_pct between 0 and 100),
  bonus_curve jsonb not null default '{"0":0,"60":5,"70":10,"80":20,"90":25,"95":30}'::jsonb,
  attendance_policy jsonb not null default '{}'::jsonb,
  value_creation_policy jsonb not null default '{}'::jsonb,
  sales_commission_policy jsonb not null default '{"basis":"collected_revenue_or_gross_profit","uncapped":true}'::jsonb,
  active boolean not null default false,
  effective_from date,
  effective_to date,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(organization_id, company_id, role_title, version)
);

alter table public.kpi_records
  add column if not exists kpi_definition_id uuid references public.kpi_definitions(id) on delete set null,
  add column if not exists direction text default 'higher_better'
    check (direction in ('higher_better','lower_better','pass_fail')),
  add column if not exists evidence_refs jsonb not null default '[]'::jsonb,
  add column if not exists quality_gate_result jsonb not null default '{}'::jsonb,
  add column if not exists quality_gate_passed boolean,
  add column if not exists calculated_score numeric,
  add column if not exists policy_version_id uuid references public.compensation_policy_versions(id) on delete set null;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  work_date date not null,
  scheduled_start timestamptz,
  actual_start timestamptz,
  scheduled_end timestamptz,
  actual_end timestamptz,
  status text not null default 'present' check (status in ('present','late','absent','approved_leave','remote','field_work')),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(person_id, work_date)
);

create table if not exists public.compensation_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  period text not null,
  policy_version_id uuid not null references public.compensation_policy_versions(id) on delete restrict,
  fixed_salary_snapshot numeric not null default 0,
  currency text not null default 'USD',
  overall_kpi_score numeric,
  performance_bonus_pct numeric not null default 0,
  performance_bonus_amount numeric not null default 0,
  value_creation_amount numeric not null default 0,
  total_variable_amount numeric not null default 0,
  explanation jsonb not null default '{}'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected','paid','cancelled')),
  approval_id uuid references public.approvals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id, period, policy_version_id)
);

create table if not exists public.sales_commission_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  period text not null,
  source_entity_type text not null default 'contract',
  source_entity_id uuid,
  customer_name text,
  contract_value numeric not null default 0,
  collected_revenue numeric not null default 0,
  gross_profit numeric,
  commission_basis text not null default 'collected_revenue'
    check (commission_basis in ('contract_value','collected_revenue','gross_profit')),
  commission_rate_pct numeric not null default 0 check (commission_rate_pct >= 0),
  commission_amount numeric not null default 0,
  evidence_refs jsonb not null default '[]'::jsonb,
  status text not null default 'calculated' check (status in ('calculated','pending_approval','approved','paid','reversed')),
  approval_id uuid references public.approvals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kpi_definitions_role_idx on public.kpi_definitions(organization_id, role_title, active);
create index if not exists attendance_person_period_idx on public.attendance_records(person_id, work_date desc);
create index if not exists compensation_recommendations_person_idx on public.compensation_recommendations(person_id, period);
create index if not exists sales_commission_person_idx on public.sales_commission_events(person_id, period);

-- Deterministic scoring helper; no LLM required. Quality-gate failure can cap a KPI at zero.
create or replace function public.calculate_kpi_score(
  p_target numeric,
  p_actual numeric,
  p_direction text,
  p_quality_gate_passed boolean default true
) returns numeric
language plpgsql immutable as $$
declare
  score numeric;
begin
  if coalesce(p_quality_gate_passed, true) = false then return 0; end if;
  if p_direction = 'pass_fail' then
    return case when coalesce(p_actual,0) >= coalesce(p_target,1) then 100 else 0 end;
  elsif p_direction = 'lower_better' then
    if coalesce(p_actual,0) <= 0 then return 100; end if;
    if coalesce(p_target,0) <= 0 then return 0; end if;
    score := (p_target / p_actual) * 100;
  else
    if coalesce(p_target,0) <= 0 then return 0; end if;
    score := (coalesce(p_actual,0) / p_target) * 100;
  end if;
  return greatest(0, least(100, score));
end;
$$;

-- Commission calculation is deterministic and uncapped unless the policy itself says otherwise.
create or replace function public.calculate_sales_commission(
  p_basis text,
  p_contract_value numeric,
  p_collected_revenue numeric,
  p_gross_profit numeric,
  p_rate_pct numeric
) returns numeric
language sql immutable as $$
  select round(
    greatest(0,
      case p_basis
        when 'contract_value' then coalesce(p_contract_value,0)
        when 'gross_profit' then coalesce(p_gross_profit,0)
        else coalesce(p_collected_revenue,0)
      end
    ) * greatest(0,coalesce(p_rate_pct,0)) / 100.0,
    6
  );
$$;

alter table public.kpi_definitions enable row level security;
alter table public.compensation_policy_versions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.compensation_recommendations enable row level security;
alter table public.sales_commission_events enable row level security;

drop policy if exists "kpi_definitions_select_member" on public.kpi_definitions;
create policy "kpi_definitions_select_member" on public.kpi_definitions for select
using (public.has_organization_access(organization_id));

drop policy if exists "kpi_definitions_write_manager" on public.kpi_definitions;
create policy "kpi_definitions_write_manager" on public.kpi_definitions for all
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

drop policy if exists "compensation_policy_select_authorized" on public.compensation_policy_versions;
create policy "compensation_policy_select_authorized" on public.compensation_policy_versions for select
using (public.can_manage_organization_people(organization_id));

drop policy if exists "compensation_policy_write_owner_admin" on public.compensation_policy_versions;
create policy "compensation_policy_write_owner_admin" on public.compensation_policy_versions for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "attendance_select_scope" on public.attendance_records;
create policy "attendance_select_scope" on public.attendance_records for select
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "attendance_write_manager" on public.attendance_records;
create policy "attendance_write_manager" on public.attendance_records for all
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

drop policy if exists "comp_recommendations_select_scope" on public.compensation_recommendations;
create policy "comp_recommendations_select_scope" on public.compensation_recommendations for select
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "comp_recommendations_write_authorized" on public.compensation_recommendations;
create policy "comp_recommendations_write_authorized" on public.compensation_recommendations for all
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

drop policy if exists "sales_commission_select_scope" on public.sales_commission_events;
create policy "sales_commission_select_scope" on public.sales_commission_events for select
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "sales_commission_write_authorized" on public.sales_commission_events;
create policy "sales_commission_write_authorized" on public.sales_commission_events for all
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

-- Existing salary_private remains the fixed contractual salary source. AI does not receive
-- a direct salary mutation function here; changes continue through explicit approvals/HR.

grant execute on function public.calculate_kpi_score(numeric,numeric,text,boolean) to authenticated;
grant execute on function public.calculate_sales_commission(text,numeric,numeric,numeric,numeric) to authenticated;

commit;
