-- Chat channels + real memory retrieval (RAG). Founder's ask, verbatim: "i want to add
-- context side window on ai chat, like in chatgpt, where you can select topic channel
-- and continue. all this information also must be used for training the company's
-- data." Confirmed he means (b) a full embeddings/RAG pipeline, not just wiring the
-- already-dead memoryCandidates field into plain rows.
--
-- Two things were true before this migration: (1) work_orders had no thread/channel
-- column at all — chat was completely flat and stateless, the model never saw a prior
-- turn; (2) the memories table already had a vector(1536) embedding column (pgvector
-- enabled) and the AI's response schema already proposed memoryCandidates, but nothing
-- ever populated the embedding column, no vector index existed, and buildContext()'s
-- memory lookup was a plain ILIKE substring match. This finishes that scaffold.

-- 1. Channels — a minimal grouping table. No new message table: work_orders already is
-- the per-turn message store (from the chat-persistence work earlier this session), so
-- a channel is just a nullable FK on it. Rows with channel_id is null are "General" —
-- every pre-existing turn stays visible there with zero backfill.
create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_id uuid references public.companies(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id),
  archived boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.chat_channels enable row level security;
drop policy if exists "chat_channels_select_scope" on public.chat_channels;
create policy "chat_channels_select_scope" on public.chat_channels for select using (
  public.is_founder_or_admin()
  or created_by_profile_id = public.current_profile_id()
  or (company_id is not null and public.has_company_access(company_id))
);
drop policy if exists "chat_channels_write_scope" on public.chat_channels;
create policy "chat_channels_write_scope" on public.chat_channels for all using (
  public.is_founder_or_admin()
  or created_by_profile_id = public.current_profile_id()
  or (company_id is not null and public.is_company_manager(company_id))
) with check (
  public.is_founder_or_admin()
  or created_by_profile_id = public.current_profile_id()
  or (company_id is not null and public.is_company_manager(company_id))
);

alter table public.work_orders add column if not exists channel_id uuid references public.chat_channels(id) on delete set null;
create index if not exists work_orders_channel_idx on public.work_orders (channel_id, created_at);

-- 2. Real retrieval. security invoker + language sql so memories RLS applies normally
-- to whatever this returns (same "RLS does the real authorization" pattern as every
-- other function this session) — it is not a bypass.
create index if not exists memories_embedding_hnsw_idx on public.memories using hnsw (embedding vector_cosine_ops);

create or replace function public.match_memories(query_embedding vector(1536), match_count int default 8)
returns table (
  id uuid, fact text, entity_type text, entity_id uuid, company_id uuid,
  confidence numeric, sensitivity visibility_level, similarity float8
)
language sql
stable
security invoker
as $$
  select m.id, m.fact, m.entity_type, m.entity_id, m.company_id, m.confidence, m.sensitivity,
         1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.match_memories(vector, int) from public, anon;
grant execute on function public.match_memories(vector, int) to authenticated;

-- 3. create_pending_work_order gains p_channel_id so a message is filed into its
-- channel from the moment the pending row is created (before the LLM call even starts).
drop function if exists public.create_pending_work_order(text, jsonb);

create or replace function public.create_pending_work_order(p_command text, p_context_pack jsonb, p_channel_id uuid default null)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  insert into public.work_orders (command, status, context_pack, created_by_profile_id, channel_id)
  values (p_command, 'queued', p_context_pack, public.current_profile_id(), p_channel_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_pending_work_order(text, jsonb, uuid) from public, anon;
grant execute on function public.create_pending_work_order(text, jsonb, uuid) to authenticated;

-- 4. sem_execute_ai_command gains p_memory_candidates — same drop-and-recreate recipe
-- as every prior parameter addition this session (a new parameter is a new overload,
-- not a replacement). Embeddings themselves are computed in TypeScript (the Edge
-- Function calls OpenAI before this RPC runs, mirroring how every other bit of business
-- logic stays in TS and this function only persists) and arrive as a plain jsonb float
-- array per candidate, cast to vector here.
drop function if exists public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid);

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
  p_deleted_task_ids uuid[] default '{}'::uuid[],
  p_companies jsonb default '[]'::jsonb,
  p_people jsonb default '[]'::jsonb,
  p_projects jsonb default '[]'::jsonb,
  p_goals jsonb default '[]'::jsonb,
  p_company_relationships jsonb default '[]'::jsonb,
  p_person_assignments jsonb default '[]'::jsonb,
  p_work_order_id uuid default null,
  p_memory_candidates jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_work_order_id uuid;
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

  if p_work_order_id is not null then
    update public.work_orders
    set status = 'done', output = p_output, token_estimate = p_token_estimate, updated_at = now()
    where id = p_work_order_id
    returning id into v_work_order_id;
  end if;

  if v_work_order_id is null then
    insert into public.work_orders (command, status, context_pack, output, token_estimate, created_by_profile_id)
    values (p_command, 'done', p_context_pack, p_output, p_token_estimate, v_profile_id)
    returning id into v_work_order_id;
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
    insert into public.companies (name, country, legal_entity_name, description)
    values (
      v_company->>'name',
      nullif(v_company->>'country',''),
      nullif(v_company->>'legalEntityName',''),
      nullif(v_company->>'description','')
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

    if v_entry_company_id is not null
       and ((v_entry_related_company_id is not null)::int + (v_entry_owner_profile_id is not null)::int = 1)
    then
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

    if v_new_person_id is not null then
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

      v_created_assignments := v_created_assignments || jsonb_build_object('id', v_new_assignment_id);
    end if;
  end loop;

  -- Memory candidates arrive pre-validated + pre-embedded from TypeScript (entityType/
  -- entityId already defaulted to 'chat_channel'/the active channel when the model
  -- omitted them, sensitivity already checked against the real enum). The embedding is a
  -- plain jsonb float array here; cast through text to vector. A candidate with no
  -- embedding (the OpenAI call failed or was skipped) still gets the fact saved, just
  -- unsearchable until a later backfill — chat must never hard-fail because of this.
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
        v_work_order_id,
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
  values (v_profile_id, v_work_order_id, p_model_name, p_input_tokens, p_output_tokens, p_estimated_cost_usd);

  insert into public.audit_logs (actor_profile_id, actor_role, event_type, entity_type, entity_id, message, metadata)
  values (
    v_profile_id, public.current_role(), 'ai_command_executed', 'work_order', v_work_order_id,
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
    'workOrderId', v_work_order_id, 'createdTasks', v_created_tasks, 'createdApprovals', v_created_approvals,
    'deletedTaskIds', to_jsonb(v_deleted_task_ids),
    'createdCompanies', v_created_companies, 'createdPeople', v_created_people,
    'createdProjects', v_created_projects, 'createdGoals', v_created_goals,
    'createdCompanyRelationships', v_created_relationships, 'createdPersonAssignments', v_created_assignments,
    'createdMemories', v_created_memories
  );
end;
$$;

revoke all on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) to authenticated;
