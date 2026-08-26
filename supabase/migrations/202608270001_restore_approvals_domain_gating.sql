-- CLAUDE.md-mandated deployment-chain audit (2026-08-27) found that the live production
-- policy on public.approvals for UPDATE did NOT match either the tracked migration
-- 202608230001_security_hardening_rls.sql or schema-v0.7-production-core.sql: production
-- was still running the original v0.7 baseline policy (202606190001, line 536) with no
-- domain gating at all - `is_founder_or_admin() OR approver_profile_id = self OR
-- is_company_manager(company_id)` - even though Supabase's own migration history table
-- reports 202608230001 as applied to this project. Reproduced live: a real company-manager
-- test account (no hr_finance/founder role) successfully approved test approvals in all
-- four domains, including finance/salary_hr/legal, which is supposed to require founder or
-- is_hr_finance(). Root cause of the drift itself is unconfirmed (migration history says
-- applied but content doesn't match - possibly an out-of-band manual policy change after
-- the migration ran, or the migration silently no-opped) - not chased further since the
-- fix is identical either way. This migration re-applies the correct domain-gated policy
-- and is idempotent (drop + create), safe to run even if some intermediate state applied
-- it partially.
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
