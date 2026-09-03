-- POST-APPLY acceptance for 202609020002_set_person_assignment_clear_manager.sql.
-- Run ONLY after that migration is applied. Before then it fails on the missing 12-arg
-- signature, which is the correct signal that it ran too early — not a defect.
--
-- Self-cleaning: every write is inside begin;…rollback;. Nothing is left in production.
-- Personas are impersonated the same way sc081 does it (set local role +
-- request.jwt.claims), because RLS/authority is the point of most of these checks.

begin;

create temp table t_verdicts (verdict jsonb);
grant select, insert on t_verdicts to authenticated, anon;

-- ---- 1. SIGNATURE: exactly one set_person_assignment, and it is the 12-arg form. -----
-- The migration DROPs the 11-arg version rather than overloading; two live overloads
-- would make every existing fewer-args call ambiguous ("function is not unique").
insert into t_verdicts values (jsonb_build_object(
  'check', 'signature',
  'exactly_one_overload', (
    select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_person_assignment'),
  -- R-ART5: this asserted `like '%boolean, boolean%'`. The correct 12-arg identity list
  -- ends `..., p_is_primary boolean, p_state text, p_clear_manager boolean` - the tail is
  -- 'boolean, text, boolean', so that substring never occurs. The assertion was FALSE for
  -- a correctly-applied migration and TRUE for nothing this migration could produce, which
  -- is independent proof this file had never been executed: one run would have shown it.
  -- Assert on the PARAMETER NAME, which is what we actually mean.
  'has_p_clear_manager', (
    select pg_get_function_arguments(p.oid) like '%p_clear_manager boolean%'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_person_assignment' limit 1),
  -- R-ART6: THE GUARD THIS SCRIPT COULD NOT SEE. This file checked `search_path` hardening
  -- and the new parameter, and passed - while the migration had silently DELETED the
  -- cross-company department guard that 202608290008 added, because the migration was
  -- based on the 202608280013 body and 202608290008 is the live one (R-B1). The script
  -- inherited the author's exact blind spot: both of them verified an ATTRIBUTE of the
  -- function (proconfig) and inferred the BODY from it, and both candidate ancestors set
  -- search_path, so the attribute could not distinguish them.
  --
  -- Verified here against the live function BODY, which is the only thing that could have
  -- caught it. The source-level equivalent, which runs with no database at all, is
  -- qa/scenarios-runner/function_redefinition_preserves_ancestor_guards.mjs.
  'cross_company_department_guard_present', (
    select pg_get_functiondef(p.oid) like '%cross-company department reference rejected%'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_person_assignment' limit 1),
  -- The 202608280013 hardening MUST survive the redefinition (a first draft of the
  -- migration was based on the older 0011 body and would have reverted this).
  'search_path_hardened', (
    select array_to_string(p.proconfig, ',') = 'search_path=""'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_person_assignment' limit 1),
  'security_definer', (
    select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_person_assignment' limit 1)
));

-- ---- 2. GRANTS: authenticated only; anon/public denied. ------------------------------
insert into t_verdicts values (jsonb_build_object(
  'check', 'grants',
  'authenticated_can_execute', has_function_privilege('authenticated',
    (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='set_person_assignment' limit 1), 'EXECUTE'),
  'anon_cannot_execute', not has_function_privilege('anon',
    (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='set_person_assignment' limit 1), 'EXECUTE'),
  'public_cannot_execute', not has_function_privilege('public',
    (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='set_person_assignment' limit 1), 'EXECUTE')
));

-- ---- 3. SEMANTICS, as founder/admin against a self-cleaning fixture. -----------------
-- A fixture company + two people, so the clear/keep/contradiction paths are exercised
-- against real rows rather than asserted from the function body.
insert into public.companies (id, name, status)
values ('ffff0001-0000-0000-0000-000000000001', 'PA-0002 QA Co', 'active');
insert into public.people (id, company_id, full_name, active)
values ('ffff0002-0000-0000-0000-000000000001', 'ffff0001-0000-0000-0000-000000000001', 'PA-0002 Report', true),
       ('ffff0003-0000-0000-0000-000000000001', 'ffff0001-0000-0000-0000-000000000001', 'PA-0002 Manager', true);

-- R-ART1: section 3 called set_person_assignment() from a bare superuser session that
-- never set request.jwt.claims. is_founder_or_admin() then evaluates against a NULL
-- auth.uid() and returns FALSE - a fact this same batch documents in 202609030001's own D4
-- comment - so the RPC raised on the very first call and EVERY assertion below it
-- (set_manager, null_does_not_clear, explicit_clear, contradiction_refused) never ran. The
-- file proved nothing about clear-manager behaviour. Every sibling script sets this; this
-- one simply omitted it.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub',(select p.auth_user_id::text from public.profiles p where p.role='founder' limit 1),
                    'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_assignment uuid; v_manager uuid; v_err text;
begin
  -- Set a manager.
  v_assignment := public.set_person_assignment(
    'ffff0002-0000-0000-0000-000000000001'::uuid,
    'ffff0001-0000-0000-0000-000000000001'::uuid,
    null, null, null,
    'ffff0003-0000-0000-0000-000000000001'::uuid);
  select manager_person_id into v_manager from public.person_assignments where id = v_assignment;
  insert into t_verdicts values (jsonb_build_object('check','set_manager',
    'manager_set', v_manager = 'ffff0003-0000-0000-0000-000000000001'::uuid));

  -- NULL manager + clear=false KEEPS the existing manager (today's coalesce semantics,
  -- which every existing caller depends on).
  perform public.set_person_assignment(
    'ffff0002-0000-0000-0000-000000000001'::uuid,
    'ffff0001-0000-0000-0000-000000000001'::uuid,
    null, null, 'Updated title', null);
  select manager_person_id into v_manager from public.person_assignments where id = v_assignment;
  insert into t_verdicts values (jsonb_build_object('check','null_does_not_clear',
    'manager_kept', v_manager = 'ffff0003-0000-0000-0000-000000000001'::uuid));

  -- clear=true actually clears.
  perform public.set_person_assignment(
    'ffff0002-0000-0000-0000-000000000001'::uuid,
    'ffff0001-0000-0000-0000-000000000001'::uuid,
    null, null, null, null, 'full_time', 100, null, true, 'current', true);
  select manager_person_id into v_manager from public.person_assignments where id = v_assignment;
  insert into t_verdicts values (jsonb_build_object('check','explicit_clear',
    'manager_cleared', v_manager is null));

  -- Contradiction refuses rather than guessing which the caller meant.
  begin
    perform public.set_person_assignment(
      'ffff0002-0000-0000-0000-000000000001'::uuid,
      'ffff0001-0000-0000-0000-000000000001'::uuid,
      null, null, null,
      'ffff0003-0000-0000-0000-000000000001'::uuid, 'full_time', 100, null, true, 'current', true);
    insert into t_verdicts values (jsonb_build_object('check','contradiction',
      'CONTRADICTION_WAS_ACCEPTED_DEFECT', true));
  exception when others then
    get stacked diagnostics v_err = MESSAGE_TEXT;
    insert into t_verdicts values (jsonb_build_object('check','contradiction',
      'contradiction_refused', true, 'message', v_err));
  end;
end $$;

-- ---- 4. AUTHORITY: a non-manager employee cannot assign. -----------------------------
-- The RPC RAISES (rather than silently no-opping) when the caller is neither founder/
-- admin nor a manager of the operating company.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','484ece55-b088-45f1-b795-a55ae2e0dbde','role','authenticated')::text, true);
do $$
declare v_err text;
begin
  begin
    perform public.set_person_assignment(
      'ffff0002-0000-0000-0000-000000000001'::uuid,
      'ffff0001-0000-0000-0000-000000000001'::uuid,
      null, null, null,
      'ffff0003-0000-0000-0000-000000000001'::uuid);
    insert into t_verdicts values (jsonb_build_object('check','authority',
      'NON_MANAGER_COULD_ASSIGN_DEFECT', true));
  exception when others then
    get stacked diagnostics v_err = MESSAGE_TEXT;
    insert into t_verdicts values (jsonb_build_object('check','authority',
      'non_manager_refused', true, 'message', left(v_err, 120)));
  end;
end $$;

reset role;
select jsonb_pretty(jsonb_agg(verdict)) as post_apply_202609020002 from t_verdicts;


-- ---- R-ART8: MACHINE-DECIDED VERDICT ------------------------------------------------
-- Every one of these files previously ended by printing a raw JSON blob for a human to
-- eyeball. Eyeballing is how a vacuous pass survives: three of the four scripts in this
-- batch were reported as passing when one aborted before its assertions ran, one was
-- refused by a PRIMARY KEY rather than the CHECK it tested, and one by a FOREIGN KEY
-- rather than the RLS it tested. A file must state its own verdict.
--
-- Convention: any key whose name is SHOUTED (upper-case) is a DEFECT marker - true means
-- something bad is present. Any other boolean key is an EXPECTATION - false means the
-- property this file exists to prove does not hold.
select
  count(*) filter (where defect_present)  as defect_markers_true,
  count(*) filter (where expectation_failed) as expectations_false,
  case when count(*) filter (where defect_present or expectation_failed) = 0
       then 'PASS' else 'FAIL' end        as verdict,
  jsonb_agg(kv.key) filter (where defect_present or expectation_failed) as failing_keys
from t_verdicts v,
     lateral jsonb_each(v.verdict) as kv(key, val),
     lateral (select
       (kv.key = upper(kv.key) and kv.key ~ '[A-Z]{4}' and kv.val = 'true'::jsonb) as defect_present,
       (kv.key <> upper(kv.key) and jsonb_typeof(kv.val) = 'boolean' and kv.val = 'false'::jsonb) as expectation_failed
     ) f;

rollback;
