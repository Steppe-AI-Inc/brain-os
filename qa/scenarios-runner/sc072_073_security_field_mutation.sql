-- SC-072 / SC-073 Security-field mutation. Owning a resource does not grant the right to
-- mutate its security fields.
--   SC-072: the employee OWNS (created) a task, then tries to move it to another company
--           and to reassign it — tasks_update_scope only lets founder/manager/owner edit,
--           and a WITH CHECK to another company they don't belong to must fail.
--   SC-073: the employee tries to downgrade a confidential document to internal —
--           documents_write_scope is manager+ only, so the update is denied outright.
-- Denial = the row is UNCHANGED after the attempt (RLS UPDATE affects 0 rows silently) or
-- the statement raises. Rolled back.
begin;

create temp table sc07x_obs (k text, v text) on commit drop;
grant insert, select on sc07x_obs to authenticated;

-- Task created BY the employee (so they own it) in CLIX GPS.
insert into public.tasks (id, company_id, title, status, created_by_profile_id)
 values ('a072a072-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC072 owned task','queued','66ef2052-d002-4592-b841-82cd2171b51a');
-- A confidential document in CLIX GPS.
insert into public.documents (id, company_id, title, sensitivity)
 values ('a073a073-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC073 confidential doc','confidential');

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

do $$
begin
  -- SC-072: try to move owned task to another company.
  begin
    update public.tasks set company_id='773210d1-1203-4910-b18a-eab4cc7c3d9c'
      where id='a072a072-0000-0000-0000-000000000001';
    insert into sc07x_obs values ('task_move_company','ATTEMPT-NOERROR');
  exception when others then
    insert into sc07x_obs values ('task_move_company','DENIED:'||sqlstate);
  end;
  -- SC-073: try to downgrade confidential doc to internal.
  begin
    update public.documents set sensitivity='internal'
      where id='a073a073-0000-0000-0000-000000000001';
    insert into sc07x_obs values ('doc_downgrade','ATTEMPT-NOERROR');
  exception when others then
    insert into sc07x_obs values ('doc_downgrade','DENIED:'||sqlstate);
  end;
end $$;

reset role;

-- True post-state read as postgres: neither field may have actually changed.
select json_build_object(
  'scenario','SC-072 / SC-073',
  'task_company_unchanged', (select company_id from public.tasks where id='a072a072-0000-0000-0000-000000000001') = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
  'doc_sensitivity_unchanged', (select sensitivity from public.documents where id='a073a073-0000-0000-0000-000000000001') = 'confidential',
  'task_move_attempt', (select v from sc07x_obs where k='task_move_company'),
  'doc_downgrade_attempt', (select v from sc07x_obs where k='doc_downgrade'),
  'all_pass', (
        (select company_id from public.tasks where id='a072a072-0000-0000-0000-000000000001') = 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'
    and (select sensitivity from public.documents where id='a073a073-0000-0000-0000-000000000001') = 'confidential'
  )
) as verdict;

rollback;
