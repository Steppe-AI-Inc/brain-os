-- Phase 6 permanent regression: plugin/skill registry rows (plugin_sources/
-- plugin_components/plugin_component_versions/agent_plugin_attachments) are founder/
-- admin-only - an ordinary company member can never mutate them, directly disproving
-- "a plugin can alter its own permission_profile / install_status / attachment state".
--
-- Real-impersonation method (qa/scenarios-runner/README.md convention): superuser
-- connection, `set local role authenticated` + `set_config('request.jwt.claims', ...)`
-- downgrades to exactly what a real logged-in persona would experience. Single
-- transaction, both personas tested via RESET ROLE between them, self-cleaning - the
-- whole thing rolls back, nothing is ever left in production.
--
-- Companion checks proven live this session, not re-encoded here (Postgres raises a hard
-- 42501 error on the RLS-rejected INSERT, which doesn't fit this file's single-SELECT-
-- verdict convention without a DO-block exception handler out of scope for this pass):
--   - an ordinary employee's INSERT into plugin_component_versions raises
--     "new row violates row-level security policy for table plugin_component_versions"
--   - plugin-attach.mjs's discoverComponent()/applyUpdate()/rollbackComponent() refuse any
--     definitionPath outside REPO_ROOT or the local Claude Code plugin cache
--     (assertPathWithinAllowedRoots) - live-proven by attempting to register a component
--     pointing at C:\Windows\System32\drivers\etc\hosts, refused before any hash/registry
--     write occurred.

begin;

create temp table t_result (who text, rows_mutated int) on commit drop;
grant insert, select on t_result to authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text,
  true
)
from public.profiles p
where p.role = 'employee' and p.auth_user_id is not null
limit 1;

set local role authenticated;

with employee_attempt as (
  update public.plugin_components set install_status = 'disabled'
  where id = (select id from public.plugin_components order by created_at limit 1)
  returning id
)
insert into t_result select 'employee', count(*) from employee_attempt;

reset role;
select set_config('request.jwt.claims', '', true);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', p.auth_user_id::text, 'role', 'authenticated')::text,
  true
)
from public.profiles p
where p.role = 'founder' and p.auth_user_id is not null
limit 1;

set local role authenticated;

with founder_attempt as (
  update public.plugin_components set install_status = install_status
  where id = (select id from public.plugin_components order by created_at limit 1)
  returning id
)
insert into t_result select 'founder', count(*) from founder_attempt;

reset role;

select
  jsonb_build_object(
    'employee_rows_mutated', (select rows_mutated from t_result where who = 'employee'),
    'founder_rows_mutated', (select rows_mutated from t_result where who = 'founder'),
    'pass_employee_blocked', (select rows_mutated from t_result where who = 'employee') = 0,
    'pass_founder_allowed', (select rows_mutated from t_result where who = 'founder') = 1,
    'all_pass', ((select rows_mutated from t_result where who = 'employee') = 0
                 and (select rows_mutated from t_result where who = 'founder') = 1)
  ) as verdict;

rollback;
