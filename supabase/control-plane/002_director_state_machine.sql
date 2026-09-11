-- THE DIRECTOR STATE MACHINE.
--
-- WHY THIS EXISTS, stated as the defect it closes: the Factory had no durable component that decided WHAT
-- TO DO NEXT. Nodes could claim work, hold leases, heartbeat and checkpoint — all of that already worked —
-- but the thing that reconciled a work order, read a finished verifier's artifact and created the next run
-- was a person in a chat window. So the founder had to type "KEEP WORKING" for the Factory to take its
-- next step, which makes the founder the heartbeat. That is the defect.
--
-- `factory.work_orders.status` is the orchestration projection of the business work order and stays as it
-- is. It is too coarse to drive a loop: `in_progress` cannot tell "an agent is writing code" from "a
-- verifier is running" from "the last run died and its lease has not expired yet", and those three need
-- different next actions. So the DIRECTOR state lives in its own column, with its own vocabulary, and the
-- two are kept deliberately separate rather than one being overloaded into the other.
--
-- EVERY TRANSITION IS DRIVEN BY DURABLE EVIDENCE. The columns below record WHAT the director saw and WHEN,
-- so a restarted director reaches the same conclusion from the same rows, and a human can audit why a work
-- order moved without reading a transcript.

begin;

-- ---------------------------------------------------------------------------------------------------
-- THE STATE.  Separate from `status`, because they answer different questions.
-- ---------------------------------------------------------------------------------------------------
alter table factory.work_orders
  add column if not exists director_state text not null default 'queued'
    check (director_state in (
      'queued',               -- nothing has started; runnable when dependencies and surfaces allow
      'running',              -- the director is mid-decision on this order
      'waiting_for_agent',    -- an implementation run is out; its lease is the liveness signal
      'waiting_for_verifier', -- an independent verifier is out; its ARTIFACT is the completion signal
      'repair_required',      -- a verifier FAILED and the repair has not been dispatched yet
      'retryable',            -- a transient failure: provider capacity, a dead process, an expired lease
      'blocked_founder',      -- only a founder action can advance it; nothing else here can
      'blocked_external',     -- an external dependency (a database, a provider account) is missing
      'completed',
      'failed_terminal'       -- no retry can change the outcome
    )),
  -- ONE next action, in words, derived rather than remembered. A list is how a resumption picks the easy
  -- item; a sentence is what a fresh model run can be handed without a transcript.
  add column if not exists next_action text,
  -- WHY it is blocked, when it is. Never a provider string; a reason a founder can act on.
  add column if not exists blocked_reason text,
  -- THE EVIDENCE THE LAST TRANSITION WAS MADE FROM. A restarted director re-derives; this is the audit.
  add column if not exists last_evidence text,
  add column if not exists last_evidence_at timestamptz,
  -- Which director process last moved it, so two directors racing is visible rather than silent.
  add column if not exists director_node_id text,
  add column if not exists director_state_at timestamptz not null default now(),
  -- How many times a RETRYABLE state has been re-entered. A retry that never stops is a loop, not a retry.
  add column if not exists retry_count integer not null default 0,
  -- The handler that knows how to evaluate this kind of work. Unknown kinds are left alone rather than
  -- guessed at: a director that invents a next action for work it does not understand is worse than idle.
  add column if not exists handler text not null default 'unknown';

create index if not exists work_orders_director_state_idx
  on factory.work_orders (director_state, priority);

-- ---------------------------------------------------------------------------------------------------
-- FOUNDER NOTIFICATIONS.  One row per genuine boundary, and the director is the only writer.
--
-- The contract is explicit about what a notification may contain and what it may never be: it must name
-- the work order, why it is blocked, the exact action required, and WHAT CONTINUES WITHOUT THE FOUNDER.
-- It must never be "keep going?" — a question the Factory can answer itself is not a boundary.
-- ---------------------------------------------------------------------------------------------------
create table if not exists factory.founder_notifications (
  notification_id  uuid primary key default gen_random_uuid(),
  work_order_id    uuid not null references factory.work_orders(work_order_id) on delete cascade,
  -- The four fields the contract names. NOT NULL on all of them, so an empty notification is
  -- unrepresentable rather than merely discouraged.
  why_blocked      text not null,
  exact_action     text not null,
  what_continues   text not null,
  raised_at        timestamptz not null default now(),
  -- Cleared by the director when the boundary is gone, never by asking.
  resolved_at      timestamptz,
  -- One live notification per work order: re-raising the same boundary every poll is how a real one gets
  -- ignored. The partial unique index makes the duplicate impossible rather than merely unlikely.
  constraint founder_notifications_fields_nonempty
    check (length(btrim(why_blocked)) > 0 and length(btrim(exact_action)) > 0
           and length(btrim(what_continues)) > 0)
);

create unique index if not exists founder_notifications_one_live_per_order
  on factory.founder_notifications (work_order_id)
  where resolved_at is null;

-- ---------------------------------------------------------------------------------------------------
-- THE DIRECTOR'S OWN LEASE.  Process lifetime != work order lifetime, and it must also be true that
-- DIRECTOR lifetime != work order lifetime. Two directors on two machines must not both dispatch.
-- ---------------------------------------------------------------------------------------------------
create table if not exists factory.director_lease (
  -- A single row. The primary key is a constant so a second row cannot exist.
  only_one         boolean primary key default true check (only_one),
  node_id          text not null,
  acquired_at      timestamptz not null default now(),
  heartbeat_at     timestamptz not null default now(),
  lease_seconds    integer not null default 60
);

commit;
