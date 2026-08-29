-- Company archive/restore ownership — permanent regression for KNOWN_FAILURE_MODES.md #19's
-- sibling fix (frictionless company delete, migration 202608280013). Proves, against real
-- fixture companies in a rolled-back transaction, against the already-deployed
-- archive_company()/restore_company()/companies RLS (not redefined here — this tests what's
-- actually live, same convention as organization_graph_integrity.sql):
--   0. a non-admin cannot INSERT a company at all (companies_insert_admin)
--   1. force_company_creator ignores whatever created_by_profile_id the client supplies
--   2. creator + active membership -> archive/restore/edit all allowed
--   3. same creator, membership removed -> archive denied AND plain edit affects 0 rows
--   4. a different, unrelated user -> denied
--   5. founder -> allowed unconditionally
--   6. idempotency: re-archiving an already-archived company is a no-op, not an error
--   7. not-found id -> reason not_found, no mutation
--   8. companies_lifecycle_guard blocks a direct UPDATE ... SET status='archived' bypass
--   9. companies_status_check rejects an invalid status value
-- This is exactly the regression that caught two real bugs before they shipped: the
-- companies_write_scope INSERT-bootstrap gap (no non-admin/manager could ever create the
-- row they'd later need active membership on) and the lifecycle-guard GUC flag leaking
-- across an entire transaction instead of resetting after each RPC's own UPDATE.
begin;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

insert into public.companies (id, name, status) values ('cccc0002-0000-0000-0000-000000000001','SC-ARCH Founder Co','active');
insert into public.companies (id, name, status) values ('cccc0002-0000-0000-0000-000000000002','SC-ARCH Employee Co','active');
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('cccc0002-0000-0000-0000-000000000002','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);
insert into public.companies (id, name, status) values ('cccc0002-0000-0000-0000-000000000004','SC-ARCH Creator Tier Co','active');
update public.companies set created_by_profile_id = '66ef2052-d002-4592-b841-82cd2171b51a' where id = 'cccc0002-0000-0000-0000-000000000004';
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('cccc0002-0000-0000-0000-000000000004','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);
select set_config('sc_arch.founder_profile_id', (public.current_profile_id())::text, true);
reset role;

-- 0. Non-admin cannot INSERT a company at all.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.companies (id, name, status) values ('cccc0002-0000-0000-0000-000000000009','SC-ARCH Unauthorized Insert','active');
    perform set_config('sc_arch.nonadmin_insert_blocked', 'false', true);
  exception when others then
    perform set_config('sc_arch.nonadmin_insert_blocked', 'true', true);
  end;
end $$;
reset role;

-- 1. Creator spoof: founder (the only actor who can insert) explicitly supplies a
-- different profile as created_by_profile_id - the trigger must overwrite it regardless.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
insert into public.companies (id, name, status, created_by_profile_id)
  values ('cccc0002-0000-0000-0000-000000000005','SC-ARCH Insert Spoof Test','active','66ef2052-d002-4592-b841-82cd2171b51a');
select set_config('sc_arch.spoof_creator',
  (select created_by_profile_id::text from public.companies where id='cccc0002-0000-0000-0000-000000000005'), true);
reset role;

-- 2. Creator + active membership -> archive/restore/edit all allowed.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_arch.creator_archive', (public.archive_company('cccc0002-0000-0000-0000-000000000004'))::text, true);
select set_config('sc_arch.creator_restore', (public.restore_company('cccc0002-0000-0000-0000-000000000004'))::text, true);
update public.companies set description = 'edited by creator' where id = 'cccc0002-0000-0000-0000-000000000004';
select set_config('sc_arch.creator_edit_rows',
  (select count(*)::text from public.companies where id='cccc0002-0000-0000-0000-000000000004' and description='edited by creator'), true);
reset role;

-- 3. Former creator after membership removal -> denied, and a plain edit affects 0 rows
-- (RLS blocks it silently, it doesn't throw - must check row count, not an exception).
update public.company_memberships set active = false
  where company_id='cccc0002-0000-0000-0000-000000000004' and profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_arch.former_creator_archive', (public.archive_company('cccc0002-0000-0000-0000-000000000004'))::text, true);
do $$
declare
  v_rows int;
begin
  update public.companies set description = 'should fail' where id = 'cccc0002-0000-0000-0000-000000000004';
  get diagnostics v_rows = row_count;
  perform set_config('sc_arch.former_creator_edit_blocked', (v_rows = 0)::text, true);
end $$;
reset role;

-- 4. Different, unrelated user -> denied.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_arch.other_user_archive', (public.archive_company('cccc0002-0000-0000-0000-000000000001'))::text, true);
reset role;

-- 5. Founder -> allowed unconditionally.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_arch.founder_archive', (public.archive_company('cccc0002-0000-0000-0000-000000000001'))::text, true);

-- 6. Idempotency: re-archiving an already-archived company is a no-op.
select set_config('sc_arch.idempotent_archive', (public.archive_company('cccc0002-0000-0000-0000-000000000001'))::text, true);

-- 7. Not-found id.
select set_config('sc_arch.not_found', (public.archive_company('00000000-0000-0000-0000-000000000000'))::text, true);

-- 8. companies_lifecycle_guard blocks a direct bypass, even after multiple prior real RPC
-- calls in this same transaction (the GUC-leak bug this test caught before push).
do $$
begin
  begin
    update public.companies set status = 'archived' where id = 'cccc0002-0000-0000-0000-000000000002';
    perform set_config('sc_arch.direct_bypass_blocked', 'false', true);
  exception when others then
    perform set_config('sc_arch.direct_bypass_blocked', 'true', true);
  end;
end $$;

-- 9. Status CHECK constraint rejects an invalid value directly.
do $$
begin
  begin
    update public.companies set status = 'not_a_real_status' where id = 'cccc0002-0000-0000-0000-000000000002';
    perform set_config('sc_arch.status_constraint_blocked', 'false', true);
  exception when others then
    perform set_config('sc_arch.status_constraint_blocked', 'true', true);
  end;
end $$;
reset role;

select json_build_object(
  'scenario', 'COMPANY-ARCHIVE-OWNERSHIP',
  'classification', 'FIXED (KNOWN_FAILURE_MODES.md #19 sibling — see migration 202608280013)',
  'nonadmin_insert_blocked', current_setting('sc_arch.nonadmin_insert_blocked', true) = 'true',
  'spoof_prevented', current_setting('sc_arch.spoof_creator', true) = current_setting('sc_arch.founder_profile_id', true),
  'creator_archive', current_setting('sc_arch.creator_archive', true)::jsonb,
  'creator_restore', current_setting('sc_arch.creator_restore', true)::jsonb,
  'creator_edit_allowed', current_setting('sc_arch.creator_edit_rows', true) = '1',
  'former_creator_archive', current_setting('sc_arch.former_creator_archive', true)::jsonb,
  'former_creator_edit_blocked', current_setting('sc_arch.former_creator_edit_blocked', true) = 'true',
  'other_user_archive', current_setting('sc_arch.other_user_archive', true)::jsonb,
  'founder_archive', current_setting('sc_arch.founder_archive', true)::jsonb,
  'idempotent_archive', current_setting('sc_arch.idempotent_archive', true)::jsonb,
  'not_found', current_setting('sc_arch.not_found', true)::jsonb,
  'direct_bypass_blocked', current_setting('sc_arch.direct_bypass_blocked', true) = 'true',
  'status_constraint_blocked', current_setting('sc_arch.status_constraint_blocked', true) = 'true',
  'all_pass', (
        current_setting('sc_arch.nonadmin_insert_blocked', true) = 'true'
    and current_setting('sc_arch.spoof_creator', true) = current_setting('sc_arch.founder_profile_id', true)
    and (current_setting('sc_arch.creator_archive', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_arch.creator_archive', true)::jsonb->>'authorized') = 'true'
    and (current_setting('sc_arch.creator_restore', true)::jsonb->>'changed') = 'true'
    and current_setting('sc_arch.creator_edit_rows', true) = '1'
    and (current_setting('sc_arch.former_creator_archive', true)::jsonb->>'authorized') = 'false'
    and current_setting('sc_arch.former_creator_edit_blocked', true) = 'true'
    and (current_setting('sc_arch.other_user_archive', true)::jsonb->>'authorized') = 'false'
    and (current_setting('sc_arch.founder_archive', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_arch.idempotent_archive', true)::jsonb->>'reason') = 'already_archived'
    and (current_setting('sc_arch.not_found', true)::jsonb->>'reason') = 'not_found'
    and current_setting('sc_arch.direct_bypass_blocked', true) = 'true'
    and current_setting('sc_arch.status_constraint_blocked', true) = 'true'
  )
) as verdict;

rollback;
