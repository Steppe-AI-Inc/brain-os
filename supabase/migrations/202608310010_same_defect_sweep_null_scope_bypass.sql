-- SECURITY FIX — BUG-004 same-defect sweep (founder-requested, not mechanical).
--
-- Swept every RLS policy in public schema for `company_id IS NULL` used as a
-- permissive OR-branch, the exact class 202608310008 closed on `memories`. Found 8
-- policies across 7 tables with the identical shape. Classified each by real semantics
-- before touching it, per the founder's explicit instruction not to mechanically
-- change every nullable FK:
--
-- FIXED here (write-bypass class - a zero-membership authenticated stranger could
-- write a company_id-NULL row, same severity reasoning as BUG-004 itself: "is an
-- unauthorized write"):
--   - approvals_insert_scope: any authenticated user could insert an approval with
--     company_id=NULL, bypassing has_company_access() entirely.
--   - integration_queue_insert_scope: same shape.
--   - product_specs_write_manager: `company_id IS NULL OR is_company_manager(...)` -
--     the NULL branch bypassed the company_manager requirement entirely, not just
--     company scoping.
--   - tasks_insert_scope: same shape as approvals/integration_queue.
--
-- FIXED here (read-exposure class - lower severity than a write bypass, but the same
-- structural gap, and cheap to close in the same pass since it's info disclosure, not
-- destructive):
--   - documents_select_scope, engineering_drawings_select, product_specs_select_scope.
--
-- Deliberately NOT touched (genuine nuance, not a blanket bypass, needs separate
-- design attention rather than a rushed change in this pass):
--   - tasks_update_scope: its company_id IS NULL branch is nested inside
--     `created_by_profile_id = current_profile_id() AND (company_id IS NULL OR
--     <real membership check>)` - i.e. "the task's own creator may update a
--     company-agnostic (NULL-scoped) task they made, without needing company
--     membership for a company_id that doesn't apply". This is a real design question
--     (should tasks_insert_scope even allow creating a NULL-scoped task once fixed
--     below? if not, this branch becomes dead code; if yes, is creator-only update of
--     one's own unscoped task actually the intended model?) that deserves its own
--     review, not a mechanical copy of the memories fix. Left exactly as-is.
--
-- Every fix follows the same pattern as 202608310008: remove the blanket
-- `company_id IS NULL` OR-branch; global/unscoped access (where still wanted) already
-- flows through is_founder_or_admin() elsewhere in each policy.

begin;

-- approvals (write bypass)
drop policy if exists "approvals_insert_scope" on public.approvals;
create policy "approvals_insert_scope" on public.approvals for insert with check (
  public.is_founder_or_admin() or (company_id is not null and public.has_company_access(company_id))
);

-- integration_queue (write bypass)
drop policy if exists "integration_queue_insert_scope" on public.integration_queue;
create policy "integration_queue_insert_scope" on public.integration_queue for insert with check (
  auth.uid() is not null and company_id is not null and public.has_company_access(company_id)
);

-- product_specs (write bypass - the NULL branch previously bypassed is_company_manager entirely)
drop policy if exists "product_specs_write_manager" on public.product_specs;
create policy "product_specs_write_manager" on public.product_specs for all using (
  company_id is not null and public.is_company_manager(company_id)
) with check (
  company_id is not null and public.is_company_manager(company_id)
);

-- product_specs (read exposure)
drop policy if exists "product_specs_select_scope" on public.product_specs;
create policy "product_specs_select_scope" on public.product_specs for select using (
  company_id is not null and public.has_company_access(company_id)
);

-- tasks (write bypass) - tasks_update_scope intentionally NOT touched, see header.
drop policy if exists "tasks_insert_scope" on public.tasks;
create policy "tasks_insert_scope" on public.tasks for insert with check (
  public.is_founder_or_admin() or (company_id is not null and public.has_company_access(company_id))
);

-- documents (read exposure, all three sensitivity tiers - same 3-tier shape as memories)
drop policy if exists "documents_select_scope" on public.documents;
create policy "documents_select_scope" on public.documents for select using (
  public.is_founder_or_admin()
  or (sensitivity = 'public' and company_id is not null and (public.has_company_access(company_id) or public.is_investor_viewer_of(company_id)))
  or (sensitivity = 'internal' and company_id is not null and public.has_company_access(company_id))
  or (sensitivity = 'confidential' and company_id is not null and (public.is_company_manager(company_id) or public.is_hr_finance()))
);

-- engineering_drawings (read exposure)
drop policy if exists "engineering_drawings_select" on public.engineering_drawings;
create policy "engineering_drawings_select" on public.engineering_drawings for select using (
  public.is_founder_or_admin() or (company_id is not null and public.has_company_access(company_id))
);

commit;
