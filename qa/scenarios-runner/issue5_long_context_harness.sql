-- GitHub issue #5 — long-context conversation harness (50 / 100 / 200 turns).
--
-- Builds a REAL, N-turn, same-channel conversation in work_orders and then asserts what
-- sem-ai-command's own context-building query would actually see on turn N+1. This tests
-- the persistence/retrieval architecture directly, which is testable today without
-- deploying the Edge Function (the class-B code fix is separately gated on
-- pending/issue-5-confirmation-action-type-binding).
--
-- What it mirrors, exactly (supabase/functions/sem-ai-command/index.ts):
--   conversationHistoryQuery = channelId
--     ? from('work_orders').select('command,output').eq('channel_id', channelId)
--         .order('created_at', {ascending:false}).limit(8)
--     : Promise.resolve({ data: [], error: null });
--   conversationHistory = rows.reverse().map(r => ({command, summary: output?.summary}))
--   lastTurnOutput      = reversed[reversed.length - 1].output   // LAST TURN ONLY
--   pendingAction       = lastTurnOutput?.pendingAction
--   recentlyResolvedEntities = lastTurnOutput?.resolvedEntities  // LAST TURN ONLY
--
-- Named regressions (issue #5's own list) this harness covers at the persistence layer:
--   BRAIN_CHAT_SAME_CHANNEL_RECENT_HISTORY_SURVIVES_COMPACTION
--   BRAIN_CHAT_CHANNEL_IDENTITY_PRESERVED_ACROSS_LONG_CONTEXT
--   BRAIN_CHAT_COMPACTION_PRESERVES_PENDING_ACTION_STATE
--   BRAIN_CHAT_RECENT_TURN_NOT_DENIED_AS_MISSING
--
-- Self-cleaning: everything runs inside begin;...rollback;. No production residue.
-- Read the verdict's own `_interpretation` field — several of these assertions are
-- EXPECTED to fail against today's architecture; that is the finding, not a broken test.

begin;

create temp table t_result (verdict jsonb);

do $$
declare
  v_channel_id uuid;
  v_profile_id uuid := '46bf57d3-33b3-47b4-8302-126726a92775'; -- FOUNDER fixture
  v_company_id uuid := 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'; -- CLIX GPS fixture
  v_turns int;
  v_scale int;
  v_scales int[] := array[50, 100, 200];
  v_visible int;
  v_oldest_visible int;
  v_first_turn_visible boolean;
  v_pending_survives boolean;
  v_ids_in_history int;
  v_results jsonb := '[]'::jsonb;
begin
  foreach v_scale in array v_scales loop
    -- Fresh channel per scale so each run is independent.
    insert into public.chat_channels (name, created_by_profile_id)
    values ('ISSUE5-HARNESS-' || v_scale, v_profile_id)
    returning id into v_channel_id;

    -- Build N real turns. Turn 1 carries a canonical entity id in resolvedEntities and a
    -- pendingAction, so we can test whether either survives to turn N+1.
    for v_turns in 1..v_scale loop
      insert into public.work_orders (command, status, context_pack, output, created_by_profile_id, channel_id, company_id)
      values (
        'harness turn ' || v_turns,
        'done',
        '{}'::jsonb,
        jsonb_build_object(
          'summary', 'summary of turn ' || v_turns,
          -- Only turn 1 carries the canonical target + pending action we later look for.
          'resolvedEntities', case when v_turns = 1
            then jsonb_build_object('company', jsonb_build_object('id', v_company_id, 'name', 'CLIX GPS'))
            else null end,
          'pendingAction', case when v_turns = 1
            then jsonb_build_object('kind','single_entity_clarification','question','Did you mean CLIX GPS?','candidateIds', jsonb_build_array(v_company_id),'entityType','company')
            else null end
        ),
        v_profile_id,
        v_channel_id,
        v_company_id
      );
      -- created_at MUST be set explicitly with a real per-turn offset. Postgres' now()
      -- (and therefore `created_at default now()`) is TRANSACTION-stable, so every row
      -- inserted in this loop would otherwise share an identical timestamp and
      -- `order by created_at desc limit 8` would return an arbitrary, non-deterministic
      -- 8 rows. Found while first running this harness: the 200-turn scale reported
      -- turn 1 as "still visible" purely because of tie-ordering, contradicting the
      -- 50/100 scales. That was a harness bug producing a false PASS, not a real finding.
      update public.work_orders
        set created_at = now() - ((v_scale - v_turns) * interval '1 second')
        where channel_id = v_channel_id and command = 'harness turn ' || v_turns;
    end loop;

    -- Now mirror the REAL history query the Edge Function runs on turn N+1.
    select count(*) into v_visible from (
      select 1 from public.work_orders
      where channel_id = v_channel_id
      order by created_at desc
      limit 8
    ) s;

    -- Is the very first turn of the conversation still retrievable?
    select exists (
      select 1 from (
        select command from public.work_orders
        where channel_id = v_channel_id
        order by created_at desc
        limit 8
      ) s where s.command = 'harness turn 1'
    ) into v_first_turn_visible;

    -- Does turn 1's pendingAction survive to be readable at turn N+1?
    -- (lastTurnOutput only ever reads the single most recent row, so this is really
    -- asking: can a pending action asked more than one turn ago still be honored?)
    select exists (
      select 1 from (
        select output from public.work_orders
        where channel_id = v_channel_id
        order by created_at desc
        limit 1
      ) s where s.output->'pendingAction' is not null and s.output->'pendingAction' <> 'null'::jsonb
    ) into v_pending_survives;

    -- How many canonical entity IDs are carried in the retrievable history window?
    -- conversationHistory maps ONLY {command, summary} - resolvedEntities is read from
    -- the last turn alone - so anything older is unreferenceable by id.
    select count(*) into v_ids_in_history from (
      select output from public.work_orders
      where channel_id = v_channel_id
      order by created_at desc
      limit 8
    ) s where s.output->'resolvedEntities' is not null and s.output->'resolvedEntities' <> 'null'::jsonb;

    v_results := v_results || jsonb_build_object(
      'conversation_turns', v_scale,
      'turns_actually_persisted', (select count(*) from public.work_orders where channel_id = v_channel_id),
      'turns_visible_to_next_turn', v_visible,
      'turns_invisible', v_scale - v_visible,
      'pct_of_conversation_visible', round(100.0 * v_visible / v_scale, 1),
      'BRAIN_CHAT_SAME_CHANNEL_RECENT_HISTORY_SURVIVES_COMPACTION', v_first_turn_visible,
      'BRAIN_CHAT_COMPACTION_PRESERVES_PENDING_ACTION_STATE', v_pending_survives,
      'canonical_entity_ids_reachable_in_window', v_ids_in_history
    );
  end loop;

  insert into t_result (verdict) values (jsonb_build_object(
    'scenario', 'issue #5 long-context harness (50/100/200 turns, same channel)',
    'mirrors', 'sem-ai-command conversationHistoryQuery + lastTurnOutput exactly',
    'results', v_results,
    '_interpretation', jsonb_build_object(
      'expected_to_fail_today', 'BRAIN_CHAT_SAME_CHANNEL_RECENT_HISTORY_SURVIVES_COMPACTION and BRAIN_CHAT_COMPACTION_PRESERVES_PENDING_ACTION_STATE are EXPECTED false at every scale against the current architecture. That is the finding this harness exists to prove, not a broken test.',
      'root_cause_1', 'limit(8) is a hard truncation with no compaction, summarization, or carry-forward. At 50/100/200 turns, 42/92/192 turns are simply invisible - the model cannot see them and will correctly-but-uselessly report it has no record of them.',
      'root_cause_2', 'pendingAction and resolvedEntities are read from the SINGLE most recent row only (lastTurnOutput). A clarification asked 2+ turns ago is unreachable, so any intervening message permanently orphans the pending action.',
      'root_cause_3', 'conversationHistory carries only {command, summary} - no canonical entity ids and no turn ids. Referents like "that company" / "same one" / "this employee" cannot be resolved against anything older than the immediately-previous turn.',
      'not_a_cause', 'Legacy null channel_id rows (401 of 428 lifetime work_orders) predate channel binding, which shipped 2026-08-31; every turn that day carried a real channel_id. Those legacy rows are permanently unreachable but are NOT the cause of current-traffic history loss.',
      'never_yet_exercised_live', 'The longest real production channel to date is 7 turns - just under the limit(8) window - so this truncation has never actually fired in production. It is guaranteed to at the 50/100/200-turn scale the founder requires.'
    )
  ));
end $$;

select verdict from t_result;

rollback;
