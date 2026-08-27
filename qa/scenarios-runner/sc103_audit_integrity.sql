-- SC-103 Audit integrity. audit_logs has exactly two policies: audit_logs_insert_auth
-- (INSERT, any authenticated) and audit_logs_select_scope (SELECT). There is NO UPDATE
-- and NO DELETE policy, so with RLS enabled those operations are default-DENIED for every
-- non-superuser. This script proves an ordinary user cannot tamper with an audit row it
-- can even see (its own). Rolled back.
begin;

create temp table sc103_obs (k text, v text) on commit drop;
grant insert, select on sc103_obs to authenticated;

-- An audit row owned by the employee (so audit_logs_select_scope lets them read it).
insert into public.audit_logs (id, actor_profile_id, actor_role, event_type, message)
 values ('c103c103-0000-0000-0000-000000000001','66ef2052-d002-4592-b841-82cd2171b51a','employee','task_created','SC103 original message');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

insert into sc103_obs values ('can_read_own', exists(select 1 from public.audit_logs where id='c103c103-0000-0000-0000-000000000001')::text);
do $$ begin
  begin
    update public.audit_logs set message='SC103 TAMPERED' where id='c103c103-0000-0000-0000-000000000001';
    insert into sc103_obs values ('update_attempt','NOERROR');
  exception when others then insert into sc103_obs values ('update_attempt','DENIED:'||sqlstate);
  end;
  begin
    delete from public.audit_logs where id='c103c103-0000-0000-0000-000000000001';
    insert into sc103_obs values ('delete_attempt','NOERROR');
  exception when others then insert into sc103_obs values ('delete_attempt','DENIED:'||sqlstate);
  end;
end $$;
reset role;

select json_build_object(
  'scenario','SC-103',
  'can_read_own', (select v from sc103_obs where k='can_read_own'),
  'update_attempt', (select v from sc103_obs where k='update_attempt'),
  'delete_attempt', (select v from sc103_obs where k='delete_attempt'),
  'message_unchanged', (select message from public.audit_logs where id='c103c103-0000-0000-0000-000000000001') = 'SC103 original message',
  'row_still_present', exists(select 1 from public.audit_logs where id='c103c103-0000-0000-0000-000000000001'),
  'all_pass', (
        (select message from public.audit_logs where id='c103c103-0000-0000-0000-000000000001')='SC103 original message'
    and exists(select 1 from public.audit_logs where id='c103c103-0000-0000-0000-000000000001')
  )
) as verdict;

rollback;
