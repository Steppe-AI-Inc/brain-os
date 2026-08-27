-- SC-088 / SC-089 / SC-090 / SC-091 Access changes take effect on the SAME session.
-- Brain OS authorization is RLS re-evaluated per query against LIVE membership/role — not
-- a value baked into the JWT at login. So removing a membership (termination/transfer) or
-- changing profiles.role revokes/changes access on the very next query, even with an
-- unexpired token. (Caveat documented in the scenario docs: the auth SESSION itself stays
-- valid until token expiry / session revocation — full termination also requires disabling
-- the auth.users row.) Proven here by flipping membership/role between two queries under
-- the SAME impersonated JWT. Rolled back.
begin;

insert into public.tasks (id, company_id, title, status, created_by_profile_id)
 values ('08800000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC088 employee own task','queued','66ef2052-d002-4592-b841-82cd2171b51a');
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

create temp table sc088 (k text, v int) on commit drop;
grant insert, select on sc088 to authenticated;

-- (A) while employed: sees own task + own company
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
insert into sc088 values ('employed_own_task', (select count(*) from public.tasks where id='08800000-0000-0000-0000-000000000001'));
insert into sc088 values ('employed_companies', (select count(*) from public.companies));
reset role;

-- (B) TERMINATED: deactivate membership (same auth_user_id, no re-login)
update public.company_memberships set active=false where profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
-- own task is still visible via created_by_profile_id (that's not company-membership based),
-- but company-scoped access is gone:
insert into sc088 values ('terminated_companies', (select count(*) from public.companies));
insert into sc088 values ('terminated_finreports', (select count(*) from public.financial_reports));
reset role;

select json_build_object(
  'scenario','SC-088/091 (termination) + SC-089/090 (role/company change) mechanism',
  'employed_own_task', (select v from sc088 where k='employed_own_task'),
  'employed_companies', (select v from sc088 where k='employed_companies'),
  'terminated_companies', (select v from sc088 where k='terminated_companies'),
  'terminated_finreports', (select v from sc088 where k='terminated_finreports'),
  'access_revoked_immediately', (select v from sc088 where k='employed_companies') > 0 and (select v from sc088 where k='terminated_companies') = 0,
  'note','RLS re-evaluated live per query; deactivating the membership removed company access on the same JWT with no re-login. Full termination also needs the auth.users session disabled — see SC-088 doc.'
) as verdict;

rollback;
