-- SC-057 Country/company manager is NOT a CFO.
-- A company manager of CLIX GPS may approve production/general/external_comms approvals,
-- but must NOT approve salary_hr/finance/legal, must NOT read salary_private, must NOT
-- read company_sensitive (cash/ownership). Tested by attempting the real approve UPDATE
-- (approvals_update_approver RLS) and re-reading the true status as postgres afterward.
-- NOTE: this runs against LIVE production, which does NOT yet have decide_approval()
-- (migration 202608270005 is committed but unpushed) — so we test the direct RLS UPDATE
-- path, which is exactly the boundary approvals_update_approver enforces. All rolled back.
begin;

-- Four pending approvals, one per domain, all at CLIX GPS.
insert into public.approvals (id, company_id, title, domain, status, risk_level) values
 ('cccc0001-0000-0000-0000-00000000000a','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC057 salary approval','salary_hr','pending','high'),
 ('cccc0001-0000-0000-0000-00000000000b','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC057 finance approval','finance','pending','high'),
 ('cccc0001-0000-0000-0000-00000000000c','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC057 legal approval','legal','pending','high'),
 ('cccc0001-0000-0000-0000-00000000000d','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC057 production approval','production','pending','high');

-- A salary row and a company_sensitive row the manager must NOT read.
insert into public.people (id, company_id, full_name) values
 ('cccc0002-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC057 Test Person');
insert into public.salary_private (person_id, base_salary) values
 ('cccc0002-0000-0000-0000-000000000001', 1000000);
insert into public.company_sensitive (company_id) values
 ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d');

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);

create temp table sc057_obs (k text, v int) on commit drop;
grant insert, select on sc057_obs to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

-- Attempt to approve each domain (RLS silently affects 0 rows where denied).
update public.approvals set status='approved' where id='cccc0001-0000-0000-0000-00000000000a' and status='pending';
update public.approvals set status='approved' where id='cccc0001-0000-0000-0000-00000000000b' and status='pending';
update public.approvals set status='approved' where id='cccc0001-0000-0000-0000-00000000000c' and status='pending';
update public.approvals set status='approved' where id='cccc0001-0000-0000-0000-00000000000d' and status='pending';

-- Capture what the manager can READ (as the manager).
insert into sc057_obs values
 ('salary_visible', (select count(*) from public.salary_private where person_id='cccc0002-0000-0000-0000-000000000001')),
 ('company_sensitive_visible', (select count(*) from public.company_sensitive where company_id='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'));

reset role;

-- Read TRUE stored statuses as postgres, plus manager observations.
select json_build_object(
  'scenario','SC-057',
  'persona','company manager of CLIX GPS',
  'salary_approve_blocked',  (select status from public.approvals where id='cccc0001-0000-0000-0000-00000000000a') = 'pending',
  'finance_approve_blocked', (select status from public.approvals where id='cccc0001-0000-0000-0000-00000000000b') = 'pending',
  'legal_approve_blocked',   (select status from public.approvals where id='cccc0001-0000-0000-0000-00000000000c') = 'pending',
  'production_approve_allowed',(select status from public.approvals where id='cccc0001-0000-0000-0000-00000000000d') = 'approved',
  'salary_read_blocked', (select v from sc057_obs where k='salary_visible') = 0,
  'cash_read_blocked',   (select v from sc057_obs where k='company_sensitive_visible') = 0,
  'all_pass', (
        (select status from public.approvals where id='cccc0001-0000-0000-0000-00000000000a')='pending'
    and (select status from public.approvals where id='cccc0001-0000-0000-0000-00000000000b')='pending'
    and (select status from public.approvals where id='cccc0001-0000-0000-0000-00000000000c')='pending'
    and (select status from public.approvals where id='cccc0001-0000-0000-0000-00000000000d')='approved'
    and (select v from sc057_obs where k='salary_visible')=0
    and (select v from sc057_obs where k='company_sensitive_visible')=0
  )
) as verdict;

rollback;
