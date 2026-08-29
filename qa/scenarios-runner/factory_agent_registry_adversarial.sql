-- Factory Agent Registry adversarial regression — Phase 6 of the Software Factory
-- master plan. Assumes the migration's own DDL (public.agents new columns,
-- agents_with_live_status view) has ALREADY been applied earlier in the SAME
-- transaction (see the runner wrapper), same convention as
-- canonical_work_order_model_adversarial.sql. Caller wraps this in BEGIN;...ROLLBACK;.
--
-- Named checks map to the Phase 6 spec's required permanent regressions. Two of the
-- nine named checks (FACTORY_AGENT_SYNC_IDEMPOTENT proven by actually running
-- sync-agents.mjs twice; FACTORY_AGENT_REGISTRY_DRIVES_EXECUTION proven by actually
-- dispatching via startRunByAgentId) are process-level guarantees that can't be proven
-- by SQL alone — their evidence lives in docs/software-factory/PHASE_6_FINDINGS.md
-- instead, from a real live run, not simulated here.

-- Real profile reused (read-only reuse, never mutated outside this rolled-back
-- transaction) — same identity used in canonical_work_order_model_adversarial.sql.
select set_config('faa.emp1_pid', '66ef2052-d002-4592-b841-82cd2171b51a', true);

-- FACTORY_AGENT_SYNC_NO_DUPLICATE_SLUG: the unique constraint on name is real and
-- enforced, not just a naming convention.
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.agents (name, role) values ('brain-os-implementation-engineer', 'duplicate-attempt');
  exception when unique_violation then
    v_blocked := true;
  end;
  perform set_config('faa.t1_no_duplicate_slug', v_blocked::text, true);
end $$;

-- FACTORY_AGENT_DEFINITION_HASH_DETECTS_CHANGE: an UPSERT with a different hash value
-- actually changes the stored hash (proves the DB layer supports drift detection - the
-- real hash computation itself happens in sync-agents.mjs / JS crypto, proven live).
do $$
declare
  v_before text;
  v_after text;
begin
  select definition_hash into v_before from public.agents where name = 'brain-os-implementation-engineer';
  insert into public.agents (name, role, definition_hash)
  values ('brain-os-implementation-engineer', 'implementation_engineer', 'deadbeef-simulated-changed-hash')
  on conflict (name) do update set definition_hash = excluded.definition_hash;
  select definition_hash into v_after from public.agents where name = 'brain-os-implementation-engineer';
  perform set_config('faa.t2_hash_before', coalesce(v_before, '(null)'), true);
  perform set_config('faa.t2_hash_after', v_after, true);
  perform set_config('faa.t2_hash_changed', (v_after = 'deadbeef-simulated-changed-hash' and v_after is distinct from v_before)::text, true);
end $$;

-- FACTORY_UNKNOWN_AGENT_CANNOT_EXECUTE (DB-level guarantee): agent_runs.agent_id has a
-- real FK to public.agents(id) - an unknown/nonexistent agent id cannot be referenced.
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.agent_runs (agent_id, agent_definition_path, execution_provider, status)
    values ('00000000-0000-0000-0000-000000000000'::uuid, 'FAKE nonexistent agent', 'claude_code_background', 'queued');
  exception when foreign_key_violation then
    v_blocked := true;
  end;
  perform set_config('faa.t3_unknown_agent_fk_blocked', v_blocked::text, true);
end $$;

-- FACTORY_AGENT_CANNOT_SELF_ESCALATE_AUTHORITY: reuses agents_write_admin (unchanged by
-- this migration, already proven founder/admin-only) - an ordinary authenticated
-- employee cannot flip has_production_authority/execution_provider on any row, not even
-- their "own" agent by any stretch, since agents have no creator/owner concept at all.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  update public.agents set execution_provider = 'claude_code_background', has_production_authority = true
  where name = 'brain-os-product-architect';
exception when others then null;
end $$;
reset role;
do $$
declare
  v_still_null boolean;
begin
  select execution_provider is null into v_still_null from public.agents where name = 'brain-os-product-architect';
  perform set_config('faa.t4_self_escalation_blocked', coalesce(v_still_null, true)::text, true);
end $$;

-- FACTORY_STATUS_CANNOT_BE_SPOOFED_VIA_FAKE_AGENT_RUN: real defect found by an
-- independent review of this migration's first version - agent_runs_insert_scope's
-- `company_id is null` branch let any authenticated user fabricate an unattributed
-- agent_runs row against ANY real agent, which agents_with_live_status would then
-- surface as a genuine-looking status. Fixed in
-- 202608290004_agent_runs_insert_scope_tighten.sql (insert now founder/admin only -
-- the only real insert path is the trusted service-role Runner, which bypasses RLS
-- entirely and is unaffected).
do $$
declare
  v_agent_id uuid;
begin
  select id into v_agent_id from public.agents where name = 'brain-os-db-security-engineer';
  perform set_config('faa.spoof_target_agent_id', v_agent_id::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

do $$
begin
  insert into public.agent_runs (agent_id, company_id, agent_definition_path, execution_provider, status, verification_status, summary)
  values (current_setting('faa.spoof_target_agent_id')::uuid, null, 'FAKE', 'claude_code_background', 'in_progress'::work_status, 'e2e_verified', 'FAKE-SPOOFED-STATUS-MARKER');
exception when others then null;
end $$;

reset role;

do $$
declare
  v_spoofed_count int;
begin
  select count(*) into v_spoofed_count from public.agent_runs where summary = 'FAKE-SPOOFED-STATUS-MARKER';
  perform set_config('faa.t9_status_spoof_blocked', (v_spoofed_count = 0)::text, true);
end $$;

-- FACTORY_AGENT_RUN_REFERENCES_CANONICAL_AGENT + FACTORY_STATUS_DERIVED_FROM_REAL_RUN:
-- real agent_runs rows in each state, confirm agents_with_live_status computes correctly
-- from actual run rows, not a stored/fakeable status.
do $$
declare
  v_agent_id uuid;
begin
  select id into v_agent_id from public.agents where name = 'brain-os-db-security-engineer';
  if v_agent_id is null then
    insert into public.agents (name, role, execution_provider, has_production_authority)
    values ('brain-os-db-security-engineer', 'security', 'claude_code_background', true)
    returning id into v_agent_id;
  else
    update public.agents set execution_provider = 'claude_code_background', has_production_authority = true where id = v_agent_id;
  end if;
  perform set_config('faa.dbse_agent_id', v_agent_id::text, true);
end $$;

-- No run yet -> IDLE (agent real, dispatchable, nothing active, nothing failed).
select set_config('faa.t5_status_no_runs', live_status, true) from public.agents_with_live_status where id = current_setting('faa.dbse_agent_id')::uuid;

do $$
declare
  v_agent_id uuid := current_setting('faa.dbse_agent_id')::uuid;
begin
  insert into public.agent_runs (agent_id, agent_definition_path, execution_provider, status)
  values (v_agent_id, '.claude/agents/brain-os-db-security-engineer.md', 'claude_code_background', 'in_progress'::work_status);
end $$;

do $$
declare
  v_status text;
  v_agent_id uuid := current_setting('faa.dbse_agent_id')::uuid;
begin
  select live_status into v_status from public.agents_with_live_status where id = v_agent_id;
  perform set_config('faa.t6_status_running', v_status, true);
end $$;

do $$
declare
  v_agent_id uuid := current_setting('faa.dbse_agent_id')::uuid;
begin
  update public.agent_runs set status = 'rejected'::work_status where agent_id = v_agent_id;
end $$;

do $$
declare
  v_status text;
  v_run_agent_id uuid;
  v_agent_id uuid := current_setting('faa.dbse_agent_id')::uuid;
begin
  select live_status, id into v_status, v_run_agent_id from public.agents_with_live_status where id = v_agent_id;
  perform set_config('faa.t7_status_failed', v_status, true);
  -- FACTORY_AGENT_RUN_REFERENCES_CANONICAL_AGENT: the run's agent_id really is this
  -- canonical agent, joined via the real FK, not a coincidental name match.
  perform set_config('faa.t8_run_references_canonical_agent',
    (exists(select 1 from public.agent_runs ar where ar.agent_id = v_agent_id))::text, true);
end $$;

select json_build_object(
  'FACTORY_AGENT_SYNC_NO_DUPLICATE_SLUG', current_setting('faa.t1_no_duplicate_slug', true),
  'FACTORY_AGENT_DEFINITION_HASH_DETECTS_CHANGE', current_setting('faa.t2_hash_changed', true),
  'hash_before', current_setting('faa.t2_hash_before', true),
  'hash_after', current_setting('faa.t2_hash_after', true),
  'FACTORY_UNKNOWN_AGENT_CANNOT_EXECUTE', current_setting('faa.t3_unknown_agent_fk_blocked', true),
  'FACTORY_AGENT_CANNOT_SELF_ESCALATE_AUTHORITY', current_setting('faa.t4_self_escalation_blocked', true),
  'status_no_runs_expect_IDLE', current_setting('faa.t5_status_no_runs', true),
  'status_running_expect_RUNNING', current_setting('faa.t6_status_running', true),
  'status_failed_expect_FAILED', current_setting('faa.t7_status_failed', true),
  'FACTORY_STATUS_DERIVED_FROM_REAL_RUN',
    (current_setting('faa.t5_status_no_runs', true) = 'IDLE'
     and current_setting('faa.t6_status_running', true) = 'RUNNING'
     and current_setting('faa.t7_status_failed', true) = 'FAILED'),
  'FACTORY_AGENT_RUN_REFERENCES_CANONICAL_AGENT', current_setting('faa.t8_run_references_canonical_agent', true),
  'FACTORY_STATUS_CANNOT_BE_SPOOFED_VIA_FAKE_AGENT_RUN', current_setting('faa.t9_status_spoof_blocked', true),
  'all_pass', (
    current_setting('faa.t1_no_duplicate_slug', true) = 'true'
    and current_setting('faa.t2_hash_changed', true) = 'true'
    and current_setting('faa.t3_unknown_agent_fk_blocked', true) = 'true'
    and current_setting('faa.t4_self_escalation_blocked', true) = 'true'
    and current_setting('faa.t5_status_no_runs', true) = 'IDLE'
    and current_setting('faa.t6_status_running', true) = 'RUNNING'
    and current_setting('faa.t7_status_failed', true) = 'FAILED'
    and current_setting('faa.t8_run_references_canonical_agent', true) = 'true'
    and current_setting('faa.t9_status_spoof_blocked', true) = 'true'
  )
) as verdict;
