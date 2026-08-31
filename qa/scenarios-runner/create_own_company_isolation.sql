-- Overnight multi-org milestone, Priority 1 — RLS isolation test for
-- create_own_company() (supabase/migrations/202609010001_create_own_company.sql).
-- GATED: this migration is committed but NOT YET applied to production (new production
-- DB migration, needs explicit founder authorization before push — see MASTER_PLAN.md /
-- quiet-wiggling-biscuit.md authorization boundaries). This script cannot run until then;
-- it is written now so it's ready the moment the migration is authorized and pushed.
--
-- Proves, using only the existing EMPLOYEE fixture (qa/scenarios/personas/README.md —
-- profile 66ef2052, auth 9c92a8d5, zero memberships by default):
--   1. An ordinary employee (given a temp pre-existing employer membership at CLIX GPS,
--      role_in_company='employee') can create their own company and becomes its owner.
--   2. Their pre-existing employer membership is completely unchanged (not overwritten,
--      not duplicated, still 'employee') — creating a personal company does not touch it.
--   3. The new company has exactly ONE membership row: the creator's. The employer
--      (CLIX GPS) gains no automatic access — no row appears for the founder or anyone
--      else at the new company.
--   4. No company_relationships row links the new company to CLIX GPS — it is not a
--      subsidiary/business-unit of the employer (founder's explicit non-goal).
--   5. is_company_manager(CLIX GPS) for this profile is still false — becoming owner of
--      a brand-new company does NOT increase their authority at the employer (founder's
--      exact words: "founder of their own company must NOT increase their permissions
--      inside SEM LLC").
--   6. The creator can perform a real owner-authority action in the new company (insert
--      a task) — ownership is functional, not just a decorative membership row.
-- All rolled back; nothing is left in production tables.

begin;

-- Pre-existing employer membership — the scenario is specifically "an employee of
-- CLIX GPS creates their own separate company," not a user with zero prior employment.
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', '66ef2052-d002-4592-b841-82cd2171b51a', 'employee', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

-- The real call under test, as this persona.
select id as new_company_id, name into temp t_new_company
from public.create_own_company('SC-081 QA Personal Co', 'legal_entity', 'Mongolia', null);

insert into public.tasks (id, company_id, title, status, created_by_profile_id)
select 'cccc0001-0000-0000-0000-000000000001', new_company_id, 'SC-081 owner-created task', 'queued', '66ef2052-d002-4592-b841-82cd2171b51a'
from t_new_company;

select json_build_object(
  'scenario', 'SC-081 create_own_company isolation',
  'creator_is_owner_of_new_company', exists(
    select 1 from public.company_memberships m join t_new_company c on m.company_id = c.new_company_id
    where m.profile_id = '66ef2052-d002-4592-b841-82cd2171b51a' and m.role_in_company = 'owner' and m.active
  ),
  'employer_membership_unchanged', (
    select count(*) = 1 from public.company_memberships
    where company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'
      and profile_id = '66ef2052-d002-4592-b841-82cd2171b51a'
      and role_in_company = 'employee' and active
  ),
  'new_company_has_exactly_one_member', (
    select count(*) from public.company_memberships m join t_new_company c on m.company_id = c.new_company_id
  ) = 1,
  'no_subsidiary_relationship_created', not exists(
    select 1 from public.company_relationships r join t_new_company c
      on r.company_id = c.new_company_id or r.related_company_id = c.new_company_id
    where r.company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d' or r.related_company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'
  ),
  'no_manager_authority_gained_at_employer', not public.is_company_manager('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'),
  'owner_authority_functional_in_new_company', exists(
    select 1 from public.tasks where id = 'cccc0001-0000-0000-0000-000000000001'
  ),
  'all_pass', (
    exists(select 1 from public.company_memberships m join t_new_company c on m.company_id = c.new_company_id
           where m.profile_id = '66ef2052-d002-4592-b841-82cd2171b51a' and m.role_in_company = 'owner' and m.active)
    and (select count(*) = 1 from public.company_memberships
         where company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d' and profile_id = '66ef2052-d002-4592-b841-82cd2171b51a'
           and role_in_company = 'employee' and active)
    and (select count(*) from public.company_memberships m join t_new_company c on m.company_id = c.new_company_id) = 1
    and not exists(select 1 from public.company_relationships r join t_new_company c
                     on r.company_id = c.new_company_id or r.related_company_id = c.new_company_id
                   where r.company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d' or r.related_company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')
    and not public.is_company_manager('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')
    and exists(select 1 from public.tasks where id = 'cccc0001-0000-0000-0000-000000000001')
  )
) as verdict;

reset role;
rollback;
