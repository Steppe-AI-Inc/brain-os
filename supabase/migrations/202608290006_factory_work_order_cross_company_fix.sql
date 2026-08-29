-- SECURITY INCIDENT FIX — real, live, exploitable defect found by independent review of
-- 202608290005 (create_factory_work_order): p_goal_id was accepted with no check that
-- the referenced goal actually belongs to p_company_id. RLS on canonical_work_orders
-- (canonical_work_orders_insert_scope) does not catch this — it only authorizes based on
-- company_id, and a foreign key existence check does not enforce which company the
-- referenced row belongs to. A caller with real access to Company A could set
-- company_id=A and goal_id=<a real goal belonging to Company B>, cross-associating data
-- across companies. Immediately contained (execute REVOKEd on create_factory_work_order
-- for `authenticated` the moment this was found, before this fix was even written) — see
-- docs/software-factory/PHASE_8_SECURITY_INCIDENT.md for the full incident record.
--
-- Fix has TWO layers, deliberately not just one ("do not rely on RLS alone", and do not
-- rely on a single code path either):
--   1. A real BEFORE INSERT OR UPDATE trigger on public.canonical_work_orders itself -
--      structural, table-level protection that holds regardless of which RPC or future
--      code path performs the write, not just this one RPC.
--   2. An explicit check inside create_factory_work_order() too, so the RPC's own error
--      message is specific and immediate rather than a generic trigger exception - this
--      is redundant with the trigger by design (defense in depth), not instead of it.

begin;

create or replace function public.enforce_canonical_work_order_goal_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.goal_id is not null and not exists (
    select 1 from public.goals g where g.id = new.goal_id and g.company_id = new.company_id
  ) then
    raise exception 'canonical_work_orders: goal_id % does not belong to company_id % (cross-company goal reference rejected)', new.goal_id, new.company_id
      using errcode = '23514'; -- check_violation
  end if;
  return new;
end;
$$;

drop trigger if exists canonical_work_orders_enforce_goal_company on public.canonical_work_orders;
create trigger canonical_work_orders_enforce_goal_company
  before insert or update on public.canonical_work_orders
  for each row execute function public.enforce_canonical_work_order_goal_company();

create or replace function public.create_factory_work_order(
  p_title text,
  p_objective text,
  p_company_id uuid,
  p_goal_id uuid default null,
  p_work_type text default 'software_development',
  p_priority text default 'medium',
  p_acceptance_criteria jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  if p_goal_id is not null and not exists (
    select 1 from public.goals g where g.id = p_goal_id and g.company_id = p_company_id
  ) then
    raise exception 'create_factory_work_order: goal % does not belong to company % (cross-company goal reference rejected)', p_goal_id, p_company_id
      using errcode = '23514';
  end if;

  insert into public.canonical_work_orders (
    title, objective, company_id, goal_id, work_type, priority, acceptance_criteria,
    status, requested_by_profile_id
  ) values (
    p_title, p_objective, p_company_id, p_goal_id,
    coalesce(p_work_type, 'software_development'),
    coalesce(p_priority, 'medium')::priority_level,
    coalesce(p_acceptance_criteria, '[]'::jsonb),
    'queued',
    public.current_profile_id()
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Re-grant execute (was REVOKEd during immediate containment, before this fix existed).
revoke all on function public.create_factory_work_order(text, text, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_factory_work_order(text, text, uuid, uuid, text, text, jsonb) to authenticated;

commit;
