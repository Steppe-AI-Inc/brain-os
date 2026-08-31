-- Live verification: Phase 4 typed notification event model — RPC personas, dedup/
-- idempotency, resolve-then-renotify, WO-completion-exactly-once, healthy-heartbeat-no-op.
-- Wrapped in begin;...rollback; by the caller. Zero residue. Looks up notifications by
-- (work_order_id, event_type) rather than guessing the exact generated dedupe_key string
-- (which embeds a live `extract(epoch from updated_at)` value) - a real fragility this
-- test's own first draft hit live.

begin;

-- ================== FIXTURES ==================
insert into public.companies (id, name, status) values ('dddd9301-0000-0000-0000-000000000001', 'NOTIF-TEST-CO', 'active');
insert into public.canonical_work_orders (id, company_id, title, objective, status)
values ('dddd9302-0000-0000-0000-000000000001', 'dddd9301-0000-0000-0000-000000000001', 'NOTIF-TEST-WO', 'lifecycle test', 'queued');

insert into auth.users (id, instance_id, aud, role, email) values
  ('dddd9303-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notif-test-nonadmin@example.invalid');
-- on_auth_user_created trigger auto-creates the matching public.profiles row.

-- ================== TEST 1: dedupe - two real transitions into 'blocked' with the SAME
-- updated_at (simulating rapid duplicate polling writes) create exactly one open
-- notification ==================
update public.canonical_work_orders set status = 'blocked'::work_status, updated_at = '2026-08-31 00:00:00+00'
where id = 'dddd9302-0000-0000-0000-000000000001';
update public.canonical_work_orders set status = 'queued'::work_status where id = 'dddd9302-0000-0000-0000-000000000001';
update public.canonical_work_orders set status = 'blocked'::work_status, updated_at = '2026-08-31 00:00:00+00'
where id = 'dddd9302-0000-0000-0000-000000000001';

select set_config('t.dedupe_count',
  (select count(*)::text from public.founder_notifications
   where work_order_id = 'dddd9302-0000-0000-0000-000000000001' and event_type = 'FACTORY_WORK_ORDER_BLOCKED'), true);

select set_config('t.first_notif_id',
  (select id::text from public.founder_notifications
   where work_order_id = 'dddd9302-0000-0000-0000-000000000001' and event_type = 'FACTORY_WORK_ORDER_BLOCKED'
   order by created_at limit 1), true);

-- ================== TEST 2: resolve, then a genuinely NEW blocked episode (different
-- updated_at) is free to notify again - not permanently suppressed ==================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('t.founder_resolve_result', public.resolve_founder_notification(current_setting('t.first_notif_id')::uuid)::text, true);
reset role;

update public.canonical_work_orders set status = 'queued'::work_status where id = 'dddd9302-0000-0000-0000-000000000001';
update public.canonical_work_orders set status = 'blocked'::work_status, updated_at = '2026-08-31 01:00:00+00'
where id = 'dddd9302-0000-0000-0000-000000000001';

select set_config('t.open_blocked_count_after_second_episode',
  (select count(*)::text from public.founder_notifications
   where work_order_id = 'dddd9302-0000-0000-0000-000000000001' and event_type = 'FACTORY_WORK_ORDER_BLOCKED' and status != 'resolved'), true);

-- ================== TEST 3: Work Order completion creates AT MOST ONE completion
-- notification even after a real no-op rewrite. A real, pre-existing trigger
-- (enforce_work_order_completion_via_rpc) blocks any direct status='done' write - a
-- real thing this test's own first draft hit live - so this goes through the actual
-- complete_work_order() RPC, with the minimal real task+agent_run it requires. ==================
insert into public.tasks (id, company_id, canonical_work_order_id, title, status)
values ('dddd9305-0000-0000-0000-000000000001', 'dddd9301-0000-0000-0000-000000000001', 'dddd9302-0000-0000-0000-000000000001', 'NOTIF-TEST-TASK', 'done');
insert into public.agent_runs (id, company_id, canonical_work_order_id, task_id, status)
values ('dddd9306-0000-0000-0000-000000000001', 'dddd9301-0000-0000-0000-000000000001', 'dddd9302-0000-0000-0000-000000000001', 'dddd9305-0000-0000-0000-000000000001', 'done'::work_status);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('t.complete_wo_result', public.complete_work_order('dddd9302-0000-0000-0000-000000000001'::uuid)::text, true);
-- Real no-op re-call (already done) - complete_work_order's own idempotency guard, not
-- the trigger, is what's being exercised here.
select set_config('t.complete_wo_result_repeat', public.complete_work_order('dddd9302-0000-0000-0000-000000000001'::uuid)::text, true);
reset role;

select set_config('t.completion_count',
  (select count(*)::text from public.founder_notifications
   where work_order_id = 'dddd9302-0000-0000-0000-000000000001' and event_type = 'FACTORY_WORK_ORDER_COMPLETED'), true);

-- ================== TEST 4: RPC personas - non-admin cannot resolve/mark-read
-- (a real founder/admin gate inside the function body, not merely RLS) ==================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','dddd9303-0000-0000-0000-000000000001','role','authenticated')::text, true);
select set_config('t.non_admin_resolve_result', public.resolve_founder_notification(current_setting('t.first_notif_id')::uuid)::text, true);
select set_config('t.non_admin_mark_read_result', public.mark_founder_notification_read(current_setting('t.first_notif_id')::uuid)::text, true);
reset role;

-- ================== TEST 5: healthy heartbeat (fresh, in_progress) never appears as
-- STALE ==================
insert into public.agent_runs (id, company_id, canonical_work_order_id, status, started_at, last_heartbeat_at)
values ('dddd9304-0000-0000-0000-000000000001', 'dddd9301-0000-0000-0000-000000000001', 'dddd9302-0000-0000-0000-000000000001', 'in_progress'::work_status, now(), now());

select set_config('t.healthy_run_not_stale',
  (select (live_run_status != 'STALE')::text from public.agent_runs_with_live_status where id = 'dddd9304-0000-0000-0000-000000000001'), true);

-- ================== VERDICT ==================
select json_build_object(
  'dedupe_prevents_same_instant_duplicate', (current_setting('t.dedupe_count') = '1'),
  'founder_resolve_succeeded', (current_setting('t.founder_resolve_result')::jsonb ->> 'changed' = 'true'),
  'genuinely_new_episode_notifies_again', (current_setting('t.open_blocked_count_after_second_episode') = '1'),
  'completion_notification_created_at_most_once', (current_setting('t.completion_count') = '1'),
  'non_admin_resolve_blocked', (current_setting('t.non_admin_resolve_result')::jsonb ->> 'authorized' = 'false'),
  'non_admin_mark_read_blocked', (current_setting('t.non_admin_mark_read_result')::jsonb ->> 'authorized' = 'false'),
  'healthy_heartbeat_not_stale', current_setting('t.healthy_run_not_stale')::boolean,
  'all_pass', (
    (current_setting('t.dedupe_count') = '1')
    and (current_setting('t.founder_resolve_result')::jsonb ->> 'changed' = 'true')
    and (current_setting('t.open_blocked_count_after_second_episode') = '1')
    and (current_setting('t.completion_count') = '1')
    and (current_setting('t.non_admin_resolve_result')::jsonb ->> 'authorized' = 'false')
    and (current_setting('t.non_admin_mark_read_result')::jsonb ->> 'authorized' = 'false')
    and current_setting('t.healthy_run_not_stale')::boolean
  )
) as verdict;

rollback;
