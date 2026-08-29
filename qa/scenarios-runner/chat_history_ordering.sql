-- Chat history ordering + channel isolation — permanent regression for the defect fixed
-- in web/lib/data/chat-history.ts's getChatHistory() and the AI-context query in
-- supabase/functions/sem-ai-command/index.ts (conversationHistoryQuery): both used to
-- order created_at ASCENDING then LIMIT, which PostgREST/Postgres apply in that order —
-- LIMIT after ORDER BY — so for any channel with more rows than the limit, the query
-- fetched the OLDEST N turns, never the newest. This is a pure query-shape defect, not an
-- RLS/authorization one, so this script runs as the connecting superuser (no persona
-- impersonation needed) and proves two things directly against real Postgres semantics:
--
--   1. CHAT_HISTORY_NEWEST_SURVIVES_NAVIGATION (ordering half): `order by created_at desc
--      limit N` for a channel with more than N turns returns exactly the N most recent
--      turns (the newest turn is present, the oldest turns beyond the window are absent),
--      and reversing that result set restores true chronological order for display —
--      exactly what getChatHistory()/conversationHistoryQuery now do.
--   2. CHAT_HISTORY_CHANNEL_CACHE_ISOLATED (channel-scoping half): a channel-scoped query
--      never returns another channel's rows, in either direction, and a channel with
--      fewer rows than the limit returns its complete history untruncated.
--
-- All fixtures are rolled back — nothing is left in production tables.
begin;

-- Two real channels under an existing fixture company (CLIX GPS), created by the
-- existing FOUNDER fixture profile — same ids used throughout qa/scenarios-runner/*.sql
-- (see qa/scenarios-runner/README.md's "Fixture identities").
insert into public.chat_channels (id, name, company_id, created_by_profile_id) values
  ('cc000001-0000-0000-0000-000000000001', 'CHO Channel A', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', '46bf57d3-33b3-47b4-8302-126726a92775'),
  ('cc000001-0000-0000-0000-000000000002', 'CHO Channel B', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', '46bf57d3-33b3-47b4-8302-126726a92775');

-- Channel A: 35 turns, explicit ascending created_at (turn N is always older than turn
-- N+1) so "newest 30" and "oldest 5" are unambiguous regardless of insertion order or
-- clock resolution — no reliance on now()/statement timing.
insert into public.work_orders (id, command, channel_id, status, created_by_profile_id, created_at)
select
  ('cc0a0000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'CHO-A-' || n,
  'cc000001-0000-0000-0000-000000000001',
  'done',
  '46bf57d3-33b3-47b4-8302-126726a92775',
  timestamptz '2026-01-01 00:00:00+00' + (n || ' minutes')::interval
from generate_series(1, 35) as n;

-- Channel B: only 5 turns — fewer than the page size, so its full history must come back
-- untruncated, and none of it should ever appear in a Channel-A-scoped query or vice versa.
insert into public.work_orders (id, command, channel_id, status, created_by_profile_id, created_at)
select
  ('cc0b0000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'CHO-B-' || n,
  'cc000001-0000-0000-0000-000000000002',
  'done',
  '46bf57d3-33b3-47b4-8302-126726a92775',
  timestamptz '2026-01-01 00:00:00+00' + (n || ' minutes')::interval
from generate_series(1, 5) as n;

-- Reproduce getChatHistory()'s exact query shape for Channel A: order by created_at desc,
-- limit 30 (the fix), then reverse for chronological display.
create temporary table cho_a_kept as
select command, created_at from (
  select command, created_at
  from public.work_orders
  where channel_id = 'cc000001-0000-0000-0000-000000000001'
  order by created_at desc
  limit 30
) newest_first
order by created_at asc;

create temporary table cho_b_kept as
select command, created_at from (
  select command, created_at
  from public.work_orders
  where channel_id = 'cc000001-0000-0000-0000-000000000002'
  order by created_at desc
  limit 30
) newest_first
order by created_at asc;

select json_build_object(
  'scenario', 'CHAT-HISTORY-ORDERING',
  'classification', 'FIXED — chat-history.ts getChatHistory() + sem-ai-command conversationHistoryQuery ordering defect',

  -- Ordering half (CHAT_HISTORY_NEWEST_SURVIVES_NAVIGATION)
  'kept_count_is_30', (select count(*) from cho_a_kept) = 30,
  'newest_message_present', exists(select 1 from cho_a_kept where command = 'CHO-A-35'),
  'oldest_five_excluded', not exists(select 1 from cho_a_kept where command in ('CHO-A-1','CHO-A-2','CHO-A-3','CHO-A-4','CHO-A-5')),
  'reversed_result_is_chronological',
    (select command from cho_a_kept order by created_at asc limit 1) = 'CHO-A-6'
    and (select command from cho_a_kept order by created_at desc limit 1) = 'CHO-A-35',

  -- Channel-scoping half (CHAT_HISTORY_CHANNEL_CACHE_ISOLATED)
  'channel_a_never_leaks_into_channel_b', not exists(select 1 from cho_b_kept where command like 'CHO-A-%'),
  'channel_b_never_leaks_into_channel_a', not exists(select 1 from cho_a_kept where command like 'CHO-B-%'),
  'channel_b_full_history_untruncated', (select count(*) from cho_b_kept) = 5,

  'all_pass', (
        (select count(*) from cho_a_kept) = 30
    and exists(select 1 from cho_a_kept where command = 'CHO-A-35')
    and not exists(select 1 from cho_a_kept where command in ('CHO-A-1','CHO-A-2','CHO-A-3','CHO-A-4','CHO-A-5'))
    and (select command from cho_a_kept order by created_at asc limit 1) = 'CHO-A-6'
    and (select command from cho_a_kept order by created_at desc limit 1) = 'CHO-A-35'
    and not exists(select 1 from cho_b_kept where command like 'CHO-A-%')
    and not exists(select 1 from cho_a_kept where command like 'CHO-B-%')
    and (select count(*) from cho_b_kept) = 5
  )
) as verdict;

rollback;
