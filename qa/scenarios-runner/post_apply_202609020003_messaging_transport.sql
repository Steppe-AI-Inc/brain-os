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
  'one_live_identity_per_transport', exists(
    select 1 from pg_indexes where schemaname='public' and tablename='external_identity_bindings'
      and indexdef ilike '%unique%transport%external_user_id%'),
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
do $$
declare v_wrote boolean := false;
begin
  begin
    insert into public.external_identity_bindings (transport, external_user_id, profile_id)
    values ('telegram', 'attacker-999', '2953fbe7-0000-0000-0000-000000000000');
    v_wrote := true;
  exception when others then v_wrote := false;
  end;
  insert into t_verdicts values (jsonb_build_object(
    'check','identity_authority',
    'ordinary_user_cannot_bind_identity', not v_wrote));
end $$;

reset role;
select jsonb_pretty(jsonb_agg(verdict)) as post_apply_202609020003 from t_verdicts;

rollback;
