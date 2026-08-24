-- Brain OS — Artifact intelligence, automatic company matching, and RLS-scoped search
-- Additive only. Requires the existing companies/documents tables.
begin;

alter table public.companies
  add column if not exists aliases text[] not null default '{}'::text[];

alter table public.documents
  add column if not exists original_filename text,
  add column if not exists file_size_bytes bigint,
  add column if not exists analysis_status text not null default 'pending',
  add column if not exists analysis_summary text,
  add column if not exists analysis_json jsonb not null default '{}'::jsonb,
  add column if not exists analysis_error text,
  add column if not exists analyzed_at timestamptz,
  add column if not exists suggested_company_id uuid references public.companies(id) on delete set null,
  add column if not exists company_match_confidence numeric(5,4),
  add column if not exists company_match_reason text,
  add column if not exists company_match_status text not null default 'unconfirmed',
  add column if not exists search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(analysis_summary, '') || ' ' ||
      coalesce(extracted_text, '')
    )
  ) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_analysis_status_check'
  ) then
    alter table public.documents
      add constraint documents_analysis_status_check
      check (analysis_status in ('pending', 'processing', 'ready', 'needs_review', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'documents_company_match_status_check'
  ) then
    alter table public.documents
      add constraint documents_company_match_status_check
      check (company_match_status in ('unconfirmed', 'automatic', 'confirmed', 'review_needed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'documents_company_match_confidence_check'
  ) then
    alter table public.documents
      add constraint documents_company_match_confidence_check
      check (
        company_match_confidence is null
        or (company_match_confidence >= 0 and company_match_confidence <= 1)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'documents_file_size_check'
  ) then
    alter table public.documents
      add constraint documents_file_size_check
      check (file_size_bytes is null or file_size_bytes >= 0);
  end if;
end;
$$;

update public.documents
set
  analysis_status = case
    when nullif(trim(coalesce(extracted_text, '')), '') is not null then 'ready'
    when nullif(trim(coalesce(summary, '')), '') is not null then 'needs_review'
    else 'pending'
  end,
  analysis_summary = coalesce(analysis_summary, summary),
  company_match_status = case
    when company_id is not null then 'confirmed'
    else 'unconfirmed'
  end
where analyzed_at is null
  and analysis_status = 'pending';

create index if not exists documents_search_vector_idx
  on public.documents using gin(search_vector);
create index if not exists documents_analysis_tracking_idx
  on public.documents(analysis_status, company_match_status, created_at desc);
create index if not exists documents_suggested_company_idx
  on public.documents(suggested_company_id, created_at desc);
create index if not exists companies_aliases_idx
  on public.companies using gin(aliases);

create or replace function public.search_artifacts(
  p_query text,
  p_company_id uuid default null,
  p_limit integer default 8
)
returns table (
  id uuid,
  company_id uuid,
  suggested_company_id uuid,
  title text,
  category text,
  mime_type text,
  summary text,
  analysis_summary text,
  analysis_json jsonb,
  extracted_text text,
  sensitivity public.visibility_level,
  analysis_status text,
  company_match_status text,
  company_match_confidence numeric,
  created_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      nullif(trim(coalesce(p_query, '')), '') as query_text,
      case
        when nullif(trim(coalesce(p_query, '')), '') is null then null
        else websearch_to_tsquery('simple', trim(p_query))
      end as query_value
  )
  select
    d.id,
    d.company_id,
    d.suggested_company_id,
    d.title,
    d.category,
    d.mime_type,
    d.summary,
    d.analysis_summary,
    d.analysis_json,
    left(d.extracted_text, 12000) as extracted_text,
    d.sensitivity,
    d.analysis_status,
    d.company_match_status,
    d.company_match_confidence,
    d.created_at,
    case
      when params.query_value is null then 0::real
      else ts_rank_cd(d.search_vector, params.query_value)
    end as rank
  from public.documents d
  cross join params
  where (p_company_id is null or d.company_id = p_company_id)
    and (
      params.query_value is null
      or d.search_vector @@ params.query_value
    )
  order by
    case when params.query_value is null then 0 else ts_rank_cd(d.search_vector, params.query_value) end desc,
    d.created_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

revoke all on function public.search_artifacts(text, uuid, integer) from public;
grant execute on function public.search_artifacts(text, uuid, integer) to authenticated;

commit;
