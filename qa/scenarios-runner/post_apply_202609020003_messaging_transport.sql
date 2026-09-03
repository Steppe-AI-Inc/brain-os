-- POST-APPLY acceptance for 202609020003_messaging_transport_foundation.sql.
-- Run ONLY after that migration is applied. Self-cleaning (begin;…rollback;).
--
-- The governing rules being proven, not asserted: chat_channels stays the canonical
-- conversation layer; an external identity confers NO authority by default; anon gets
-- nothing; the outbound queue needs the channel's WRITE tier so a viewer cannot speak
-- as the company.

begin;

create temp table t_verdicts (verdict jsonb);
grant select, insert on t_verdicts to authenticated, anon;

-- ---- 1. SCHEMA + constraint shape ---------------------------------------------------
insert into t_verdicts values (jsonb_build_object(
  'check', 'schema',
  'three_tables_exist', (
    select count(*) = 3 from information_schema.tables
     where table_schema = 'public'
       and table_name in ('channel_transport_bindings','external_identity_bindings','outbound_messages')),
  'binding_company_id_not_null', (
    select is_nullable = 'NO' from information_schema.columns
     where table_schema='public' and table_name='channel_transport_bindings' and column_name='company_id'),
  'binding_channel_id_not_null', (
    select is_nullable = 'NO' from information_schema.columns
     where table_schema='public' and table_name='channel_transport_bindings' and column_name='channel_id'),
  -- R-ART7/R-C5: this asserted only that SOME unique index on (transport, external_user_id)
  -- existed. The implemented constraint was one mapping TOTAL, not one LIVE mapping, so the
  -- assertion passed while the guarantee its NAME states did not hold. It now requires the
  -- partial predicate that makes the name true.
  'one_live_identity_per_transport', exists(
    select 1 from pg_indexes where schemaname='public' and tablename='external_identity_bindings'
      and indexdef ilike '%unique%transport%external_user_id%'
      and indexdef ilike '%where%status%active%'),
  'one_binding_per_external_conversation', exists(
    select 1 from pg_indexes where schemaname='public' and tablename='channel_transport_bindings'
      and indexdef ilike '%unique%transport%external_conversation_id%'),
  -- A binding must ship DISABLED: enabling is a deliberate act, never a default.
  'binding_defaults_disabled', (
    select column_default like '%false%' from information_schema.columns
     where table_schema='public' and table_name='channel_transport_bindings' and column_name='enabled'),
  -- No secrets columns in ordinary tables.
  'no_secret_columns', not exists(
    select 1 from information_schema.columns
     where table_schema='public'
       and table_name in ('channel_transport_bindings','external_identity_bindings','outbound_messages')
       and (column_name ilike '%token%' or column_name ilike '%secret%' or column_name ilike '%api_key%'
            or column_name ilike '%password%' or column_name ilike '%credential%'))
));

-- ---- 2. RLS enabled + anon has no grants -------------------------------------------
insert into t_verdicts values (jsonb_build_object(
  'check', 'rls_and_grants',
  'rls_enabled_on_all_three', (
    select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public'
       and c.relname in ('channel_transport_bindings','external_identity_bindings','outbound_messages')),
  'anon_has_no_privileges', not exists(
    select 1 from information_schema.role_table_grants
     where table_schema='public' and grantee='anon'
       and table_name in ('channel_transport_bindings','external_identity_bindings','outbound_messages')),
  'public_has_no_privileges', not exists(
    select 1 from information_schema.role_table_grants
     where table_schema='public' and grantee='PUBLIC'
       and table_name in ('channel_transport_bindings','external_identity_bindings','outbound_messages'))
));

-- ---- 3. anon is HARD-denied at query time, not merely empty --------------------------
set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
do $$
begin
  begin
    perform 1 from public.channel_transport_bindings limit 1;
    insert into t_verdicts values (jsonb_build_object('check','anon','ANON_COULD_QUERY_BINDINGS_DEFECT', true));
  exception when insufficient_privilege then
    insert into t_verdicts values (jsonb_build_object('check','anon','anon_denied_bindings', true, 'sqlstate', SQLSTATE));
  end;
  begin
    perform 1 from public.external_identity_bindings limit 1;
    insert into t_verdicts values (jsonb_build_object('check','anon','ANON_COULD_QUERY_IDENTITIES_DEFECT', true));
  exception when insufficient_privilege then
    insert into t_verdicts values (jsonb_build_object('check','anon','anon_denied_identities', true));
  end;
end $$;

-- ---- 4. An ordinary authenticated user cannot mint an identity binding ---------------
-- Identity mapping is founder/admin-only: the mapped profile's memberships decide org
-- reach, so it is platform-wide authority, not a company-manager decision.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','484ece55-b088-45f1-b795-a55ae2e0dbde','role','authenticated')::text, true);
-- R-ART7. This test was VACUOUS and would have passed with NO RLS ON THE TABLE AT ALL.
-- It inserted profile_id '2953fbe7-0000-0000-0000-000000000000' - a fabricated UUID, the
-- documented-but-truncated '2953fbe7-*' zero-padded. profile_id carries `references
-- public.profiles(id)`, so the insert failed with foreign_key_violation (23503), and the
-- handler was `exception when others`, recording "ordinary user cannot bind identity" for
-- a reason that had nothing to do with authority. The founder-only tier - this migration's
-- own AUTHORITY-CRITICAL claim - had zero real coverage.
--
-- Fixed on both sides: the profile is RESOLVED from the persona's auth id rather than
-- guessed (the real UUID is only recorded truncated, and inventing one is exactly what
-- went wrong), and ONLY insufficient_privilege counts as a pass. Any other error now fails
-- the check loudly instead of quietly certifying it.
do $$
declare
  v_wrote boolean := false;
  v_refused_by_rls boolean := false;
  v_other_error text := null;
  v_profile uuid;
begin
  select p.id into v_profile from public.profiles p
   where p.auth_user_id = '484ece55-b088-45f1-b795-a55ae2e0dbde'::uuid;
  if v_profile is null then
    raise exception 'R-ART7 fixture: the unrelated-employee profile could not be resolved; this test cannot run vacuously';
  end if;

  begin
    insert into public.external_identity_bindings (transport, external_user_id, profile_id)
    values ('telegram', 'attacker-999', v_profile);
    v_wrote := true;
  exception
    when insufficient_privilege then v_refused_by_rls := true;
    when others then v_other_error := SQLSTATE;
  end;

  insert into t_verdicts values (jsonb_build_object(
    'check','identity_authority',
    'ordinary_user_cannot_bind_identity', (not v_wrote) and v_refused_by_rls,
    'refused_by_rls', v_refused_by_rls,
    'REFUSED_FOR_THE_WRONG_REASON_SQLSTATE', v_other_error));
end $$;

reset role;
select jsonb_pretty(jsonb_agg(verdict)) as post_apply_202609020003 from t_verdicts;


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
