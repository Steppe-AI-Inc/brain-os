-- financial_reports_select_scope was gated at has_company_access() — any active company
-- member, including a technician — not is_company_manager() like the write policy
-- already correctly uses. Revenue/expenses/net income/cash position are exactly the
-- "finance" sensitive domain the founder's governance doc calls out by name: RLS is the
-- real boundary the AI context pack relies on, so this was a genuine gap, not a
-- prompt-level one — a technician's own RLS-scoped query could read real revenue rows.
drop policy if exists "financial_reports_select_scope" on public.financial_reports;
create policy "financial_reports_select_scope" on public.financial_reports
  for select using (public.is_founder_or_admin() or public.is_company_manager(company_id));
