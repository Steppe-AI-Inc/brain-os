-- Task deletion: manual (Tasks page) and AI-driven (sem-ai-command "delete" commands).
-- Previously there was no DELETE RLS policy on tasks at all, so any delete attempt —
-- manual or via chat — silently affected 0 rows (Postgres RLS denies by omission, not
-- by error) or, for the AI path, failed earlier because the schema had no delete action
-- and the model's non-JSON attempts to comply broke strict JSON parsing.

-- Two incoming FKs need ON DELETE SET NULL so deleting a task doesn't hard-fail on a
-- referencing row that's otherwise unrelated to the task's own lifecycle:
--   - tasks.parent_task_id (self-reference for subtasks — none exist in the app yet,
--     but the column exists) — orphaned subtasks stay, just lose the parent link.
--   - model_usage.task_id (currently always NULL in practice — sem_execute_ai_command's
--     model_usage insert never sets it — but the column exists for future use).
-- approvals.task_id already has ON DELETE SET NULL from the original schema.
alter table public.tasks drop constraint if exists tasks_parent_task_id_fkey;
alter table public.tasks add constraint tasks_parent_task_id_fkey
  foreign key (parent_task_id) references public.tasks(id) on delete set null;

alter table public.model_usage drop constraint if exists model_usage_task_id_fkey;
alter table public.model_usage add constraint model_usage_task_id_fkey
  foreign key (task_id) references public.tasks(id) on delete set null;

drop policy if exists "tasks_delete_scope" on public.tasks;
create policy "tasks_delete_scope" on public.tasks for delete using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- Extend the transactional RPC with an optional deletion list. A new trailing parameter
-- (even with a default) changes the function's identity in Postgres — `create or
-- replace` over a different arg list creates a second overload rather than replacing the
-- first, which then makes plain `on function public.sem_execute_ai_command` (no arg
-- list) ambiguous. Drop the old 10-arg signature explicitly first.
drop function if exists public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric);

create or replace function public.sem_execute_ai_command(
  p_command text,
  p_context_pack jsonb,
  p_output jsonb,
  p_token_estimate int,
  p_tasks jsonb,
  p_approvals jsonb,
  p_model_name text,
  p_input_tokens int,
  p_output_tokens int,
  p_estimated_cost_usd numeric,
  p_deleted_task_ids uuid[] default '{}'::uuid[]
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
  v_deleted_task_ids uuid[] := '{}';
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

  -- Deletion runs under `security invoker`, same as every insert above, so
  -- tasks_delete_scope RLS is the actual authorization check here — a task outside the
  -- caller's access simply won't be deleted (0 rows), not an error.
  if p_deleted_task_ids is not null and array_length(p_deleted_task_ids, 1) > 0 then
    with removed as (
      delete from public.tasks where id = any(p_deleted_task_ids) returning id
    )
    select coalesce(array_agg(id), '{}') into v_deleted_task_ids from removed;
  end if;

  insert into public.model_usage (profile_id, work_order_id, model_name, input_tokens, output_tokens, estimated_cost_usd)
  values (v_profile_id, v_work_order_id, p_model_name, p_input_tokens, p_output_tokens, p_estimated_cost_usd);

  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, message, metadata)
  values (
    v_profile_id, public.current_role(), 'ai_command_executed', 'work_order', v_work_order_id,
    'AI command executed through v0.7 production core (transactional)',
    jsonb_build_object(
      'command', p_command, 'model', p_model_name, 'tokenEstimate', p_token_estimate,
      'tasks', jsonb_array_length(v_created_tasks), 'approvals', jsonb_array_length(v_created_approvals),
      'deletedTasks', coalesce(array_length(v_deleted_task_ids,1), 0)
    )
  );

  return jsonb_build_object(
    'workOrderId', v_work_order_id, 'createdTasks', v_created_tasks, 'createdApprovals', v_created_approvals,
    'deletedTaskIds', to_jsonb(v_deleted_task_ids)
  );
end;
$$;

revoke all on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[]) from public, anon;
grant execute on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[]) to authenticated;
