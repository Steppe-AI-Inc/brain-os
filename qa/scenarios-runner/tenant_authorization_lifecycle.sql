-- Tenant authorization on the company lifecycle — permanent regression for
-- governance/CANONICAL_WORK_CONTRACT.md §5 (TenantAuthorization) and the P1 package that made
-- Brain Chat resolve archive/restore targets SERVER-SIDE across every status (BUG-014). Because
-- chat no longer filters targets by context-window membership, the ONLY thing standing between a
-- resolved id and a mutation is the canonical RPC's own authorization — this proves it, against
-- the already-deployed archive_company()/restore_company() (not redefined here), in a rolled-back
-- transaction, same conventions as company_archive_ownership.sql:
--   1. a company-manager-tier member of company X calling restore_company / archive_company on
--      company Y (a different organization) -> authorized=false, changed=false, status unchanged
--   2. the same member on their own company X -> allowed (positive control, so the suite cannot
--      pass on a role with no grants)
--   3. an unrelated authenticated user -> denied on both
--   4. founder -> allowed on both (positive control)
--   5. a not-found id -> reason not_found, nothing changes
-- Every outcome is read back from the row afterwards (postcondition), never from the RPC alone.
begin;

-- Founder seeds the fixtures (the only actor who can insert companies).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
insert into public.companies (id, name, status) values ('cccc0007-0000-0000-0000-000000000001','SC-TENANT Own Co','active');
insert into public.companies (id, name, status) values ('cccc0007-0000-0000-0000-000000000002','SC-TENANT Foreign Co','archived');
insert into public.companies (id, name, status) values ('cccc0007-0000-0000-0000-000000000003','SC-TENANT Foreign Active Co','active');
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('cccc0007-0000-0000-0000-000000000001','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);
reset role;

-- 1. Manager of Own Co tries to restore / archive companies in a foreign organization.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_tenant.foreign_restore', (public.restore_company('cccc0007-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_tenant.foreign_archive', (public.archive_company('cccc0007-0000-0000-0000-000000000003'))::text, true);
-- 2. Positive control: the same manager on their own company.
select set_config('sc_tenant.own_archive', (public.archive_company('cccc0007-0000-0000-0000-000000000001'))::text, true);
select set_config('sc_tenant.own_restore', (public.restore_company('cccc0007-0000-0000-0000-000000000001'))::text, true);
reset role;

-- 3. Unrelated authenticated user (no membership anywhere in these fixtures).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','1d2b3c4d-0000-4000-8000-000000000abc','role','authenticated')::text, true);
select set_config('sc_tenant.unrelated_restore', (public.restore_company('cccc0007-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_tenant.unrelated_archive', (public.archive_company('cccc0007-0000-0000-0000-000000000003'))::text, true);
reset role;

-- 4 / 5. Founder positive control and not-found.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_tenant.founder_restore', (public.restore_company('cccc0007-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_tenant.founder_archive', (public.archive_company('cccc0007-0000-0000-0000-000000000003'))::text, true);
select set_config('sc_tenant.not_found', (public.restore_company('cccc0007-0000-0000-0000-0000000000ff'))::text, true);
reset role;

-- Postconditions, read back from the rows (never trusted from the RPC alone).
select set_config('sc_tenant.status_foreign_archived_after_manager',
  (select status from public.companies where id='cccc0007-0000-0000-0000-000000000002'), true);

select
  'foreign restore by other-org manager denied' as scenario,
  (current_setting('sc_tenant.foreign_restore')::jsonb->>'authorized') = 'false'
    and (current_setting('sc_tenant.foreign_restore')::jsonb->>'changed') = 'false'
    and (current_setting('sc_tenant.foreign_restore')::jsonb->>'reason') = 'denied' as pass
union all select 'foreign archive by other-org manager denied',
  (current_setting('sc_tenant.foreign_archive')::jsonb->>'authorized') = 'false'
    and (current_setting('sc_tenant.foreign_archive')::jsonb->>'changed') = 'false'
union all select 'own archive by manager allowed (positive control)',
  (current_setting('sc_tenant.own_archive')::jsonb->>'changed') = 'true'
    and (current_setting('sc_tenant.own_archive')::jsonb->>'postconditionPassed') = 'true'
union all select 'own restore by manager allowed (positive control)',
  (current_setting('sc_tenant.own_restore')::jsonb->>'changed') = 'true'
union all select 'unrelated user denied on restore',
  (current_setting('sc_tenant.unrelated_restore')::jsonb->>'authorized') = 'false'
    and (current_setting('sc_tenant.unrelated_restore')::jsonb->>'changed') = 'false'
union all select 'unrelated user denied on archive',
  (current_setting('sc_tenant.unrelated_archive')::jsonb->>'authorized') = 'false'
union all select 'founder restore allowed',
  (current_setting('sc_tenant.founder_restore')::jsonb->>'changed') = 'true'
union all select 'founder archive allowed',
  (current_setting('sc_tenant.founder_archive')::jsonb->>'changed') = 'true'
union all select 'not-found id reports not_found, nothing changes',
  (current_setting('sc_tenant.not_found')::jsonb->>'reason') = 'not_found'
    and (current_setting('sc_tenant.not_found')::jsonb->>'changed') = 'false';

-- Overall verdict: every scenario must pass.
select
  bool_and(pass) as all_pass
from (
  select (current_setting('sc_tenant.foreign_restore')::jsonb->>'changed') = 'false' as pass
  union all select (current_setting('sc_tenant.foreign_archive')::jsonb->>'changed') = 'false'
  union all select (current_setting('sc_tenant.own_archive')::jsonb->>'changed') = 'true'
  union all select (current_setting('sc_tenant.own_restore')::jsonb->>'changed') = 'true'
  union all select (current_setting('sc_tenant.unrelated_restore')::jsonb->>'changed') = 'false'
  union all select (current_setting('sc_tenant.unrelated_archive')::jsonb->>'changed') = 'false'
  union all select (current_setting('sc_tenant.founder_restore')::jsonb->>'changed') = 'true'
  union all select (current_setting('sc_tenant.founder_archive')::jsonb->>'changed') = 'true'
  union all select (current_setting('sc_tenant.not_found')::jsonb->>'reason') = 'not_found'
) v;

rollback;
