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
  'has_p_clear_manager', (
    select pg_get_function_identity_arguments(p.oid) like '%boolean, boolean%'
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

rollback;
