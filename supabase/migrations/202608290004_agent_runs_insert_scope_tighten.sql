-- Tighten agent_runs_insert_scope — real defect found by independent review of Phase 6
-- (Factory Agent Registry, 202608290003).
--
-- The live policy (from 202608290002_canonical_work_order_model.sql) is:
--   (is_founder_or_admin() OR company_id IS NULL OR has_company_access(company_id))
--   AND (created_by_profile_id IS NULL OR created_by_profile_id = current_profile_id())
--
-- The `company_id IS NULL` branch was meant for a future non-admin insert path that
-- doesn't exist yet — but as written, ANY authenticated user can insert a fully
-- fabricated agent_runs row (status='in_progress'/'rejected', any real agent_id, any
-- fake summary/verification_status) against ANY real Software Factory agent simply by
-- leaving company_id null, with zero relationship to that agent required. This was a
-- real, low-consequence gap before 202608290003 (nothing surfaced these fake rows to
-- anyone) — Phase 6's new public.agents_with_live_status view turns it into a genuine
-- status-spoofing vector with a founder/admin-facing consequence (a fabricated
-- RUNNING/FAILED status for a real agent, indistinguishable from a real one at the view
-- layer, confirmed live by rolled-back adversarial testing).
--
-- Fix: the ONLY real insert path today is the trusted service-role Runner
-- (scripts/factory-runner/provider.mjs), which bypasses RLS entirely and is therefore
-- completely unaffected by this tightening. No legitimate non-admin, non-service-role
-- flow currently inserts agent_runs rows directly — so removing the permissive branch
-- costs nothing real today. A future legitimate non-admin insert path (e.g. a company
-- manager triggering a task-linked run from the UI) should get its own properly-scoped
-- policy branch when that flow is actually built, not have this one left open on
-- spec.

begin;

drop policy if exists "agent_runs_insert_scope" on public.agent_runs;

create policy "agent_runs_insert_scope" on public.agent_runs for insert with check (
  public.is_founder_or_admin()
);

commit;
