-- Financial document upload -> AI analysis -> dashboard. Founder's ask, verbatim:
-- "i upload clix gps financial results for the last month, it should save the
-- artifact, analyze it, ai agent/cfo, bookkeper, make report, make financial
-- dashboard, and show financial health, in one go pass."
--
-- No Storage bucket existed at all before this migration (verified via
-- `supabase storage ls --experimental` returning []) — documents.storage_path has sat
-- unused since it was scaffolded. This creates the bucket + RLS, plus a purpose-built
-- financial_reports table (documents already covers "save the artifact" — a financial
-- statement upload is just documents.category = 'financial_statement', no schema change
-- needed there).

-- Safe uuid cast for RLS — a storage object path's first folder segment is meant to be a
-- company_id, but RLS must not hard-error on a malformed/foreign path; it should just
-- evaluate to "no match" like any other failed authorization check.
create or replace function public.try_uuid(t text) returns uuid
language sql immutable as $$
  select case when t ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then t::uuid else null end;
$$;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

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

do $$ begin
  create type financial_health_status as enum ('healthy', 'watch', 'at_risk', 'unknown');
exception when duplicate_object then null; end $$;

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

-- Same sensitivity tier as documents/memories (founder or the company's own manager) —
-- financial figures are sensitive but not salary-tier restricted.
alter table public.financial_reports enable row level security;
drop policy if exists "financial_reports_select_scope" on public.financial_reports;
create policy "financial_reports_select_scope" on public.financial_reports for select using (
  public.is_founder_or_admin() or public.has_company_access(company_id)
);
drop policy if exists "financial_reports_write_scope" on public.financial_reports;
create policy "financial_reports_write_scope" on public.financial_reports for all using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
) with check (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- Pure registry metadata, same as every other agent row this app already has — a label
-- a task's owner_agent_id can point to, not a new execution engine.
insert into public.agents (name, role, description, active)
select 'AI CFO', 'finance_cfo', 'Analyzes uploaded financial statements and produces health reports.', true
where not exists (select 1 from public.agents where role = 'finance_cfo');

insert into public.agents (name, role, description, active)
select 'AI Bookkeeper', 'bookkeeping', 'Extracts revenue/expense/net-income figures from uploaded financial documents.', true
where not exists (select 1 from public.agents where role = 'bookkeeping');
