-- PREPARED, NOT APPLIED. Status: BLOCKED — PRODUCTION DB AUTHORIZATION.
--
-- This file lives in supabase/drafts/ and NOT in supabase/migrations/ on purpose: it must not be picked up
-- by any migration run, and it must not travel with an Edge Function deployment. Applying it is a founder
-- action on the production database.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- FINDING (Codex audit E, independently reproduced from repository source 2026-09-09)
--
-- `person_assignments_write_manager` authorises a write on ONE column:
--
--     using      (is_founder_or_admin() or is_company_manager(operating_company_id))
--     with check (is_founder_or_admin() or is_company_manager(operating_company_id))
--
-- The row it authorises carries four org-bearing columns. Three are unchecked:
--
--     person_id                   WHOSE assignment this is        -- unchecked
--     manager_person_id           WHO is named as their manager   -- unchecked
--     legal_employer_company_id   WHO legally employs them        -- unchecked
--     operating_company_id        the destination                 -- checked
--
-- `sem_execute_ai_command` is SECURITY INVOKER, so this policy is the whole of the authorisation for an
-- assignment written through chat. A manager of Org A therefore satisfies the policy while writing a row
-- about a person who belongs to Org B, naming a manager who belongs to Org B, and recording an Org B legal
-- employer — provided only that the DESTINATION is their own org. That is the adversarial case the founder
-- named: "Org A user attempts to move a Person in Org B into Org A".
--
-- Codex raised the concern; this file is the independent reproduction, and it CONFIRMS it at source level.
-- What is NOT claimed: no live probe was run. Confirming the exploit against production requires a
-- cross-tenant write attempt, which is precisely what must never be performed, and confirming it against a
-- staging clone requires a database this session has no authorisation to touch. The finding is therefore
-- CONFIRMED (source) / BLOCKED — NEEDS LIVE EVIDENCE for behavioural proof.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- THE FIX: authority over an assignment is authority over EVERY party to it, not just the destination.
--
-- A person's own org is read through `people.company_id`, which is the column every other page reads and
-- which `set_person_assignment` already keeps in sync. A NULL source org means the person is unattached and
-- may be assigned by any manager of the destination — that is onboarding, not capture.

begin;

drop policy if exists "person_assignments_write_manager" on public.person_assignments;

create policy "person_assignments_write_scope" on public.person_assignments for all
using (
  public.is_founder_or_admin()
  or (
    public.is_company_manager(operating_company_id)
    -- The SOURCE person must be inside the caller's authority, not merely the destination.
    and exists (
      select 1 from public.people pe
      where pe.id = person_assignments.person_id
        and (pe.company_id is null or public.is_company_manager(pe.company_id))
    )
  )
)
with check (
  public.is_founder_or_admin()
  or (
    public.is_company_manager(operating_company_id)
    and (legal_employer_company_id is null or public.is_company_manager(legal_employer_company_id))
    and exists (
      select 1 from public.people pe
      where pe.id = person_assignments.person_id
        and (pe.company_id is null or public.is_company_manager(pe.company_id))
    )
    -- A manager may only be named from a company the caller also manages: naming an Org B manager on an
    -- Org A assignment leaks the org graph and creates a reporting line nobody in Org B authorised.
    and (
      manager_person_id is null
      or exists (
        select 1 from public.people mp
        where mp.id = person_assignments.manager_person_id
          and (mp.company_id is null or public.is_company_manager(mp.company_id))
      )
    )
  )
);

commit;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- REQUIRED ACCEPTANCE, to be run by whoever applies this (see the companion suite
-- qa/scenarios-runner/person_assignment_scope_authorization.sql for the executable form):
--
--   1. Org A manager moves an Org A person within Org A .................. MUST SUCCEED (no regression)
--   2. Org A manager moves an UNATTACHED person into Org A ............... MUST SUCCEED (onboarding)
--   3. Org A manager moves an Org B person into Org A .................... MUST FAIL
--   4. Org A manager names an Org B person as manager on an Org A row .... MUST FAIL
--   5. Org A manager sets an Org B legal employer on an Org A row ........ MUST FAIL
--   6. Founder/admin does any of the above .............................. MUST SUCCEED (unchanged)
--   7. A person reading their OWN assignment ............................ MUST SUCCEED (select unchanged)
--
-- Case 1 and case 7 are the regression half: a scope fix that also breaks ordinary assignment or a person's
-- view of their own record has traded one defect for another.
