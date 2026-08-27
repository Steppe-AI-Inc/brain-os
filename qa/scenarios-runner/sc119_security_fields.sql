-- SC-119 Security-field mutation. For each security-bearing column, an unauthorized
-- (member-but-not-manager) employee attempts a mutation that would change visibility or
-- authority, and it must be denied / leave the field unchanged. Fields covered here
-- (others in SC-057/072/073/118): memory.sensitivity, memory.company_id,
-- task.owner_person_id, approval.approver_profile_id (self-assign), approval.status.
-- Rolled back.
begin;

insert into public.memories (id, company_id, entity_type, fact, sensitivity)
 values ('119a0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','company','SC119 confidential fact','confidential');
insert into public.tasks (id, company_id, title, status, created_by_profile_id, owner_person_id)
 values ('119b0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC119 task','queued','46bf57d3-33b3-47b4-8302-126726a92775', null);
insert into public.approvals (id, company_id, title, domain, status, risk_level)
 values ('119c0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC119 approval','finance','pending','high');

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
-- all attempts are RLS-filtered (member is not manager/hr_finance) -> 0 rows, no state change
update public.memories set sensitivity='internal' where id='119a0000-0000-0000-0000-000000000001';
update public.memories set company_id='773210d1-1203-4910-b18a-eab4cc7c3d9c' where id='119a0000-0000-0000-0000-000000000001';
update public.tasks set owner_person_id=null where id='119b0000-0000-0000-0000-000000000001';
update public.approvals set approver_profile_id='66ef2052-d002-4592-b841-82cd2171b51a' where id='119c0000-0000-0000-0000-000000000001';
update public.approvals set status='approved' where id='119c0000-0000-0000-0000-000000000001';
reset role;

select json_build_object(
  'scenario','SC-119',
  'memory_sensitivity_unchanged', (select sensitivity from public.memories where id='119a0000-0000-0000-0000-000000000001')='confidential',
  'memory_company_unchanged',     (select company_id from public.memories where id='119a0000-0000-0000-0000-000000000001')='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
  'approval_approver_unchanged',  (select approver_profile_id from public.approvals where id='119c0000-0000-0000-0000-000000000001') is null,
  'approval_status_unchanged',    (select status from public.approvals where id='119c0000-0000-0000-0000-000000000001')='pending',
  'all_pass', (
        (select sensitivity from public.memories where id='119a0000-0000-0000-0000-000000000001')='confidential'
    and (select company_id from public.memories where id='119a0000-0000-0000-0000-000000000001')='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'
    and (select approver_profile_id from public.approvals where id='119c0000-0000-0000-0000-000000000001') is null
    and (select status from public.approvals where id='119c0000-0000-0000-0000-000000000001')='pending'
  )
) as verdict;

rollback;
