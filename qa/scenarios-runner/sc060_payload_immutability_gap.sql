-- SC-060 Approval payload immutability — FIXED (qa/KNOWN_FAILURE_MODES.md #15, migration
-- 202608280003). Previously this script REPRODUCED the gap: a manager authorized to
-- DECIDE an approval could also silently REWRITE its approval_payload (offerPrice 2200 ->
-- 1200) via a plain UPDATE. Now asserts the fix: a BEFORE UPDATE trigger
-- (prevent_approval_payload_mutation) rejects any change to approval_payload/title/
-- domain/company_id once set, so the attempt is caught and the payload is provably
-- unchanged. Also proves decide_approval() itself is unaffected (only touches status/
-- decided_at/decision_notes/approver_profile_id, never the locked columns). Rolled back.
begin;
insert into public.approvals (id, company_id, title, domain, status, risk_level, approval_payload)
 values ('060a0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC060 offer','production','pending','high','{"offerPrice":2200}'::jsonb);
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

-- Attempt the same rewrite as before — must now be rejected by the trigger, caught here
-- so the script can keep going and report cleanly instead of aborting.
do $$
begin
  begin
    update public.approvals set approval_payload='{"offerPrice":1200}'::jsonb where id='060a0000-0000-0000-0000-000000000001';
    perform set_config('sc060.mutation_blocked', 'false', true);
  exception when raise_exception then
    perform set_config('sc060.mutation_blocked', 'true', true);
  end;
end $$;

-- decide_approval() itself must still work normally (only touches status/decided_at/
-- decision_notes/approver_profile_id, never the locked columns) — a manager decides this
-- production-domain approval.
do $$
declare
  v_decided boolean;
begin
  select decided into v_decided from public.decide_approval('060a0000-0000-0000-0000-000000000001'::uuid, 'approved');
  perform set_config('sc060.decide_still_works', v_decided::text, true);
end $$;

reset role;

select json_build_object(
  'scenario','SC-060',
  'classification','FIXED',
  'mutation_blocked', current_setting('sc060.mutation_blocked', true) = 'true',
  'payload_unchanged', (select approval_payload->>'offerPrice' from public.approvals where id='060a0000-0000-0000-0000-000000000001')='2200',
  'decide_approval_still_works', current_setting('sc060.decide_still_works', true) = 'true',
  'approval_status_after', (select status from public.approvals where id='060a0000-0000-0000-0000-000000000001'),
  'all_pass', (
        current_setting('sc060.mutation_blocked', true) = 'true'
    and (select approval_payload->>'offerPrice' from public.approvals where id='060a0000-0000-0000-0000-000000000001')='2200'
    and current_setting('sc060.decide_still_works', true) = 'true'
    and (select status from public.approvals where id='060a0000-0000-0000-0000-000000000001')='approved'
  )
) as verdict;
rollback;
