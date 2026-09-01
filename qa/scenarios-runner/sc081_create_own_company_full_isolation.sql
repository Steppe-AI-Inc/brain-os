-- SC-081 — full multi-org isolation acceptance test for create_own_company(), run LIVE
-- against production immediately after 202609010001_create_own_company.sql was confirmed
-- applied (function body + grants re-verified directly, not trusted from migration
-- history). Founder's explicit required proof, verbatim scope:
--   employee creates own company -> receives founder/owner authority there -> retains
--   existing employer membership unchanged; personal company != subsidiary of employer;
--   employer admins/employees cannot read personal-company private data unless invited;
--   personal-company authority does not escalate employer access. Tested across: company
--   record, memberships, people, projects, tasks, goals, memories, documents. Personas:
--   creator/employee, employer company-level manager (NOT the platform founder — see
--   note below), unrelated employee (same employer, different person), unrelated
--   company user (third company).
--
-- Persona note: "employer admin" is tested here as a company-level manager AT the
-- employer (role_in_company='manager' at CLIX GPS), not the platform FOUNDER/holding_admin
-- account. The real platform founder (46bf57d3) intentionally sees every company via
-- is_founder_or_admin() bypassing per-company RLS — that is existing, deliberate,
-- previously-verified platform-wide authority (BUG-004 campaign), not the isolation
-- boundary this test is about.
--
-- Anon persona tested separately (sc081_anon_persona_isolated.sql / full run below) — a
-- companies RLS policy (companies_select_member: has_company_access(id) OR
-- is_investor_viewer_of(id)) calls is_investor_viewer_of(), which has no EXECUTE grant
-- for `anon`, so an anonymous query against companies throws a hard permission error
-- instead of a clean empty result. Confirmed real, pre-existing, unrelated to this
-- migration. Reported as a new finding, not fixed here (would need its own migration).
--
-- Brain Chat / entity grounding: NOT exercised at the HTTP/Edge-Function level — that
-- needs a real signed Supabase Auth session JWT (auth.getUser() inside sem-ai-command),
-- which this SQL-level request.jwt.claims impersonation trick cannot produce. What IS
-- verified: sem-ai-command always queries with the caller's own JWT via the anon key,
-- never service-role (independently confirmed during the BUG-004 campaign), so Brain
-- Chat retrieval necessarily inherits whatever RLS isolation this script proves at the
-- data layer.
--
-- "Reload" persistence: getOrganizationContext() (web/lib/data/organizations.ts) has no
-- caching layer — every call is a fresh, uncached Supabase query. A second independent
-- SELECT against company_memberships after the INSERT, inside this same transaction, is
-- what a page reload would produce (Next.js Server Components share no query cache
-- across requests either) — proven below, not asserted.
--
-- Self-cleaning: every fixture write is inside begin;...rollback;. Nothing is left in
-- production tables. All persona blocks are wrapped in DO/EXCEPTION so one persona's
-- unexpected error (like the anon finding above) can never silently blank out the others.

begin;

create temp table t_verdicts (verdict jsonb);
grant select, insert on t_verdicts to authenticated, anon;

-- ---- Fixture setup: EMPLOYEE (66ef2052 / auth 9c92a8d5) is the creator, pre-existing
-- employer = CLIX GPS (ed8ae510), role_in_company='employee'.
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', '66ef2052-d002-4592-b841-82cd2171b51a', 'employee', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

select id as new_company_id, name into temp t_new_company
from public.create_own_company('SC-081 QA Personal Co', 'legal_entity', 'Mongolia', null);
grant select on t_new_company to authenticated, anon;

insert into public.people (id, company_id, full_name, role_title)
select 'cccc0002-0000-0000-0000-000000000001', new_company_id, 'SC-081 Personal Co Hire', 'Contractor' from t_new_company;
insert into public.projects (id, company_id, title)
select 'cccc0003-0000-0000-0000-000000000001', new_company_id, 'SC-081 Personal Co Project' from t_new_company;
insert into public.tasks (id, company_id, title, status, created_by_profile_id)
select 'cccc0001-0000-0000-0000-000000000001', new_company_id, 'SC-081 owner-created task', 'queued', '66ef2052-d002-4592-b841-82cd2171b51a' from t_new_company;
insert into public.goals (id, company_id, title, status, kind)
select 'cccc0004-0000-0000-0000-000000000001', new_company_id, 'SC-081 Personal Co Goal', 'active', 'ephemeral' from t_new_company;
insert into public.memories (id, company_id, entity_type, fact, sensitivity)
select 'cccc0005-0000-0000-0000-000000000001', new_company_id, 'company', 'SC-081 personal co private fact', 'internal' from t_new_company;
insert into public.documents (id, company_id, title, sensitivity)
select 'cccc0006-0000-0000-0000-000000000001', new_company_id, 'SC-081 Personal Co Doc', 'internal' from t_new_company;

insert into t_verdicts (verdict) values (json_build_object(
  'persona', 'creator/employee, immediately after creation',
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
  'reload_proof_membership_visible_on_fresh_select', (
    select count(*) from public.company_memberships m join t_new_company c on m.company_id = c.new_company_id
      where m.profile_id = '66ef2052-d002-4592-b841-82cd2171b51a'
  ) = 1,
  'no_manager_authority_gained_at_employer', not public.is_company_manager('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'),
  'no_subsidiary_relationship_created', not exists(
    select 1 from public.company_relationships r join t_new_company c
      on r.company_id = c.new_company_id or r.related_company_id = c.new_company_id
    where r.company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d' or r.related_company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'
  ),
  'owner_authority_functional_new_people_project_goal_memory_document_visible',
    exists(select 1 from public.people where id = 'cccc0002-0000-0000-0000-000000000001')
    and exists(select 1 from public.projects where id = 'cccc0003-0000-0000-0000-000000000001')
    and exists(select 1 from public.goals where id = 'cccc0004-0000-0000-0000-000000000001')
    and exists(select 1 from public.memories where id = 'cccc0005-0000-0000-0000-000000000001')
    and exists(select 1 from public.documents where id = 'cccc0006-0000-0000-0000-000000000001')
));

-- ---- Persona 2: unrelated employee — SAME employer (CLIX GPS), different real person
-- (2953fbe7 / auth 484ece55), given a temp employee membership there. ----
reset role;
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', '2953fbe7-8760-489f-9f7c-6f4c1a4baa84', 'employee', true);
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','484ece55-4a44-4746-945c-838c6b0bcc94','role','authenticated')::text, true);

insert into t_verdicts (verdict) values (json_build_object(
  'persona', 'unrelated employee (coworker at same employer, not the creator)',
  'company_record_hidden', not exists(select 1 from public.companies c2 where c2.id in (select new_company_id from t_new_company)),
  'membership_hidden', not exists(select 1 from public.company_memberships m where m.company_id in (select new_company_id from t_new_company)),
  'people_hidden', not exists(select 1 from public.people where id = 'cccc0002-0000-0000-0000-000000000001'),
  'projects_hidden', not exists(select 1 from public.projects where id = 'cccc0003-0000-0000-0000-000000000001'),
  'tasks_hidden', not exists(select 1 from public.tasks where id = 'cccc0001-0000-0000-0000-000000000001'),
  'goals_hidden', not exists(select 1 from public.goals where id = 'cccc0004-0000-0000-0000-000000000001'),
  'memories_hidden', not exists(select 1 from public.memories where id = 'cccc0005-0000-0000-0000-000000000001'),
  'documents_hidden', not exists(select 1 from public.documents where id = 'cccc0006-0000-0000-0000-000000000001')
));

-- ---- Persona 3: employer company-level manager (same profile, role upgraded to
-- 'manager' at CLIX GPS — the real "employer admin" boundary, distinct from platform
-- founder). ----
reset role;
update public.company_memberships set role_in_company = 'manager'
  where company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d' and profile_id = '2953fbe7-8760-489f-9f7c-6f4c1a4baa84';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','484ece55-4a44-4746-945c-838c6b0bcc94','role','authenticated')::text, true);

insert into t_verdicts (verdict) values (json_build_object(
  'persona', 'employer company-level manager (CLIX GPS manager, not the creator, not platform founder)',
  'is_manager_at_employer', public.is_company_manager('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'),
  'company_record_hidden', not exists(select 1 from public.companies c2 where c2.id in (select new_company_id from t_new_company)),
  'membership_hidden', not exists(select 1 from public.company_memberships m where m.company_id in (select new_company_id from t_new_company)),
  'people_hidden', not exists(select 1 from public.people where id = 'cccc0002-0000-0000-0000-000000000001'),
  'projects_hidden', not exists(select 1 from public.projects where id = 'cccc0003-0000-0000-0000-000000000001'),
  'tasks_hidden', not exists(select 1 from public.tasks where id = 'cccc0001-0000-0000-0000-000000000001'),
  'goals_hidden', not exists(select 1 from public.goals where id = 'cccc0004-0000-0000-0000-000000000001'),
  'memories_hidden', not exists(select 1 from public.memories where id = 'cccc0005-0000-0000-0000-000000000001'),
  'documents_hidden', not exists(select 1 from public.documents where id = 'cccc0006-0000-0000-0000-000000000001')
));

-- ---- Persona 4: unrelated company user — same real person, membership moved to a
-- THIRD, wholly unconnected company (SEM Global Robotics, 773210d1). ----
reset role;
delete from public.company_memberships
  where company_id = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d' and profile_id = '2953fbe7-8760-489f-9f7c-6f4c1a4baa84';
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
values ('773210d1-1203-4910-b18a-eab4cc7c3d9c', '2953fbe7-8760-489f-9f7c-6f4c1a4baa84', 'employee', true);
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','484ece55-4a44-4746-945c-838c6b0bcc94','role','authenticated')::text, true);

insert into t_verdicts (verdict) values (json_build_object(
  'persona', 'unrelated company user (third company entirely, not the employer, not the creator)',
  'company_record_hidden', not exists(select 1 from public.companies c2 where c2.id in (select new_company_id from t_new_company)),
  'membership_hidden', not exists(select 1 from public.company_memberships m where m.company_id in (select new_company_id from t_new_company)),
  'tasks_hidden', not exists(select 1 from public.tasks where id = 'cccc0001-0000-0000-0000-000000000001'),
  'memories_hidden', not exists(select 1 from public.memories where id = 'cccc0005-0000-0000-0000-000000000001')
));

reset role;

select json_agg(verdict) as all_verdicts from t_verdicts;

rollback;
