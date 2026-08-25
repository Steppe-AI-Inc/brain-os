-- Two related gaps, both confirmed live before this fix:
--
-- 1. documents_select_scope treated 'confidential' the same as 'public'/'internal' —
--    gated only by has_company_access (any active company member), not manager tier.
--    A confidential financial statement's ROW was readable by any employee.
--
-- 2. The Storage policy on the documents bucket never looked at documents.sensitivity
--    at all — it only checked company membership on the folder prefix. So even where
--    the table row was correctly restricted, the actual uploaded file bytes were not:
--    a technician blocked from the confidential documents ROW could still fetch the
--    underlying file via a signed URL, because Storage RLS had no join back to the
--    document's sensitivity. This is the more serious of the two — the file storage
--    layer must enforce the same tiers the table already claims to enforce.
drop policy if exists "documents_select_scope" on public.documents;
create policy "documents_select_scope" on public.documents for select using (
  public.is_founder_or_admin()
  or ((sensitivity in ('public', 'internal')) and ((company_id is null) or public.has_company_access(company_id)))
  or ((sensitivity = 'confidential') and ((company_id is null) or public.is_company_manager(company_id)))
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
          or (d.sensitivity = 'confidential' and ((d.company_id is null) or public.is_company_manager(d.company_id)))
        )
    )
  )
);
