-- Software Factory Phase 4 — typed canonical founder notification event model.
--
-- Core requirement (founder-specified): notifications must originate from canonical
-- Brain OS execution state, never from parsing LLM prose. The mechanism here is
-- deliberately structural: real AFTER UPDATE triggers on agent_runs/canonical_work_orders
-- fire only on a genuine status transition (OLD.status != NEW.status), reading the
-- notification's title/body directly from the real row - there is no code path here that
-- could be satisfied by a model merely saying "I need approval" in a chat reply.
--
-- STALE is the one event type that cannot be trigger-driven (nothing UPDATEs a row during
-- the silence that makes it stale) - scheduler.mjs's own heartbeat-refresh poll (already
-- reading real heartbeat age each cycle) calls create_founder_notification() directly when
-- it detects a genuine RUNNING->STALE transition, same discipline: computed from real
-- agent_runs.last_heartbeat_at, never narrated.

begin;

-- Canonical event vocabulary (renamed/extended from the original Phase 3 constraint to the
-- founder-specified FACTORY_* names; the two prior real rows this session's own testing
-- created already used the old vocabulary - migrated below, not silently orphaned).
alter table public.founder_notifications drop constraint if exists founder_notifications_event_type_check;

update public.founder_notifications set event_type = case event_type
  when 'approval_required' then 'FACTORY_APPROVAL_REQUIRED'
  when 'destructive_confirmation_required' then 'FACTORY_CONFIRMATION_REQUIRED'
  when 'db_push_required' then 'FACTORY_DB_PUSH_REQUIRED'
  when 'production_deploy_required' then 'FACTORY_PRODUCTION_DEPLOY_REQUIRED'
  when 'agent_failed' then 'FACTORY_AGENT_FAILED'
  when 'agent_stale' then 'FACTORY_AGENT_STALE'
  when 'security_verifier_failed' then 'FACTORY_VERIFICATION_FAILED'
  when 'work_order_blocked' then 'FACTORY_WORK_ORDER_BLOCKED'
  when 'work_order_completed' then 'FACTORY_WORK_ORDER_COMPLETED'
  when 'release_completed' then 'FACTORY_RELEASE_COMPLETED'
  when 'provider_unavailable' then 'FACTORY_PROVIDER_UNAVAILABLE'
  else event_type
end;

alter table public.founder_notifications add constraint founder_notifications_event_type_check
  check (event_type in (
    'FACTORY_APPROVAL_REQUIRED','FACTORY_CONFIRMATION_REQUIRED','FACTORY_DB_PUSH_REQUIRED',
    'FACTORY_PRODUCTION_DEPLOY_REQUIRED','FACTORY_AGENT_FAILED','FACTORY_AGENT_STALE',
    'FACTORY_VERIFICATION_FAILED','FACTORY_SECURITY_BLOCKED','FACTORY_WORK_ORDER_BLOCKED',
    'FACTORY_PROVIDER_UNAVAILABLE','FACTORY_RELEASE_FAILED','FACTORY_WORK_ORDER_COMPLETED',
    'FACTORY_RELEASE_COMPLETED'
  ));

-- Idempotency: the same real blocker must not create 50 notifications as workers poll.
-- dedupe_key is deterministic per caller (event_type + canonical resource id + a state/
-- version marker, e.g. 'agent_stale:<run_id>' or 'work_order_blocked:<wo_id>:<updated_at>').
-- Partial unique index (only while NOT resolved) - a resolved blocker that genuinely
-- recurs later is allowed to notify again, a still-open one is never duplicated.
alter table public.founder_notifications add column if not exists dedupe_key text;
alter table public.founder_notifications add column if not exists status text not null default 'unread'
  check (status in ('unread','read','resolved','dismissed'));
alter table public.founder_notifications add column if not exists action_required boolean not null default false;
alter table public.founder_notifications add column if not exists resolved_at timestamptz;

create unique index if not exists founder_notifications_dedupe_open_idx
  on public.founder_notifications (dedupe_key) where status != 'resolved' and dedupe_key is not null;

-- Canonical creation path - every real notification-creating call site (triggers below,
-- scheduler.mjs's heartbeat poll) goes through this, never a raw INSERT, so idempotency
-- is enforced in exactly one place.
create or replace function public.create_founder_notification(
  p_event_type text,
  p_severity text,
  p_title text,
  p_body text,
  p_work_order_id uuid,
  p_agent_run_id uuid,
  p_dedupe_key text,
  p_action_required boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.founder_notifications
    (event_type, severity, title, body, work_order_id, agent_run_id, dedupe_key, action_required, status)
  values
    (p_event_type, p_severity, p_title, p_body, p_work_order_id, p_agent_run_id, p_dedupe_key, p_action_required, 'unread')
  on conflict (dedupe_key) where status != 'resolved' do nothing
  returning id into v_id;
  return v_id; -- null means a real, still-open duplicate was correctly suppressed
end;
$$;
revoke all on function public.create_founder_notification from public;
grant execute on function public.create_founder_notification to authenticated;

-- Real resolution path - preserves audit/history (row stays, status flips), matching the
-- founder's own explicit "preserve audit/history appropriately" requirement.
create or replace function public.resolve_founder_notification(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.founder_notifications;
begin
  if not public.is_founder_or_admin() then
    return jsonb_build_object('authorized', false, 'reason', 'not_founder_or_admin');
  end if;
  update public.founder_notifications set status = 'resolved', resolved_at = now()
  where id = p_id and status != 'resolved'
  returning * into v_row;
  if v_row.id is null then
    return jsonb_build_object('authorized', true, 'changed', false, 'reason', 'not_found_or_already_resolved');
  end if;
  return jsonb_build_object('authorized', true, 'changed', true, 'notificationId', v_row.id, 'newStatus', 'resolved');
end;
$$;
revoke all on function public.resolve_founder_notification from public;
grant execute on function public.resolve_founder_notification to authenticated;

create or replace function public.mark_founder_notification_read(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.founder_notifications;
begin
  if not public.is_founder_or_admin() then
    return jsonb_build_object('authorized', false, 'reason', 'not_founder_or_admin');
  end if;
  update public.founder_notifications set status = 'read'
  where id = p_id and status = 'unread'
  returning * into v_row;
  if v_row.id is null then
    return jsonb_build_object('authorized', true, 'changed', false, 'reason', 'not_found_or_not_unread');
  end if;
  return jsonb_build_object('authorized', true, 'changed', true, 'notificationId', v_row.id, 'newStatus', 'read');
end;
$$;
revoke all on function public.mark_founder_notification_read from public;
grant execute on function public.mark_founder_notification_read to authenticated;

-- ================== Structural, trigger-driven events (never LLM-prose-driven) ==================

create or replace function public.notify_agent_run_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'rejected'::work_status and old.status is distinct from 'rejected'::work_status then
    perform public.create_founder_notification(
      'FACTORY_AGENT_FAILED', 'critical',
      'Agent run failed',
      coalesce(new.error, new.summary, 'Agent run ' || new.id || ' failed.'),
      new.canonical_work_order_id, new.id,
      'agent_failed:' || new.id::text, true
    );
  end if;
  if new.verification_status = 'failed' and old.verification_status is distinct from 'failed' then
    perform public.create_founder_notification(
      'FACTORY_VERIFICATION_FAILED', 'critical',
      'Independent verification failed',
      coalesce(new.summary, 'Agent run ' || new.id || ' failed independent verification.'),
      new.canonical_work_order_id, new.id,
      'verification_failed:' || new.id::text, true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists agent_run_notify_transition on public.agent_runs;
create trigger agent_run_notify_transition
  after update on public.agent_runs
  for each row execute function public.notify_agent_run_transition();

create or replace function public.notify_work_order_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'blocked'::work_status and old.status is distinct from 'blocked'::work_status then
    perform public.create_founder_notification(
      'FACTORY_WORK_ORDER_BLOCKED', 'warning',
      'Work Order blocked: ' || new.title,
      coalesce(new.objective, 'Work Order ' || new.id || ' is blocked.'),
      new.id, null,
      'work_order_blocked:' || new.id::text || ':' || extract(epoch from new.updated_at)::text, true
    );
  end if;
  if new.status = 'done'::work_status and old.status is distinct from 'done'::work_status then
    perform public.create_founder_notification(
      'FACTORY_WORK_ORDER_COMPLETED', 'info',
      'Work Order completed: ' || new.title,
      coalesce(new.objective, 'Work Order ' || new.id || ' completed.'),
      new.id, null,
      'work_order_completed:' || new.id::text, false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists canonical_work_order_notify_transition on public.canonical_work_orders;
create trigger canonical_work_order_notify_transition
  after update on public.canonical_work_orders
  for each row execute function public.notify_work_order_transition();

commit;
