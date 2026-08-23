-- SEM Brain rewrite — Phase 3 (ticket: Software Factory)
-- The only new table called for by the rewrite plan's "missing-table decisions": PRDs are
-- a distinct entity from tasks (a document, not a work item), so software tickets
-- themselves stay as `tasks` rows (source='software_factory') rather than a parallel
-- table, per the plan's bias toward fewer new tables. qa_cases/releases stay deferred.

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

alter table public.product_specs enable row level security;

-- Same read/write shape as projects: company-scope read, manager-gated write.
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
