-- Founder governance doc, section 1: "Editable originals are required where an editable
-- source exists. PDF-only delivery is insufficient for assets that should remain
-- editable." Tracks whether a derivative-only file (PDF, image) in a category that
-- matters for reuse (brochures, proposals, contracts, HR) has a matching editable
-- source (PPTX/DOCX/XLSX) on file, so the browser can flag the gap instead of silently
-- accepting a PDF-only submission.
alter table public.documents add column if not exists editable_source_status text default 'not_applicable'
  check (editable_source_status in ('not_applicable', 'present', 'missing'));
