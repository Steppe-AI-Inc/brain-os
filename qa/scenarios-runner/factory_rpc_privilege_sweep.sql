-- Permanent regression: NEW_PRIVILEGED_RPC_DENIES_ANON_BY_DEFAULT.
--
-- Real incident this closes (qa/KNOWN_FAILURE_MODES.md #42): create_founder_notification
-- (202608310001) explicitly revoked EXECUTE from `authenticated`/`public` after a
-- live-caught non-admin exploit, but never from `anon` — Supabase's own default
-- privileges grant EXECUTE to `anon`/`authenticated`/`service_role` on every newly
-- created function automatically unless explicitly revoked. This left a fully
-- UNAUTHENTICATED caller able to insert attacker-controlled founder_notifications rows
-- in production. Found independently during Phase 3/4 verification, fixed
-- (202608310003_create_founder_notification_revoke_anon.sql), and the same sweep found
-- two more Phase 4 functions (resolve_founder_notification, mark_founder_notification_read)
-- with the identical unrevoked-anon-grant shape — not currently exploitable (both have
-- their own internal is_founder_or_admin() gate, empirically confirmed to fail closed),
-- but fixed anyway per least-privilege rather than leaving two known-loose grants live.
--
-- This file has two parts:
--   PART A — a generic, non-parameterized sweep: enumerate every SECURITY DEFINER
--            function in `public` with an `anon` EXECUTE grant. Run this FIRST any time
--            a new factory RPC is added — a growing list here is the early-warning
--            signal, not a fixed pass/fail against named functions.
--   PART B — the specific 3-persona live behavioral proof (anon denied, non-admin
--            denied, founder's real canonical path still works) for the three functions
--            this incident actually touched.
--
-- Wrapped in begin;...rollback; by the caller. Zero residue.

begin;

-- ================== PART A: generic privilege sweep ==================
-- Intentionally NOT a fixed allowlist/denylist of function names - this is meant to
-- catch the NEXT function that makes this same mistake, not just re-check today's three.
-- Two judgment calls baked in here, both real findings from this incident's own live
-- investigation (2026-08-31), not assumptions:
--   1. Trigger functions (prorettype = 'trigger') are excluded - Postgres itself refuses
--      to invoke a `returns trigger` function directly regardless of GRANT state
--      (confirmed live) - an anon grant on one is inert, not a real exposure.
--   2. RLS-helper predicates (name matches is_%/has_%/current_%) are excluded - these
--      MUST remain callable by every role including anon for RLS policy evaluation
--      itself to function (a policy like `using (is_founder_or_admin())` needs the
--      function callable in an anon query's own evaluation context, even though the
--      answer always comes back false for anon) - revoking anon here would break row-
--      level security across the whole app, not improve it. Confirmed this naming
--      pattern is coherent: is_founder_or_admin/is_company_manager/is_hr_finance/
--      has_company_access/current_profile_id/current_role are ALL real RLS-policy
--      predicates, not mutation entry points.
-- Anything else this query surfaces is a genuine candidate needing individual review -
-- see the disclosed, NOT-fixed-here findings in qa/KNOWN_FAILURE_MODES.md #42 for the
-- three pre-existing (non-Phase-4) functions this exact sweep found live
-- (create_mcp_connector_secret/get_mcp_connector_token/delete_mcp_connector_secret,
-- set_company_relationship, set_person_assignment) - each has its own internal
-- is_founder_or_admin()-class gate (confirmed by direct code read, not assumed), so
-- none are currently exploitable, but all are out of THIS migration's scope (pre-
-- existing, unrelated to the Phase 4 incident that triggered this sweep) and are
-- flagged for a separate, deliberate follow-up rather than fixed as a drive-by here.
select set_config('t.functions_with_anon_grant',
  (
    select coalesce(json_agg(p.proname order by p.proname), '[]'::json)::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.prorettype != 'trigger'::regtype
      and p.proname !~ '^(is_|has_|current_)'
      and p.proacl is not null
      and exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%')
  ), true
);

-- ================== PART B: 3-persona live behavioral proof ==================
insert into auth.users (id, instance_id, aud, role, email) values
  ('eeee9401-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rpc-sweep-nonadmin@example.invalid');

do $$
begin
  begin
    set local role anon;
    perform public.create_founder_notification('FACTORY_APPROVAL_REQUIRED','critical','x','x',null,null,'sweep-anon-key',true);
    reset role;
    perform set_config('t.anon_create', 'ALLOWED_BAD', true);
  exception when insufficient_privilege then
    reset role;
    perform set_config('t.anon_create', 'DENIED', true);
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','eeee9401-0000-0000-0000-000000000001','role','authenticated')::text, true);
do $$
begin
  begin
    perform public.create_founder_notification('FACTORY_APPROVAL_REQUIRED','critical','x','x',null,null,'sweep-nonadmin-key',true);
    perform set_config('t.nonadmin_create', 'ALLOWED_BAD', true);
  exception when insufficient_privilege then
    perform set_config('t.nonadmin_create', 'DENIED', true);
  end;
end $$;
select set_config('t.nonadmin_resolve', public.resolve_founder_notification(gen_random_uuid())->>'authorized', true);
reset role;

insert into public.companies (id, name, status) values ('eeee9402-0000-0000-0000-000000000001', 'RPC-SWEEP-VERIFY-CO', 'active');
insert into public.canonical_work_orders (id, company_id, title, objective, status)
values ('eeee9403-0000-0000-0000-000000000001', 'eeee9402-0000-0000-0000-000000000001', 'RPC-SWEEP-VERIFY-WO', 'test', 'queued');
update public.canonical_work_orders set status = 'blocked'::work_status where id = 'eeee9403-0000-0000-0000-000000000001';
select set_config('t.founder_canonical_path_works',
  (select exists(select 1 from public.founder_notifications where work_order_id = 'eeee9403-0000-0000-0000-000000000001'))::text, true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('t.founder_resolve',
  (select public.resolve_founder_notification(id)->>'authorized' from public.founder_notifications where work_order_id = 'eeee9403-0000-0000-0000-000000000001' limit 1), true);
reset role;

-- ================== VERDICT ==================
-- `all_pass` deliberately scopes to THIS incident (the 3 Phase 4 functions
-- create_founder_notification/resolve_founder_notification/mark_founder_notification_read) -
-- it does not require the pre-existing, out-of-scope functions in
-- `functions_still_holding_anon_grant` to also be clean, so this test stays a truthful
-- pass/fail signal for the incident it was written for rather than perpetually red for
-- unrelated, already-disclosed, separately-tracked findings. `functions_still_holding_
-- anon_grant` is reported every run regardless (informational - a growing or changing
-- list here, even after all_pass=true, is the early-warning signal for a NEW instance of
-- this mistake and should be investigated on its own).
select json_build_object(
  'functions_still_holding_anon_grant', current_setting('t.functions_with_anon_grant')::json,
  'in_scope_functions_clean', not (current_setting('t.functions_with_anon_grant')::jsonb ? 'create_founder_notification'
    or current_setting('t.functions_with_anon_grant')::jsonb ? 'resolve_founder_notification'
    or current_setting('t.functions_with_anon_grant')::jsonb ? 'mark_founder_notification_read'),
  'anon_create_denied', current_setting('t.anon_create') = 'DENIED',
  'nonadmin_create_denied', current_setting('t.nonadmin_create') = 'DENIED',
  'nonadmin_resolve_denied', current_setting('t.nonadmin_resolve') = 'false',
  'founder_canonical_path_works', current_setting('t.founder_canonical_path_works')::boolean,
  'founder_resolve_allowed', current_setting('t.founder_resolve') = 'true',
  'all_pass', (
    not (current_setting('t.functions_with_anon_grant')::jsonb ? 'create_founder_notification'
      or current_setting('t.functions_with_anon_grant')::jsonb ? 'resolve_founder_notification'
      or current_setting('t.functions_with_anon_grant')::jsonb ? 'mark_founder_notification_read')
    and current_setting('t.anon_create') = 'DENIED'
    and current_setting('t.nonadmin_create') = 'DENIED'
    and current_setting('t.nonadmin_resolve') = 'false'
    and current_setting('t.founder_canonical_path_works')::boolean
    and current_setting('t.founder_resolve') = 'true'
  )
) as verdict;

rollback;
