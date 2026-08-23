-- SEM Brain v0.7.1 — Transactional AI command persistence (ticket 12)
-- Applies on top of 202606190001_sem_brain_v071_production_core.sql and
-- 202608230001_security_hardening_rls.sql.
--
-- Problem: supabase/functions/sem-ai-command/index.ts previously inserted work_order,
-- each task, each approval, model_usage, and audit_logs as separate sequential requests,
-- silently swallowing per-row errors (`if(!error && data) push`). A failure partway
-- through (RLS denial on a hallucinated company_id, a constraint violation, a network
-- blip) left a partial work order with some tasks/approvals missing and no record of
-- what failed or why.
--
-- Fix: one Postgres function wrapping every insert in a single transaction. Any failure
-- (including an RLS policy violation on an individual insert) raises an exception and
-- rolls back the entire work order atomically — no more partial state. This function is
-- intentionally NOT security definer: it runs as the invoking role (the caller's own
-- Supabase Auth session, same as before), so every RLS policy from the hardening
-- migration (tasks_insert_scope, approvals_insert_scope, etc.) still applies to each
-- insert exactly as it did with the old sequential-insert code. The Edge Function still
-- computes approvalRequired/domain per task in TypeScript (tickets 2 and 4) — this
-- function is a pure persistence layer, it does not re-derive that logic.

create or replace function public.sem_execute_ai_command(
  p_command text,
  p_context_pack jsonb,
  p_output jsonb,
  p_token_estimate int,
  p_tasks jsonb,        -- array of {companyId, projectId, title, description, parentGoal,
                         --   ownerType, ownerAgentId, ownerPersonId, acceptanceCriteria,
                         --   testMethod, approvalRequired, priority, riskLevel}
  p_approvals jsonb,     -- array of {title, reason, riskLevel, domain, taskIndex}
  p_model_name text,
  p_input_tokens int,
  p_output_tokens int,
  p_estimated_cost_usd numeric
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_work_order_id uuid;
  v_task jsonb;
  v_approval jsonb;
  v_task_ids uuid[] := '{}';
  v_task_company_ids uuid[] := '{}';
  v_created_tasks jsonb := '[]'::jsonb;
  v_created_approvals jsonb := '[]'::jsonb;
  v_new_task_id uuid;
  v_new_task_company_id uuid;
  v_new_approval_id uuid;
  v_task_index int;
begin
  if v_profile_id is null then
    raise exception 'No profile found for the authenticated user';
  end if;

  insert into public.work_orders (command, status, context_pack, output, token_estimate, created_by_profile_id)
  values (p_command, 'queued', p_context_pack, p_output, p_token_estimate, v_profile_id)
  returning id into v_work_order_id;

  for v_task in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb))
  loop
    insert into public.tasks (
      company_id, project_id, title, description, parent_goal,
      owner_type, owner_agent_id, owner_person_id,
      acceptance_criteria, test_method,
      status, priority, risk_level, approval_required,
      source, created_by_profile_id
    ) values (
      nullif(v_task->>'companyId','')::uuid,
      nullif(v_task->>'projectId','')::uuid,
      v_task->>'title',
      coalesce(v_task->>'description',''),
      coalesce(v_task->>'parentGoal',''),
      coalesce(v_task->>'ownerType','agent'),
      nullif(v_task->>'ownerAgentId','')::uuid,
      nullif(v_task->>'ownerPersonId','')::uuid,
      coalesce(v_task->'acceptanceCriteria','[]'::jsonb),
      coalesce(v_task->'testMethod','[]'::jsonb),
      case when coalesce((v_task->>'approvalRequired')::boolean,false) then 'needs_approval'::work_status else 'queued'::work_status end,
      coalesce((v_task->>'priority')::priority_level,'medium'::priority_level),
      coalesce((v_task->>'riskLevel')::risk_level,'low'::risk_level),
      coalesce((v_task->>'approvalRequired')::boolean,false),
      'ai_command_v0.7',
      v_profile_id
    )
    returning id, company_id into v_new_task_id, v_new_task_company_id;

    v_task_ids := array_append(v_task_ids, v_new_task_id);
    v_task_company_ids := array_append(v_task_company_ids, v_new_task_company_id);
    v_created_tasks := v_created_tasks || jsonb_build_object('id', v_new_task_id, 'company_id', v_new_task_company_id);
  end loop;

  for v_approval in select * from jsonb_array_elements(coalesce(p_approvals, '[]'::jsonb))
  loop
    v_task_index := nullif(v_approval->>'taskIndex','')::int;
    insert into public.approvals (
      company_id, task_id, title, reason, risk_level, domain,
      requested_by_profile_id, approval_payload
    ) values (
      case when v_task_index is not null and v_task_index >= 0 and v_task_index < array_length(v_task_company_ids,1)
        then v_task_company_ids[v_task_index+1] else nullif(v_approval->>'companyId','')::uuid end,
      case when v_task_index is not null and v_task_index >= 0 and v_task_index < array_length(v_task_ids,1)
        then v_task_ids[v_task_index+1] else null end,
      coalesce(v_approval->>'title','Approval required'),
      coalesce(v_approval->>'reason','Risk policy requires approval'),
      coalesce((v_approval->>'riskLevel')::risk_level,'medium'::risk_level),
      coalesce((v_approval->>'domain')::approval_domain,'general'::approval_domain),
      v_profile_id,
      v_approval
    )
    returning id into v_new_approval_id;

    v_created_approvals := v_created_approvals || jsonb_build_object('id', v_new_approval_id);
  end loop;

  insert into public.model_usage (profile_id, work_order_id, model_name, input_tokens, output_tokens, estimated_cost_usd)
  values (v_profile_id, v_work_order_id, p_model_name, p_input_tokens, p_output_tokens, p_estimated_cost_usd);

  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, message, metadata)
  values (
    v_profile_id, public.current_role(), 'ai_command_executed', 'work_order', v_work_order_id,
    'AI command executed through v0.7 production core (transactional)',
    jsonb_build_object(
      'command', p_command, 'model', p_model_name, 'tokenEstimate', p_token_estimate,
      'tasks', jsonb_array_length(v_created_tasks), 'approvals', jsonb_array_length(v_created_approvals)
    )
  );

  return jsonb_build_object('workOrderId', v_work_order_id, 'createdTasks', v_created_tasks, 'createdApprovals', v_created_approvals);
end;
$$;

-- Only authenticated users may call this (matches the Edge Function's own auth check;
-- this is a second, DB-level backstop in case the RPC is ever called from elsewhere).
revoke all on function public.sem_execute_ai_command from public, anon;
grant execute on function public.sem_execute_ai_command to authenticated;
