-- Canonical Work Order model — staged, compatibility-safe migration.
--
-- Direct schema inspection (docs/software-factory/CANONICAL_WORK_ORDER_INSPECTION.md)
-- confirmed `public.work_orders` has ZERO FK relationship to `goals` or `tasks` today —
-- it is exclusively the AI chat-command audit log (one row per chat turn: command +
-- context_pack + output), never a business "Work Order." Overloading it for the
-- Software Factory's Goal -> Work Order -> Task chain would create a bad semantic model
-- where "what's our revenue?" and "Build Partner Revenue Dashboard" are the same entity
-- type. Founder direction 2026-08-29: semantic separation, staged (not a reckless rename).
--
-- STAGE A — rename the existing load-bearing table to what it actually is
-- (`ai_command_runs`). Every column, RLS behavior, and RPC stays functionally identical —
-- this is a pure naming fix, zero behavioral change. Frees the `work_orders` name for its
-- real canonical meaning.
--
-- STAGE B — introduce the new canonical `public.work_orders`
-- (Company -> Goal -> Work Order -> Task), a real FK `tasks.work_order_id`, a real FK
-- `ai_command_runs.work_order_id` (nullable — most chat commands never create a
-- persistent Work Order), and a real FK `work_orders.goal_id -> goals.id`.
--
-- STAGE C — introduce `public.agent_runs` (Task -> Agent Assignment -> Agent Run), the
-- one genuinely new execution concept with no canonical equivalent anywhere in the
-- existing schema (an Agent Definition and one execution of that agent are different
-- things — public.agents already models the definition). Execution EVENTS are
-- deliberately NOT given a new table — the existing append-only `audit_logs`
-- (entity_type/entity_id/event_type/metadata) already models exactly this shape
-- (entity_type = 'agent_run') and is reused unchanged, per "inspect existing models
-- before adding them."
--
-- Explicitly NOT done here (deliberate scope decision, not an oversight): `model_usage
-- .work_order_id` / `ai_reply_log.work_order_id` keep their current column names. Both
-- are internal token/cost-tracking FKs, not user-facing "Work Order" concepts — nobody
-- confuses them with the canonical business Work Order in practice, and the FK itself
-- continues to correctly reference `ai_command_runs.id` after Stage A (a table rename
-- does not change what a foreign key column points to). Renaming every internal FK
-- column that happens to share the words "work order" would multiply blast radius for a
-- collision risk that doesn't actually exist for these two tables.
--
-- No archive/restore RPCs or lifecycle-guard trigger for the new `work_orders` yet —
-- deliberately minimal v1 (real canonical chain, real RLS, real FKs) scoped to what
-- Phase 5's bootstrap acceptance test actually needs. The proven archive/restore pattern
-- (archive_task/archive_goal) is a natural, low-risk follow-up once this base model is
-- proven live, not a blocker for it.

begin;

-- ============================================================================
-- STAGE A — rename work_orders -> ai_command_runs (zero behavioral change)
-- ============================================================================

alter table public.work_orders rename to ai_command_runs;
alter table public.ai_command_runs rename constraint work_orders_pkey to ai_command_runs_pkey;
alter table public.ai_command_runs rename constraint work_orders_assigned_agent_id_fkey to ai_command_runs_assigned_agent_id_fkey;
alter table public.ai_command_runs rename constraint work_orders_channel_id_fkey to ai_command_runs_channel_id_fkey;
alter table public.ai_command_runs rename constraint work_orders_company_id_fkey to ai_command_runs_company_id_fkey;
alter table public.ai_command_runs rename constraint work_orders_created_by_profile_id_fkey to ai_command_runs_created_by_profile_id_fkey;
alter index public.work_orders_channel_idx rename to ai_command_runs_channel_idx;

alter policy "work_orders_select_scope" on public.ai_command_runs rename to "ai_command_runs_select_scope";
alter policy "work_orders_insert_auth" on public.ai_command_runs rename to "ai_command_runs_insert_auth";
alter policy "work_orders_update_admin" on public.ai_command_runs rename to "ai_command_runs_update_admin";

-- create_pending_work_order -> create_pending_ai_command_run (function NAME changes, so
-- create-or-replace can't do it in place — drop the old signature, create the new one).
drop function if exists public.create_pending_work_order(text, jsonb, uuid);

create function public.create_pending_ai_command_run(p_command text, p_context_pack jsonb, p_channel_id uuid default null)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  insert into public.ai_command_runs (command, status, context_pack, created_by_profile_id, channel_id)
  values (p_command, 'queued', p_context_pack, public.current_profile_id(), p_channel_id)
  returning id into v_id;

  if p_channel_id is not null then
    update public.chat_channels set updated_at = now() where id = p_channel_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_pending_ai_command_run(text, jsonb, uuid) from public, anon;
grant execute on function public.create_pending_ai_command_run(text, jsonb, uuid) to authenticated;

-- mark_work_order_failed -> mark_ai_command_run_failed (same reason, drop + recreate).
drop function if exists public.mark_work_order_failed(uuid, text);

create function public.mark_ai_command_run_failed(p_ai_command_run_id uuid, p_error text)
returns void
language plpgsql
security invoker
as $$
begin
  update public.ai_command_runs
  set status = 'rejected', output = jsonb_build_object('error', p_error), updated_at = now()
  where id = p_ai_command_run_id;
end;
$$;

revoke all on function public.mark_ai_command_run_failed(uuid, text) from public, anon;
grant execute on function public.mark_ai_command_run_failed(uuid, text) to authenticated;

-- sem_execute_ai_command keeps its name (it genuinely does "execute an AI command") but
-- is redefined: p_work_order_id -> p_ai_command_run_id (same position/type, but Postgres
-- refuses to change a parameter NAME via create-or-replace even when the signature is
-- otherwise identical - confirmed live by the rollback-tested run this migration was
-- drafted from: "ERROR 42P13: cannot change name of input parameter" - hence the explicit
-- drop first), every internal reference to public.work_orders -> public.ai_command_runs,
-- the audit_logs entity_type tag 'work_order' -> 'ai_command_run', and the returned jsonb
-- key 'workOrderId' -> 'aiCommandRunId'. Zero other behavioral change — every other branch
-- (tasks/approvals/companies/people/projects/goals/relationships/assignments/memories/
-- deleted tasks) is byte-identical to the version this replaces.
drop function if exists public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, uuid);

create function public.sem_execute_ai_command(
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
  p_deleted_task_ids uuid[] default '{}'::uuid[],
  p_companies jsonb default '[]'::jsonb,
  p_people jsonb default '[]'::jsonb,
  p_projects jsonb default '[]'::jsonb,
  p_goals jsonb default '[]'::jsonb,
  p_company_relationships jsonb default '[]'::jsonb,
  p_person_assignments jsonb default '[]'::jsonb,
  p_ai_command_run_id uuid default null,
  p_memory_candidates jsonb default '[]'::jsonb,
  p_primary_company_id uuid default null
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_ai_command_run_id uuid;
  v_task jsonb;
  v_approval jsonb;
  v_company jsonb;
  v_person jsonb;
  v_project jsonb;
  v_goal jsonb;
  v_relationship jsonb;
  v_assignment jsonb;
  v_memory jsonb;
  v_task_ids uuid[] := '{}';
  v_task_company_ids uuid[] := '{}';
  v_company_ids uuid[] := '{}';
  v_person_ids uuid[] := '{}';
  v_created_tasks jsonb := '[]'::jsonb;
  v_created_approvals jsonb := '[]'::jsonb;
  v_created_companies jsonb := '[]'::jsonb;
  v_created_people jsonb := '[]'::jsonb;
  v_created_projects jsonb := '[]'::jsonb;
  v_created_goals jsonb := '[]'::jsonb;
  v_created_relationships jsonb := '[]'::jsonb;
  v_created_assignments jsonb := '[]'::jsonb;
  v_created_memories jsonb := '[]'::jsonb;
  v_new_task_id uuid;
  v_new_task_company_id uuid;
  v_new_approval_id uuid;
  v_new_company_id uuid;
  v_new_person_id uuid;
  v_new_project_id uuid;
  v_new_goal_id uuid;
  v_new_relationship_id uuid;
  v_new_assignment_id uuid;
  v_new_memory_id uuid;
  v_task_index int;
  v_company_index int;
  v_person_index int;
  v_entry_company_id uuid;
  v_entry_related_company_id uuid;
  v_entry_owner_profile_id uuid;
  v_entry_manager_id uuid;
  v_deleted_task_ids uuid[] := '{}';
begin
  if v_profile_id is null then
    raise exception 'No profile found for the authenticated user';
  end if;

  if p_ai_command_run_id is not null then
    update public.ai_command_runs
    set status = 'done', output = p_output, token_estimate = p_token_estimate, updated_at = now(),
        company_id = coalesce(p_primary_company_id, company_id)
    where id = p_ai_command_run_id
    returning id into v_ai_command_run_id;
  end if;

  if v_ai_command_run_id is null then
    insert into public.ai_command_runs (command, status, context_pack, output, token_estimate, created_by_profile_id, company_id)
    values (p_command, 'done', p_context_pack, p_output, p_token_estimate, v_profile_id, p_primary_company_id)
    returning id into v_ai_command_run_id;
  end if;

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

  for v_company in select * from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb))
  loop
    insert into public.companies (name, country, legal_entity_name, description, organization_type)
    values (
      v_company->>'name',
      nullif(v_company->>'country',''),
      nullif(v_company->>'legalEntityName',''),
      nullif(v_company->>'description',''),
      coalesce(nullif(v_company->>'organizationType',''), 'legal_entity')
    )
    returning id into v_new_company_id;

    v_company_ids := array_append(v_company_ids, v_new_company_id);
    v_created_companies := v_created_companies || jsonb_build_object('id', v_new_company_id, 'name', v_company->>'name');
  end loop;

  for v_person in select * from jsonb_array_elements(coalesce(p_people, '[]'::jsonb))
  loop
    v_company_index := nullif(v_person->>'companyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_person->>'companyId','')::uuid
    end;

    insert into public.people (full_name, email, role_title, company_id)
    values (
      v_person->>'fullName',
      nullif(v_person->>'email',''),
      nullif(v_person->>'roleTitle',''),
      v_entry_company_id
    )
    returning id into v_new_person_id;

    v_person_ids := array_append(v_person_ids, v_new_person_id);
    v_created_people := v_created_people || jsonb_build_object('id', v_new_person_id, 'full_name', v_person->>'fullName');
  end loop;

  for v_project in select * from jsonb_array_elements(coalesce(p_projects, '[]'::jsonb))
  loop
    v_company_index := nullif(v_project->>'companyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_project->>'companyId','')::uuid
    end;

    insert into public.projects (company_id, title, goal, deadline, blockers)
    values (
      v_entry_company_id,
      v_project->>'title',
      nullif(v_project->>'goal',''),
      nullif(v_project->>'deadline','')::date,
      nullif(v_project->>'blockers','')
    )
    returning id into v_new_project_id;

    v_created_projects := v_created_projects || jsonb_build_object('id', v_new_project_id, 'title', v_project->>'title');
  end loop;

  for v_goal in select * from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb))
  loop
    v_company_index := nullif(v_goal->>'companyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_goal->>'companyId','')::uuid
    end;

    insert into public.goals (company_id, title, description, kind, status, due_at)
    values (
      v_entry_company_id,
      v_goal->>'title',
      nullif(v_goal->>'description',''),
      coalesce((v_goal->>'kind')::goal_kind,'ephemeral'::goal_kind),
      coalesce((v_goal->>'status')::goal_status,'draft'::goal_status),
      nullif(v_goal->>'dueAt','')::timestamptz
    )
    returning id into v_new_goal_id;

    v_created_goals := v_created_goals || jsonb_build_object('id', v_new_goal_id, 'title', v_goal->>'title');
  end loop;

  for v_relationship in select * from jsonb_array_elements(coalesce(p_company_relationships, '[]'::jsonb))
  loop
    v_company_index := nullif(v_relationship->>'companyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_relationship->>'companyId','')::uuid
    end;

    v_company_index := nullif(v_relationship->>'relatedCompanyIndex','')::int;
    v_entry_related_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_relationship->>'relatedCompanyId','')::uuid
    end;

    v_entry_owner_profile_id := case
      when nullif(v_relationship->>'ownerProfileId','')::uuid = v_profile_id then v_profile_id
      else null
    end;

    v_new_relationship_id := null;
    if v_entry_company_id is not null
       and ((v_entry_related_company_id is not null)::int + (v_entry_owner_profile_id is not null)::int = 1)
    then
      begin
        if v_entry_related_company_id is not null
           and coalesce((v_relationship->>'state')::relationship_state,'planned'::relationship_state) = 'current'::relationship_state
        then
          v_new_relationship_id := public.set_company_relationship(
            v_entry_company_id,
            v_entry_related_company_id,
            coalesce((v_relationship->>'relationshipType')::company_relationship_type,'parent_of'::company_relationship_type),
            nullif(v_relationship->>'ownershipPct','')::numeric,
            'current'
          );
        else
          insert into public.company_relationships (
            company_id, related_company_id, owner_profile_id, relationship_type,
            ownership_pct, state, effective_date, notes, created_by_profile_id
          ) values (
            v_entry_company_id,
            v_entry_related_company_id,
            v_entry_owner_profile_id,
            coalesce((v_relationship->>'relationshipType')::company_relationship_type,'parent_of'::company_relationship_type),
            nullif(v_relationship->>'ownershipPct','')::numeric,
            coalesce((v_relationship->>'state')::relationship_state,'planned'::relationship_state),
            nullif(v_relationship->>'effectiveDate','')::date,
            nullif(v_relationship->>'notes',''),
            v_profile_id
          )
          returning id into v_new_relationship_id;
        end if;
      exception when others then
        v_new_relationship_id := null;
      end;
    end if;

    if v_new_relationship_id is not null then
      v_created_relationships := v_created_relationships || jsonb_build_object('id', v_new_relationship_id);
    end if;
  end loop;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_person_assignments, '[]'::jsonb))
  loop
    v_person_index := nullif(v_assignment->>'personIndex','')::int;
    v_new_person_id := case
      when v_person_index is not null and v_person_index >= 0 and v_person_index < array_length(v_person_ids,1)
        then v_person_ids[v_person_index+1]
      else nullif(v_assignment->>'personId','')::uuid
    end;

    v_person_index := nullif(v_assignment->>'managerPersonIndex','')::int;
    v_entry_manager_id := case
      when v_person_index is not null and v_person_index >= 0 and v_person_index < array_length(v_person_ids,1)
        then v_person_ids[v_person_index+1]
      else nullif(v_assignment->>'managerPersonId','')::uuid
    end;

    v_company_index := nullif(v_assignment->>'legalEmployerCompanyIndex','')::int;
    v_entry_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_assignment->>'legalEmployerCompanyId','')::uuid
    end;

    v_company_index := nullif(v_assignment->>'operatingCompanyIndex','')::int;
    v_entry_related_company_id := case
      when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
        then v_company_ids[v_company_index+1]
      else nullif(v_assignment->>'operatingCompanyId','')::uuid
    end;

    v_new_assignment_id := null;
    if v_new_person_id is not null then
      begin
        if v_entry_related_company_id is not null
           and coalesce((v_assignment->>'state')::assignment_state,'current'::assignment_state) = 'current'::assignment_state
           and coalesce((v_assignment->>'isPrimary')::boolean, true)
        then
          v_new_assignment_id := public.set_person_assignment(
            v_new_person_id,
            v_entry_related_company_id,
            v_entry_company_id,
            nullif(v_assignment->>'departmentId','')::uuid,
            nullif(v_assignment->>'jobTitle',''),
            v_entry_manager_id,
            coalesce(v_assignment->>'employmentType','full_time'),
            coalesce(nullif(v_assignment->>'allocationPct','')::numeric, 100),
            nullif(v_assignment->>'responsibilities',''),
            true,
            'current'
          );
        else
          insert into public.person_assignments (
            person_id, legal_employer_company_id, operating_company_id, department_id,
            job_title, manager_person_id, employment_type, allocation_pct,
            start_date, end_date, is_primary, responsibilities, state, created_by_profile_id
          ) values (
            v_new_person_id,
            v_entry_company_id,
            v_entry_related_company_id,
            nullif(v_assignment->>'departmentId','')::uuid,
            nullif(v_assignment->>'jobTitle',''),
            v_entry_manager_id,
            coalesce((v_assignment->>'employmentType')::employment_type,'full_time'::employment_type),
            coalesce(nullif(v_assignment->>'allocationPct','')::numeric, 100),
            nullif(v_assignment->>'startDate','')::date,
            nullif(v_assignment->>'endDate','')::date,
            coalesce((v_assignment->>'isPrimary')::boolean, true),
            nullif(v_assignment->>'responsibilities',''),
            coalesce((v_assignment->>'state')::assignment_state,'current'::assignment_state),
            v_profile_id
          )
          returning id into v_new_assignment_id;
        end if;
      exception when others then
        v_new_assignment_id := null;
      end;
    end if;

    if v_new_assignment_id is not null then
      v_created_assignments := v_created_assignments || jsonb_build_object('id', v_new_assignment_id);
    end if;
  end loop;

  for v_memory in select * from jsonb_array_elements(coalesce(p_memory_candidates, '[]'::jsonb))
  loop
    if coalesce(v_memory->>'fact','') <> '' then
      v_company_index := nullif(v_memory->>'companyIndex','')::int;
      v_entry_company_id := case
        when v_company_index is not null and v_company_index >= 0 and v_company_index < array_length(v_company_ids,1)
          then v_company_ids[v_company_index+1]
        else nullif(v_memory->>'companyId','')::uuid
      end;

      insert into public.memories (
        company_id, entity_type, entity_id, fact, source_type, source_id,
        confidence, sensitivity, embedding, created_by_profile_id
      ) values (
        v_entry_company_id,
        coalesce(nullif(v_memory->>'entityType',''), 'chat_channel'),
        nullif(v_memory->>'entityId','')::uuid,
        v_memory->>'fact',
        'ai_chat',
        v_ai_command_run_id,
        coalesce((v_memory->>'confidence')::numeric, 0.8),
        coalesce((v_memory->>'sensitivity')::visibility_level, 'internal'::visibility_level),
        case when v_memory->'embedding' is not null then (v_memory->'embedding')::text::vector else null end,
        v_profile_id
      )
      returning id into v_new_memory_id;

      v_created_memories := v_created_memories || jsonb_build_object('id', v_new_memory_id);
    end if;
  end loop;

  if p_deleted_task_ids is not null and array_length(p_deleted_task_ids, 1) > 0 then
    with removed as (
      delete from public.tasks where id = any(p_deleted_task_ids) returning id
    )
    select coalesce(array_agg(id), '{}') into v_deleted_task_ids from removed;
  end if;

  insert into public.model_usage (profile_id, work_order_id, model_name, input_tokens, output_tokens, estimated_cost_usd)
  values (v_profile_id, v_ai_command_run_id, p_model_name, p_input_tokens, p_output_tokens, p_estimated_cost_usd);

  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id, message, metadata)
  values (
    v_profile_id, public.current_role(), 'ai_command_executed', 'ai_command_run', v_ai_command_run_id, p_primary_company_id,
    'AI command executed through v0.7 production core (transactional)',
    jsonb_build_object(
      'command', p_command, 'model', p_model_name, 'tokenEstimate', p_token_estimate,
      'tasks', jsonb_array_length(v_created_tasks), 'approvals', jsonb_array_length(v_created_approvals),
      'deletedTasks', coalesce(array_length(v_deleted_task_ids,1), 0),
      'companies', jsonb_array_length(v_created_companies), 'people', jsonb_array_length(v_created_people),
      'projects', jsonb_array_length(v_created_projects), 'goals', jsonb_array_length(v_created_goals),
      'companyRelationships', jsonb_array_length(v_created_relationships), 'personAssignments', jsonb_array_length(v_created_assignments),
      'memories', jsonb_array_length(v_created_memories)
    )
  );

  return jsonb_build_object(
    'aiCommandRunId', v_ai_command_run_id, 'createdTasks', v_created_tasks, 'createdApprovals', v_created_approvals,
    'deletedTaskIds', to_jsonb(v_deleted_task_ids),
    'createdCompanies', v_created_companies, 'createdPeople', v_created_people,
    'createdProjects', v_created_projects, 'createdGoals', v_created_goals,
    'createdCompanyRelationships', v_created_relationships, 'createdPersonAssignments', v_created_assignments,
    'createdMemories', v_created_memories
  );
end;
$$;

revoke all on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, uuid) from public, anon;
grant execute on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, uuid) to authenticated;

-- ============================================================================
-- STAGE B — the new canonical public.work_orders (Company -> Goal -> Work Order -> Task)
-- ============================================================================

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  title text not null,
  objective text,
  -- Extensible classification, not a rigid enum — generic Brain OS infrastructure usable
  -- by software development, sales, operations, service, finance, engineering, and future
  -- AI-managed business processes. Adding a new work_type is a one-line check-constraint
  -- migration, not a schema redesign.
  work_type text not null default 'general' check (work_type in (
    'general','software_development','sales','operations','service','finance','engineering'
  )),
  status work_status not null default 'draft',
  priority priority_level not null default 'medium',
  risk_level risk_level not null default 'low',
  acceptance_criteria jsonb not null default '[]'::jsonb,
  owner_type text not null default 'human' check (owner_type in ('human','agent')),
  owner_person_id uuid references public.people(id),
  owner_agent_id uuid references public.agents(id),
  requested_by_profile_id uuid references public.profiles(id),
  created_by_profile_id uuid references public.profiles(id),
  previous_status work_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index work_orders_company_status_idx on public.work_orders (company_id, status);
create index work_orders_goal_idx on public.work_orders (goal_id);

-- Same "unconditional BEFORE INSERT force-creator" pattern as force_task_creator/
-- force_goal_creator/force_company_creator — those were each added after a real bug where
-- both the manual UI path and the AI-creation RPC path left created_by_profile_id null.
create or replace function public.force_work_order_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by_profile_id := public.current_profile_id();
  return new;
end;
$$;
create trigger work_orders_force_creator
  before insert on public.work_orders
  for each row execute function public.force_work_order_creator();

alter table public.work_orders enable row level security;

-- Exact three-tier pattern already proven on tasks/goals/companies: founder/admin,
-- company manager, creator-with-active-membership, plus an owner-person self-view branch
-- (mirrors tasks_select_scope's owner_person_id EXISTS clause).
create policy "work_orders_select_scope" on public.work_orders for select using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or created_by_profile_id = public.current_profile_id()
  or exists (select 1 from public.people pe where pe.id = work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
);

create policy "work_orders_insert_scope" on public.work_orders for insert with check (
  public.is_founder_or_admin() or public.has_company_access(company_id)
);

create policy "work_orders_update_scope" on public.work_orders for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = work_orders.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = work_orders.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
);

-- Delete is manager+/admin only, deliberately narrower than update — same rule as
-- tasks_delete_scope.
create policy "work_orders_delete_scope" on public.work_orders for delete using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- Real FK, not free-text association (tasks.parent_goal was free text — this deliberately
-- does not repeat that gap).
alter table public.tasks add column work_order_id uuid references public.work_orders(id) on delete set null;
create index tasks_work_order_idx on public.tasks (work_order_id);

-- Nullable: a simple informational chat command may legitimately have work_order_id =
-- null (it never created/executed a persistent Work Order). Set only when a command
-- actually creates/executes one.
alter table public.ai_command_runs add column work_order_id uuid references public.work_orders(id) on delete set null;
create index ai_command_runs_work_order_idx on public.ai_command_runs (work_order_id);

-- ============================================================================
-- STAGE C — public.agent_runs (Task -> Agent Assignment -> Agent Run)
-- ============================================================================
-- An Agent Definition (public.agents, already exists) and one execution of that agent are
-- genuinely different concepts. This is the one real gap with no canonical equivalent.
-- Execution EVENTS reuse audit_logs (entity_type = 'agent_run') rather than a new table —
-- audit_logs already models append-only entity/event/metadata exactly.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  agent_id uuid references public.agents(id),
  agent_definition_path text,
  agent_definition_hash text,
  execution_provider text not null default 'claude_code_background' check (execution_provider in ('claude_code_background','claude_code_local')),
  provider_run_id text,
  status work_status not null default 'queued',
  branch text,
  base_commit text,
  head_commit text,
  summary text,
  error text,
  verification_status text check (verification_status in ('pending','live_verified','e2e_verified','failed','blocked')),
  started_at timestamptz,
  finished_at timestamptz,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_runs_task_idx on public.agent_runs (task_id);
create index agent_runs_work_order_idx on public.agent_runs (work_order_id);
create index agent_runs_provider_run_idx on public.agent_runs (provider_run_id);

-- No force-creator trigger here, deliberately: agent_runs' only real insert path is the
-- trusted Runner process (service role, bypasses RLS already) — not a user-facing form —
-- so the spoofing-prevention rationale behind force_task_creator/force_goal_creator
-- doesn't apply the same way. created_by_profile_id is left for the Runner to set
-- explicitly (e.g. to whoever's chat command originated the Work Order, if known) or
-- leave null for an unattributed background bootstrap run.

alter table public.agent_runs enable row level security;

create policy "agent_runs_select_scope" on public.agent_runs for select using (
  public.is_founder_or_admin()
  or (company_id is not null and public.is_company_manager(company_id))
  or created_by_profile_id = public.current_profile_id()
);

create policy "agent_runs_insert_scope" on public.agent_runs for insert with check (
  public.is_founder_or_admin() or company_id is null or public.has_company_access(company_id)
);

create policy "agent_runs_update_scope" on public.agent_runs for update using (
  public.is_founder_or_admin() or (company_id is not null and public.is_company_manager(company_id))
) with check (
  public.is_founder_or_admin() or (company_id is not null and public.is_company_manager(company_id))
);

create policy "agent_runs_delete_scope" on public.agent_runs for delete using (public.is_founder_or_admin());

commit;
