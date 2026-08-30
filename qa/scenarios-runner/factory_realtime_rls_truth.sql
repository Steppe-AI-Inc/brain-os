-- Live verification: "Realtime subscription truth must match ordinary RLS truth" —
-- Supabase Realtime's Postgres Changes feature authorizes each subscribed row against
-- the EXACT SAME RLS policies as an ordinary SELECT, using the connecting client's own
-- JWT claims (confirmed: agent_runs_select_scope/canonical_work_orders_select_scope/
-- tasks_select_scope/founder_notifications_founder_only, read directly from
-- pg_policies). Proving these policies correctly restrict cross-company access at the
-- SQL level is therefore a direct, valid proof that a Realtime subscription cannot leak
-- what an ordinary query already couldn't return — not a separate/weaker mechanism.
--
-- Wrapped in begin;...rollback; by the caller. Zero residue.

begin;

-- ================== FIXTURES: two real, distinct companies with their own managers ==================
insert into public.companies (id, name, status) values
  ('bbbb9101-0000-0000-0000-000000000001', 'RT-TEST-CO-A', 'active'),
  ('bbbb9101-0000-0000-0000-000000000002', 'RT-TEST-CO-B', 'active');

-- Synthetic, self-contained non-founder/non-admin profile (this transaction rolls back,
-- zero residue) - a real row in public.profiles is required for the company_memberships
-- FK, so it's created here rather than reusing an id from another file's own throwaway
-- fixture (confirmed live: that id was never a persistent profile row).
-- is_company_manager()/current_profile_id() resolve via profiles.auth_user_id = auth.uid()
-- (auth.uid() reads the JWT's own `sub` claim) - NOT profiles.id directly. A synthetic
-- test profile must set auth_user_id to the same id used as the JWT sub below, or every
-- company-membership check silently resolves to "no matching profile" (a real thing this
-- test itself caught live on its first run - see KNOWN_FAILURE_MODES.md for the record).
-- profiles.auth_user_id also has a real FK to auth.users(id) - a minimal synthetic row
-- there is required too, all inside this same rolled-back transaction, zero residue.
-- Real gap this test caught live: on_auth_user_created (a real trigger on auth.users)
-- auto-inserts the matching public.profiles row - an explicit INSERT right after
-- collides with it (duplicate auth_user_id). UPDATE the auto-created row instead.
insert into auth.users (id, instance_id, aud, role, email) values
  ('bbbb9106-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rt-test-manager@example.invalid');
update public.profiles set full_name = 'RT-TEST Company Manager', role = 'company_manager'
where auth_user_id = 'bbbb9106-0000-0000-0000-000000000001';
-- profiles.id is trigger-generated (gen_random_uuid), NOT equal to auth_user_id - look it
-- up rather than assuming, the second real gap this test caught live.
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
select 'bbbb9101-0000-0000-0000-000000000001', p.id, 'manager', true
from public.profiles p where p.auth_user_id = 'bbbb9106-0000-0000-0000-000000000001';

insert into public.canonical_work_orders (id, company_id, title, objective, status)
values
  ('bbbb9102-0000-0000-0000-000000000001', 'bbbb9101-0000-0000-0000-000000000001', 'RT-TEST-WO-A (company A only)', 'RLS/Realtime truth test', 'in_progress'),
  ('bbbb9102-0000-0000-0000-000000000002', 'bbbb9101-0000-0000-0000-000000000002', 'RT-TEST-WO-B (company B only)', 'RLS/Realtime truth test', 'in_progress');

insert into public.tasks (id, company_id, canonical_work_order_id, title, status)
values
  ('bbbb9103-0000-0000-0000-000000000001', 'bbbb9101-0000-0000-0000-000000000001', 'bbbb9102-0000-0000-0000-000000000001', 'RT-TEST-TASK-A', 'queued'),
  ('bbbb9103-0000-0000-0000-000000000002', 'bbbb9101-0000-0000-0000-000000000002', 'bbbb9102-0000-0000-0000-000000000002', 'RT-TEST-TASK-B', 'queued');

insert into public.agent_runs (id, company_id, canonical_work_order_id, task_id, status)
values
  ('bbbb9104-0000-0000-0000-000000000001', 'bbbb9101-0000-0000-0000-000000000001', 'bbbb9102-0000-0000-0000-000000000001', 'bbbb9103-0000-0000-0000-000000000001', 'in_progress'::work_status),
  ('bbbb9104-0000-0000-0000-000000000002', 'bbbb9101-0000-0000-0000-000000000002', 'bbbb9102-0000-0000-0000-000000000002', 'bbbb9103-0000-0000-0000-000000000002', 'in_progress'::work_status);

insert into public.founder_notifications (id, event_type, severity, title, work_order_id)
values ('bbbb9105-0000-0000-0000-000000000001', 'work_order_blocked', 'warning', 'RT-TEST-NOTIFICATION (founder-only)', 'bbbb9102-0000-0000-0000-000000000001');

-- ================== TEST: Company A's manager, impersonated exactly as Realtime would
-- authorize their JWT ==================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','bbbb9106-0000-0000-0000-000000000001','role','authenticated')::text, true);

select set_config('rt.sees_own_company_work_order',
  (select exists(select 1 from public.canonical_work_orders where id = 'bbbb9102-0000-0000-0000-000000000001'))::text, true);
select set_config('rt.sees_own_company_task',
  (select exists(select 1 from public.tasks where id = 'bbbb9103-0000-0000-0000-000000000001'))::text, true);
select set_config('rt.sees_own_company_agent_run',
  (select exists(select 1 from public.agent_runs where id = 'bbbb9104-0000-0000-0000-000000000001'))::text, true);

-- The load-bearing assertions: Company A's manager must NOT see ANY of Company B's rows.
select set_config('rt.cannot_see_other_company_work_order',
  (select not exists(select 1 from public.canonical_work_orders where id = 'bbbb9102-0000-0000-0000-000000000002'))::text, true);
select set_config('rt.cannot_see_other_company_task',
  (select not exists(select 1 from public.tasks where id = 'bbbb9103-0000-0000-0000-000000000002'))::text, true);
select set_config('rt.cannot_see_other_company_agent_run',
  (select not exists(select 1 from public.agent_runs where id = 'bbbb9104-0000-0000-0000-000000000002'))::text, true);

-- founder_notifications is founder-only for every command, regardless of company -
-- a company manager must see NONE of it, not even their own company's blocker.
select set_config('rt.non_founder_sees_zero_notifications',
  (select not exists(select 1 from public.founder_notifications where id = 'bbbb9105-0000-0000-0000-000000000001'))::text, true);

reset role;

-- ================== TEST: founder/admin DOES see everything (the positive case,
-- proving this isn't just "nobody sees anything") ==================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

select set_config('rt.founder_sees_company_a', (select exists(select 1 from public.canonical_work_orders where id = 'bbbb9102-0000-0000-0000-000000000001'))::text, true);
select set_config('rt.founder_sees_company_b', (select exists(select 1 from public.canonical_work_orders where id = 'bbbb9102-0000-0000-0000-000000000002'))::text, true);
select set_config('rt.founder_sees_notification', (select exists(select 1 from public.founder_notifications where id = 'bbbb9105-0000-0000-0000-000000000001'))::text, true);

reset role;

-- ================== VERDICT ==================
select json_build_object(
  'sees_own_company_work_order', current_setting('rt.sees_own_company_work_order')::boolean,
  'sees_own_company_task', current_setting('rt.sees_own_company_task')::boolean,
  'sees_own_company_agent_run', current_setting('rt.sees_own_company_agent_run')::boolean,
  'cannot_see_other_company_work_order', current_setting('rt.cannot_see_other_company_work_order')::boolean,
  'cannot_see_other_company_task', current_setting('rt.cannot_see_other_company_task')::boolean,
  'cannot_see_other_company_agent_run', current_setting('rt.cannot_see_other_company_agent_run')::boolean,
  'non_founder_sees_zero_notifications', current_setting('rt.non_founder_sees_zero_notifications')::boolean,
  'founder_sees_company_a', current_setting('rt.founder_sees_company_a')::boolean,
  'founder_sees_company_b', current_setting('rt.founder_sees_company_b')::boolean,
  'founder_sees_notification', current_setting('rt.founder_sees_notification')::boolean,
  'all_pass', (
    current_setting('rt.sees_own_company_work_order')::boolean
    and current_setting('rt.sees_own_company_task')::boolean
    and current_setting('rt.sees_own_company_agent_run')::boolean
    and current_setting('rt.cannot_see_other_company_work_order')::boolean
    and current_setting('rt.cannot_see_other_company_task')::boolean
    and current_setting('rt.cannot_see_other_company_agent_run')::boolean
    and current_setting('rt.non_founder_sees_zero_notifications')::boolean
    and current_setting('rt.founder_sees_company_a')::boolean
    and current_setting('rt.founder_sees_company_b')::boolean
    and current_setting('rt.founder_sees_notification')::boolean
  )
) as verdict;

rollback;
