-- GitHub issue #5, Classes A/C/D/E — durable structured channel state (P1).
-- STATUS: FIX PREPARED / REVIEW REQUIRED. NOT pushed. Executing this against production
-- requires explicit founder authorization at the `supabase db push` boundary.
--
-- What Work-PC's long-context harness measured on the live system
-- (qa/scenarios-runner/issue5_long_context_harness.sql, results recorded in
-- qa/home-pc-handoff/fixes/ISSUE-5.json):
--   * ALL conversational state lives in the last turn's work_orders.output — the
--     structured pendingAction, resolved canonical target ids, everything;
--   * history retrieval is a hard limit(8) of {command, summary} pairs with ZERO
--     canonical ids in the window: at 50 turns 16% of the conversation is visible, at
--     200 turns 4%, and the first turn is never reachable;
--   * source-turn identity, expected-confirmation type, expiry and compaction do not
--     exist anywhere in the schema.
-- Class B (confirmation misbinding) was closed fail-closed in Edge Function v92; A/C/D/E
-- cannot be closed by wording because the state they need durable DOES NOT EXIST.
-- This table is that state.
--
-- Identity model (explicit, per the standing rule AUTH USER != PERSON != ORGANIZATION
-- MEMBERSHIP): a channel-state row's identity is the CHANNEL (channel_id PK). Authority
-- over it derives from the channel's own ownership/company scoping via profiles —
-- never from a person row, never from bare auth identity, and its org scope is the
-- channel's company_id. This table adds NO new authority of its own: every predicate
-- delegates to chat_channels, so it can never be more visible or more writable than
-- the channel it describes.
--
-- Class-B lesson carried into the schema itself: the action type of a pending action is
-- a FIRST-CLASS, VOCABULARY-CONSTRAINED column, not a nullable field buried in jsonb.
-- The original defect was an absent action type being coerced into the most destructive
-- default at read time; here the database refuses an unknown action type at write time,
-- and a NULL action type is only legal when there is no pending action at all.

begin;

create table if not exists public.chat_channel_state (
  -- Channel/session identity. One row per channel: this is a PROJECTION of the
  -- conversation ("where were we"), not a log — history stays in work_orders.
  channel_id uuid primary key references public.chat_channels(id) on delete cascade,

  -- ---- The one live pending action a bare confirmation may bind to. ----------------
  -- Full structured pendingAction (kind/entityType/question/options/executionPlan…),
  -- exactly what sem-ai-command emits per turn — durable instead of last-turn-only.
  -- NULL means nothing is pending: a bare 'yes' must then never mutate anything.
  pending_action jsonb,
  -- Explicit, constrained action type (issue #5 Class B, now enforced by the DB):
  -- unknown vocabulary is refused at write time, never coerced at read time.
  pending_action_action_type text check (
    pending_action_action_type in (
      'archive', 'restore', 'create', 'delete', 'update', 'assign',
      'end_employment', 'restore_employment', 'reassign', 'multi_action_plan'
    )
  ),
  -- Canonical target ids the pending action is bound to: [{resourceType, id}].
  -- A confirmation binds to EXACTLY these ids or to nothing.
  pending_action_target_ids jsonb,
  -- The turn that created it — source-turn identity for audit and staleness.
  pending_action_source_work_order_id uuid references public.work_orders(id) on delete set null,
  -- What kind of reply legitimately resolves it: a disambiguation is resolved by a
  -- CHOICE, a destructive plan by an explicit CONFIRMATION — never interchangeable.
  pending_action_expected_confirmation text check (
    pending_action_expected_confirmation in ('confirmation', 'choice', 'free_text_answer')
  ),
  pending_action_created_at timestamptz,
  -- Hard expiry. The READER treats an expired or source-less pending action as absent
  -- and re-asks; a sweeper may also null it out, but correctness never depends on one.
  pending_action_expires_at timestamptz,
  -- A pending action must arrive whole or not at all: no action without its type,
  -- creation time, expiry and expected confirmation — the half-written shape is the
  -- one Class B proved dangerous, so the DB refuses it outright.
  constraint chat_channel_state_pending_action_whole check (
    (pending_action is null
      and pending_action_action_type is null
      and pending_action_target_ids is null
      and pending_action_expected_confirmation is null
      and pending_action_created_at is null
      and pending_action_expires_at is null)
    or
    (pending_action is not null
      and pending_action_action_type is not null
      and pending_action_expected_confirmation is not null
      and pending_action_created_at is not null
      and pending_action_expires_at is not null)
  ),

  -- ---- Durable reference resolution. ------------------------------------------------
  -- Most-recent-first canonical entity references the conversation is "about":
  -- [{resourceType, id, label, sourceWorkOrderId, at}]. Pronoun resolution reads THIS,
  -- never prose. The writer keeps it bounded (a stack, not a log).
  focus_stack jsonb not null default '[]'::jsonb,
  -- Entities resolved in recent turns (the durable home of what today lives one turn
  -- deep in work_orders.output.recentlyResolvedEntities). Same element shape as
  -- focus_stack; superset semantics — focus is what's ACTIVE, resolved is what's KNOWN.
  resolved_entities jsonb not null default '[]'::jsonb,
  -- The last mutation that actually executed with a confirmed postcondition:
  -- {resourceType, id, action, workOrderId, at}. "Undo that" / "what did you just do"
  -- answers from here — backend-written execution fact, never model prose.
  last_successful_mutation jsonb,

  -- ---- Compaction checkpoint. -------------------------------------------------------
  -- Rolling summary of turns older than the raw retrieval window, plus the canonical
  -- ids that appeared in them — so an entity from turn 1 is still resolvable at turn
  -- 200 even though its prose left the window long ago.
  compacted_summary text,
  compacted_canonical_ids jsonb not null default '[]'::jsonb,
  compacted_through_work_order_id uuid references public.work_orders(id) on delete set null,
  compacted_turn_count integer not null default 0 check (compacted_turn_count >= 0),

  -- Optimistic concurrency: the Edge Function updates `... where channel_id = $1 and
  -- version = $read`, treats 0 affected rows as a concurrent turn, re-reads, and never
  -- blind-overwrites. Deliberately writer-driven (no trigger): a trigger bumping it
  -- underneath the writer would break exactly the compare-and-set it exists for.
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

-- Expiry sweep support: only rows that actually hold a pending action need scanning.
create index if not exists chat_channel_state_pending_expiry_idx
  on public.chat_channel_state (pending_action_expires_at)
  where pending_action is not null;

alter table public.chat_channel_state enable row level security;

-- READ mirrors the channel: the EXISTS subquery runs under the caller's own RLS on
-- chat_channels (founder/admin, creator, or manager of the channel's company — see
-- chat_channels_select_scope), so this table can never be MORE visible than its
-- channel. One predicate, maintained in one place, inherited here. Cross-org isolation
-- follows for free: a channel you cannot see is a state row you cannot see.
drop policy if exists "chat_channel_state_select_scope" on public.chat_channel_state;
create policy "chat_channel_state_select_scope" on public.chat_channel_state for select using (
  exists (select 1 from public.chat_channels c where c.id = chat_channel_state.channel_id)
);

-- WRITE requires the channel's WRITE tier (creator / company manager / founder-admin),
-- not merely read visibility: someone who can read a manager's channel must not be able
-- to plant a pending destructive action in it. Spelled out (rather than delegating to
-- chat_channels' own RLS row-visibility) because SELECT visibility is the WEAKER tier —
-- delegating the way the select policy does would grant writes to every reader.
drop policy if exists "chat_channel_state_write_scope" on public.chat_channel_state;
create policy "chat_channel_state_write_scope" on public.chat_channel_state for all using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.chat_channels c
    where c.id = chat_channel_state.channel_id
      and (c.created_by_profile_id = public.current_profile_id()
           or (c.company_id is not null and public.is_company_manager(c.company_id)))
  )
) with check (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.chat_channels c
    where c.id = chat_channel_state.channel_id
      and (c.created_by_profile_id = public.current_profile_id()
           or (c.company_id is not null and public.is_company_manager(c.company_id)))
  )
);

-- The Edge Function always acts as the real signed-in user (auth.getUser(), never
-- service-role), so `authenticated` is the only grantee. anon gets NOTHING — stated
-- explicitly rather than left to the default, per the anon-grant sweep discipline
-- (202608310004): revoke is a no-op on a fresh table but survives a future
-- default-privilege change.
revoke all on public.chat_channel_state from anon, public;
grant select, insert, update, delete on public.chat_channel_state to authenticated;

commit;

-- ROLLBACK STRATEGY (for the reviewer; not executed by this file):
--   This migration is purely ADDITIVE — one new table, no changes to any existing
--   object, no data migration, nothing reads it until the feature-gated application
--   code ships. Rollback is `drop table public.chat_channel_state;` with zero effect
--   on any existing feature; the application code is written to treat the table's
--   absence as "no durable state" (see web/Edge integration notes), so rollback does
--   not require an application rollback.
