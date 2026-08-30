-- Live verification: Software Factory Phase 1/2 groundwork
-- (202608300004_plugin_registry.sql, 202608300005_task_dag_and_agent_telemetry.sql).
-- Wrapped in begin;...rollback; by the caller — zero residue, matching this repo's
-- established convention (qa/scenarios-runner/*.sql). Uses a real, known non-admin
-- profile id (9c92a8d5-853c-4ef3-846a-f4fe8c42d97a — a company manager, already proven
-- non-founder/admin in complete_agent_run_lifecycle.sql's own TEST 3) for the RLS check.

begin;

-- ================== TEST 1: RLS blocks a non-admin from writing plugin_sources ==================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

do $$
begin
  begin
    insert into public.plugin_sources (github_owner, github_repo, repository_url) values ('attacker','evil-repo','https://github.com/attacker/evil-repo');
    perform set_config('rls_test.non_admin_insert_blocked', 'false', true);
  exception when insufficient_privilege or others then
    perform set_config('rls_test.non_admin_insert_blocked', 'true', true);
  end;
end $$;

reset role;

-- ================== TEST 2: founder/admin CAN write plugin_sources/components, and
-- capabilities/agent_plugin_attachments work with a REAL canonical agent id ==================
set local role authenticated;
-- A real founder profile — reuse the same id complete_agent_run_lifecycle.sql already
-- established as the founder-completion path (cbcc41cf-830d-4600-8545-3b9e22c8297f).
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

insert into public.plugin_sources (id, github_owner, github_repo, repository_url, license, trust_status)
values ('aaaa9001-0000-0000-0000-000000000001', 'obra', 'superpowers', 'https://github.com/obra/superpowers', 'MIT', 'approved');

insert into public.plugin_components (id, source_id, slug, component_type, definition_hash, install_status, enabled)
values ('aaaa9002-0000-0000-0000-000000000001', 'aaaa9001-0000-0000-0000-000000000001', 'verification-before-completion-test', 'skill', 'deadbeef', 'registered', true);

select set_config('plugin_test.real_agent_id', (select id::text from public.agents where name = 'brain-os-verifier'), true);

do $$
declare v_agent_id uuid := current_setting('plugin_test.real_agent_id')::uuid;
begin
  update public.agents set capabilities = array['db_truth','rls_testing','fresh_context_verification'] where id = v_agent_id;
  insert into public.agent_plugin_attachments (agent_id, plugin_component_id)
  values (v_agent_id, 'aaaa9002-0000-0000-0000-000000000001');
end $$;

select set_config('plugin_test.capabilities_persisted',
  (select (capabilities = array['db_truth','rls_testing','fresh_context_verification'])::text
   from public.agents where id = current_setting('plugin_test.real_agent_id')::uuid), true);

select set_config('plugin_test.attachment_persisted',
  (select exists(
    select 1 from public.agent_plugin_attachments
    where agent_id = current_setting('plugin_test.real_agent_id')::uuid
      and plugin_component_id = 'aaaa9002-0000-0000-0000-000000000001'
      and detached_at is null
  ))::text, true);

-- ================== TEST 3: tasks DAG columns (depends_on/parallel_group/
-- required_capabilities) persist correctly against a REAL canonical_work_order ==================
select set_config('plugin_test.real_wo_id', (select id::text from public.canonical_work_orders where company_id is not null limit 1), true);
select set_config('plugin_test.real_wo_company_id', (select company_id::text from public.canonical_work_orders where id = current_setting('plugin_test.real_wo_id')::uuid), true);

do $$
declare
  v_wo_id uuid := current_setting('plugin_test.real_wo_id')::uuid;
  v_company_id uuid := current_setting('plugin_test.real_wo_company_id')::uuid;
  v_task_a uuid;
  v_task_b uuid;
begin
  insert into public.tasks (title, status, canonical_work_order_id, company_id, parallel_group, required_capabilities)
  values ('DAG-TEST-A', 'queued', v_wo_id, v_company_id, 'group-1', array['db_truth'])
  returning id into v_task_a;

  insert into public.tasks (title, status, canonical_work_order_id, company_id, depends_on, required_capabilities)
  values ('DAG-TEST-B', 'queued', v_wo_id, v_company_id, array[v_task_a], array['rls_testing'])
  returning id into v_task_b;

  perform set_config('plugin_test.dag_task_a', v_task_a::text, true);
  perform set_config('plugin_test.dag_task_b', v_task_b::text, true);
end $$;

select set_config('plugin_test.dag_persisted',
  (select (depends_on = array[current_setting('plugin_test.dag_task_a')::uuid]
           and parallel_group is null
           and required_capabilities = array['rls_testing'])::text
   from public.tasks where id = current_setting('plugin_test.dag_task_b')::uuid), true);

-- ================== TEST 4: heartbeat -> live status derivation (RUNNING vs STALE),
-- via a synthetic agent_runs row — never touches a real run ==================
do $$
declare
  v_agent_id uuid := current_setting('plugin_test.real_agent_id')::uuid;
  v_run_fresh uuid;
  v_run_stale uuid;
begin
  insert into public.agent_runs (id, agent_id, status, started_at, last_heartbeat_at)
  values ('aaaa9003-0000-0000-0000-000000000001', v_agent_id, 'in_progress'::work_status, now(), now())
  returning id into v_run_fresh;

  insert into public.agent_runs (id, agent_id, status, started_at, last_heartbeat_at)
  values ('aaaa9003-0000-0000-0000-000000000002', v_agent_id, 'in_progress'::work_status, now() - interval '20 minutes', now() - interval '15 minutes')
  returning id into v_run_stale;
end $$;

select set_config('plugin_test.fresh_shows_running',
  (select (live_run_status = 'RUNNING')::text from public.agent_runs_with_live_status where id = 'aaaa9003-0000-0000-0000-000000000001'), true);
select set_config('plugin_test.stale_shows_stale_not_running',
  (select (live_run_status = 'STALE')::text from public.agent_runs_with_live_status where id = 'aaaa9003-0000-0000-0000-000000000002'), true);

-- ================== VERDICT ==================
select json_build_object(
  'non_admin_insert_blocked', current_setting('rls_test.non_admin_insert_blocked')::boolean,
  'capabilities_persisted_with_real_agent_id', current_setting('plugin_test.capabilities_persisted')::boolean,
  'attachment_persisted_with_real_agent_id', current_setting('plugin_test.attachment_persisted')::boolean,
  'dag_columns_persisted', current_setting('plugin_test.dag_persisted')::boolean,
  'fresh_heartbeat_shows_running', current_setting('plugin_test.fresh_shows_running')::boolean,
  'stale_heartbeat_shows_stale_not_running', current_setting('plugin_test.stale_shows_stale_not_running')::boolean,
  'all_pass', (
    current_setting('rls_test.non_admin_insert_blocked')::boolean
    and current_setting('plugin_test.capabilities_persisted')::boolean
    and current_setting('plugin_test.attachment_persisted')::boolean
    and current_setting('plugin_test.dag_persisted')::boolean
    and current_setting('plugin_test.fresh_shows_running')::boolean
    and current_setting('plugin_test.stale_shows_stale_not_running')::boolean
  )
) as verdict;

rollback;
