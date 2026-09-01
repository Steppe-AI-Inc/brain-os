-- PERMANENT REGRESSION — BUG-005 / GitHub issue #5, Classes A + D
-- Measures the channel-continuity LAYERS SEPARATELY, per the founder instruction not to
-- label every continuity failure "the LLM forgot".
--
-- Layers this distinguishes:
--   PERSISTENCE  - did the turn reach work_orders at all?
--   RETRIEVAL    - how many of the persisted turns fall inside the limit(8) window?
--   STRUCTURE    - does the persisted pendingAction carry an actionType and canonical ids?
--
-- It reports on REAL channels produced by live browser testing, so it stays meaningful as
-- the product changes. Read-only - no fixtures, no mutation, no rollback needed.
--
-- Live baseline, deployed sem-ai-command v92, 2026-09-01 (campaign C002):
--   * A 3-user-turn channel persisted only 1 work_orders row.
--   * Every persisted pendingAction carried kind='open_question' with actionType ABSENT -
--     the unrepresentable-ASSIGN condition behind the original misbinding.
--   * Replies were observed lagging one turn behind their prompts (turn/response
--     misalignment), which is a prompt-construction/ordering signal, not model recall.

with recent as (
  select channel_id,
         count(*)                                                        as persisted_turns,
         min(created_at)                                                 as first_turn,
         max(created_at)                                                 as last_turn,
         count(*) filter (where output ? 'pendingAction')                as turns_with_pending_action,
         count(*) filter (where output->'pendingAction'->>'actionType' is not null)
                                                                         as pending_with_action_type,
         count(*) filter (where output->'pendingAction'->>'kind' is not null)
                                                                         as pending_with_kind
  from public.work_orders
  where channel_id is not null
    and created_at > now() - interval '2 days'
  group by channel_id
),
agg as (
  select
    count(*)                                             as channels_seen,
    coalesce(sum(persisted_turns), 0)                    as total_persisted_turns,
    coalesce(max(persisted_turns), 0)                    as longest_channel_turns,
    coalesce(sum(turns_with_pending_action), 0)          as total_pending_actions,
    coalesce(sum(pending_with_action_type), 0)           as pending_carrying_action_type,
    coalesce(sum(pending_with_kind), 0)                  as pending_carrying_kind
  from recent
)
select json_build_object(
  'channels_seen_last_2d',          channels_seen,
  'total_persisted_turns',          total_persisted_turns,
  'longest_channel_turns',          longest_channel_turns,
  'retrieval_window_limit',         8,
  'longest_channel_exceeds_window', (longest_channel_turns > 8),

  'pending_actions_persisted',      total_pending_actions,
  'pending_carrying_kind',          pending_carrying_kind,
  'pending_carrying_action_type',   pending_carrying_action_type,

  -- THE LOAD-BEARING ASSERTION. A pending action with no actionType is exactly the state
  -- that produced the original issue #5 misbinding: with the type absent, the pre-fix code
  -- coerced it to the most destructive operation, and the post-fix code fails closed so the
  -- action can never be confirmed at all. Either way the pending action is unusable.
  'all_pass', (total_pending_actions = 0 OR pending_carrying_action_type = total_pending_actions),

  'bug_id', 'BUG-005',
  'classes', 'A (persistence/retrieval), D (execution-state continuity)',
  'expected_state_until_fixed', 'EXPECTED_FAIL',
  'layer_note', 'If pending_carrying_action_type < pending_actions_persisted the defect is STRUCTURAL (the type cannot be represented), not a context-size problem. Do not treat it as a retrieval-window issue.',
  'vacuity_note', 'If pending_actions_persisted is 0 this test is VACUOUS - it passes without proving anything. Treat 0 as INCONCLUSIVE and re-run after exercising a clarification flow in the browser.'
) as verdict
from agg;
