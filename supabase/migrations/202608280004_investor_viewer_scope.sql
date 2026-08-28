-- governance/roles/README.md's own finding: "investor_viewer-tier test account saw
-- identical data to a plain employee — not reduced, not different." Confirmed live
-- 2026-08-27. Root cause: has_company_access() (the gate behind most operational tables'
-- select policies) only checks real company membership, never profiles.role — so every
-- profiles.role value below founder/holding_admin/hr_finance is currently decorative on
-- tables gated by has_company_access() alone.
--
-- Fix: has_company_access() now explicitly excludes investor_viewer, so every table gated
-- purely by it (people, projects, product_lines, inventory_items, proposals/
-- proposal_items, product_specs, departments, key_results, goal_context, and every insert
-- check) is now correctly denied to an investor. A new is_investor_viewer_of(company_id)
-- grants investor_viewer back a curated, read-only, investor-appropriate slice: basic
-- company info, goals, financial_reports, and public-tier (not internal-tier)
-- documents/memories. This is a deliberate default scope, not the only possible one —
-- flagged for the founder to refine if the intended investor view differs.

create or replace function public.has_company_access(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_founder_or_admin()
    or exists (
      select 1 from public.company_memberships m
      join public.profiles p on p.id = m.profile_id
      where p.auth_user_id = auth.uid()
        and m.company_id = cid
        and m.active = true
        and p.role <> 'investor_viewer'
    );
$$;

create or replace function public.is_investor_viewer_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_memberships m
    join public.profiles p on p.id = m.profile_id
    where p.auth_user_id = auth.uid()
      and m.company_id = cid
      and m.active = true
      and p.role = 'investor_viewer'
  );
$$;

revoke all on function public.is_investor_viewer_of(uuid) from public, anon;
grant execute on function public.is_investor_viewer_of(uuid) to authenticated;

-- Curated investor allow-list, additive to whatever each policy already grants.

drop policy if exists "companies_select_member" on public.companies;
create policy "companies_select_member" on public.companies for select using (
  public.has_company_access(id) or public.is_investor_viewer_of(id)
);

drop policy if exists "goals_select_scope" on public.goals;
create policy "goals_select_scope" on public.goals for select using (
  public.is_founder_or_admin()
  or public.has_company_access(company_id)
  or public.is_investor_viewer_of(company_id)
  or exists (select 1 from public.people pe where pe.id = goals.owner_person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "financial_reports_select_scope" on public.financial_reports;
create policy "financial_reports_select_scope" on public.financial_reports for select using (
  public.is_founder_or_admin() or public.is_company_manager(company_id) or public.is_hr_finance() or public.is_investor_viewer_of(company_id)
);

-- documents/memories: investor access only extends to the public tier, not internal —
-- day-to-day operational notes are still not an investor's business even under this
-- broadened scope.
drop policy if exists "documents_select_scope" on public.documents;
create policy "documents_select_scope" on public.documents for select using (
  public.is_founder_or_admin()
  or (sensitivity = 'public' and (company_id is null or public.has_company_access(company_id) or public.is_investor_viewer_of(company_id)))
  or (sensitivity = 'internal' and (company_id is null or public.has_company_access(company_id)))
  or (sensitivity = 'confidential' and (company_id is null or public.is_company_manager(company_id) or public.is_hr_finance()))
);

drop policy if exists "memories_select_scope" on public.memories;
create policy "memories_select_scope" on public.memories for select using (
  public.is_founder_or_admin()
  or (sensitivity = 'public' and (company_id is null or public.has_company_access(company_id) or public.is_investor_viewer_of(company_id)))
  or (sensitivity = 'internal' and (company_id is null or public.has_company_access(company_id)))
  or (sensitivity = 'confidential' and (company_id is null or public.is_company_manager(company_id) or public.is_hr_finance()))
);
