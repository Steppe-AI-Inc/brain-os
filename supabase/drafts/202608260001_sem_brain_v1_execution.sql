-- SEM Brain v1 execution core - REVIEW DRAFT ONLY.
-- Phase 0 artifact. This file intentionally lives outside supabase/migrations.
-- Validate against an isolated database; do not apply to production before architecture review.
--
-- Conceptual hierarchy:
-- GOAL -> WORK ORDER -> STEP/TASK -> EXECUTION -> QA -> OUTCOME

begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.v1_policy_effect as enum ('allow', 'approve', 'deny');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.v1_resolution_state as enum ('unresolved', 'resolved', 'ambiguous');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.v1_execution_status as enum (
    'queued',
    'running',
    'awaiting_approval',
    'awaiting_clarification',
    'succeeded',
    'failed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.v1_qa_status as enum ('pending', 'passed', 'failed', 'waived');
exception when duplicate_object then null; end $$;

-- Preserve the existing goal/work-order/task concepts and connect them explicitly.
alter table public.work_orders
  add column if not exists goal_id uuid references public.goals(id) on delete set null,
  add column if not exists parent_work_order_id uuid references public.work_orders(id) on delete set null,
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists source_kind text not null default 'founder_command',
  add column if not exists source_event_id text,
  add column if not exists idempotency_key text,
  add column if not exists execution_status public.v1_execution_status not null default 'queued';

create unique index if not exists work_orders_creator_idempotency_uidx
  on public.work_orders (created_by_profile_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists work_orders_goal_idx on public.work_orders (goal_id);
create index if not exists work_orders_correlation_idx on public.work_orders (correlation_id);

alter table public.tasks
  add column if not exists goal_id uuid references public.goals(id) on delete set null,
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null,
  add column if not exists execution_order integer;

create index if not exists tasks_goal_idx on public.tasks (goal_id);
create index if not exists tasks_work_order_idx on public.tasks (work_order_id);

create table if not exists public.work_order_steps (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  task_id uuid unique references public.tasks(id) on delete set null,
  step_key text not null,
  title text not null,
  description text,
  sequence_no integer not null,
  status public.v1_execution_status not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  expected_output jsonb not null default '{}'::jsonb,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  attempt_limit integer not null default 3 check (attempt_limit between 1 and 20),
  next_attempt_no integer not null default 1 check (next_attempt_no >= 1),
  resume_after timestamptz,
  locked_by text,
  locked_until timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, step_key),
  unique (work_order_id, sequence_no)
);

create index if not exists work_order_steps_ready_idx
  on public.work_order_steps (status, resume_after, locked_until)
  where status in ('queued', 'running');

alter table public.tasks
  add column if not exists work_order_step_id uuid references public.work_order_steps(id) on delete set null;

create table if not exists public.work_order_step_dependencies (
  step_id uuid not null references public.work_order_steps(id) on delete cascade,
  depends_on_step_id uuid not null references public.work_order_steps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (step_id, depends_on_step_id),
  check (step_id <> depends_on_step_id)
);

-- Models persist mentions, never invented IDs. The constraint encodes the exact rule:
-- zero matches = unresolved; one = resolved with a verified ID; more than one = ambiguous.
create table if not exists public.entity_references (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  step_id uuid references public.work_order_steps(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  mention_text text not null,
  expected_entity_type text not null,
  resolution_state public.v1_resolution_state not null,
  match_count integer not null check (match_count >= 0),
  resolved_entity_id uuid,
  candidate_entity_ids uuid[] not null default '{}',
  resolution_source text,
  resolved_by_profile_id uuid references public.profiles(id),
  resolved_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (resolution_state = 'unresolved' and match_count = 0 and resolved_entity_id is null)
    or
    (resolution_state = 'resolved' and match_count = 1 and resolved_entity_id is not null)
    or
    (resolution_state = 'ambiguous' and match_count > 1 and resolved_entity_id is null)
  )
);

create index if not exists entity_references_work_order_idx
  on public.entity_references (work_order_id, resolution_state);
-- Policy evaluation is data-driven. The orchestrator may suggest a policy result,
-- but the backend must store the matched rule and enforce allow/approve/deny.
create or replace function public.sem_canonical_jsonb(value jsonb)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select value::text;
$$;

create table if not exists public.approval_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  action_type_pattern text not null,
  domain public.approval_domain not null default 'general',
  effect public.v1_policy_effect not null,
  required_role public.app_role,
  conditions jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  active boolean not null default true,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists approval_policies_scope_name_uidx
  on public.approval_policies (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- A catch-all deny rule guarantees that every action can bind to a policy even before
-- company-specific rules are configured. Lower numeric priority wins during matching.
insert into public.approval_policies (
  company_id, name, action_type_pattern, effect, priority
) values (
  null, 'Global default deny', '*', 'deny', 2147483647
)
on conflict (
  (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  name
) do nothing;

create table if not exists public.action_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  step_id uuid references public.work_order_steps(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  action_type text not null,
  integration text,
  payload jsonb not null,
  payload_hash bytea generated always as (
    digest(public.sem_canonical_jsonb(payload), 'sha256')
  ) stored,
  required_entity_count integer not null default 0 check (required_entity_count >= 0),
  matched_policy_id uuid not null references public.approval_policies(id) on delete restrict,
  policy_effect public.v1_policy_effect not null,
  status text not null default 'draft' check (
    status in ('draft', 'pending_approval', 'approved', 'ready', 'executing', 'succeeded', 'failed', 'cancelled')
  ),
  idempotency_key text not null,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, idempotency_key)
);

create table if not exists public.action_request_entity_references (
  action_request_id uuid not null references public.action_requests(id) on delete cascade,
  entity_reference_id uuid not null references public.entity_references(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (action_request_id, entity_reference_id)
);

create or replace function public.sem_validate_action_entity_reference()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_action_work_order uuid;
  v_reference_work_order uuid;
  v_resolution public.v1_resolution_state;
begin
  select work_order_id into v_action_work_order
  from public.action_requests
  where id = new.action_request_id;

  select work_order_id, resolution_state
  into v_reference_work_order, v_resolution
  from public.entity_references
  where id = new.entity_reference_id;

  if v_action_work_order is distinct from v_reference_work_order then
    raise exception 'Entity reference belongs to a different work order';
  end if;

  if v_resolution <> 'resolved' then
    raise exception 'Only database-resolved entity references may enter an action';
  end if;

  return new;
end;
$$;

drop trigger if exists action_entity_reference_guard on public.action_request_entity_references;
create trigger action_entity_reference_guard
before insert or update on public.action_request_entity_references
for each row execute function public.sem_validate_action_entity_reference();

create or replace function public.sem_protect_action_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resolved_count integer;
  v_policy_company_id uuid;
  v_policy_effect public.v1_policy_effect;
  v_policy_active boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Action requests are append-oriented and cannot be deleted';
  end if;

  select company_id, effect, active
  into v_policy_company_id, v_policy_effect, v_policy_active
  from public.approval_policies
  where id = new.matched_policy_id;

  if v_policy_effect is null or not v_policy_active then
    raise exception 'Action request must bind to an active approval policy';
  end if;

  if v_policy_effect <> new.policy_effect then
    raise exception 'Action policy effect does not match the bound policy';
  end if;

  if v_policy_company_id is not null and v_policy_company_id is distinct from new.company_id then
    raise exception 'Action and approval policy company scopes do not match';
  end if;

  if tg_op = 'UPDATE' and (
    new.payload is distinct from old.payload
    or new.action_type is distinct from old.action_type
    or new.integration is distinct from old.integration
    or new.work_order_id is distinct from old.work_order_id
    or new.step_id is distinct from old.step_id
    or new.task_id is distinct from old.task_id
    or new.required_entity_count is distinct from old.required_entity_count
    or new.matched_policy_id is distinct from old.matched_policy_id
    or new.policy_effect is distinct from old.policy_effect
    or new.idempotency_key is distinct from old.idempotency_key
  ) then
    raise exception 'Canonical action payload and policy binding are immutable; create a new action request';
  end if;

  if new.status in ('approved', 'ready', 'executing', 'succeeded') then
    select count(*) into v_resolved_count
    from public.action_request_entity_references
    where action_request_id = new.id;

    if v_resolved_count <> new.required_entity_count then
      raise exception 'Action entity resolution is incomplete';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists action_request_payload_guard on public.action_requests;
create trigger action_request_payload_guard
before insert or update or delete on public.action_requests
for each row execute function public.sem_protect_action_payload();

-- Existing approvals remain available for legacy records. New v1 approvals bind to
-- exactly one immutable action request and copy its canonical payload hash.
alter table public.approvals
  add column if not exists action_request_id uuid references public.action_requests(id) on delete restrict,
  add column if not exists approval_policy_id uuid references public.approval_policies(id) on delete restrict,
  add column if not exists approved_payload_hash bytea;

create unique index if not exists approvals_action_request_uidx
  on public.approvals (action_request_id)
  where action_request_id is not null;

create or replace function public.sem_bind_approval_payload()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payload jsonb;
  v_hash bytea;
  v_policy_id uuid;
begin
  if tg_op = 'UPDATE' and old.action_request_id is not null and (
    new.action_request_id is distinct from old.action_request_id
    or new.approved_payload_hash is distinct from old.approved_payload_hash
    or new.approval_payload is distinct from old.approval_payload
    or new.approval_policy_id is distinct from old.approval_policy_id
  ) then
    raise exception 'Approval payload binding is immutable; create a new approval';
  end if;

  if new.action_request_id is not null then
    select payload, payload_hash, matched_policy_id
    into v_payload, v_hash, v_policy_id
    from public.action_requests
    where id = new.action_request_id;

    if v_hash is null then
      raise exception 'Action request not found';
    end if;

    new.approval_payload := v_payload;
    new.approved_payload_hash := v_hash;
    new.approval_policy_id := v_policy_id;
  end if;

  return new;
end;
$$;

drop trigger if exists approval_payload_binding_guard on public.approvals;
create trigger approval_payload_binding_guard
before insert or update on public.approvals
for each row execute function public.sem_bind_approval_payload();

create table if not exists public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public.approvals(id) on delete restrict,
  action_request_id uuid not null references public.action_requests(id) on delete restrict,
  payload_hash bytea not null,
  decision public.approval_status not null check (
    decision in ('approved', 'rejected', 'changes_requested', 'cancelled')
  ),
  decided_by_profile_id uuid not null references public.profiles(id),
  decision_notes text,
  decided_at timestamptz not null default now()
);
create or replace function public.sem_can_decide_approval(p_approval_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_approver_profile_id uuid;
  v_domain public.approval_domain;
  v_required_role public.app_role;
begin
  select a.company_id, a.approver_profile_id, a.domain, p.required_role
  into v_company_id, v_approver_profile_id, v_domain, v_required_role
  from public.approvals a
  left join public.approval_policies p on p.id = a.approval_policy_id
  where a.id = p_approval_id;

  return public.is_founder_or_admin()
    or v_approver_profile_id = public.current_profile_id()
    or (v_required_role is not null and v_required_role = public.current_role())
    or (v_domain in ('salary_hr', 'finance') and public.is_hr_finance())
    or (
      v_domain in ('general', 'production', 'external_comms')
      and v_company_id is not null
      and public.is_company_manager(v_company_id)
    );
end;
$$;

revoke all on function public.sem_can_decide_approval(uuid) from public, anon;
grant execute on function public.sem_can_decide_approval(uuid) to authenticated;

create or replace function public.sem_validate_approval_decision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_action_request_id uuid;
  v_expected_hash bytea;
  v_effect public.v1_policy_effect;
begin
  if new.decided_by_profile_id <> public.current_profile_id() then
    raise exception 'Approval decision actor must be the authenticated profile';
  end if;

  if not public.sem_can_decide_approval(new.approval_id) then
    raise exception 'Caller is not authorized by the matched approval policy';
  end if;

  select a.action_request_id, a.approved_payload_hash, r.policy_effect
  into v_action_request_id, v_expected_hash, v_effect
  from public.approvals a
  join public.action_requests r on r.id = a.action_request_id
  where a.id = new.approval_id;

  if v_action_request_id is null or v_action_request_id <> new.action_request_id then
    raise exception 'Decision does not match the approval action';
  end if;

  if v_expected_hash is null or v_expected_hash <> new.payload_hash then
    raise exception 'Approval payload hash mismatch; changed actions require a new approval';
  end if;

  if new.decision = 'approved' and v_effect = 'deny' then
    raise exception 'A deny policy cannot be overridden by an approval decision';
  end if;

  return new;
end;
$$;

create or replace function public.sem_reject_append_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

drop trigger if exists approval_decision_validate on public.approval_decisions;
create trigger approval_decision_validate
before insert on public.approval_decisions
for each row execute function public.sem_validate_approval_decision();

drop trigger if exists approval_decision_immutable on public.approval_decisions;
create trigger approval_decision_immutable
before update or delete on public.approval_decisions
for each row execute function public.sem_reject_append_mutation();

create table if not exists public.execution_attempts (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  step_id uuid references public.work_order_steps(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  action_request_id uuid references public.action_requests(id) on delete restrict,
  attempt_no integer not null check (attempt_no >= 1),
  executor_kind text not null check (executor_kind in ('human', 'agent', 'tool', 'system')),
  agent_id uuid references public.agents(id) on delete set null,
  tool_name text,
  status public.v1_execution_status not null default 'queued',
  idempotency_key text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error jsonb,
  created_by_profile_id uuid references public.profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (action_request_id, idempotency_key),
  unique (step_id, attempt_no),
  check (
    (executor_kind = 'agent' and agent_id is not null)
    or (executor_kind = 'tool' and tool_name is not null)
    or executor_kind in ('human', 'system')
  )
);

create index if not exists execution_attempts_work_order_idx
  on public.execution_attempts (work_order_id, status);

create or replace function public.sem_validate_execution_attempt()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_effect public.v1_policy_effect;
  v_payload_hash bytea;
  v_required_count integer;
  v_resolved_count integer;
begin
  if new.action_request_id is null then
    return new;
  end if;

  select policy_effect, payload_hash, required_entity_count
  into v_effect, v_payload_hash, v_required_count
  from public.action_requests
  where id = new.action_request_id
    and work_order_id = new.work_order_id;

  if v_effect is null then
    raise exception 'Execution action request not found in this work order';
  end if;

  if v_effect = 'deny' then
    raise exception 'Policy denied this action';
  end if;

  select count(*) into v_resolved_count
  from public.action_request_entity_references
  where action_request_id = new.action_request_id;

  if v_resolved_count <> v_required_count then
    raise exception 'Execution blocked until every entity reference is uniquely resolved';
  end if;

  if v_effect = 'approve' and not exists (
    select 1
    from public.approval_decisions d
    where d.action_request_id = new.action_request_id
      and d.decision = 'approved'
      and d.payload_hash = v_payload_hash
  ) then
    raise exception 'Execution blocked: approved canonical payload hash not found';
  end if;

  return new;
end;
$$;

drop trigger if exists execution_attempt_guard on public.execution_attempts;
create trigger execution_attempt_guard
before insert or update of action_request_id, status on public.execution_attempts
for each row execute function public.sem_validate_execution_attempt();

create table if not exists public.approval_resume_tokens (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public.approvals(id) on delete restrict,
  action_request_id uuid not null unique references public.action_requests(id) on delete restrict,
  payload_hash bytea not null,
  resume_token uuid not null unique default gen_random_uuid(),
  consumed_at timestamptz,
  consumed_by_attempt_id uuid unique references public.execution_attempts(id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace function public.sem_project_approval_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.approvals
  set status = new.decision,
      decided_at = new.decided_at,
      approver_profile_id = new.decided_by_profile_id,
      decision_notes = new.decision_notes
  where id = new.approval_id;

  update public.action_requests
  set status = case
      when new.decision = 'approved' then 'approved'
      else 'cancelled'
    end,
    updated_at = now()
  where id = new.action_request_id;

  if new.decision = 'approved' then
    insert into public.approval_resume_tokens (
      approval_id,
      action_request_id,
      payload_hash
    ) values (
      new.approval_id,
      new.action_request_id,
      new.payload_hash
    );
  end if;

  return new;
end;
$$;

drop trigger if exists approval_decision_project on public.approval_decisions;
create trigger approval_decision_project
after insert on public.approval_decisions
for each row execute function public.sem_project_approval_decision();

create or replace function public.sem_claim_approved_action(
  p_action_request_id uuid,
  p_resume_token uuid,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_attempt_id uuid;
  v_token_id uuid;
  v_approval_id uuid;
  v_work_order_id uuid;
  v_step_id uuid;
  v_task_id uuid;
  v_next_attempt integer;
  v_attempt_id uuid;
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Idempotency key is required';
  end if;

  select id into v_existing_attempt_id
  from public.execution_attempts
  where action_request_id = p_action_request_id
    and idempotency_key = p_idempotency_key;

  if v_existing_attempt_id is not null then
    return v_existing_attempt_id;
  end if;

  select id, approval_id into v_token_id, v_approval_id
  from public.approval_resume_tokens
  where action_request_id = p_action_request_id
    and resume_token = p_resume_token
    and consumed_at is null
  for update;

  if v_token_id is null then
    raise exception 'Resume token is invalid or already consumed';
  end if;

  if not public.sem_can_decide_approval(v_approval_id) then
    raise exception 'Caller is not authorized to resume this approved action';
  end if;

  select work_order_id, step_id, task_id
  into v_work_order_id, v_step_id, v_task_id
  from public.action_requests
  where id = p_action_request_id;

  select coalesce(max(attempt_no), 0) + 1
  into v_next_attempt
  from public.execution_attempts
  where step_id is not distinct from v_step_id;

  insert into public.execution_attempts (
    work_order_id,
    step_id,
    task_id,
    action_request_id,
    attempt_no,
    executor_kind,
    status,
    idempotency_key,
    created_by_profile_id
  ) values (
    v_work_order_id,
    v_step_id,
    v_task_id,
    p_action_request_id,
    v_next_attempt,
    'system',
    'queued',
    p_idempotency_key,
    public.current_profile_id()
  )
  returning id into v_attempt_id;

  update public.approval_resume_tokens
  set consumed_at = now(),
      consumed_by_attempt_id = v_attempt_id
  where id = v_token_id
    and consumed_at is null;

  if not found then
    raise exception 'Resume token was consumed concurrently';
  end if;

  update public.action_requests
  set status = 'executing',
      updated_at = now()
  where id = p_action_request_id;

  return v_attempt_id;
end;
$$;

revoke all on function public.sem_claim_approved_action(uuid, uuid, text) from public, anon;
grant execute on function public.sem_claim_approved_action(uuid, uuid, text) to authenticated;
-- One idempotency ledger covers founder commands, API requests, webhooks, and callbacks.
-- A reused key with a different canonical request hash is rejected.
create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  idempotency_key text not null,
  source_kind text not null check (source_kind in ('founder_command', 'api', 'webhook', 'callback')),
  request_payload jsonb not null,
  request_hash bytea generated always as (
    digest(public.sem_canonical_jsonb(request_payload), 'sha256')
  ) stored,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  resource_type text,
  resource_id uuid,
  response_payload jsonb,
  claimed_by_profile_id uuid references public.profiles(id),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (scope, idempotency_key)
);

create or replace function public.sem_claim_idempotency(
  p_scope text,
  p_idempotency_key text,
  p_source_kind text,
  p_request_payload jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_existing_hash bytea;
  v_incoming_hash bytea;
begin
  if nullif(trim(p_scope), '') is null or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Idempotency scope and key are required';
  end if;

  v_incoming_hash := digest(
    public.sem_canonical_jsonb(p_request_payload),
    'sha256'
  );

  insert into public.idempotency_keys (
    scope,
    idempotency_key,
    source_kind,
    request_payload,
    claimed_by_profile_id
  ) values (
    p_scope,
    p_idempotency_key,
    p_source_kind,
    p_request_payload,
    public.current_profile_id()
  )
  on conflict (scope, idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select id, request_hash
  into v_id, v_existing_hash
  from public.idempotency_keys
  where scope = p_scope
    and idempotency_key = p_idempotency_key
  for update;

  if v_existing_hash <> v_incoming_hash then
    raise exception 'Idempotency key was reused with a different request payload';
  end if;

  return v_id;
end;
$$;

create or replace function public.sem_complete_idempotency(
  p_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_response_payload jsonb
) returns public.idempotency_keys
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result public.idempotency_keys;
begin
  update public.idempotency_keys
  set status = 'completed',
      resource_type = p_resource_type,
      resource_id = p_resource_id,
      response_payload = p_response_payload,
      completed_at = now()
  where id = p_id
    and (
      claimed_by_profile_id = public.current_profile_id()
      or public.is_founder_or_admin()
    )
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Idempotency claim not found or not owned by caller';
  end if;

  return v_result;
end;
$$;

revoke all on function public.sem_claim_idempotency(text, text, text, jsonb) from public, anon;
revoke all on function public.sem_complete_idempotency(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.sem_claim_idempotency(text, text, text, jsonb) to authenticated;
grant execute on function public.sem_complete_idempotency(uuid, text, uuid, jsonb) to authenticated;

create table if not exists public.qa_runs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  step_id uuid references public.work_order_steps(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  execution_attempt_id uuid references public.execution_attempts(id) on delete set null,
  status public.v1_qa_status not null default 'pending',
  reviewer_kind text not null check (reviewer_kind in ('human', 'agent', 'system')),
  reviewer_profile_id uuid references public.profiles(id),
  reviewer_agent_id uuid references public.agents(id),
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.qa_results (
  id uuid primary key default gen_random_uuid(),
  qa_run_id uuid not null references public.qa_runs(id) on delete cascade,
  check_key text not null,
  description text not null,
  status public.v1_qa_status not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (qa_run_id, check_key)
);

create table if not exists public.work_order_outcomes (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null unique references public.work_orders(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  status text not null check (status in ('completed', 'partially_completed', 'failed', 'cancelled')),
  summary text not null,
  result jsonb not null default '{}'::jsonb,
  accepted_by_profile_id uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.sem_memory_candidate_hash(
  p_company_id uuid,
  p_fact text,
  p_source_trace jsonb,
  p_sensitivity public.visibility_level
) returns bytea
language sql
immutable
set search_path = public, extensions
as $$
  select digest(
    convert_to(
      public.sem_canonical_jsonb(
        jsonb_build_object(
          'company_id', p_company_id,
          'fact', p_fact,
          'source_trace', p_source_trace,
          'sensitivity', p_sensitivity
        )
      ),
      'UTF8'
    ),
    'sha256'
  );
$$;

create table if not exists public.memory_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  step_id uuid references public.work_order_steps(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  entity_reference_id uuid references public.entity_references(id) on delete set null,
  fact text not null,
  source_trace jsonb not null,
  confidence numeric not null check (confidence between 0 and 1),
  sensitivity public.visibility_level not null default 'internal',
  candidate_hash bytea generated always as (
    public.sem_memory_candidate_hash(
      company_id,
      fact,
      source_trace,
      sensitivity
    )
  ) stored,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'persisted')),
  reviewed_by_profile_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  persisted_memory_id uuid references public.memories(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists memory_candidates_work_order_hash_uidx
  on public.memory_candidates (work_order_id, candidate_hash);

-- The new audit stream is append-only and hash-chained. Existing audit_logs remains
-- available as a legacy read model until consumers migrate.
create table if not exists public.execution_audit_events (
  sequence_no bigint generated always as identity primary key,
  id uuid not null unique default gen_random_uuid(),
  work_order_id uuid references public.work_orders(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_agent_id uuid references public.agents(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  previous_hash bytea,
  event_hash bytea not null,
  occurred_at timestamptz not null default now()
);

create index if not exists execution_audit_work_order_idx
  on public.execution_audit_events (work_order_id, sequence_no);

create or replace function public.sem_hash_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_chain_key text;
begin
  v_chain_key := coalesce(new.work_order_id::text, new.company_id::text, 'global');
  perform pg_advisory_xact_lock(hashtextextended(v_chain_key, 0));

  select event_hash into new.previous_hash
  from public.execution_audit_events
  where coalesce(work_order_id::text, company_id::text, 'global') = v_chain_key
  order by sequence_no desc
  limit 1;

  new.event_hash := digest(
    convert_to(
      concat_ws(
        '|',
        coalesce(encode(new.previous_hash, 'hex'), ''),
        new.id::text,
        coalesce(new.work_order_id::text, ''),
        coalesce(new.actor_profile_id::text, ''),
        coalesce(new.actor_agent_id::text, ''),
        new.event_type,
        coalesce(new.entity_type, ''),
        coalesce(new.entity_id::text, ''),
        public.sem_canonical_jsonb(new.payload),
        new.occurred_at::text
      ),
      'UTF8'
    ),
    'sha256'
  );

  return new;
end;
$$;

drop trigger if exists execution_audit_hash on public.execution_audit_events;
create trigger execution_audit_hash
before insert on public.execution_audit_events
for each row execute function public.sem_hash_audit_event();

drop trigger if exists execution_audit_immutable on public.execution_audit_events;
create trigger execution_audit_immutable
before update or delete on public.execution_audit_events
for each row execute function public.sem_reject_append_mutation();

create or replace function public.sem_append_audit_event(
  p_work_order_id uuid,
  p_company_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_event_id uuid;
begin
  if v_profile_id is null then
    raise exception 'Authenticated profile required';
  end if;

  if p_company_id is not null and not public.has_company_access(p_company_id) then
    raise exception 'Caller has no access to the audit company scope';
  end if;

  if p_work_order_id is not null and not exists (
    select 1
    from public.work_orders w
    where w.id = p_work_order_id
      and (
        w.created_by_profile_id = v_profile_id
        or (w.company_id is not null and public.has_company_access(w.company_id))
        or public.is_founder_or_admin()
      )
  ) then
    raise exception 'Caller has no access to the audit work order';
  end if;

  insert into public.execution_audit_events (
    work_order_id,
    company_id,
    actor_profile_id,
    event_type,
    entity_type,
    entity_id,
    payload
  ) values (
    p_work_order_id,
    p_company_id,
    v_profile_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.sem_append_audit_event(uuid, uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.sem_append_audit_event(uuid, uuid, text, text, uuid, jsonb) to authenticated;
create or replace function public.sem_can_read_work_order(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      public.is_founder_or_admin()
      or w.created_by_profile_id = public.current_profile_id()
      or (w.company_id is not null and public.is_company_manager(w.company_id))
      or exists (
        select 1
        from public.tasks t
        join public.people pe on pe.id = t.owner_person_id
        where t.work_order_id = w.id
          and pe.profile_id = public.current_profile_id()
      )
    from public.work_orders w
    where w.id = p_work_order_id
  ), false);
$$;

create or replace function public.sem_can_manage_work_order(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      public.is_founder_or_admin()
      or w.created_by_profile_id = public.current_profile_id()
      or (w.company_id is not null and public.is_company_manager(w.company_id))
    from public.work_orders w
    where w.id = p_work_order_id
  ), false);
$$;

revoke all on function public.sem_can_read_work_order(uuid) from public, anon;
revoke all on function public.sem_can_manage_work_order(uuid) from public, anon;
grant execute on function public.sem_can_read_work_order(uuid) to authenticated;
grant execute on function public.sem_can_manage_work_order(uuid) to authenticated;

alter table public.work_order_steps enable row level security;
alter table public.work_order_step_dependencies enable row level security;
alter table public.entity_references enable row level security;
alter table public.approval_policies enable row level security;
alter table public.action_requests enable row level security;
alter table public.action_request_entity_references enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.execution_attempts enable row level security;
alter table public.approval_resume_tokens enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.qa_runs enable row level security;
alter table public.qa_results enable row level security;
alter table public.work_order_outcomes enable row level security;
alter table public.memory_candidates enable row level security;
alter table public.execution_audit_events enable row level security;

create policy "work_order_steps_select_scope"
on public.work_order_steps for select
using (public.sem_can_read_work_order(work_order_id));

create policy "work_order_steps_insert_scope"
on public.work_order_steps for insert
with check (public.sem_can_manage_work_order(work_order_id));

create policy "work_order_steps_update_scope"
on public.work_order_steps for update
using (public.sem_can_manage_work_order(work_order_id))
with check (public.sem_can_manage_work_order(work_order_id));

create policy "step_dependencies_select_scope"
on public.work_order_step_dependencies for select
using (
  exists (
    select 1
    from public.work_order_steps s
    where s.id = step_id
      and public.sem_can_read_work_order(s.work_order_id)
  )
);

create policy "step_dependencies_write_scope"
on public.work_order_step_dependencies for all
using (
  exists (
    select 1
    from public.work_order_steps s
    where s.id = step_id
      and public.sem_can_manage_work_order(s.work_order_id)
  )
)
with check (
  exists (
    select 1
    from public.work_order_steps s
    where s.id = step_id
      and public.sem_can_manage_work_order(s.work_order_id)
  )
);

create policy "entity_references_select_scope"
on public.entity_references for select
using (public.sem_can_read_work_order(work_order_id));

create policy "entity_references_insert_scope"
on public.entity_references for insert
with check (
  public.sem_can_manage_work_order(work_order_id)
  and (
    resolved_by_profile_id is null
    or resolved_by_profile_id = public.current_profile_id()
  )
);

create policy "entity_references_update_scope"
on public.entity_references for update
using (public.sem_can_manage_work_order(work_order_id))
with check (
  public.sem_can_manage_work_order(work_order_id)
  and (
    resolved_by_profile_id is null
    or resolved_by_profile_id = public.current_profile_id()
    or public.is_founder_or_admin()
  )
);

create policy "approval_policies_select_scope"
on public.approval_policies for select
using (
  public.is_founder_or_admin()
  or (company_id is not null and public.is_company_manager(company_id))
);

create policy "approval_policies_write_scope"
on public.approval_policies for all
using (
  public.is_founder_or_admin()
  or (company_id is not null and public.is_company_manager(company_id))
)
with check (
  public.is_founder_or_admin()
  or (company_id is not null and public.is_company_manager(company_id))
);

create policy "action_requests_select_scope"
on public.action_requests for select
using (public.sem_can_read_work_order(work_order_id));

create policy "action_requests_insert_scope"
on public.action_requests for insert
with check (
  public.sem_can_manage_work_order(work_order_id)
  and created_by_profile_id = public.current_profile_id()
  and (
    company_id is null
    or public.has_company_access(company_id)
  )
);

create policy "action_requests_update_scope"
on public.action_requests for update
using (public.sem_can_manage_work_order(work_order_id))
with check (public.sem_can_manage_work_order(work_order_id));

create policy "action_entity_refs_select_scope"
on public.action_request_entity_references for select
using (
  exists (
    select 1
    from public.action_requests a
    where a.id = action_request_id
      and public.sem_can_read_work_order(a.work_order_id)
  )
);

create policy "action_entity_refs_insert_scope"
on public.action_request_entity_references for insert
with check (
  exists (
    select 1
    from public.action_requests a
    where a.id = action_request_id
      and public.sem_can_manage_work_order(a.work_order_id)
  )
);

create policy "approval_decisions_select_scope"
on public.approval_decisions for select
using (
  public.sem_can_decide_approval(approval_id)
  or exists (
    select 1
    from public.action_requests a
    where a.id = action_request_id
      and public.sem_can_read_work_order(a.work_order_id)
  )
);

create policy "approval_decisions_insert_scope"
on public.approval_decisions for insert
with check (
  decided_by_profile_id = public.current_profile_id()
  and public.sem_can_decide_approval(approval_id)
);
create policy "execution_attempts_select_scope"
on public.execution_attempts for select
using (public.sem_can_read_work_order(work_order_id));

create policy "execution_attempts_insert_scope"
on public.execution_attempts for insert
with check (
  public.sem_can_manage_work_order(work_order_id)
  and (
    created_by_profile_id is null
    or created_by_profile_id = public.current_profile_id()
  )
);

create policy "execution_attempts_update_scope"
on public.execution_attempts for update
using (public.sem_can_manage_work_order(work_order_id))
with check (public.sem_can_manage_work_order(work_order_id));

create policy "approval_resume_tokens_select_scope"
on public.approval_resume_tokens for select
using (public.sem_can_decide_approval(approval_id));

create policy "approval_resume_tokens_update_scope"
on public.approval_resume_tokens for update
using (public.sem_can_decide_approval(approval_id))
with check (public.sem_can_decide_approval(approval_id));

create policy "idempotency_keys_select_scope"
on public.idempotency_keys for select
using (
  claimed_by_profile_id = public.current_profile_id()
  or public.is_founder_or_admin()
);

create policy "idempotency_keys_insert_scope"
on public.idempotency_keys for insert
with check (
  claimed_by_profile_id = public.current_profile_id()
  and auth.uid() is not null
);

create policy "idempotency_keys_update_scope"
on public.idempotency_keys for update
using (
  claimed_by_profile_id = public.current_profile_id()
  or public.is_founder_or_admin()
)
with check (
  claimed_by_profile_id = public.current_profile_id()
  or public.is_founder_or_admin()
);

create policy "qa_runs_select_scope"
on public.qa_runs for select
using (public.sem_can_read_work_order(work_order_id));

create policy "qa_runs_write_scope"
on public.qa_runs for all
using (public.sem_can_manage_work_order(work_order_id))
with check (public.sem_can_manage_work_order(work_order_id));

create policy "qa_results_select_scope"
on public.qa_results for select
using (
  exists (
    select 1
    from public.qa_runs q
    where q.id = qa_run_id
      and public.sem_can_read_work_order(q.work_order_id)
  )
);

create policy "qa_results_write_scope"
on public.qa_results for all
using (
  exists (
    select 1
    from public.qa_runs q
    where q.id = qa_run_id
      and public.sem_can_manage_work_order(q.work_order_id)
  )
)
with check (
  exists (
    select 1
    from public.qa_runs q
    where q.id = qa_run_id
      and public.sem_can_manage_work_order(q.work_order_id)
  )
);

create policy "work_order_outcomes_select_scope"
on public.work_order_outcomes for select
using (public.sem_can_read_work_order(work_order_id));

create policy "work_order_outcomes_write_scope"
on public.work_order_outcomes for all
using (public.sem_can_manage_work_order(work_order_id))
with check (
  public.sem_can_manage_work_order(work_order_id)
  and (
    accepted_by_profile_id is null
    or accepted_by_profile_id = public.current_profile_id()
    or public.is_founder_or_admin()
  )
);

create policy "memory_candidates_select_scope"
on public.memory_candidates for select
using (
  public.is_founder_or_admin()
  or (
    sensitivity in ('public', 'internal')
    and public.sem_can_read_work_order(work_order_id)
  )
  or (
    sensitivity = 'confidential'
    and (
      public.is_hr_finance()
      or (company_id is not null and public.is_company_manager(company_id))
    )
  )
);

create policy "memory_candidates_write_scope"
on public.memory_candidates for all
using (public.sem_can_manage_work_order(work_order_id))
with check (
  public.sem_can_manage_work_order(work_order_id)
  and (
    reviewed_by_profile_id is null
    or reviewed_by_profile_id = public.current_profile_id()
    or public.is_founder_or_admin()
  )
);

create policy "execution_audit_select_scope"
on public.execution_audit_events for select
using (
  public.is_founder_or_admin()
  or (work_order_id is not null and public.sem_can_read_work_order(work_order_id))
  or (company_id is not null and public.is_company_manager(company_id))
);

grant select, insert, update on public.work_order_steps to authenticated;
grant select, insert, update, delete on public.work_order_step_dependencies to authenticated;
grant select, insert, update on public.entity_references to authenticated;
grant select, insert, update, delete on public.approval_policies to authenticated;
grant select, insert, update on public.action_requests to authenticated;
grant select, insert on public.action_request_entity_references to authenticated;
grant select, insert on public.approval_decisions to authenticated;
grant select, insert, update on public.execution_attempts to authenticated;
grant select, update on public.approval_resume_tokens to authenticated;
grant select, insert, update on public.idempotency_keys to authenticated;
grant select, insert, update, delete on public.qa_runs to authenticated;
grant select, insert, update, delete on public.qa_results to authenticated;
grant select, insert, update, delete on public.work_order_outcomes to authenticated;
grant select, insert, update on public.memory_candidates to authenticated;
grant select on public.execution_audit_events to authenticated;

revoke all on function public.sem_validate_action_entity_reference() from public, anon, authenticated;
revoke all on function public.sem_protect_action_payload() from public, anon, authenticated;
revoke all on function public.sem_bind_approval_payload() from public, anon, authenticated;
revoke all on function public.sem_validate_approval_decision() from public, anon, authenticated;
revoke all on function public.sem_reject_append_mutation() from public, anon, authenticated;
revoke all on function public.sem_validate_execution_attempt() from public, anon, authenticated;
revoke all on function public.sem_project_approval_decision() from public, anon, authenticated;
revoke all on function public.sem_hash_audit_event() from public, anon, authenticated;
revoke all on function public.sem_memory_candidate_hash(uuid, text, jsonb, public.visibility_level) from public, anon, authenticated;

-- No production change occurs from this file's existence. Moving this reviewed file into
-- supabase/migrations is a separate, explicitly approved Phase 1 release action.
commit;
