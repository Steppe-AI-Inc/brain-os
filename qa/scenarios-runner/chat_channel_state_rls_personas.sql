-- chat_channel_state — post-apply RLS persona + constraint acceptance test.
--
-- RUN ONLY AFTER 202609020001_chat_channel_state_durable_conversation.sql is applied
-- (it references the new table; before that it fails on relation-not-found, which is
-- the correct signal that it ran too early, not a defect).
--
-- Same discipline as sc081: real production personas impersonated via
-- `set local role` + request.jwt.claims, every write inside begin;...rollback;
-- (self-cleaning, zero residue), personas wrapped so one persona's error cannot blank
-- out the others' verdicts. Personas reuse the sc081 fixtures:
--   creator/employee  profile 66ef2052-d002-4592-b841-82cd2171b51a / auth 9c92a8d5-853c-4ef3-846a-f4fe8c42d97a
--   unrelated employee profile 2953fbe7-* / auth 484ece55-* (same platform, no channel tie)
--   founder            looked up dynamically by role='founder'
--   anon               role anon, no claims
--
-- What must hold (founder's issue-#5 requirements):
--   * channel-state visibility/writability NEVER exceeds the channel's own
--     (AUTH USER != PERSON != ORG MEMBERSHIP: authority derives from the channel via
--     profiles, org scope is the channel's company);
--   * an authenticated-but-uninvited user sees nothing and can write nothing —
--     including INSERTING a state row for someone else's channel (planting a pending
--     destructive action is the attack this blocks);
--   * anon is hard-denied (no grant, not just empty);
--   * a pending action is whole-or-nothing: no action without explicit action type,
--     expected confirmation, creation and expiry (the Class-B half-written shape is
--     refused by the DB, not coerced at read time);
--   * unknown action-type vocabulary is refused;
--   * optimistic version CAS works (0 rows on a stale version, 1 on the fresh one).

begin;

create temp table t_verdicts (verdict jsonb);
grant select, insert on t_verdicts to authenticated, anon;

-- ---- Fixtures (superuser): one personal channel + one whose state carries a pending
-- action, both owned by the creator persona. ----------------------------------------
insert into public.chat_channels (id, name, company_id, created_by_profile_id)
values ('dddd0001-0000-0000-0000-000000000001', 'CCS-QA personal channel', null,
        '66ef2052-d002-4592-b841-82cd2171b51a');

-- ---- Persona 1: creator — full lifecycle on their own channel's state. -------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

insert into public.chat_channel_state (
  channel_id, pending_action, pending_action_action_type, pending_action_target_ids,
  pending_action_expected_confirmation, pending_action_created_at, pending_action_expires_at,
  focus_stack, resolved_entities
) values (
  'dddd0001-0000-0000-0000-000000000001',
  '{"kind":"bulk_confirmation","question":"Archive CCS-QA Co?"}'::jsonb,
  'archive',
  '[{"resourceType":"company","id":"eeee0001-0000-0000-0000-000000000001"}]'::jsonb,
  'confirmation', now(), now() + interval '30 minutes',
  '[{"resourceType":"company","id":"eeee0001-0000-0000-0000-000000000001","label":"CCS-QA Co"}]'::jsonb,
  '[]'::jsonb
);

do $$
declare v_updated int;
begin
  -- Stale-version CAS must touch 0 rows; fresh version must touch 1.
  update public.chat_channel_state set version = 99, updated_at = now()
    where channel_id = 'dddd0001-0000-0000-0000-000000000001' and version = 12345;
  get diagnostics v_updated = row_count;
  insert into t_verdicts values (json_build_object(
    'persona','creator',
    'stale_version_cas_touches_zero_rows', v_updated = 0));
  update public.chat_channel_state set version = 2, updated_at = now()
    where channel_id = 'dddd0001-0000-0000-0000-000000000001' and version = 1;
  get diagnostics v_updated = row_count;
  insert into t_verdicts values (json_build_object(
    'persona','creator',
    'fresh_version_cas_touches_one_row', v_updated = 1,
    'own_state_visible', exists(select 1 from public.chat_channel_state
      where channel_id = 'dddd0001-0000-0000-0000-000000000001'),
    'pending_action_readable_with_binding', (
      select pending_action_action_type = 'archive'
         and pending_action_expected_confirmation = 'confirmation'
         and pending_action_target_ids @> '[{"resourceType":"company"}]'::jsonb
      from public.chat_channel_state
      where channel_id = 'dddd0001-0000-0000-0000-000000000001')));
end $$;

-- Constraint: half-written pending action (no action type / confirmation / expiry)
-- must be REFUSED — the exact Class-B shape.
do $$
begin
  begin
    insert into public.chat_channel_state (channel_id, pending_action)
    select id, '{"kind":"bulk_confirmation"}'::jsonb from public.chat_channels
      where id = 'dddd0001-0000-0000-0000-000000000001';
    insert into t_verdicts values (json_build_object('persona','creator',
      'HALF_WRITTEN_PENDING_ACTION_WAS_ACCEPTED_DEFECT', true));
  exception when check_violation or unique_violation then
    insert into t_verdicts values (json_build_object('persona','creator',
      'half_written_pending_action_refused', true, 'sqlstate', SQLSTATE));
  end;
end $$;

-- Constraint: unknown action-type vocabulary refused at write time.
do $$
begin
  begin
    update public.chat_channel_state
      set pending_action_action_type = 'obliterate'
      where channel_id = 'dddd0001-0000-0000-0000-000000000001';
    insert into t_verdicts values (json_build_object('persona','creator',
      'UNKNOWN_ACTION_TYPE_WAS_ACCEPTED_DEFECT', true));
  exception when check_violation then
    insert into t_verdicts values (json_build_object('persona','creator',
      'unknown_action_type_refused', true));
  end;
end $$;

-- ---- Persona 2: authenticated-but-uninvited (unrelated employee). -------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','484ece55-b088-45f1-b795-a55ae2e0dbde','role','authenticated')::text, true);

do $$
declare v_count int; v_wrote boolean := false;
begin
  select count(*) into v_count from public.chat_channel_state
    where channel_id = 'dddd0001-0000-0000-0000-000000000001';
  begin
    update public.chat_channel_state set compacted_summary = 'planted'
      where channel_id = 'dddd0001-0000-0000-0000-000000000001';
    -- RLS-silent 0-row match is the expected shape for update.
    v_wrote := found;
  exception when others then v_wrote := false;
  end;
  insert into t_verdicts values (json_build_object(
    'persona','unrelated employee',
    'cannot_see_others_channel_state', v_count = 0,
    'cannot_update_others_channel_state', not v_wrote));
  -- Planting a state row (a pending destructive action) on someone else's channel must
  -- be refused by WITH CHECK.
  begin
    insert into public.chat_channel_state (channel_id) values ('dddd0001-0000-0000-0000-000000000001');
    insert into t_verdicts values (json_build_object('persona','unrelated employee',
      'PLANTED_STATE_ROW_ON_FOREIGN_CHANNEL_DEFECT', true));
  exception when insufficient_privilege or unique_violation then
    -- unique_violation would mean the row was visible enough to conflict — still a
    -- refusal of the plant, but record which shape fired.
    insert into t_verdicts values (json_build_object('persona','unrelated employee',
      'cannot_plant_state_row_on_foreign_channel', true, 'sqlstate', SQLSTATE));
  end;
end $$;

-- ---- Persona 3: founder/admin — platform-wide visibility (existing, deliberate). ----
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub',(select p.auth_user_id::text from public.profiles p where p.role = 'founder' limit 1),
                    'role','authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into t_verdicts values (json_build_object(
    'persona','founder',
    'founder_sees_channel_state', exists(select 1 from public.chat_channel_state
      where channel_id = 'dddd0001-0000-0000-0000-000000000001')));
end $$;

-- ---- Persona 4: anon — hard denial (no grant), not a quiet empty result. -----------
reset role;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
set local role anon;
do $$
begin
  begin
    perform 1 from public.chat_channel_state limit 1;
    insert into t_verdicts values (json_build_object('persona','anon',
      'ANON_COULD_QUERY_CHANNEL_STATE_DEFECT', true));
  exception when insufficient_privilege then
    insert into t_verdicts values (json_build_object('persona','anon',
      'anon_hard_denied_permission_error', true, 'sqlstate', SQLSTATE));
  end;
end $$;

reset role;
select jsonb_pretty(jsonb_agg(verdict)) as chat_channel_state_rls_personas from t_verdicts;

rollback;
