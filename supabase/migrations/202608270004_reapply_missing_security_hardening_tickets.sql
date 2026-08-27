-- Root-cause investigation, 2026-08-27: after reproducing the memories_select_scope
-- confidential-tier leak (asked to reproduce KNOWN_FAILURE_MODES.md #11), a systematic
-- signature-based diff of every live policy against schema-v0.7-production-core.sql
-- found the live memories policy doesn't match the file. Tracing it back:
-- 202608230001_security_hardening_rls.sql bundled SIX security tickets. Ticket 3 (5
-- tables: product_lines/inventory_items/sales_leads/proposals/proposal_items) is
-- confirmed live and working (verified via impersonation earlier this session).
-- Tickets 1, 4, 5, and 6 (partially) never actually took effect in production despite
-- the migration showing as applied in supabase_migrations.schema_migrations - the same
-- ledger-says-applied-but-isn't pattern as the approvals_update_approver bug (KNOWN_
-- FAILURE_MODES.md #8), just affecting more of the same migration than first found.
-- This migration re-applies everything from 202608230001 that a live re-check found
-- still missing, verified via a live pg_policy/reloptions diff against production, not
-- assumed from the migration ledger.

-- Ticket 1: safe_companies / safe_proposals had no security_invoker, so RLS evaluated
-- as the view owner (bypasses RLS) instead of the caller. Confirmed live and exploitable
-- 2026-08-27: a test account with ZERO company memberships anywhere saw all 7 companies
-- via safe_companies (0 via the base companies table, correctly) and 1 proposal via
-- safe_proposals it should not have had access to. Exploitable by any authenticated
-- user via a direct query/REST call, independent of whether any app code path uses
-- these views (grepped web/ - none does; PostgREST GRANTs to `authenticated` still make
-- them directly queryable regardless of app usage).
alter view public.safe_companies set (security_invoker = true);
alter view public.safe_proposals set (security_invoker = true);

-- Ticket 5: tasks_select_scope was supposed to be narrowed to founder/admin, company
-- manager, task creator, or task owner - not "any active company member." Confirmed
-- live 2026-08-27 it's still the old broad version (has_company_access(company_id) OR
-- owner match, no manager/creator distinction at all). This directly contradicts what
-- was documented earlier this session in qa/ACCEPTANCE_TESTS.md #4 as "false by design,
-- not a bug" - it is in fact the exact known bug this migration already tried to fix
-- once (see the migration's own comment: "tasks_select_scope let any company member see
-- every task"). qa/ACCEPTANCE_TESTS.md #4 needs correcting after this is verified live.
drop policy if exists "tasks_select_scope" on public.tasks;
create policy "tasks_select_scope" on public.tasks for select using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or created_by_profile_id = public.current_profile_id()
  or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id())
);

-- Ticket 6 (memories half only - documents was already confirmed live and correct):
-- memories_select_scope lumped 'confidential' into the same broad has_company_access
-- branch as 'public'/'internal', instead of requiring manager+/hr_finance like every
-- other confidential-tier check in the schema (including documents' own policy, right
-- next to this one in the same migration). Reproduced live and confirmed exploitable
-- 2026-08-27: a plain non-manager employee at CLIX GPS read two 'confidential'-tagged
-- memories rows containing the company's exact real revenue/expense/cash figures,
-- verbatim, while correctly being unable to read the financial_reports table those
-- figures were sourced from (0 rows). See qa/KNOWN_FAILURE_MODES.md #11.
drop policy if exists "memories_select_scope" on public.memories;
create policy "memories_select_scope" on public.memories for select using (
  public.is_founder_or_admin()
  or (sensitivity in ('public','internal') and (company_id is null or public.has_company_access(company_id)))
  or (sensitivity = 'confidential' and (company_id is null or public.is_company_manager(company_id) or public.is_hr_finance()))
);
