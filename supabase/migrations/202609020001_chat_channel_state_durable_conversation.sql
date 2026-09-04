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

-- R-A10: `if not exists` on a NEW table masks divergence — if a table of this name already
-- existed with a different shape (a hand-made one, or a partially-applied earlier attempt),
-- this migration would succeed and silently leave the wrong columns in place, and every
-- constraint and trigger below would be attached to a table that is not the one described
-- here. Kept for re-runnability, but no longer trusted: the guard immediately after the
-- CREATE fails loudly if the table this migration ends up with is not the table it means.
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
  -- R-A4 (DB review round 2). The constraint above refused a half-written action TYPE and
  -- then permitted a half-written TARGET: `action_type='archive'` with NULL target_ids was
  -- a legal row, directly contradicting the comment four lines up ("binds to EXACTLY these
  -- ids or to nothing"). That is the Class-B shape again — an absent field available to be
  -- coerced into a destructive default at read time. A 'confirmation' is the destructive
  -- kind and must name its targets. 'choice' and 'free_text_answer' legitimately have no
  -- bound target yet, so they stay unconstrained DELIBERATELY, not by omission.
  constraint chat_channel_state_confirmation_binds_targets check (
    pending_action_expected_confirmation is distinct from 'confirmation'
    or pending_action_target_ids is not null
  ),
  -- R-A3: these columns are read as collections. A scalar planted in any of them breaks
  -- the reader, so the shape is refused at write time rather than defended at read time.
  constraint chat_channel_state_jsonb_shapes check (
    jsonb_typeof(focus_stack) = 'array'
    and jsonb_typeof(resolved_entities) = 'array'
    and jsonb_typeof(compacted_canonical_ids) = 'array'
    and (pending_action_target_ids is null or jsonb_typeof(pending_action_target_ids) = 'array')
  ),

  -- ---- Durable reference resolution. ------------------------------------------------
  -- Most-recent-first canonical entity references the conversation is "about":
  -- [{resourceType, id, label, sourceWorkOrderId, at}]. Pronoun resolution reads THIS,
  -- never prose. The writer keeps it bounded (a stack, not a log).
  -- R-A3: focus_stack and resolved_entities stay CLIENT-WRITABLE by design — they are a
  -- convenience projection, not evidence. That is safe only under two obligations the
  -- reader owes, stated here because they are invariants, not preferences:
  --   1. Every id read from these columns is UNTRUSTED. Re-derive authorization on it at
  --      mutation time (the archive_company/archive_task family already does).
  --   2. Never render the stored `label`. Re-label from the canonical row. A planted label
  --      is a UI-spoofing primitive ("CCS-QA Co" displayed for an id that is something
  --      else) even when the mutation itself is correctly denied.
  -- This is SAFE-BY-DELEGATION, not safe-by-construction. If either obligation is ever
  -- dropped, these columns must move behind the trusted-write trigger like the others.
  focus_stack jsonb not null default '[]'::jsonb,
  -- Entities resolved in recent turns (the durable home of what today lives one turn
  -- deep in work_orders.output.recentlyResolvedEntities). Same element shape as
  -- focus_stack; superset semantics — focus is what's ACTIVE, resolved is what's KNOWN.
  resolved_entities jsonb not null default '[]'::jsonb,
  -- The last mutation that actually executed with a confirmed postcondition:
  -- {resourceType, id, action, workOrderId, at}. "Undo that" / "what did you just do"
  -- answers from here — backend-written execution fact, never model prose.
  -- R-A2: that sentence was previously a CLAIM the grants contradicted — the column was
  -- writable straight from PostgREST, so a user could plant a mutation that never happened
  -- and have the AI read it back as fact. It is now TRUE by enforcement: see the
  -- trusted-column trigger and record_chat_channel_mutation() below. Do not weaken the
  -- trigger without deleting this sentence in the same commit.
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

-- R-A9: both FKs point at work_orders, which receives deletes. An unindexed referencing
-- column forces a sequential scan of this table on every such delete, and the ON DELETE
-- SET NULL action makes that scan mandatory rather than incidental. Partial, because a
-- null pointer is never what the delete is looking for.
create index if not exists chat_channel_state_pending_source_wo_idx
  on public.chat_channel_state (pending_action_source_work_order_id)
  where pending_action_source_work_order_id is not null;
create index if not exists chat_channel_state_compacted_through_wo_idx
  on public.chat_channel_state (compacted_through_work_order_id)
  where compacted_through_work_order_id is not null;

-- R-A10 guard. Every column this migration's constraints, triggers and RPCs depend on must
-- actually be present on the table we ended up with. If `if not exists` above adopted a
-- pre-existing table of a different shape, this raises instead of leaving a half-wired
-- object behind that reads as correctly migrated.
do $$
declare
  v_missing text;
begin
  select string_agg(c.expected, ', ')
    into v_missing
    from (values
      ('channel_id'), ('pending_action'), ('pending_action_action_type'),
      ('pending_action_target_ids'), ('pending_action_source_work_order_id'),
      ('pending_action_expected_confirmation'), ('pending_action_created_at'),
      ('pending_action_expires_at'), ('focus_stack'), ('resolved_entities'),
      ('last_successful_mutation'), ('compacted_summary'), ('compacted_canonical_ids'),
      ('compacted_through_work_order_id'), ('compacted_turn_count'), ('version'),
      ('updated_at')
    ) as c(expected)
   where not exists (
     select 1 from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = 'chat_channel_state'
        and ic.column_name = c.expected
   );
  if v_missing is not null then
    raise exception 'chat_channel_state exists with a different shape; missing column(s): %. Refusing to attach constraints and triggers to a table this migration did not create.', v_missing;
  end if;
end;
$$;

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
-- not merely read visibility.
--
-- R-A1 (DB review round 2) CORRECTED THE STATED REASON. The previous comment justified
-- spelling this out rather than delegating by claiming "SELECT visibility is the WEAKER
-- tier — delegating the way the select policy does would grant writes to every reader."
-- That is FALSE on the live schema: chat_channels_select_scope and
-- chat_channels_write_scope are byte-identical predicates (schema-v0.7-production-core.sql
-- 3272-3287). There is no reader-who-cannot-write on chat_channels today.
--
-- The DECISION to spell it out is still right — it future-proofs against a later widening
-- of the select scope (e.g. a channel-membership model letting any company member read).
-- But it is right for that reason, not the one previously stated. Recording the correction
-- rather than quietly swapping the justification: an author who believed there was a
-- read/write gap that does not exist had an inaccurate model of the surface being extended,
-- and that is the finding.
--
-- The real escalation R-A1 exposed is closed BELOW, not here. Because this tier includes
-- is_company_manager(), a manager of company X could write the state row of ANY channel
-- scoped to company X — including a channel created by the FOUNDER — and plant a
-- pending_action with an 'archive' type and target ids. If the founder then answered a
-- bare "yes", the confirmation would bind to the planted action and execute under FOUNDER
-- authority: manager-tier input, founder-tier execution, by confused deputy. Narrowing
-- this policy alone would not have been enough, because the same columns were also
-- directly writable by the channel's own creator via PostgREST. The trusted columns are
-- therefore made SERVER-ONLY by trigger below, which closes R-A1 and R-A2 together.
-- ROUND 3 / A-3 (P2): the table-tier write policy admitted the company-manager tier
-- (is_company_manager = owner, manager AND team_lead). The reviewer, as a manager of the
-- same company, DELETEd the founder's armed pending action and planted a focus_stack entry
-- in the founder's channel row. A channel's state row belongs to the channel's creator and
-- the founder/admin tier — no manager has a legitimate write into another user's
-- conversation state. The manager branch is removed from both halves of the policy.
-- ROUND 3 / A-4 (P2), ACCEPTED IN WRITING: `version` stays client-writable by design — it is
-- the optimistic-concurrency counter the writer maintains, and with the manager tier gone the
-- only client that can break the CAS on a channel is that channel's own creator, on their own
-- row. That is self-harm, not authority escalation, and is accepted.
-- ROUND 3 / A-5 (P3), recorded: the R-A10 shape guard checks column presence, not types.
drop policy if exists "chat_channel_state_write_scope" on public.chat_channel_state;
create policy "chat_channel_state_write_scope" on public.chat_channel_state for all using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.chat_channels c
    where c.id = chat_channel_state.channel_id
      and c.created_by_profile_id = public.current_profile_id()
  )
) with check (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.chat_channels c
    where c.id = chat_channel_state.channel_id
      and c.created_by_profile_id = public.current_profile_id()
  )
);

-- The Edge Function always acts as the real signed-in user (auth.getUser(), never
-- service-role), so `authenticated` is the only grantee. anon gets NOTHING — stated
-- explicitly rather than left to the default, per the anon-grant sweep discipline
-- (202608310004): revoke is a no-op on a fresh table but survives a future
-- default-privilege change.
revoke all on public.chat_channel_state from anon, public;
grant select, insert, update, delete on public.chat_channel_state to authenticated;

-- =====================================================================================
-- TRUSTED COLUMNS ARE SERVER-ONLY (DB review round 2: closes R-A1 and R-A2)
--
-- R-A2: `last_successful_mutation` is commented "backend-written execution fact, never
-- model prose", and the AI answers "what did you just do" / "undo that" from it. But the
-- grants above plus the write policy let the END USER write that jsonb directly through
-- PostgREST. A user could plant a fabricated mutation that never happened and have it read
-- back as authoritative execution fact. That is the false-execution-claim failure class
-- with the fabrication moved INTO the database — strictly worse than model prose, because
-- the database is the layer this system trusts to CORRECT the model. The same applies to
-- the pending_action_* block (R-A1's confused-deputy plant) and the compaction checkpoint.
--
-- THE RULE ENFORCED HERE: a client may CLEAR trusted state but may never ASSERT it.
-- Clearing cannot fabricate anything — it can only lose state the system will re-derive —
-- so expiry sweeps, "forget this", and the FK's own ON DELETE SET NULL all keep working
-- without any privileged path. Setting a trusted column to a non-null value requires TWO
-- things at once: the transaction-local flag below AND the execution context of a
-- SECURITY DEFINER RPC (current_user = the migration role that owns them).
--
-- ROUND 3 (independent review, A-1, P1): the previous sentence here said the flag was
-- something "only a SECURITY DEFINER RPC can set". That was FALSE as written —
-- app.chat_channel_state_trusted_write is a plain custom GUC in an unreserved namespace and
-- ANY role may set_config() it; the reviewer planted a fabricated last_successful_mutation
-- as `authenticated` in one statement. The flag is therefore no longer the authority. The
-- authority is the execution context (see the guard), which a client cannot forge: a client
-- that raises the flag is still `authenticated` and is refused. The flag is kept only to
-- separate "inside an RPC" from "a superuser's ad-hoc UPDATE" within the trusted context.
-- The reviewer's same-class sweep found the flag-only pattern ALREADY LIVE in five pushed
-- migrations (app.company_lifecycle_rpc, app.task_lifecycle_rpc, app.goal_lifecycle_rpc,
-- 202608290008, 202608300002, 202608290010); that is a live-schema defect class recorded in
-- qa/KNOWN_FAILURE_MODES.md and owed its own migration — not silently folded in here.
--
-- FLAG SCOPING, STATED PRECISELY (the imprecise version of this comment was itself a bug
-- caught while writing it). `set_config(..., is_local => true)` discards the flag at
-- TRANSACTION end — NOT at function end. So it does not leak across transactions, and
-- under PostgREST every RPC call is its own transaction. But inside one transaction it
-- WOULD stay on after the RPC returned, leaving a direct table write in that same
-- transaction trusted. Each RPC therefore turns the flag off explicitly when it is done,
-- and the is_local scoping is the backstop for the path where the write raises and the
-- explicit reset never runs. Neither mechanism alone is sufficient; both are here on
-- purpose. Do not remove the explicit reset as redundant — it is not.
-- =====================================================================================

create or replace function public.chat_channel_state_guard_trusted_columns()
returns trigger
language plpgsql
security invoker           -- deliberately NOT definer: this reads a GUC, never an identity.
set search_path = ''
as $$
declare
  -- ROUND 3 / A-1: the flag alone was forgeable (see the header). `current_user` IS rebound
  -- inside a SECURITY DEFINER function — R-D1 called that the wrong primitive when the
  -- question was "who is the caller"; here the question is "am I running under the
  -- definer's identity", and the rebinding is exactly what answers it. This trigger is
  -- SECURITY INVOKER, so inside one of the three RPCs (owned by the migration role)
  -- current_user is that owner; for a direct client write it is anon/authenticated,
  -- whatever GUC the client has set. Both conditions are required.
  v_trusted boolean := coalesce(
    current_setting('app.chat_channel_state_trusted_write', true), 'off') = 'on'
    and current_user in ('postgres', 'supabase_admin');
  v_asserts boolean;
begin
  if v_trusted then
    return new;
  end if;

  -- An ASSERTION is a trusted column arriving non-null and different from what is already
  -- stored. Nulling, or leaving a value untouched, is not an assertion.
  v_asserts :=
       (new.pending_action is not null
          and new.pending_action is distinct from old.pending_action)
    or (new.pending_action_action_type is not null
          and new.pending_action_action_type is distinct from old.pending_action_action_type)
    or (new.pending_action_target_ids is not null
          and new.pending_action_target_ids is distinct from old.pending_action_target_ids)
    or (new.pending_action_source_work_order_id is not null
          and new.pending_action_source_work_order_id is distinct from old.pending_action_source_work_order_id)
    or (new.pending_action_expected_confirmation is not null
          and new.pending_action_expected_confirmation is distinct from old.pending_action_expected_confirmation)
    or (new.pending_action_created_at is not null
          and new.pending_action_created_at is distinct from old.pending_action_created_at)
    or (new.pending_action_expires_at is not null
          and new.pending_action_expires_at is distinct from old.pending_action_expires_at)
    or (new.last_successful_mutation is not null
          and new.last_successful_mutation is distinct from old.last_successful_mutation)
    or (new.compacted_summary is not null
          and new.compacted_summary is distinct from old.compacted_summary)
    or (new.compacted_through_work_order_id is not null
          and new.compacted_through_work_order_id is distinct from old.compacted_through_work_order_id)
    or (coalesce(new.compacted_turn_count, 0) <> 0
          and coalesce(new.compacted_turn_count, 0) is distinct from coalesce(old.compacted_turn_count, 0))
    or (new.compacted_canonical_ids is not null and new.compacted_canonical_ids <> '[]'::jsonb
          and new.compacted_canonical_ids is distinct from old.compacted_canonical_ids);

  if v_asserts then
    raise exception 'chat_channel_state: pending_action_*, last_successful_mutation and compacted_* are server-written only; use the chat_channel_state RPCs (a client may clear them, never assert them)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- INSERT is guarded by the same rule with an all-null OLD, so a row cannot be BORN holding
-- a fabricated pending action or mutation record either. (The first defect of this class in
-- this repo was an INSERT path that a guard written only for UPDATE never saw.)
create or replace function public.chat_channel_state_guard_trusted_columns_ins()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- ROUND 3 / A-1: the same two-part gate as the UPDATE guard — flag AND definer context.
  if coalesce(current_setting('app.chat_channel_state_trusted_write', true), 'off') = 'on'
     and current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if new.pending_action is not null
     or new.pending_action_action_type is not null
     or new.pending_action_target_ids is not null
     or new.pending_action_source_work_order_id is not null
     or new.pending_action_expected_confirmation is not null
     or new.pending_action_created_at is not null
     or new.pending_action_expires_at is not null
     or new.last_successful_mutation is not null
     or new.compacted_summary is not null
     or new.compacted_through_work_order_id is not null
     or coalesce(new.compacted_turn_count, 0) <> 0
     or coalesce(new.compacted_canonical_ids, '[]'::jsonb) <> '[]'::jsonb then
    raise exception 'chat_channel_state: a row may not be created holding server-written state (pending_action_*, last_successful_mutation, compacted_*); insert the empty row, then use the RPCs'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_channel_state_guard_trusted_ins on public.chat_channel_state;
create trigger chat_channel_state_guard_trusted_ins
  before insert on public.chat_channel_state
  for each row execute function public.chat_channel_state_guard_trusted_columns_ins();

drop trigger if exists chat_channel_state_guard_trusted_upd on public.chat_channel_state;
create trigger chat_channel_state_guard_trusted_upd
  before update on public.chat_channel_state
  for each row execute function public.chat_channel_state_guard_trusted_columns();

-- R-A6: `updated_at` had a default and no trigger, so it fired on INSERT only and silently
-- lied after every UPDATE unless each writer remembered to set it — developer convention,
-- which is exactly what this project's standing pattern rejects in favour of DB
-- enforcement. Explicitly NOT done for `version`: a trigger bumping the version underneath
-- the writer would break the compare-and-set the column exists for.
create or replace function public.chat_channel_state_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chat_channel_state_touch_updated_at on public.chat_channel_state;
create trigger chat_channel_state_touch_updated_at
  before update on public.chat_channel_state
  for each row execute function public.chat_channel_state_touch_updated_at();

-- R-A7: `compacted_through_work_order_id ON DELETE SET NULL` un-anchored the compaction
-- checkpoint silently — the pointer went NULL while compacted_summary, _turn_count and
-- _canonical_ids stayed populated, so the row claimed "N turns are compacted" with no
-- record of through where, and a reader could not tell whether re-compacting would
-- double-count. The checkpoint now invalidates AS A UNIT: lose the anchor, lose the
-- checkpoint, re-compact from the beginning. This trigger fires on the FK's own SET NULL
-- update, and because it only ever NULLS things, the trusted-column guard permits it.
create or replace function public.chat_channel_state_invalidate_unanchored_compaction()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.compacted_through_work_order_id is null and old.compacted_through_work_order_id is not null then
    new.compacted_summary := null;
    new.compacted_turn_count := 0;
    new.compacted_canonical_ids := '[]'::jsonb;
  end if;
  return new;
end;
$$;

-- Name ordering matters: PostgreSQL fires BEFORE triggers in alphabetical order, so this
-- must run before `chat_channel_state_guard_trusted_upd` sees the row. `chat_channel_state_a_`
-- sorts ahead of `chat_channel_state_g`. Do not rename it without re-checking that.
drop trigger if exists chat_channel_state_a_invalidate_compaction on public.chat_channel_state;
create trigger chat_channel_state_a_invalidate_compaction
  before update on public.chat_channel_state
  for each row execute function public.chat_channel_state_invalidate_unanchored_compaction();

-- =====================================================================================
-- THE ONLY WAY TO ASSERT TRUSTED STATE
--
-- Each RPC checks authority itself, raises the transaction-local flag, writes, and lowers
-- the flag again before returning. See the scoping note above the guard trigger for why
-- BOTH the explicit reset and the is_local scoping are needed: is_local alone survives to
-- the end of the TRANSACTION, not the end of the function, so it would leave a direct
-- table write in the same transaction trusted.
--
-- AUTHORITY IS NARROWER HERE THAN THE TABLE'S WRITE POLICY, ON PURPOSE (R-A1). The RLS
-- write tier includes company managers because a manager legitimately maintains channels
-- in their own company. But planting a PENDING DESTRUCTIVE ACTION in a channel someone
-- else will confirm is not maintenance — it is the confused-deputy escalation. So the
-- pending-action writer is the channel's own CREATOR plus founder/admin, and no one else.
-- =====================================================================================

create or replace function public.set_chat_channel_pending_action(
  p_channel_id uuid,
  p_pending_action jsonb,
  p_action_type text,
  p_target_ids jsonb,
  p_expected_confirmation text,
  p_expires_at timestamptz,
  p_source_work_order_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_founder_or_admin()
    or exists (
      select 1 from public.chat_channels c
      where c.id = p_channel_id
        and c.created_by_profile_id = public.current_profile_id()
    )
  ) then
    raise exception 'set_chat_channel_pending_action: only the channel creator or a founder/admin may arm a pending action on channel %', p_channel_id
      using errcode = '42501';
  end if;

  perform set_config('app.chat_channel_state_trusted_write', 'on', true);

  insert into public.chat_channel_state as s (
    channel_id, pending_action, pending_action_action_type, pending_action_target_ids,
    pending_action_expected_confirmation, pending_action_created_at, pending_action_expires_at,
    pending_action_source_work_order_id
  ) values (
    p_channel_id, p_pending_action, p_action_type, p_target_ids,
    p_expected_confirmation, now(), p_expires_at, p_source_work_order_id
  )
  on conflict (channel_id) do update set
    pending_action = excluded.pending_action,
    pending_action_action_type = excluded.pending_action_action_type,
    pending_action_target_ids = excluded.pending_action_target_ids,
    pending_action_expected_confirmation = excluded.pending_action_expected_confirmation,
    pending_action_created_at = excluded.pending_action_created_at,
    pending_action_expires_at = excluded.pending_action_expires_at,
    pending_action_source_work_order_id = excluded.pending_action_source_work_order_id,
    version = s.version + 1;

  perform set_config('app.chat_channel_state_trusted_write', 'off', true);
end;
$$;

-- Recording what actually executed. This is the column the AI answers "what did you just
-- do" from, so it is the single most important one to keep un-forgeable (R-A2).
-- ROUND 3 / A-2 (P2), SCOPE STATED: "un-forgeable" means un-forgeable BY OTHER USERS. The
-- channel's own creator (which is what the Edge Function is, acting as the signed-in user)
-- can record a mutation claim this RPC does not verify against any execution record; the
-- database checks WHO writes, not WHETHER it happened. Closing that requires an execution
-- evidence source to verify against (the work_orders execution record), which is a separate
-- change. Until then this column is trusted against cross-user forgery only. Accepted in
-- writing for this migration.
create or replace function public.record_chat_channel_mutation(
  p_channel_id uuid,
  p_mutation jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_founder_or_admin()
    or exists (
      select 1 from public.chat_channels c
      where c.id = p_channel_id
        and c.created_by_profile_id = public.current_profile_id()
    )
  ) then
    raise exception 'record_chat_channel_mutation: not authorized for channel %', p_channel_id
      using errcode = '42501';
  end if;

  perform set_config('app.chat_channel_state_trusted_write', 'on', true);

  insert into public.chat_channel_state as s (channel_id, last_successful_mutation)
  values (p_channel_id, p_mutation)
  on conflict (channel_id) do update set
    last_successful_mutation = excluded.last_successful_mutation,
    version = s.version + 1;

  perform set_config('app.chat_channel_state_trusted_write', 'off', true);
end;
$$;

create or replace function public.set_chat_channel_compaction(
  p_channel_id uuid,
  p_summary text,
  p_canonical_ids jsonb,
  p_through_work_order_id uuid,
  p_turn_count integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_founder_or_admin()
    or exists (
      select 1 from public.chat_channels c
      where c.id = p_channel_id
        and c.created_by_profile_id = public.current_profile_id()
    )
  ) then
    raise exception 'set_chat_channel_compaction: not authorized for channel %', p_channel_id
      using errcode = '42501';
  end if;
  -- The anchor is what makes the checkpoint meaningful (R-A7). A summary without one is
  -- the un-anchored state the invalidation trigger exists to prevent, so refuse to create
  -- it deliberately in the first place.
  if p_summary is not null and p_through_work_order_id is null then
    raise exception 'set_chat_channel_compaction: a compaction summary requires its through-work-order anchor'
      using errcode = '23514';
  end if;

  perform set_config('app.chat_channel_state_trusted_write', 'on', true);

  insert into public.chat_channel_state as s (
    channel_id, compacted_summary, compacted_canonical_ids,
    compacted_through_work_order_id, compacted_turn_count
  ) values (
    p_channel_id, p_summary, coalesce(p_canonical_ids, '[]'::jsonb),
    p_through_work_order_id, coalesce(p_turn_count, 0)
  )
  on conflict (channel_id) do update set
    compacted_summary = excluded.compacted_summary,
    compacted_canonical_ids = excluded.compacted_canonical_ids,
    compacted_through_work_order_id = excluded.compacted_through_work_order_id,
    compacted_turn_count = excluded.compacted_turn_count,
    version = s.version + 1;

  perform set_config('app.chat_channel_state_trusted_write', 'off', true);
end;
$$;

revoke execute on function public.set_chat_channel_pending_action(uuid, jsonb, text, jsonb, text, timestamptz, uuid) from anon, public;
revoke execute on function public.record_chat_channel_mutation(uuid, jsonb) from anon, public;
revoke execute on function public.set_chat_channel_compaction(uuid, text, jsonb, uuid, integer) from anon, public;
grant execute on function public.set_chat_channel_pending_action(uuid, jsonb, text, jsonb, text, timestamptz, uuid) to authenticated;
grant execute on function public.record_chat_channel_mutation(uuid, jsonb) to authenticated;
grant execute on function public.set_chat_channel_compaction(uuid, text, jsonb, uuid, integer) to authenticated;

-- ROUND 3 / A-6 (P3): PostgreSQL grants EXECUTE to PUBLIC on every new function by default,
-- so the four trigger functions above were callable-in-principle by anon/PUBLIC, contradicting
-- the anon-grant sweep this file invokes. Not exploitable (a trigger function refuses a direct
-- call, SQLSTATE 0A000) — revoked anyway, because the same create-or-replace shape will not
-- always be a trigger function.
revoke execute on function public.chat_channel_state_guard_trusted_columns() from public, anon, authenticated;
revoke execute on function public.chat_channel_state_guard_trusted_columns_ins() from public, anon, authenticated;
revoke execute on function public.chat_channel_state_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.chat_channel_state_invalidate_unanchored_compaction() from public, anon, authenticated;

commit;

-- ROLLBACK STRATEGY (for the reviewer; not executed by this file):
--   This migration is purely ADDITIVE — one new table plus its own triggers and RPCs, no
--   changes to any existing object, no data migration. Rollback is
--   `drop table public.chat_channel_state cascade;` plus dropping the three RPCs, with
--   zero effect on any existing feature.
--
--   R-A5 CORRECTION. The previous text said "the application code is written to treat the
--   table's absence as 'no durable state' (see web/Edge integration notes)". THERE IS NO
--   SUCH CODE AND NO SUCH FEATURE GATE. A repo-wide search for `chat_channel_state`
--   returns only this migration, a comment reference in 202609020003, the acceptance SQL,
--   and review records. Zero application code, in web/ or supabase/functions/.
--
--   The rollback IS safe, but for the OPPOSITE reason to the one claimed: nothing reads
--   the table because no reader exists, not because a gate handles its absence.
--
--   WHAT THE FOUNDER MUST BE TOLD PLAINLY BEFORE AUTHORIZING THIS PUSH: applying this
--   migration closes NONE of issue #5 Classes A/C/D/E and delivers NO behaviour change.
--   Expiry is "enforced by the READER" and there is no reader; null-source-means-expired
--   is a reader obligation and there is no reader. This is a schema down-payment and
--   inert storage until the Edge Function is written against it. It should be authorized
--   on that basis or not at all — not as a fix.
