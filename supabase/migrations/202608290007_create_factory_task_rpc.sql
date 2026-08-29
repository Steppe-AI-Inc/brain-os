-- Phase 8 continuation — real Task creation under a canonical Work Order, for
-- brain-os-factory-director to use when decomposing a dispatched Work Order. Built with
-- the company-consistency invariant enforced FROM THE START, per the explicit
-- PRE-EXPOSURE BLOCKER in qa/KNOWN_FAILURE_MODES.md #24 (no feature may expose
-- tasks.canonical_work_order_id as a settable path without enforcing
-- task.company_id == work_order.company_id first) — this is that enforcement, not an
-- afterthought.
--
-- Design choice, structurally safer than the goal_id case: p_company_id is NOT a
-- parameter at all. company_id is always derived server-side from the real Work Order
-- row, never caller-supplied — a cross-company mismatch is impossible by construction,
-- not just checked. A table-level trigger is added too anyway (defense in depth,
-- mirroring 202608290006's two-layer pattern exactly), since a direct INSERT bypassing
-- this RPC would otherwise still be able to set a mismatched pair.

begin;

create or replace function public.enforce_task_work_order_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.canonical_work_order_id is not null and not exists (
    select 1 from public.canonical_work_orders wo
    where wo.id = new.canonical_work_order_id and wo.company_id = new.company_id
  ) then
    raise exception 'tasks: canonical_work_order_id % does not belong to company_id % (cross-company work order reference rejected)', new.canonical_work_order_id, new.company_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_enforce_work_order_company on public.tasks;
create trigger tasks_enforce_work_order_company
  before insert or update on public.tasks
  for each row execute function public.enforce_task_work_order_company();

create or replace function public.create_factory_task(
  p_work_order_id uuid,
  p_title text,
  p_description text default null,
  p_owner_agent_id uuid default null,
  p_acceptance_criteria jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_company_id uuid;
  v_id uuid;
begin
  select company_id into v_company_id from public.canonical_work_orders where id = p_work_order_id;
  if v_company_id is null then
    raise exception 'create_factory_task: no canonical_work_orders row % (or it has no company_id)', p_work_order_id
      using errcode = '23503';
  end if;

  insert into public.tasks (
    company_id, title, description, canonical_work_order_id,
    owner_type, owner_agent_id, acceptance_criteria, status, source
  ) values (
    v_company_id, p_title, coalesce(p_description, ''), p_work_order_id,
    case when p_owner_agent_id is not null then 'agent' else 'human' end,
    p_owner_agent_id, coalesce(p_acceptance_criteria, '[]'::jsonb),
    'queued', 'factory_director'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_factory_task(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_factory_task(uuid, text, text, uuid, jsonb) to authenticated;

commit;
