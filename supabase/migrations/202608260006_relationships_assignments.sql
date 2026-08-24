-- Action registry, step 3: company_relationships (ownership/parent structure) and
-- person_assignments (legal employer vs operating company vs manager vs allocation %).
-- Both were explicitly deferred in steps 1-2 until real data existed — the founder has
-- since populated real companies/people through chat, and requested this schema.
--
-- Hard rule driving this migration, in the founder's own words: "SEM Brain must never
-- treat an intention as an already-completed legal transfer." Every relationship carries
-- an explicit state (current/planned/historical/under_restructuring), defaulting to
-- 'planned' — the model must justify 'current', never default to it.

do $$ begin
  create type relationship_state as enum ('current','planned','historical','under_restructuring');
exception when duplicate_object then null; end $$;
do $$ begin
  create type company_relationship_type as enum ('parent_of','owned_by_percentage');
exception when duplicate_object then null; end $$;
do $$ begin
  create type employment_type as enum ('full_time','part_time','contractor','advisor');
exception when duplicate_object then null; end $$;
do $$ begin
  create type assignment_state as enum ('current','planned','historical');
exception when duplicate_object then null; end $$;

-- Reuses the exact owner_profile_id pattern already established in company_sensitive
-- (an individual owner, e.g. the founder personally, vs. a related company) — same
-- classification (company_sensitive/founder_only), same shape, no new pattern invented.
create table if not exists public.company_relationships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  related_company_id uuid references public.companies(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id),
  relationship_type company_relationship_type not null default 'parent_of',
  ownership_pct numeric,
  state relationship_state not null default 'planned',
  effective_date date,
  notes text,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_relationships_owner_check check (
    (case when related_company_id is not null then 1 else 0 end
     + case when owner_profile_id is not null then 1 else 0 end) = 1
  )
);

create table if not exists public.person_assignments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  legal_employer_company_id uuid references public.companies(id) on delete set null,
  operating_company_id uuid references public.companies(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  job_title text,
  manager_person_id uuid references public.people(id) on delete set null,
  employment_type employment_type default 'full_time',
  allocation_pct numeric default 100,
  start_date date,
  end_date date,
  is_primary boolean default true,
  responsibilities text,
  state assignment_state not null default 'current',
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.company_relationships enable row level security;
drop policy if exists "company_relationships_select_founder" on public.company_relationships;
create policy "company_relationships_select_founder" on public.company_relationships for select using (public.is_founder_or_admin());
drop policy if exists "company_relationships_write_founder" on public.company_relationships;
create policy "company_relationships_write_founder" on public.company_relationships for all using (public.is_founder_or_admin()) with check (public.is_founder_or_admin());

alter table public.person_assignments enable row level security;
drop policy if exists "person_assignments_select_scope" on public.person_assignments;
create policy "person_assignments_select_scope" on public.person_assignments for select using (
  public.is_founder_or_admin()
  or public.has_company_access(operating_company_id)
  or exists (select 1 from public.people pe where pe.id = person_assignments.person_id and pe.profile_id = public.current_profile_id())
);
drop policy if exists "person_assignments_write_manager" on public.person_assignments;
create policy "person_assignments_write_manager" on public.person_assignments for all using (
  public.is_founder_or_admin() or public.is_company_manager(operating_company_id)
) with check (
  public.is_founder_or_admin() or public.is_company_manager(operating_company_id)
);

drop function if exists public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb);

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
  p_person_assignments jsonb default '[]'::jsonb
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
  v_new_task_id uuid;
  v_new_task_company_id uuid;
  v_new_approval_id uuid;
  v_new_company_id uuid;
  v_new_person_id uuid;
  v_new_project_id uuid;
  v_new_goal_id uuid;
  v_new_relationship_id uuid;
  v_new_assignment_id uuid;
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

  -- company_relationships_write_founder is the real authorization check — founder/admin
  -- only, matching company_sensitive's classification exactly. ownerProfileId is only
  -- honored if it equals the caller's own profile id (never trusted as an arbitrary
  -- model-supplied value). State defaults to 'planned' at the table level; the model is
  -- instructed to justify 'current', never default to it.
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

  -- person_assignments_write_manager is the real authorization check (company-manager+
  -- of the operating company). personIndex resolves the assignment subject or manager
  -- against people created earlier in this same request, mirroring companyIndex.
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
      'companyRelationships', jsonb_array_length(v_created_relationships), 'personAssignments', jsonb_array_length(v_created_assignments)
    )
  );

  return jsonb_build_object(
    'workOrderId', v_work_order_id, 'createdTasks', v_created_tasks, 'createdApprovals', v_created_approvals,
    'deletedTaskIds', to_jsonb(v_deleted_task_ids),
    'createdCompanies', v_created_companies, 'createdPeople', v_created_people,
    'createdProjects', v_created_projects, 'createdGoals', v_created_goals,
    'createdCompanyRelationships', v_created_relationships, 'createdPersonAssignments', v_created_assignments
  );
end;
$$;

revoke all on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.sem_execute_ai_command(text, jsonb, jsonb, int, jsonb, jsonb, text, int, int, numeric, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
