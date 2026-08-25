-- Align live with what schema-v0.7-production-core.sql already documented but was never
-- actually applied to master: confidential documents (financial statements etc.) should
-- also be readable by HR/finance, not just company managers — same tier as
-- financial_reports_select_scope's sibling logic. Mirrors into the storage policy too so
-- the file bytes follow the same rule as the row.
drop policy if exists "documents_select_scope" on public.documents;
create policy "documents_select_scope" on public.documents for select using (
  public.is_founder_or_admin()
  or ((sensitivity in ('public', 'internal')) and ((company_id is null) or public.has_company_access(company_id)))
  or ((sensitivity = 'confidential') and ((company_id is null) or public.is_company_manager(company_id) or public.is_hr_finance()))
);

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
