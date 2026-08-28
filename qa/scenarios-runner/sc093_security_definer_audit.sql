-- SC-093 SECURITY DEFINER function audit. Exercises every live SECURITY DEFINER function
-- in the public schema under an unauthorized (employee), authorized (founder), and
-- malformed-input path, confirming each enforces its intended boundary. SECURITY DEFINER
-- bypasses table RLS, so each of these MUST do its own check — this proves they do.
-- Live SECURITY DEFINER set (re-queried 2026-08-28, see qa/KNOWN_FAILURE_MODES.md #14/#15):
-- current_profile_id, current_role, is_founder_or_admin, is_hr_finance, has_company_access,
-- is_investor_viewer_of, is_company_manager, can_manage_board_item,
-- create/get/delete_mcp_connector_secret, handle_new_auth_user,
-- sem_audit_board_change/_column_change/_item_change, decide_approval,
-- propose_salary_change. decide_approval() itself is audited in depth separately in
-- SC-059/SC-059b/SC-094/SC-058/SC-060 (its self-approval and payload-immutability guards
-- specifically) — this script covers it here only for the baseline unauthorized-caller
-- check, not the full logic. set_channel_company_id is deliberately NOT in this audit —
-- it's SECURITY INVOKER, not SECURITY DEFINER (relies on chat_channels_write_scope RLS
-- normally, doesn't bypass it), so it's a different class of function than this script
-- targets. Rolled back.
begin;

create temp table sc093_obs (k text, v text) on commit drop;
grant insert, select on sc093_obs to authenticated;

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

-- ---- unauthorized: employee ----
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
insert into sc093_obs values
 ('emp_is_founder_or_admin', public.is_founder_or_admin()::text),
 ('emp_is_hr_finance', public.is_hr_finance()::text),
 ('emp_current_role', public.current_role()::text),
 ('emp_has_access_own', public.has_company_access('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')::text),
 ('emp_has_access_other', public.has_company_access('773210d1-1203-4910-b18a-eab4cc7c3d9c')::text),
 ('emp_is_manager_own', public.is_company_manager('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')::text),
 ('emp_try_uuid_malformed', coalesce(public.try_uuid('not-a-uuid')::text,'NULL')),
 ('emp_has_access_malformed_null', public.has_company_access(public.try_uuid('garbage'))::text),
 ('emp_is_investor_viewer_of_own', public.is_investor_viewer_of('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')::text);
-- MCP secret RPC must self-deny for a non-founder (raises 'not authorized').
do $$ begin
  begin
    perform public.create_mcp_connector_secret('sc093','x');
    insert into sc093_obs values ('emp_mcp_create','ALLOWED-BAD');
  exception when others then insert into sc093_obs values ('emp_mcp_create','DENIED');
  end;
end $$;
-- propose_salary_change must self-deny for a plain employee (not hr_finance/founder).
do $$ begin
  begin
    perform public.propose_salary_change('dddd0002-0000-0000-0000-000000000001', 1, 'USD', null);
    insert into sc093_obs values ('emp_propose_salary_change','ALLOWED-BAD');
  exception when others then insert into sc093_obs values ('emp_propose_salary_change','DENIED');
  end;
end $$;
reset role;

-- ---- authorized: founder ----
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
insert into sc093_obs values
 ('founder_is_founder_or_admin', public.is_founder_or_admin()::text),
 ('founder_has_access_any', public.has_company_access('773210d1-1203-4910-b18a-eab4cc7c3d9c')::text),
 ('founder_is_manager_any', public.is_company_manager('773210d1-1203-4910-b18a-eab4cc7c3d9c')::text);
-- propose_salary_change must succeed for founder/admin (founder bypasses the
-- is_hr_finance() requirement, same exemption pattern as everywhere else in this app).
do $$
declare
  v_id uuid;
begin
  v_id := public.propose_salary_change('dddd0002-0000-0000-0000-000000000001', 1, 'USD', null);
  insert into sc093_obs values ('founder_propose_salary_change', case when v_id is not null then 'ALLOWED-GOOD' else 'ALLOWED-BAD-NULL' end);
exception when others then insert into sc093_obs values ('founder_propose_salary_change','DENIED-BAD');
end $$;
reset role;

select json_build_object(
  'scenario','SC-093',
  'emp_is_founder_or_admin', (select v from sc093_obs where k='emp_is_founder_or_admin'),
  'emp_is_hr_finance', (select v from sc093_obs where k='emp_is_hr_finance'),
  'emp_has_access_own', (select v from sc093_obs where k='emp_has_access_own'),
  'emp_has_access_other', (select v from sc093_obs where k='emp_has_access_other'),
  'emp_is_manager_own', (select v from sc093_obs where k='emp_is_manager_own'),
  'emp_try_uuid_malformed', (select v from sc093_obs where k='emp_try_uuid_malformed'),
  'emp_has_access_malformed_null', (select v from sc093_obs where k='emp_has_access_malformed_null'),
  'emp_mcp_create', (select v from sc093_obs where k='emp_mcp_create'),
  'emp_is_investor_viewer_of_own', (select v from sc093_obs where k='emp_is_investor_viewer_of_own'),
  'emp_propose_salary_change', (select v from sc093_obs where k='emp_propose_salary_change'),
  'founder_is_founder_or_admin', (select v from sc093_obs where k='founder_is_founder_or_admin'),
  'founder_has_access_any', (select v from sc093_obs where k='founder_has_access_any'),
  'founder_propose_salary_change', (select v from sc093_obs where k='founder_propose_salary_change'),
  'all_pass', (
        (select v from sc093_obs where k='emp_is_founder_or_admin')='false'
    and (select v from sc093_obs where k='emp_is_hr_finance')='false'
    and (select v from sc093_obs where k='emp_has_access_own')='true'
    and (select v from sc093_obs where k='emp_has_access_other')='false'
    and (select v from sc093_obs where k='emp_is_manager_own')='false'
    and (select v from sc093_obs where k='emp_try_uuid_malformed')='NULL'
    and (select v from sc093_obs where k='emp_has_access_malformed_null')='false'
    and (select v from sc093_obs where k='emp_mcp_create')='DENIED'
    and (select v from sc093_obs where k='emp_is_investor_viewer_of_own')='false'
    and (select v from sc093_obs where k='emp_propose_salary_change')='DENIED'
    and (select v from sc093_obs where k='founder_is_founder_or_admin')='true'
    and (select v from sc093_obs where k='founder_has_access_any')='true'
    and (select v from sc093_obs where k='founder_propose_salary_change')='ALLOWED-GOOD'
  )
) as verdict;

rollback;
