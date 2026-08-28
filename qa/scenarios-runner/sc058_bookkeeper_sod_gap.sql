-- SC-058 Bookkeeper segregation of duties — FIXED (qa/KNOWN_FAILURE_MODES.md #14,
-- migration 202608280003). Previously this script REPRODUCED the gap: an hr_finance
-- account could write salary_private directly AND self-approve its own finance approval.
-- Now asserts the fix: direct salary_private writes are founder/admin only, hr_finance
-- must go through propose_salary_change(), and the same profile that proposed a
-- salary_hr/finance change cannot also decide it. All fixtures rolled back.
--
-- No psql meta-commands (\gset etc.) — not proven to work through `supabase db query`,
-- unlike a real psql session. Every intermediate value is passed via set_config/
-- current_setting on a custom GUC instead, scoped to this transaction.
begin;

-- Promote the EMPLOYEE test profile to hr_finance for the duration of this transaction only.
update public.profiles set role='hr_finance' where id='66ef2052-d002-4592-b841-82cd2171b51a';

insert into public.people (id, company_id, full_name)
 values ('dddd0002-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC058 Person');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

-- 1. Direct write attempt must now be blocked by RLS (salary_write_hr is founder/admin
-- only) — caught in a subtransaction so the script can keep going and report cleanly
-- instead of aborting on the expected error.
do $$
begin
  begin
    insert into public.salary_private (person_id, base_salary) values ('dddd0002-0000-0000-0000-000000000001', 2500000);
    perform set_config('sc058.direct_write_blocked', 'false', true);
  exception when insufficient_privilege then
    perform set_config('sc058.direct_write_blocked', 'true', true);
  end;
end $$;

-- 2. hr_finance proposes via the real path — should succeed and create a pending
-- salary_hr approval. Stash the new approval id in a GUC for the later steps.
do $$
declare
  v_id uuid;
begin
  v_id := public.propose_salary_change('dddd0002-0000-0000-0000-000000000001', 2500000, 'USD', 'SC-058 proposal');
  perform set_config('sc058.approval_id', v_id::text, true);
end $$;

-- 3. The SAME profile attempts to decide its own proposal — must be denied.
do $$
declare
  v_decided boolean;
begin
  select decided into v_decided from public.decide_approval(current_setting('sc058.approval_id')::uuid, 'approved');
  perform set_config('sc058.self_decided', v_decided::text, true);
end $$;

reset role;

-- 4. Founder (a different, always-authorized decider) can still resolve it — proves the
-- approval isn't permanently stuck, just that the original requester can't self-approve.
-- Must explicitly switch the JWT claims to FOUNDER here: `reset role` only resets the
-- Postgres role back to the superuser connection, it does NOT clear the
-- request.jwt.claims GUC set earlier (that's transaction-local, not role-local) — without
-- this, step 4 would silently still run as the employee/hr_finance test profile.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
declare
  v_decided boolean;
begin
  select decided into v_decided from public.decide_approval(current_setting('sc058.approval_id')::uuid, 'approved');
  perform set_config('sc058.founder_decided', v_decided::text, true);
end $$;

reset role;

select json_build_object(
  'scenario','SC-058',
  'classification','FIXED',
  'persona','hr_finance (the only mapping for bookkeeper/CFO)',
  'direct_write_blocked', current_setting('sc058.direct_write_blocked', true) = 'true',
  'proposal_created', current_setting('sc058.approval_id', true) is not null,
  'self_approval_denied', current_setting('sc058.self_decided', true) = 'false',
  'founder_can_still_approve', current_setting('sc058.founder_decided', true) = 'true',
  'salary_applied_after_founder_approval', exists(select 1 from public.salary_private where person_id='dddd0002-0000-0000-0000-000000000001' and base_salary=2500000),
  'all_pass', (
        current_setting('sc058.direct_write_blocked', true) = 'true'
    and current_setting('sc058.approval_id', true) is not null
    and current_setting('sc058.self_decided', true) = 'false'
    and current_setting('sc058.founder_decided', true) = 'true'
    and exists(select 1 from public.salary_private where person_id='dddd0002-0000-0000-0000-000000000001' and base_salary=2500000)
  )
) as verdict;

rollback;
