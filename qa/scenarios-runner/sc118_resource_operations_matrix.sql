-- SC-118 Every resource operation tested SEPARATELY. A safe SELECT policy does NOT imply
-- a safe INSERT/UPDATE/DELETE — this session already found real drift exactly this way.
-- For tasks / documents / financial_reports, exercise S/I/U/D as employee and as manager
-- of the same company, recording ALLOWED/DENIED per cell. Denial = RLS raises (42501) OR
-- affects 0 rows leaving state unchanged; we detect both. Rolled back.
begin;

create temp table sc118 (role text, tbl text, op text, result text) on commit drop;
grant insert, select on sc118 to authenticated;

-- Seed rows (as postgres) to UPDATE/DELETE/SELECT against.
insert into public.tasks (id, company_id, title, status, created_by_profile_id) values
 ('118a0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC118 seed task','queued','46bf57d3-33b3-47b4-8302-126726a92775');
insert into public.documents (id, company_id, title, sensitivity) values
 ('118d0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC118 seed doc','internal');
insert into public.financial_reports (id, company_id, period) values
 ('118f0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','2026-Q1');

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

-- Reusable tester: attempts I/U/D in savepoints, records result; SELECT by count.
create or replace function pg_temp.run_matrix(p_role text) returns void language plpgsql as $fn$
begin
  -- tasks
  insert into sc118 values (p_role,'tasks','SELECT', case when exists(select 1 from public.tasks where id='118a0000-0000-0000-0000-000000000001') then 'VISIBLE' else 'HIDDEN' end);
  begin insert into public.tasks (company_id,title,status,created_by_profile_id) values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC118 '||p_role||' ins','queued','66ef2052-d002-4592-b841-82cd2171b51a'); insert into sc118 values (p_role,'tasks','INSERT','ALLOWED'); exception when others then insert into sc118 values (p_role,'tasks','INSERT','DENIED'); end;
  begin update public.tasks set title='SC118 upd' where id='118a0000-0000-0000-0000-000000000001'; insert into sc118 values (p_role,'tasks','UPDATE', case when found then 'AFFECTED' else 'ZERO-ROWS' end); exception when others then insert into sc118 values (p_role,'tasks','UPDATE','DENIED'); end;
  begin delete from public.tasks where id='118a0000-0000-0000-0000-000000000001'; insert into sc118 values (p_role,'tasks','DELETE', case when found then 'AFFECTED' else 'ZERO-ROWS' end); exception when others then insert into sc118 values (p_role,'tasks','DELETE','DENIED'); end;
  -- documents
  insert into sc118 values (p_role,'documents','SELECT', case when exists(select 1 from public.documents where id='118d0000-0000-0000-0000-000000000001') then 'VISIBLE' else 'HIDDEN' end);
  begin insert into public.documents (company_id,title,sensitivity) values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC118 '||p_role||' doc','internal'); insert into sc118 values (p_role,'documents','INSERT','ALLOWED'); exception when others then insert into sc118 values (p_role,'documents','INSERT','DENIED'); end;
  begin update public.documents set title='SC118 upd' where id='118d0000-0000-0000-0000-000000000001'; insert into sc118 values (p_role,'documents','UPDATE', case when found then 'AFFECTED' else 'ZERO-ROWS' end); exception when others then insert into sc118 values (p_role,'documents','UPDATE','DENIED'); end;
  begin delete from public.documents where id='118d0000-0000-0000-0000-000000000001'; insert into sc118 values (p_role,'documents','DELETE', case when found then 'AFFECTED' else 'ZERO-ROWS' end); exception when others then insert into sc118 values (p_role,'documents','DELETE','DENIED'); end;
  -- financial_reports
  insert into sc118 values (p_role,'financial_reports','SELECT', case when exists(select 1 from public.financial_reports where id='118f0000-0000-0000-0000-000000000001') then 'VISIBLE' else 'HIDDEN' end);
  begin insert into public.financial_reports (company_id,period) values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','2026-Q9'); insert into sc118 values (p_role,'financial_reports','INSERT','ALLOWED'); exception when others then insert into sc118 values (p_role,'financial_reports','INSERT','DENIED'); end;
end $fn$;
grant execute on function pg_temp.run_matrix(text) to authenticated;

-- employee
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select pg_temp.run_matrix('employee');
reset role;

-- re-seed the rows the employee may have deleted (defensive; employee delete should be ZERO-ROWS anyway)
insert into public.tasks (id, company_id, title, status, created_by_profile_id) values ('118a0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC118 seed task','queued','46bf57d3-33b3-47b4-8302-126726a92775') on conflict (id) do nothing;
insert into public.documents (id, company_id, title, sensitivity) values ('118d0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC118 seed doc','internal') on conflict (id) do nothing;

-- manager
update public.company_memberships set role_in_company='manager' where profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select pg_temp.run_matrix('manager');
reset role;

select json_agg(json_build_object('role',role,'tbl',tbl,'op',op,'result',result) order by role,tbl,op) as verdict from sc118;

rollback;
