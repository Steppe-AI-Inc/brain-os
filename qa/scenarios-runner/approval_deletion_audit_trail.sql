-- Plain approval-record deletion previously had zero audit trail (SC-132 follow-up,
-- qa/KNOWN_FAILURE_MODES.md #18/#17 area — decide_approval() writes an audit_logs row for
-- a decision, a bare DELETE never did). Migration 202608280003 added an AFTER DELETE
-- trigger (audit_approval_deletion). Asserts it actually fires with the right content.
-- Not one of the original SC-054..SC-131 scenarios. All fixtures rolled back.
begin;

insert into public.approvals (id, company_id, title, reason, domain, status, risk_level)
 values ('ad000001-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC-audit-trail test','testing the deletion trigger','general','pending','low');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

delete from public.approvals where id='ad000001-0000-0000-0000-000000000001';

reset role;

select json_build_object(
  'scenario','approval_deletion_audit_trail',
  'row_gone', not exists(select 1 from public.approvals where id='ad000001-0000-0000-0000-000000000001'),
  'audit_row_exists', exists(
    select 1 from public.audit_logs
    where event_type='approval_deleted' and entity_id='ad000001-0000-0000-0000-000000000001'
  ),
  'audit_row_company_correct', (
    select company_id from public.audit_logs
    where event_type='approval_deleted' and entity_id='ad000001-0000-0000-0000-000000000001'
    order by created_at desc limit 1
  ) = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
  'audit_row_metadata', (
    select metadata from public.audit_logs
    where event_type='approval_deleted' and entity_id='ad000001-0000-0000-0000-000000000001'
    order by created_at desc limit 1
  ),
  'all_pass', (
        not exists(select 1 from public.approvals where id='ad000001-0000-0000-0000-000000000001')
    and exists(select 1 from public.audit_logs where event_type='approval_deleted' and entity_id='ad000001-0000-0000-0000-000000000001')
    and (select company_id from public.audit_logs where event_type='approval_deleted' and entity_id='ad000001-0000-0000-0000-000000000001' order by created_at desc limit 1) = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'
  )
) as verdict;

rollback;
