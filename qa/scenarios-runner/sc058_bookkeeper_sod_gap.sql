-- SC-058 Bookkeeper segregation of duties — KNOWN GAP (qa/KNOWN_FAILURE_MODES.md #14).
-- This script does NOT assert a passing control. It REPRODUCES the gap live: an
-- hr_finance account (the only role a "bookkeeper" or "CFO" can map to) can both PREPARE
-- and APPROVE the same finance action, and can write salary_private directly, with no
-- preparer-vs-approver separation. A true SoD control would DENY at least one of these.
-- All fixtures rolled back.
begin;

-- Promote the EMPLOYEE test profile to hr_finance for the duration of this transaction only.
update public.profiles set role='hr_finance' where id='66ef2052-d002-4592-b841-82cd2171b51a';

-- A finance approval REQUESTED BY this same profile (self-request).
insert into public.approvals (id, company_id, title, domain, status, risk_level, requested_by_profile_id)
 values ('dddd0001-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
         'SC058 self-requested payment','finance','pending','high','66ef2052-d002-4592-b841-82cd2171b51a');

insert into public.people (id, company_id, full_name)
 values ('dddd0002-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC058 Person');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

-- Prepare: hr_finance writes a salary row directly (no approval, no preparer restriction).
insert into public.salary_private (person_id, base_salary) values ('dddd0002-0000-0000-0000-000000000001', 2500000);
-- Approve own request: the SAME profile that requested the finance approval approves it.
update public.approvals set status='approved'
 where id='dddd0001-0000-0000-0000-000000000001' and status='pending';

reset role;

select json_build_object(
  'scenario','SC-058',
  'classification','KNOWN GAP — not a passing control',
  'persona','hr_finance (the only mapping for bookkeeper/CFO)',
  'salary_written_directly', exists(select 1 from public.salary_private where person_id='dddd0002-0000-0000-0000-000000000001' and base_salary=2500000),
  'self_requested_finance_approval_self_approved',
     (select status from public.approvals where id='dddd0001-0000-0000-0000-000000000001') = 'approved',
  'sod_gap_reproduced', (
        exists(select 1 from public.salary_private where person_id='dddd0002-0000-0000-0000-000000000001')
    and (select status from public.approvals where id='dddd0001-0000-0000-0000-000000000001')='approved'
  ),
  'note','A real SoD control would forbid requester=approver on finance/salary domains, or split write into a preparer-only role. Neither exists. Do NOT report SC-058 as PASS.'
) as verdict;

rollback;
