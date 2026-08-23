-- SEM Brain v0.7.1 — Security hardening migration (engineering audit tickets 1, 3, 4, 5, 6)
-- Applies on top of 202606190001_sem_brain_v071_production_core.sql. Do not edit that file;
-- this migration only ALTERs/DROPs/CREATEs what changed.

-- ============================================================
-- Ticket 1: safe_companies / safe_proposals views leaked all-company
-- data because they had no security_invoker, so RLS was evaluated as
-- the view owner (who bypasses RLS as table owner) instead of the caller.
-- ============================================================
alter view public.safe_companies set (security_invoker = true);
alter view public.safe_proposals set (security_invoker = true);

revoke all on public.safe_companies from public, anon;
revoke all on public.safe_proposals from public, anon;
grant select on public.safe_companies to authenticated;
grant select on public.safe_proposals to authenticated;

-- ============================================================
-- Ticket 4: approvals had no type/category column, so any company
-- manager/team_lead could approve salary/legal/finance-flagged
-- approvals with no domain-based authority check.
-- ============================================================
do $$ begin
  create type approval_domain as enum ('general','salary_hr','finance','legal','production','external_comms');
exception when duplicate_object then null; end $$;

alter table public.approvals add column if not exists domain approval_domain not null default 'general';

drop policy if exists "approvals_update_approver" on public.approvals;
create policy "approvals_update_approver" on public.approvals for update using (
  public.is_founder_or_admin()
  or approver_profile_id = public.current_profile_id()
  or (domain in ('salary_hr','finance') and public.is_hr_finance())
  or (domain in ('general','production','external_comms') and public.is_company_manager(company_id))
  -- 'legal' has no dedicated approver role yet in app_role; only founder/admin or the
  -- explicitly assigned approver_profile_id (both already covered above) can decide these
  -- until a real legal-approver assignment mechanism exists. Do not widen this without one.
);

-- ============================================================
-- Ticket 3: product_lines/inventory_items/proposals/proposal_items used
-- FOR ALL USING has_company_access(), letting any employee/contractor
-- insert/update/delete catalog, inventory, and proposal (pricing/margin)
-- data with no manager gate. sales_leads is split more leniently since
-- normal CRM usage expects reps to work their own leads.
-- ============================================================
drop policy if exists "product_lines_company_scope" on public.product_lines;
create policy "product_lines_select_scope" on public.product_lines for select using (public.has_company_access(company_id));
drop policy if exists "product_lines_write_manager" on public.product_lines;
create policy "product_lines_write_manager" on public.product_lines for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists "inventory_company_scope" on public.inventory_items;
create policy "inventory_select_scope" on public.inventory_items for select using (public.has_company_access(company_id));
drop policy if exists "inventory_write_manager" on public.inventory_items;
create policy "inventory_write_manager" on public.inventory_items for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists "sales_leads_company_scope" on public.sales_leads;
create policy "sales_leads_select_scope" on public.sales_leads for select using (public.has_company_access(company_id));
drop policy if exists "sales_leads_insert_member" on public.sales_leads;
create policy "sales_leads_insert_member" on public.sales_leads for insert with check (public.has_company_access(company_id));
drop policy if exists "sales_leads_update_own_or_manager" on public.sales_leads;
create policy "sales_leads_update_own_or_manager" on public.sales_leads for update using (
  public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = sales_leads.owner_person_id and pe.profile_id = public.current_profile_id())
) with check (
  public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = sales_leads.owner_person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "sales_leads_delete_manager" on public.sales_leads;
create policy "sales_leads_delete_manager" on public.sales_leads for delete using (public.is_company_manager(company_id));

drop policy if exists "proposals_company_scope" on public.proposals;
create policy "proposals_select_scope" on public.proposals for select using (public.has_company_access(company_id));
drop policy if exists "proposals_write_manager" on public.proposals;
create policy "proposals_write_manager" on public.proposals for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists "proposal_items_scope" on public.proposal_items;
create policy "proposal_items_select_scope" on public.proposal_items for select using (
  exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and public.has_company_access(p.company_id))
);
drop policy if exists "proposal_items_write_manager" on public.proposal_items;
create policy "proposal_items_write_manager" on public.proposal_items for all using (
  exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and public.is_company_manager(p.company_id))
) with check (
  exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id and public.is_company_manager(p.company_id))
);

-- ============================================================
-- Ticket 5: tasks_select_scope let any company member see every task
-- in the company via has_company_access(). Narrow to own/created/owned
-- plus managers (who legitimately need full company visibility).
-- Team/shared-task visibility beyond this is deferred — it needs a
-- task-sharing or team-membership join that doesn't exist in the schema
-- yet; do not widen this policy to reintroduce blanket company access
-- as a shortcut for that.
-- ============================================================
drop policy if exists "tasks_select_scope" on public.tasks;
create policy "tasks_select_scope" on public.tasks for select using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or created_by_profile_id = public.current_profile_id()
  or exists (select 1 from public.people pe where pe.id = tasks.owner_person_id and pe.profile_id = public.current_profile_id())
);

-- ============================================================
-- Ticket 6: "confidential" memories/documents were grouped with
-- public/internal and readable by any company employee, contradicting
-- the sensitivity ladder's apparent intent. Re-tier to manager/HR-finance.
-- ============================================================
drop policy if exists "memories_select_scope" on public.memories;
create policy "memories_select_scope" on public.memories for select using (
  public.is_founder_or_admin()
  or (sensitivity in ('public','internal') and (company_id is null or public.has_company_access(company_id)))
  or (sensitivity = 'confidential' and (company_id is null or public.is_company_manager(company_id) or public.is_hr_finance()))
);

drop policy if exists "documents_select_scope" on public.documents;
create policy "documents_select_scope" on public.documents for select using (
  public.is_founder_or_admin()
  or (sensitivity in ('public','internal') and (company_id is null or public.has_company_access(company_id)))
  or (sensitivity = 'confidential' and (company_id is null or public.is_company_manager(company_id) or public.is_hr_finance()))
);
