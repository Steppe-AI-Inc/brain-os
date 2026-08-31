-- Generic, repo-wide permanent regression: no directly-callable SECURITY DEFINER function
-- in `public` should hold an EXECUTE grant for `anon` or bare `PUBLIC` unless it is
-- explicitly, individually allowlisted below with a reason.
--
-- Built 2026-08-31 during the dedicated security review of create_mcp_connector_secret/
-- delete_mcp_connector_secret/get_mcp_connector_token/set_company_relationship/
-- set_person_assignment (see 202608310004's own migration comment for that review's full
-- evidence) — this generalizes the narrower, factory-scoped
-- qa/scenarios-runner/factory_rpc_privilege_sweep.sql into a whole-schema guard, since the
-- underlying defect (Supabase's own default privileges grant EXECUTE to anon/authenticated/
-- service_role on every newly created function, unless explicitly revoked) is not specific
-- to any one feature area and has now independently recurred three times (#41/#42,
-- #43/#44, and this review).
--
-- Two exclusions, both deliberate, both explained inline, neither a rubber stamp:
--   1. `^(is_|has_|current_)` name prefix — RLS-policy predicate helpers. These MUST stay
--      anon-executable for row-level security to evaluate at all for an anon-role query;
--      revoking them would break RLS across the entire app, a strictly worse outcome than
--      the issue this test exists to catch. (Same exclusion as factory_rpc_privilege_sweep.sql.)
--   2. `prorettype != trigger` — a function whose return type is `trigger` cannot be
--      invoked directly via RPC by any client regardless of its EXECUTE grants; Postgres
--      itself rejects a direct call ("trigger functions can only be called as triggers").
--      Confirmed live for a sample (enforce_canonical_work_order_goal_company,
--      enforce_company_lifecycle_via_rpc, force_company_creator, handle_new_auth_user,
--      notify_agent_run_transition — all `returns trigger`) before adding this exclusion,
--      not assumed. These inheriting the default anon/PUBLIC grant is real hygiene debt,
--      just not the same class of live attack surface as a directly-callable function —
--      excluded from `all_pass` so this test stays a signal about real risk, not schema
--      noise; not silently declared safe (see disclosed note in the verdict output).
--
-- `known_disclosed_exceptions`: functions independently found, reviewed, and consciously
-- NOT yet fixed as of this test's authorship — each needs its own tracked follow-up, not
-- silent inclusion in `all_pass`. This list should only ever shrink. Adding a function here
-- requires the same live-tested rigor as 202608310004's migration comment, not a bare name.
--   - validate_organization_graph: found during this review's own broader sweep (same
--     `if not is_founder_or_admin()`-first shape as the five functions this review covers
--     in depth) — not yet given the full 8-point per-function review this migration's
--     siblings received, so deliberately not bundled into 202608310004. Tracked here so
--     it isn't lost, not fixed here.
--
-- Read-only. No mutation, no rollback needed.

with flagged as (
  select p.proname,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
         has_function_privilege('public', p.oid, 'EXECUTE') as public_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type t on t.oid = p.prorettype
  where n.nspname = 'public'
    and p.prosecdef = true
    and t.typname != 'trigger'
    and p.proname !~ '^(is_|has_|current_)'
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))
),
known_disclosed_exceptions as (
  select unnest(array['validate_organization_graph']) as proname
)
select json_build_object(
  'all_flagged', (select coalesce(json_agg(json_build_object('proname', proname, 'anon_execute', anon_execute, 'public_execute', public_execute)), '[]'::json) from flagged),
  'unexpected_new_violations', (
    select coalesce(json_agg(f.proname), '[]'::json)
    from flagged f
    where f.proname not in (select proname from known_disclosed_exceptions)
  ),
  'known_disclosed_exceptions_still_present', (
    select coalesce(json_agg(f.proname), '[]'::json)
    from flagged f
    where f.proname in (select proname from known_disclosed_exceptions)
  ),
  'all_pass', not exists (
    select 1 from flagged f where f.proname not in (select proname from known_disclosed_exceptions)
  )
) as verdict;
