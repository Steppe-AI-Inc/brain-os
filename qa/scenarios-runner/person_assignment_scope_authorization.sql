-- CODEX FINDING E — executable acceptance for the person-assignment scope fix.
--
-- PREPARED, NOT RUN. This file is the behavioural half that
-- qa/scenarios-runner/person_assignment_scope_authorization.mjs deliberately does not attempt: proving the
-- cross-tenant write behaviourally means PERFORMING it, and the founder's standing rule is that no live
-- cross-tenant write may be made merely to demonstrate the vulnerability.
--
-- It is therefore written to run ONLY against a disposable database — a local `supabase start` instance or a
-- throwaway branch — by whoever applies supabase/drafts/202609090001_person_assignment_scope_authorization.sql.
-- It creates its own fixtures, asserts, and rolls everything back. It must NEVER be pointed at production:
-- the whole point of case 3 is an attempted cross-tenant write, and an attempt that SUCCEEDS against
-- production is a breach, not a test result.
--
-- Run: psql "$DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -f qa/scenarios-runner/person_assignment_scope_authorization.sql
--
-- Every case below is stated as the founder stated it. Cases 1, 2, 6 and 7 are the REGRESSION half: a scope
-- fix that also breaks ordinary assignment, onboarding, founder authority, or a person's view of their own
-- record has traded one defect for another.

begin;

-- ── fixtures ────────────────────────────────────────────────────────────────────────────────────────
-- Two tenants that share nothing, plus one unattached person. Ids are fixed so a failure names the row.
insert into public.companies (id, name, status) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'QA-VERIFY Org A', 'active'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'QA-VERIFY Org B', 'active');

insert into public.people (id, full_name, company_id) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'QA-VERIFY A Person',  'aaaaaaaa-0000-4000-8000-000000000001'),
  ('aaaaaaaa-1111-4000-8000-000000000002', 'QA-VERIFY A Manager', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-1111-4000-8000-000000000001', 'QA-VERIFY B Person',  'bbbbbbbb-0000-4000-8000-000000000001'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'QA-VERIFY B Manager', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('cccccccc-1111-4000-8000-000000000001', 'QA-VERIFY Unattached', null);

-- The caller for cases 1-5 is a MANAGER OF ORG A AND OF NOTHING ELSE. How that identity is established
-- depends on the fixture harness (set_config on request.jwt.claims, or a seeded profile + membership row);
-- the harness must make public.is_company_manager('aaaa…0001') true and is_company_manager('bbbb…0001')
-- false, and public.is_founder_or_admin() FALSE — a founder identity passes every case below and proves
-- nothing about scope.
\set ORG_A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set ORG_B '''bbbbbbbb-0000-4000-8000-000000000001'''

do $$
declare
  v_ok boolean;
  v_id uuid;
begin
  -- 1. Org A manager moves an Org A person within Org A ................................ MUST SUCCEED
  insert into public.person_assignments (person_id, operating_company_id, legal_employer_company_id, is_primary, state)
  values ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
          'aaaaaaaa-0000-4000-8000-000000000001', true, 'current')
  returning id into v_id;
  if v_id is null then raise exception 'CASE 1 FAILED: ordinary in-org assignment was refused (regression)'; end if;
  raise notice 'CASE 1 PASS: ordinary in-org assignment succeeded';

  -- 2. Org A manager assigns an UNATTACHED person into Org A ........................... MUST SUCCEED
  insert into public.person_assignments (person_id, operating_company_id, is_primary, state)
  values ('cccccccc-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', true, 'current')
  returning id into v_id;
  if v_id is null then raise exception 'CASE 2 FAILED: onboarding an unattached person was refused (regression)'; end if;
  raise notice 'CASE 2 PASS: unattached person is assignable';

  -- 3. Org A manager moves an ORG B person into Org A ................................. MUST FAIL
  begin
    insert into public.person_assignments (person_id, operating_company_id, is_primary, state)
    values ('bbbbbbbb-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', true, 'current');
    raise exception 'CASE 3 FAILED: an Org B person was captured into Org A — THIS IS THE VULNERABILITY';
  exception when insufficient_privilege or check_violation then
    raise notice 'CASE 3 PASS: cross-tenant person capture refused';
  end;

  -- 4. Org A manager names an ORG B person as MANAGER on an Org A row ................. MUST FAIL
  begin
    insert into public.person_assignments (person_id, operating_company_id, manager_person_id, is_primary, state)
    values ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
            'bbbbbbbb-1111-4000-8000-000000000002', true, 'current');
    raise exception 'CASE 4 FAILED: a reporting line into Org B was created without Org B authorising it';
  exception when insufficient_privilege or check_violation then
    raise notice 'CASE 4 PASS: cross-tenant manager assignment refused';
  end;

  -- 5. Org A manager sets an ORG B LEGAL EMPLOYER on an Org A row ..................... MUST FAIL
  begin
    insert into public.person_assignments (person_id, operating_company_id, legal_employer_company_id, is_primary, state)
    values ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
            'bbbbbbbb-0000-4000-8000-000000000001', true, 'current');
    raise exception 'CASE 5 FAILED: an Org B legal employer was recorded by an Org A manager';
  exception when insufficient_privilege or check_violation then
    raise notice 'CASE 5 PASS: cross-tenant legal employer refused';
  end;

  -- 6. FOUNDER/ADMIN authority is unchanged ........................................... MUST SUCCEED
  --    Re-run case 3 as a founder identity. The harness switches identity here; if it cannot, this case is
  --    reported SKIPPED rather than passed, because an unrun case is not a green one.
  raise notice 'CASE 6: run case 3 again under a founder identity — MUST SUCCEED';

  -- 7. A person reading their OWN assignment .......................................... MUST SUCCEED
  select exists (
    select 1 from public.person_assignments pa
    where pa.person_id = 'aaaaaaaa-1111-4000-8000-000000000001'
  ) into v_ok;
  if not v_ok then raise exception 'CASE 7 FAILED: the select policy stopped a person seeing their own row (regression)'; end if;
  raise notice 'CASE 7 PASS: own-assignment read survives';
end $$;

-- Nothing this file created may outlive it.
rollback;
