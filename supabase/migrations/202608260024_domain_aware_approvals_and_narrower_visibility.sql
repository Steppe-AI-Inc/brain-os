-- Approvals: read authority and approve authority need separate rules. Confirmed live:
-- real salary_hr-domain approvals exist ("Review KPI and create salary-impact
-- recommendation") and were readable by any active company member via
-- has_company_access, not just managers/HR/the requester/approver. Sensitive domains
-- (salary_hr, finance, legal) now require manager+/HR-finance tier; general/production/
-- external_comms stay company-member visible (that's normal operational visibility, not
-- a leak). The requester/approver themselves can always see their own approval either way.
drop policy if exists "approvals_select_scope" on public.approvals;
create policy "approvals_select_scope" on public.approvals for select using (
  public.is_founder_or_admin()
  or (requested_by_profile_id = public.current_profile_id())
  or (approver_profile_id = public.current_profile_id())
  or (
    domain in ('salary_hr', 'finance', 'legal')
    and (public.is_hr_finance() or public.is_company_manager(company_id))
  )
  or (
    domain not in ('salary_hr', 'finance', 'legal')
    and public.has_company_access(company_id)
  )
);

-- Audit logs: company-membership-alone was too broad — an audit row can describe a
-- salary/discount/HR decision ("Founder approved special 18% discount because margin is
-- 42%"). Narrow non-actor visibility to manager+, same tier as everything else sensitive
-- tonight. The actor themselves can always see their own logged actions.
drop policy if exists "audit_logs_select_scope" on public.audit_logs;
create policy "audit_logs_select_scope" on public.audit_logs for select using (
  public.is_founder_or_admin()
  or (actor_profile_id = public.current_profile_id())
  or public.is_company_manager(company_id)
);

-- Integration queue: payloads can carry email bodies, customer communications, document
-- exports, external recipients — company membership alone is too weak a rule for that.
-- The creator of a given integration job can still see their own; anyone else needs
-- manager+.
drop policy if exists "integration_queue_select_scope" on public.integration_queue;
create policy "integration_queue_select_scope" on public.integration_queue for select using (
  public.is_founder_or_admin()
  or (created_by_profile_id = public.current_profile_id())
  or public.is_company_manager(company_id)
);

-- Work orders: command/context_pack/output is a snapshot of what the AI knew and said
-- during one exchange — that can include anything the requester was authorized to see,
-- which a random other company member should not get to casually browse just by being
-- at the same company. No channel-membership model exists yet, so the practical
-- tightening is creator + manager+ (not "any member"), same pattern as the rest of this
-- pass. The requester of the command can always see their own work order.
drop policy if exists "work_orders_select_scope" on public.work_orders;
create policy "work_orders_select_scope" on public.work_orders for select using (
  public.is_founder_or_admin()
  or (created_by_profile_id = public.current_profile_id())
  or public.is_company_manager(company_id)
);

-- Chat channels: same reasoning as work_orders — no membership model exists yet, so
-- tighten from "any company member" to creator + manager+.
drop policy if exists "chat_channels_select_scope" on public.chat_channels;
create policy "chat_channels_select_scope" on public.chat_channels for select using (
  public.is_founder_or_admin()
  or (created_by_profile_id = public.current_profile_id())
  or ((company_id is not null) and public.is_company_manager(company_id))
);

-- Sales leads (CRM): a technician doesn't need the whole pipeline (customer emails,
-- deal values, next actions). Narrow to manager+ or the lead's own owner, from "any
-- company member."
drop policy if exists "sales_leads_select_scope" on public.sales_leads;
create policy "sales_leads_select_scope" on public.sales_leads for select using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = sales_leads.owner_person_id and pe.profile_id = public.current_profile_id())
);
