-- PERMANENT REGRESSION — BUG-004 same-defect class (approvals/integration_queue/
-- product_specs/tasks INSERT, documents/engineering_drawings/product_specs SELECT).
-- company_id IS NULL must never be a blanket authorization bypass anywhere in this
-- schema, except through explicit privileged authority (is_founder_or_admin()) or a
-- specifically-documented, reviewed exception (tasks_update_scope - see its own
-- comment in supabase/migrations/202608310010_same_defect_sweep_null_scope_bypass.sql).
--
-- Real-impersonation method (qa/scenarios-runner/README.md convention). Self-cleaning:
-- begin;...rollback;, zero residue.
--
-- Regressions covered in one file:
--   ZERO_MEMBERSHIP_USER_CANNOT_WRITE_GLOBAL_TENANT_ROW
--   ZERO_MEMBERSHIP_USER_CANNOT_READ_GLOBAL_TENANT_ROW
--   NULL_TENANT_SCOPE_REQUIRES_EXPLICIT_GLOBAL_AUTHORITY
--   NULL_SCOPE_POLICY_OCCURRENCES_ARE_EXPLICITLY_CLASSIFIED

begin;

create temp table t_result (k text, v text) on commit drop;
grant insert, select on t_result to authenticated, anon;

-- ===== NULL_SCOPE_POLICY_OCCURRENCES_ARE_EXPLICITLY_CLASSIFIED =====
-- Every RLS policy anywhere in public schema mentioning `IS NULL` must be one of the
-- explicitly-reviewed/fixed policies, or the one documented exception. A NEW occurrence
-- appearing here (a future migration reintroducing the pattern, or adding it to a new
-- table) must fail this check until it is reviewed and either fixed or added to the
-- documented-exception list below.
insert into t_result
select 'unclassified_null_scope_policies',
  coalesce(jsonb_agg(distinct c.relname || '.' || pol.polname)::text, '[]')
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (pg_get_expr(pol.polqual, pol.polrelid) ilike '%IS NULL%'
    or pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%IS NULL%')
  and pol.polname not in ('tasks_update_scope'); -- the one documented, reviewed exception

-- ===== WRITE: zero-membership stranger cannot write a NULL-scoped row =====
do $$
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text, true)
    from public.profiles p where p.role='employee' and p.auth_user_id is not null
      and not exists (select 1 from public.company_memberships m where m.profile_id=p.id) limit 1;
    set local role authenticated;
    insert into public.approvals (title, company_id, status) values ('REGRESSION-probe approval', null, 'pending');
    perform set_config('t.approvals_write', 'ALLOWED_UNEXPECTEDLY', true);
  exception when others then
    perform set_config('t.approvals_write', 'DENIED_CORRECTLY', true);
  end;
  reset role;
end $$;
insert into t_result select 'approvals_zero_membership_write_null_scope', current_setting('t.approvals_write');

do $$
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text, true)
    from public.profiles p where p.role='employee' and p.auth_user_id is not null
      and not exists (select 1 from public.company_memberships m where m.profile_id=p.id) limit 1;
    set local role authenticated;
    insert into public.integration_queue (integration, action, company_id) values ('regression-probe', 'test', null);
    perform set_config('t.iq_write', 'ALLOWED_UNEXPECTEDLY', true);
  exception when others then
    perform set_config('t.iq_write', 'DENIED_CORRECTLY', true);
  end;
  reset role;
end $$;
insert into t_result select 'integration_queue_zero_membership_write_null_scope', current_setting('t.iq_write');

do $$
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text, true)
    from public.profiles p where p.role='employee' and p.auth_user_id is not null
      and not exists (select 1 from public.company_memberships m where m.profile_id=p.id) limit 1;
    set local role authenticated;
    insert into public.product_specs (title, company_id) values ('REGRESSION-probe spec', null);
    perform set_config('t.ps_write', 'ALLOWED_UNEXPECTEDLY', true);
  exception when others then
    perform set_config('t.ps_write', 'DENIED_CORRECTLY', true);
  end;
  reset role;
end $$;
insert into t_result select 'product_specs_zero_membership_write_null_scope', current_setting('t.ps_write');

do $$
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text, true)
    from public.profiles p where p.role='employee' and p.auth_user_id is not null
      and not exists (select 1 from public.company_memberships m where m.profile_id=p.id) limit 1;
    set local role authenticated;
    insert into public.tasks (title, company_id) values ('REGRESSION-probe task', null);
    perform set_config('t.tasks_write', 'ALLOWED_UNEXPECTEDLY', true);
  exception when others then
    perform set_config('t.tasks_write', 'DENIED_CORRECTLY', true);
  end;
  reset role;
end $$;
insert into t_result select 'tasks_zero_membership_write_null_scope', current_setting('t.tasks_write');

do $$
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text, true)
    from public.profiles p where p.role='employee' and p.auth_user_id is not null
      and not exists (select 1 from public.company_memberships m where m.profile_id=p.id) limit 1;
    set local role authenticated;
    insert into public.memories (company_id, entity_type, fact, sensitivity, confidence) values (null, 'company', 'REGRESSION-probe', 'internal', 0.5);
    perform set_config('t.mem_write', 'ALLOWED_UNEXPECTEDLY', true);
  exception when others then
    perform set_config('t.mem_write', 'DENIED_CORRECTLY', true);
  end;
  reset role;
end $$;
insert into t_result select 'memories_zero_membership_write_null_scope', current_setting('t.mem_write');

-- ===== READ: zero-membership stranger sees zero NULL-scoped rows =====
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text, true)
  from public.profiles p where p.role='employee' and p.auth_user_id is not null
    and not exists (select 1 from public.company_memberships m where m.profile_id=p.id) limit 1;
  set local role authenticated;
  perform set_config('t.docs_read', (select count(*)::text from public.documents where company_id is null), true);
  perform set_config('t.eng_read', (select count(*)::text from public.engineering_drawings where company_id is null), true);
  perform set_config('t.ps_read', (select count(*)::text from public.product_specs where company_id is null), true);
  perform set_config('t.mem_read', (select count(*)::text from public.memories where company_id is null and sensitivity='confidential'::visibility_level), true);
end $$;
reset role;
insert into t_result select 'documents_zero_membership_read_null_scope', current_setting('t.docs_read');
insert into t_result select 'engineering_drawings_zero_membership_read_null_scope', current_setting('t.eng_read');
insert into t_result select 'product_specs_zero_membership_read_null_scope', current_setting('t.ps_read');
insert into t_result select 'memories_zero_membership_read_confidential_null_scope', current_setting('t.mem_read');

-- ===== NULL_TENANT_SCOPE_REQUIRES_EXPLICIT_GLOBAL_AUTHORITY: founder path preserved =====
do $$
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text, true)
    from public.profiles p where p.role='founder' and p.auth_user_id is not null limit 1;
    set local role authenticated;
    insert into public.approvals (title, company_id, status) values ('REGRESSION-probe founder approval', null, 'pending');
    perform set_config('t.founder_write', 'ALLOWED_CORRECTLY', true);
  exception when others then
    perform set_config('t.founder_write', 'DENIED_UNEXPECTEDLY', true);
  end;
  reset role;
end $$;
insert into t_result select 'founder_can_still_write_null_scope', current_setting('t.founder_write');

select
  (select jsonb_object_agg(k, v order by k) from t_result) as raw_results,
  (
    (select v from t_result where k='unclassified_null_scope_policies') = '[]'
    and (select v from t_result where k='approvals_zero_membership_write_null_scope') = 'DENIED_CORRECTLY'
    and (select v from t_result where k='integration_queue_zero_membership_write_null_scope') = 'DENIED_CORRECTLY'
    and (select v from t_result where k='product_specs_zero_membership_write_null_scope') = 'DENIED_CORRECTLY'
    and (select v from t_result where k='tasks_zero_membership_write_null_scope') = 'DENIED_CORRECTLY'
    and (select v from t_result where k='memories_zero_membership_write_null_scope') = 'DENIED_CORRECTLY'
    and (select v from t_result where k='documents_zero_membership_read_null_scope') = '0'
    and (select v from t_result where k='engineering_drawings_zero_membership_read_null_scope') = '0'
    and (select v from t_result where k='product_specs_zero_membership_read_null_scope') = '0'
    and (select v from t_result where k='memories_zero_membership_read_confidential_null_scope') = '0'
    and (select v from t_result where k='founder_can_still_write_null_scope') = 'ALLOWED_CORRECTLY'
  ) as all_pass;

rollback;
