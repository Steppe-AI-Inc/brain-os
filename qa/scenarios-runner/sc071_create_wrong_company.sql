-- SC-071 Create object in the wrong company. A member of Company A (CLIX GPS) submits a
-- task / sales_lead with company_id = Company B (SEM Global Robotics), which they are not
-- a member of. tasks_insert_scope / sales_leads_insert_member both require
-- has_company_access(company_id) in WITH CHECK, so the insert must be DENIED (SQLSTATE
-- 42501). Each attempt is wrapped so its failure rolls back only its own savepoint. The
-- app layer additionally cross-checks ids against contextCompanyIds server-side; this
-- proves the DB itself is the real backstop. Rolled back.
begin;

create temp table sc071_obs (k text, v text) on commit drop;
grant insert, select on sc071_obs to authenticated;

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

do $$
begin
  begin
    insert into public.tasks (company_id, title, status, created_by_profile_id)
      values ('773210d1-1203-4910-b18a-eab4cc7c3d9c','SC071 smuggled task','queued','66ef2052-d002-4592-b841-82cd2171b51a');
    insert into sc071_obs values ('task_wrong_company','ALLOWED-BAD');
  exception when others then
    insert into sc071_obs values ('task_wrong_company','DENIED:'||sqlstate);
  end;
  begin
    insert into public.sales_leads (company_id, client_name)
      values ('773210d1-1203-4910-b18a-eab4cc7c3d9c','SC071 smuggled lead');
    insert into sc071_obs values ('lead_wrong_company','ALLOWED-BAD');
  exception when others then
    insert into sc071_obs values ('lead_wrong_company','DENIED:'||sqlstate);
  end;
  -- Control: the SAME insert into the caller's OWN company must be allowed.
  begin
    insert into public.tasks (company_id, title, status, created_by_profile_id)
      values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC071 own-company task','queued','66ef2052-d002-4592-b841-82cd2171b51a');
    insert into sc071_obs values ('task_own_company','ALLOWED-GOOD');
  exception when others then
    insert into sc071_obs values ('task_own_company','DENIED:'||sqlstate);
  end;
end $$;

reset role;

select json_build_object(
  'scenario','SC-071',
  'task_wrong_company', (select v from sc071_obs where k='task_wrong_company'),
  'lead_wrong_company', (select v from sc071_obs where k='lead_wrong_company'),
  'task_own_company',   (select v from sc071_obs where k='task_own_company'),
  'all_pass', (
        (select v from sc071_obs where k='task_wrong_company') like 'DENIED:%'
    and (select v from sc071_obs where k='lead_wrong_company') like 'DENIED:%'
    and (select v from sc071_obs where k='task_own_company') = 'ALLOWED-GOOD'
  )
) as verdict;

rollback;
