-- Found via live persona testing (SECURITY_MATRIX.md, 2026-08-27): an hr_finance-tier
-- profile (profiles.role = 'hr_finance', no company_memberships needed) correctly saw
-- all finance/salary_hr domain approvals and all salary_rules, but zero financial_reports
-- rows, despite financial_reports being exactly the kind of company financial data an
-- HR/Finance role would be expected to review. Root cause: financial_reports_select_scope
-- and financial_reports_write_scope never called is_hr_finance() at all - they only
-- checked is_founder_or_admin() OR is_company_manager(company_id), unlike every other
-- finance-adjacent table (salary_private, salary_rules, kpi_records), which all already
-- include is_hr_finance() alongside is_company_manager(). This brings financial_reports
-- in line with that existing pattern rather than inventing a new one.
drop policy if exists "financial_reports_select_scope" on public.financial_reports;
create policy "financial_reports_select_scope" on public.financial_reports for select using (
  public.is_founder_or_admin() or public.is_company_manager(company_id) or public.is_hr_finance()
);
drop policy if exists "financial_reports_write_scope" on public.financial_reports;
create policy "financial_reports_write_scope" on public.financial_reports for all using (
  public.is_founder_or_admin() or public.is_company_manager(company_id) or public.is_hr_finance()
) with check (
  public.is_founder_or_admin() or public.is_company_manager(company_id) or public.is_hr_finance()
);
