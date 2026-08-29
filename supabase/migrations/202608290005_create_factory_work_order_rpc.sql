-- Phase 8 — Brain Chat -> Factory Director. New, standalone RPC (not folded into the
-- existing sem_execute_ai_command, deliberately) so a founder chat command can create a
-- real, queued public.canonical_work_orders row.
--
-- Kept OUT of sem_execute_ai_command's own transaction, matching this codebase's already
-- proven precedent for departments/leads/documents/product lines (see
-- supabase/functions/sem-ai-command/index.ts's own comment: "not on the high-risk list,
-- resolved/executed here") — there is no real schema reason a Factory Work Order needs
-- to be atomic with the rest of a chat turn's writes, and keeping it separate avoids
-- touching the large, already-proven sem_execute_ai_command function body at all.
--
-- security invoker (not definer): RLS applies exactly as it already does for every other
-- direct insert into canonical_work_orders (canonical_work_orders_insert_scope -
-- founder/admin or has_company_access(company_id), from 202608290002) - this RPC grants
-- no authority beyond what a caller already has via the existing policy, it is purely a
-- convenience wrapper the Edge Function calls, not a privilege escalation path.

begin;

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

revoke all on function public.create_factory_work_order(text, text, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_factory_work_order(text, text, uuid, uuid, text, text, jsonb) to authenticated;

commit;
