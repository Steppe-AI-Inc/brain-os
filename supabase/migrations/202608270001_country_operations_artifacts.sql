-- SEM Brain v1 — Country operations, employee performance cases, and private artifacts
-- Additive migration. No destructive table or column changes.
begin;

-- ---------- PRIVATE ARTIFACT STORAGE ----------
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-artifacts',
  'company-artifacts',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.artifact_company_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, storage
as $$
declare
  folder text;
begin
  folder := (storage.foldername(object_name))[1];
  return folder::uuid;
exception
  when invalid_text_representation or array_subscript_error then
    return null;
end;
$$;

revoke all on function public.artifact_company_id(text) from public;
grant execute on function public.artifact_company_id(text) to authenticated;

drop policy if exists "artifact_select_authorized" on storage.objects;
create policy "artifact_select_authorized"
on storage.objects for select to authenticated
using (
  bucket_id = 'company-artifacts'
  and (
    owner_id = (select auth.uid()::text)
    or public.is_founder_or_admin()
    or public.is_hr_finance()
    or public.is_company_manager(public.artifact_company_id(name))
  )
);

drop policy if exists "artifact_insert_company_member" on storage.objects;
create policy "artifact_insert_company_member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-artifacts'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and (
    public.is_founder_or_admin()
    or public.has_company_access(public.artifact_company_id(name))
  )
);

drop policy if exists "artifact_update_authorized" on storage.objects;
create policy "artifact_update_authorized"
on storage.objects for update to authenticated
using (
  bucket_id = 'company-artifacts'
  and (
    owner_id = (select auth.uid()::text)
    or public.is_founder_or_admin()
    or public.is_hr_finance()
    or public.is_company_manager(public.artifact_company_id(name))
  )
)
with check (
  bucket_id = 'company-artifacts'
  and (
    owner_id = (select auth.uid()::text)
    or public.is_founder_or_admin()
    or public.is_hr_finance()
    or public.is_company_manager(public.artifact_company_id(name))
  )
);

drop policy if exists "artifact_delete_authorized" on storage.objects;
create policy "artifact_delete_authorized"
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-artifacts'
  and (
    owner_id = (select auth.uid()::text)
    or public.is_founder_or_admin()
    or public.is_hr_finance()
    or public.is_company_manager(public.artifact_company_id(name))
  )
);

-- ---------- PERFORMANCE CASE DATA ----------
create table if not exists public.performance_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  replacement_person_id uuid references public.people(id) on delete set null,
  title text not null,
  country text,
  role_title text,
  status text not null default 'evidence_gathering'
    check (status in (
      'evidence_gathering',
      'improvement_plan',
      'decision_pending',
      'replacement_search',
      'terminated',
      'closed'
    )),
  rating text not null default 'unrated'
    check (rating in ('unrated', 'on_track', 'needs_improvement', 'critical')),
  summary text,
  expectations jsonb not null default '[]'::jsonb,
  start_date date not null default current_date,
  review_date date,
  decision text,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.performance_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.performance_cases(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'report',
      'evidence',
      'note',
      'review',
      'decision',
      'communication',
      'candidate',
      'system'
    )),
  title text not null,
  details text,
  document_id uuid references public.documents(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.documents
  add column if not exists person_id uuid references public.people(id) on delete set null,
  add column if not exists performance_case_id uuid references public.performance_cases(id) on delete set null;

alter table public.tasks
  add column if not exists performance_case_id uuid references public.performance_cases(id) on delete set null;

alter table public.approvals
  add column if not exists performance_case_id uuid references public.performance_cases(id) on delete set null;

create index if not exists performance_cases_company_idx
  on public.performance_cases(company_id, status, updated_at desc);
create index if not exists performance_cases_person_idx
  on public.performance_cases(person_id, created_at desc);
create index if not exists performance_case_events_case_idx
  on public.performance_case_events(case_id, created_at desc);
create index if not exists documents_performance_case_idx
  on public.documents(performance_case_id, created_at desc);
create index if not exists tasks_performance_case_idx
  on public.tasks(performance_case_id, created_at desc);
create index if not exists approvals_performance_case_idx
  on public.approvals(performance_case_id, created_at desc);

alter table public.performance_cases enable row level security;
alter table public.performance_case_events enable row level security;

drop policy if exists "performance_cases_select_authorized" on public.performance_cases;
create policy "performance_cases_select_authorized"
on public.performance_cases for select
using (
  public.is_founder_or_admin()
  or public.is_hr_finance()
  or public.is_company_manager(company_id)
);

drop policy if exists "performance_cases_insert_authorized" on public.performance_cases;
create policy "performance_cases_insert_authorized"
on public.performance_cases for insert
with check (
  public.is_founder_or_admin()
  or public.is_hr_finance()
  or public.is_company_manager(company_id)
);

drop policy if exists "performance_cases_update_authorized" on public.performance_cases;
create policy "performance_cases_update_authorized"
on public.performance_cases for update
using (
  public.is_founder_or_admin()
  or public.is_hr_finance()
  or public.is_company_manager(company_id)
)
with check (
  public.is_founder_or_admin()
  or public.is_hr_finance()
  or public.is_company_manager(company_id)
);

drop policy if exists "performance_cases_delete_founder" on public.performance_cases;
create policy "performance_cases_delete_founder"
on public.performance_cases for delete
using (public.is_founder_or_admin());

drop policy if exists "performance_case_events_select_authorized" on public.performance_case_events;
create policy "performance_case_events_select_authorized"
on public.performance_case_events for select
using (
  exists (
    select 1
    from public.performance_cases pc
    where pc.id = performance_case_events.case_id
      and (
        public.is_founder_or_admin()
        or public.is_hr_finance()
        or public.is_company_manager(pc.company_id)
      )
  )
);

drop policy if exists "performance_case_events_insert_authorized" on public.performance_case_events;
create policy "performance_case_events_insert_authorized"
on public.performance_case_events for insert
with check (
  exists (
    select 1
    from public.performance_cases pc
    where pc.id = performance_case_events.case_id
      and (
        public.is_founder_or_admin()
        or public.is_hr_finance()
        or public.is_company_manager(pc.company_id)
      )
  )
);

-- ---------- TRANSACTIONAL CASE ACTIONS ----------
create or replace function public.manage_performance_case(
  p_case_id uuid,
  p_action text,
  p_notes text default null,
  p_deadline date default null,
  p_candidate_person_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.performance_cases%rowtype;
  v_profile uuid := public.current_profile_id();
  v_task_id uuid;
  v_approval_id uuid;
  v_event_id uuid;
begin
  select * into v_case
  from public.performance_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Performance case not found';
  end if;

  if not (
    public.is_founder_or_admin()
    or public.is_hr_finance()
    or public.is_company_manager(v_case.company_id)
  ) then
    raise exception 'Not authorized to manage this performance case';
  end if;

  if p_action = 'start_improvement_plan' then
    if p_deadline is null then
      raise exception 'A review deadline is required';
    end if;

    insert into public.tasks (
      company_id,
      owner_person_id,
      performance_case_id,
      title,
      description,
      acceptance_criteria,
      status,
      priority,
      risk_level,
      approval_required,
      deadline,
      source,
      created_by_profile_id
    )
    values (
      v_case.company_id,
      v_case.person_id,
      v_case.id,
      'Complete country leadership performance improvement plan',
      coalesce(nullif(trim(p_notes), ''), 'Meet the documented commercial, operating and reporting expectations.'),
      jsonb_build_array(coalesce(nullif(trim(p_notes), ''), 'Provide objective evidence of completed outcomes.')),
      'queued',
      'critical',
      'high',
      false,
      p_deadline::timestamptz,
      'performance_case',
      v_profile
    )
    returning id into v_task_id;

    update public.performance_cases
    set status = 'improvement_plan',
        rating = 'needs_improvement',
        review_date = p_deadline,
        expectations = jsonb_build_array(coalesce(nullif(trim(p_notes), ''), 'Provide objective evidence of completed outcomes.')),
        updated_at = now()
    where id = v_case.id;

    insert into public.performance_case_events (
      case_id, event_type, title, details, task_id, created_by_profile_id
    )
    values (
      v_case.id, 'review', 'Performance improvement plan started', p_notes, v_task_id, v_profile
    )
    returning id into v_event_id;

  elsif p_action = 'request_termination' then
    if exists (
      select 1
      from public.approvals
      where performance_case_id = v_case.id
        and status = 'pending'
        and approval_payload ->> 'action' = 'terminate_employment'
    ) then
      raise exception 'A termination approval is already pending';
    end if;

    insert into public.approvals (
      company_id,
      performance_case_id,
      title,
      reason,
      domain,
      risk_level,
      status,
      approval_payload,
      requested_by_profile_id
    )
    values (
      v_case.company_id,
      v_case.id,
      'Approve employment termination review',
      coalesce(nullif(trim(p_notes), ''), 'Performance evidence requires a founder and HR/legal decision.'),
      'salary_hr',
      'critical',
      'pending',
      jsonb_build_object(
        'action', 'terminate_employment',
        'person_id', v_case.person_id,
        'legal_review_required', true,
        'case_id', v_case.id
      ),
      v_profile
    )
    returning id into v_approval_id;

    update public.performance_cases
    set status = 'decision_pending',
        rating = 'critical',
        decision = 'termination_review_requested',
        updated_at = now()
    where id = v_case.id;

    insert into public.performance_case_events (
      case_id, event_type, title, details, approval_id, created_by_profile_id
    )
    values (
      v_case.id, 'decision', 'Termination review requested', p_notes, v_approval_id, v_profile
    )
    returning id into v_event_id;

  elsif p_action = 'start_replacement_search' then
    insert into public.tasks (
      company_id,
      performance_case_id,
      title,
      description,
      status,
      priority,
      risk_level,
      approval_required,
      deadline,
      source,
      created_by_profile_id
    )
    values (
      v_case.company_id,
      v_case.id,
      'Build and assess country CEO replacement shortlist',
      coalesce(nullif(trim(p_notes), ''), 'Source qualified candidates and document evidence, references, compensation expectations and 90-day plan.'),
      'queued',
      'critical',
      'high',
      false,
      p_deadline::timestamptz,
      'performance_case',
      v_profile
    )
    returning id into v_task_id;

    update public.performance_cases
    set status = 'replacement_search',
        updated_at = now()
    where id = v_case.id;

    insert into public.performance_case_events (
      case_id, event_type, title, details, task_id, created_by_profile_id
    )
    values (
      v_case.id, 'candidate', 'Replacement search opened', p_notes, v_task_id, v_profile
    )
    returning id into v_event_id;

  elsif p_action = 'nominate_replacement' then
    if p_candidate_person_id is null then
      raise exception 'A replacement candidate is required';
    end if;

    if not exists (
      select 1 from public.people
      where id = p_candidate_person_id
    ) then
      raise exception 'Replacement candidate not found';
    end if;

    insert into public.approvals (
      company_id,
      performance_case_id,
      title,
      reason,
      domain,
      risk_level,
      status,
      approval_payload,
      requested_by_profile_id
    )
    values (
      v_case.company_id,
      v_case.id,
      'Approve country CEO replacement candidate',
      coalesce(nullif(trim(p_notes), ''), 'Candidate requires founder and HR approval before appointment.'),
      'salary_hr',
      'critical',
      'pending',
      jsonb_build_object(
        'action', 'hire_replacement',
        'candidate_person_id', p_candidate_person_id,
        'case_id', v_case.id
      ),
      v_profile
    )
    returning id into v_approval_id;

    update public.performance_cases
    set replacement_person_id = p_candidate_person_id,
        status = 'replacement_search',
        updated_at = now()
    where id = v_case.id;

    insert into public.performance_case_events (
      case_id, event_type, title, details, approval_id, created_by_profile_id
    )
    values (
      v_case.id, 'candidate', 'Replacement candidate nominated', p_notes, v_approval_id, v_profile
    )
    returning id into v_event_id;

  else
    raise exception 'Unsupported performance case action';
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    company_id,
    message,
    metadata
  )
  values (
    v_profile,
    public.current_role(),
    'performance_case_action',
    'performance_case',
    v_case.id,
    v_case.company_id,
    p_action,
    jsonb_build_object(
      'task_id', v_task_id,
      'approval_id', v_approval_id,
      'event_id', v_event_id
    )
  );

  return coalesce(v_approval_id, v_task_id, v_event_id);
end;
$$;

create or replace function public.finalize_performance_case_action(
  p_case_id uuid,
  p_action text,
  p_notes text,
  p_effective_date date,
  p_legal_review_confirmed boolean,
  p_candidate_person_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.performance_cases%rowtype;
  v_profile uuid := public.current_profile_id();
begin
  select * into v_case
  from public.performance_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Performance case not found';
  end if;

  if not (
    public.is_founder_or_admin()
    or public.is_hr_finance()
  ) then
    raise exception 'Only founder/admin or HR-finance may finalize employment decisions';
  end if;

  if not p_legal_review_confirmed then
    raise exception 'Local employment-law review must be confirmed';
  end if;

  if p_effective_date is null then
    raise exception 'An effective date is required';
  end if;

  if p_action = 'finalize_termination' then
    if not exists (
      select 1
      from public.approvals
      where performance_case_id = v_case.id
        and status = 'approved'
        and approval_payload ->> 'action' = 'terminate_employment'
    ) then
      raise exception 'An approved termination decision is required';
    end if;

    update public.people
    set active = false,
        updated_at = now()
    where id = v_case.person_id;

    update public.performance_cases
    set status = 'terminated',
        decision = 'employment_terminated',
        closed_at = p_effective_date::timestamptz,
        updated_at = now()
    where id = v_case.id;

    insert into public.performance_case_events (
      case_id, event_type, title, details, created_by_profile_id
    )
    values (
      v_case.id,
      'decision',
      'Employment termination recorded',
      concat('Effective ', p_effective_date::text, '. ', coalesce(p_notes, '')),
      v_profile
    );

  elsif p_action = 'finalize_hire' then
    if p_candidate_person_id is null then
      raise exception 'A replacement candidate is required';
    end if;

    if not exists (
      select 1
      from public.approvals
      where performance_case_id = v_case.id
        and status = 'approved'
        and approval_payload ->> 'action' = 'hire_replacement'
        and approval_payload ->> 'candidate_person_id' = p_candidate_person_id::text
    ) then
      raise exception 'An approved hiring decision for this candidate is required';
    end if;

    update public.people
    set company_id = v_case.company_id,
        active = true,
        updated_at = now()
    where id = p_candidate_person_id;

    if not found then
      raise exception 'Replacement candidate not found';
    end if;

    update public.performance_cases
    set replacement_person_id = p_candidate_person_id,
        status = 'closed',
        decision = 'replacement_hired',
        closed_at = now(),
        updated_at = now()
    where id = v_case.id;

    insert into public.performance_case_events (
      case_id, event_type, title, details, created_by_profile_id
    )
    values (
      v_case.id,
      'decision',
      'Replacement country CEO appointment recorded',
      concat('Effective ', p_effective_date::text, '. ', coalesce(p_notes, '')),
      v_profile
    );

  else
    raise exception 'Unsupported final performance action';
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    company_id,
    message,
    metadata
  )
  values (
    v_profile,
    public.current_role(),
    'performance_case_finalized',
    'performance_case',
    v_case.id,
    v_case.company_id,
    p_action,
    jsonb_build_object(
      'effective_date', p_effective_date,
      'candidate_person_id', p_candidate_person_id,
      'legal_review_confirmed', p_legal_review_confirmed
    )
  );
end;
$$;

revoke all on function public.manage_performance_case(uuid, text, text, date, uuid) from public;
revoke all on function public.finalize_performance_case_action(uuid, text, text, date, boolean, uuid) from public;
grant execute on function public.manage_performance_case(uuid, text, text, date, uuid) to authenticated;
grant execute on function public.finalize_performance_case_action(uuid, text, text, date, boolean, uuid) to authenticated;

commit;
