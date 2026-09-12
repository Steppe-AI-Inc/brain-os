-- FACTORY CONTROL PLANE — ORCHESTRATION STATE ONLY, ON A NON-PRODUCTION DATABASE
--
-- THE ONE DESIGN DECISION IN THIS FILE, AND WHY IT IS NOT A SECOND FACTORY.
--
-- The directive says two things that pull against each other, and both are right:
--
--   "Do not create a second Software Factory. Audit and extend the existing canonical_work_orders,
--    agent_runs, scheduler.mjs, supervisor.mjs, poll-and-dispatch.mjs ..."
--   "The eventual shared Factory Control Plane DB is NON-PRODUCTION ... generic nodes must not obtain
--    Brain OS production-write authority."
--
-- They pull apart because `public.canonical_work_orders` and `public.agent_runs` are PRODUCTION tables:
-- they carry foreign keys into companies, goals, people, profiles and agents. A generic node that could
-- write them would hold exactly the authority the directive forbids, and a control plane that contained
-- them would not be non-production.
--
-- There is only one way to satisfy both, and this is it: the control plane holds the ORCHESTRATION columns
-- — the ones scheduler.mjs and supervisor.mjs actually read and write — keyed by the SAME identifiers, with
-- every production foreign key replaced by a plain identifier column. Same table names, same column names,
-- same status vocabulary, same scripts. What is dropped is the coupling, not the model.
--
-- So `work_order_id` here is the id of a business work order that lives in production. It is a reference BY
-- VALUE. A node schedules against it, claims it, leases it, checkpoints it and reports on it, and at no
-- point can it read or write the business row. Whatever eventually reconciles orchestration state back into
-- the product is a separate, authorised path — a release broker with a founder manifest — not a factory
-- worker.
--
-- EVERY COLUMN BELOW EXISTS TODAY, except the ones marked NEW. The existing ones are copied from
-- 202608290002_canonical_work_order_model.sql, 202608290010_agent_run_completion.sql and
-- 202609030001_agent_run_capacity_retry.sql so the projection is faithful rather than reinvented.

begin;

create schema if not exists factory;

-- ---------------------------------------------------------------------------------------------------
-- NODES.  A node is a computer running the generic bootstrap. It is identified by what it can DO, never
-- by which desk it sits on: there is no Home-PC / Work-PC column here and there must never be one.
-- ---------------------------------------------------------------------------------------------------
create table if not exists factory.nodes (
  node_id            text primary key,
  -- Free-form capability tags the director schedules on: 'edge-verify', 'db-migrate', 'browser', ...
  capabilities       jsonb        not null default '[]'::jsonb,
  -- A security role, so a node without production authority is never handed work that needs it.
  security_role      text         not null default 'generic'
                     check (security_role in ('generic','verifier','release_broker')),
  platform           text,
  registered_at      timestamptz  not null default now(),
  last_heartbeat_at  timestamptz  not null default now(),
  -- The node reports this; nothing here trusts it for authority decisions.
  agent_version      text
);

-- ---------------------------------------------------------------------------------------------------
-- WORK ORDERS.  The orchestration projection of public.canonical_work_orders.
-- ---------------------------------------------------------------------------------------------------
create table if not exists factory.work_orders (
  -- Same id as the business work order in production. A value, not a foreign key.
  work_order_id      uuid primary key,
  title              text         not null,
  work_type          text         not null default 'software_development',
  status             text         not null default 'queued'
                     check (status in ('queued','claimed','in_progress','blocked','review','done','failed')),
  priority           text         not null default 'medium',
  risk_level         text         not null default 'low',
  -- NEW. The surface this work order will write. Two work orders whose surfaces intersect may not run
  -- concurrently; see factory.surface_locks.
  owned_surface      text[]       not null default '{}',
  -- NEW. GitHub is the durable recovery truth: everything needed to reconstruct this work order from the
  -- repository alone is recorded here, so losing this database costs orchestration state and not history.
  branch             text,
  base_commit        text,
  latest_commit      text,
  candidate_sha      text,
  release_manifest   text,
  handoff            text,
  -- NEW. What a node must BE and must HAVE to take this work.
  --
  -- These were recorded and unenforced, which is worse than absent: a reader sees `release_broker` in
  -- the schema and concludes a generic node cannot take release work. Now the claiming query enforces
  -- both, and an unschedulable work order WAITS rather than being handed to a node that cannot do it.
  requires_security_role text not null default 'generic'
                     check (requires_security_role in ('generic','verifier','release_broker')),
  requires_capabilities  text[] not null default '{}'::text[],
  created_at         timestamptz  not null default now(),
  updated_at         timestamptz  not null default now(),
  completed_at       timestamptz
);

-- Dependencies between work orders. A work order is eligible only when every dependency is done.
create table if not exists factory.work_order_dependencies (
  work_order_id      uuid not null references factory.work_orders(work_order_id) on delete cascade,
  depends_on         uuid not null references factory.work_orders(work_order_id) on delete cascade,
  primary key (work_order_id, depends_on),
  check (work_order_id <> depends_on)
);

-- ---------------------------------------------------------------------------------------------------
-- RUNS.  The orchestration projection of public.agent_runs.
-- ---------------------------------------------------------------------------------------------------
create table if not exists factory.agent_runs (
  run_id                  uuid primary key default gen_random_uuid(),
  work_order_id           uuid         not null references factory.work_orders(work_order_id) on delete cascade,
  -- NEW. Which node owns this run. The lease below is what makes ownership recoverable.
  node_id                 text         references factory.nodes(node_id) on delete set null,
  status                  text         not null default 'queued'
                          check (status in ('queued','in_progress','blocked','done','failed')),
  execution_provider      text         not null default 'claude_code_background',
  provider_run_id         text,
  requested_provider      text,
  requested_model         text,
  actual_provider         text,
  -- Existing orchestration columns, carried over verbatim in name and meaning.
  branch                  text,
  base_commit             text,
  head_commit             text,
  source_sha              text,
  worktree                text,
  checkpoint_location     text,
  last_completed_scenario text,
  remaining_scenarios     jsonb,
  verification_campaign_id text,
  attempt_count           integer      not null default 1,
  retry_after             timestamptz,
  blocked_at              timestamptz,
  blocked_reason          text,
  summary                 text,
  error                   text,
  verification_status     text check (verification_status in ('pending','live_verified','e2e_verified','failed','blocked')),
  -- NEW. The lease. A run is owned only while its lease is in the future; an expired lease is recoverable
  -- by any eligible node, which is what makes NODE LIFETIME != WORK ORDER LIFETIME true rather than hoped.
  lease_expires_at        timestamptz,
  last_heartbeat_at       timestamptz,
  -- NEW. Authority belongs to run provenance, not to computer names.
  authoring_run_id        uuid,
  authoring_node_id       text,
  verification_run_id     uuid,
  verification_node_id    text,
  started_at              timestamptz,
  finished_at             timestamptz,
  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now(),
  -- THE INDEPENDENCE INVARIANT, ENFORCED BY THE DATABASE RATHER THAN BY A CONVENTION.
  -- A run may not be its own verification, and for high-assurance acceptance the verifying node may not be
  -- the authoring node. Written as a constraint because "we always dispatch the verifier separately" is a
  -- habit, and a habit is not an invariant.
  constraint verification_is_independent
    check (verification_run_id is null or authoring_run_id is null or verification_run_id <> authoring_run_id),
  constraint verification_node_is_independent
    check (verification_node_id is null or authoring_node_id is null
           or verification_node_id <> authoring_node_id)
);

create index if not exists agent_runs_claimable
  on factory.agent_runs (status, retry_after) where status in ('queued', 'blocked');
create index if not exists agent_runs_by_work_order
  on factory.agent_runs (work_order_id);

-- ---------------------------------------------------------------------------------------------------
-- SURFACE LOCKS.  Only one active writer may own a conflicting surface.
-- The primary key IS the enforcement: two runs cannot hold the same surface, and the database says so
-- rather than the scheduler remembering to check.
-- ---------------------------------------------------------------------------------------------------
create table if not exists factory.surface_locks (
  surface            text primary key,
  run_id             uuid         not null references factory.agent_runs(run_id) on delete cascade,
  node_id            text,
  acquired_at        timestamptz  not null default now(),
  lease_expires_at   timestamptz  not null
);

-- ---------------------------------------------------------------------------------------------------
-- CHECKPOINTS.  Durable progress, so a killed process resumes rather than restarts.
-- ---------------------------------------------------------------------------------------------------
create table if not exists factory.checkpoints (
  checkpoint_id      uuid primary key default gen_random_uuid(),
  run_id             uuid         not null references factory.agent_runs(run_id) on delete cascade,
  work_order_id      uuid         not null references factory.work_orders(work_order_id) on delete cascade,
  -- Where the real artifact lives. The row is a pointer; the evidence is in the repository.
  location           text         not null,
  scenario           text,
  payload            jsonb        not null default '{}'::jsonb,
  created_at         timestamptz  not null default now()
);

create index if not exists checkpoints_by_run on factory.checkpoints (run_id, created_at desc);

-- ---------------------------------------------------------------------------------------------------
-- PER-RUN ACCOUNTING, AND NO SILENT SUBSTITUTION.
--
-- The founder's standing requirement for every agent run: requested_provider, requested_model,
-- actual_provider, actual_model, reasoning_effort, input/cached/output tokens, estimated cost,
-- termination_reason, checkpoint and candidate SHA. "NO SILENT MODEL FALLBACK. HTTP SUCCESS != VALID
-- COMPLETED RUN."
--
-- factory.agent_runs above carried requested_provider, requested_model and actual_provider - and NOT
-- actual_model, and not fallback_reason. So the control plane could not EXPRESS a model substitution at
-- all, let alone refuse a silent one, while the production table's migration 202609030001 has carried
-- both columns and both constraints since it was written. The guarantee existed on the table the Factory
-- does not use and was absent from the one it will.
--
-- ALTER, NOT A CHANGE TO THE CREATE ABOVE, deliberately: `create table if not exists` is a no-op against
-- an existing database, so editing the column list would converge a fresh server and silently skip every
-- server that already ran this file. An idempotent alter converges both.
alter table factory.agent_runs add column if not exists actual_model     text;
alter table factory.agent_runs add column if not exists fallback_reason  text;
-- Effort is part of the request, and a run served at a different effort than asked for is as much a
-- substitution as a different model; it is recorded so the comparison is possible at all.
alter table factory.agent_runs add column if not exists reasoning_effort text;
alter table factory.agent_runs add column if not exists input_tokens     bigint;
alter table factory.agent_runs add column if not exists cached_tokens    bigint;
alter table factory.agent_runs add column if not exists output_tokens    bigint;
-- The cost is an ESTIMATE and the column name says so. A figure derived from a published price list is
-- not an invoice, and a column called `cost_usd` would invite being read as one.
alter table factory.agent_runs add column if not exists estimated_cost_usd numeric(12, 6);
-- THE TERMINAL CONDITION THAT WAS ACTUALLY OBSERVED, or the absence of one. This is the field that makes
-- "HTTP success is not a completed run" recordable: a stream that returned headers and never terminated
-- has a termination_reason of stream_never_terminated, not a status of done.
alter table factory.agent_runs add column if not exists termination_reason text;

-- A SUBSTITUTION MAY NOT BE RECORDED WITHOUT A STATED REASON. The same two constraints the production
-- migration carries, with the same shape and the same known boundary: they can only compare against a
-- requested_* that is present, so writing requested_* BEFORE the call is what makes them bite. That is
-- application work and it is not something a check can do - stated here so the boundary is not mistaken
-- for coverage.
alter table factory.agent_runs drop constraint if exists agent_runs_no_silent_provider_fallback;
alter table factory.agent_runs add constraint agent_runs_no_silent_provider_fallback check (
  actual_provider is null
  or requested_provider is null
  or actual_provider = requested_provider
  or fallback_reason is not null
);
alter table factory.agent_runs drop constraint if exists agent_runs_no_silent_model_fallback;
alter table factory.agent_runs add constraint agent_runs_no_silent_model_fallback check (
  actual_model is null
  or requested_model is null
  or actual_model = requested_model
  or fallback_reason is not null
);

-- A FINISHED RUN MUST SAY HOW IT FINISHED. `done` and `failed` are the two statuses that claim a terminal
-- outcome, and a terminal outcome with no observed terminal condition is the exact shape of the 2026-08-24
-- OpenAI defect: HTTP 200, headers returned, body never terminated, eight attempts recorded as nothing in
-- particular. The queued/in_progress/blocked statuses are deliberately exempt - they make no such claim.
alter table factory.agent_runs drop constraint if exists agent_runs_terminal_status_states_its_reason;
alter table factory.agent_runs add constraint agent_runs_terminal_status_states_its_reason check (
  status not in ('done', 'failed')
  or termination_reason is not null
);

commit;
