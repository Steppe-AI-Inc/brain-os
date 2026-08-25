-- SEM Brain v1 — role knowledge, certification and person AI assistants
begin;

create table if not exists public.role_knowledge_packs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  role_title text not null,
  level int not null default 1 check (level >= 1),
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','review','approved','archived')),
  required_score numeric not null default 80 check (required_score between 0 and 100),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_knowledge_requirements (
  id uuid primary key default gen_random_uuid(),
  knowledge_pack_id uuid not null references public.role_knowledge_packs(id) on delete cascade,
  category text not null,
  title text not null,
  editable_source_required boolean not null default false,
  required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.role_certifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  knowledge_pack_id uuid not null references public.role_knowledge_packs(id) on delete cascade,
  level int not null default 1,
  score numeric,
  status text not null default 'assigned' check (status in ('assigned','in_progress','passed','failed','expired')),
  evidence jsonb not null default '[]'::jsonb,
  assessed_by_profile_id uuid references public.profiles(id) on delete set null,
  passed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id, knowledge_pack_id, level)
);

alter table public.documents
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists knowledge_pack_id uuid references public.role_knowledge_packs(id) on delete set null,
  add column if not exists role_title text,
  add column if not exists source_format text,
  add column if not exists editable_source_required boolean not null default false,
  add column if not exists editable_source_document_id uuid references public.documents(id) on delete set null,
  add column if not exists artifact_version int not null default 1,
  add column if not exists approval_status text not null default 'draft'
    check (approval_status in ('draft','review','approved','superseded','archived'));

create index if not exists role_knowledge_pack_org_idx on public.role_knowledge_packs(organization_id, role_title, level);
create index if not exists role_certification_person_idx on public.role_certifications(person_id, status, updated_at desc);
create index if not exists documents_knowledge_pack_idx on public.documents(knowledge_pack_id, approval_status);

-- Editable originals are first-class company artifacts. Extend the private bucket created
-- by the artifact migration so PPT/PPTX/DOC/DOCX/XLS/XLSX can be retained alongside PDFs.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/markdown','text/csv','application/json',
  'image/png','image/jpeg','image/webp'
]
where id = 'company-artifacts';

-- A pack is complete only when every required item has at least one approved document,
-- and editable-source requirements point to an approved editable source document.
create or replace function public.role_knowledge_pack_missing_requirements(p_pack_id uuid)
returns table(requirement_id uuid, title text, reason text)
language sql stable security definer set search_path = public as $$
  select r.id, r.title,
    case
      when not exists (
        select 1 from public.documents d
        where d.knowledge_pack_id = r.knowledge_pack_id
          and d.category = r.category
          and d.approval_status = 'approved'
      ) then 'approved artifact missing'
      when r.editable_source_required and not exists (
        select 1 from public.documents d
        where d.knowledge_pack_id = r.knowledge_pack_id
          and d.category = r.category
          and d.approval_status = 'approved'
          and (
            lower(coalesce(d.source_format,'')) in ('ppt','pptx','doc','docx','xls','xlsx','fig','figma','key','pages','numbers')
            or d.editable_source_document_id is not null
          )
      ) then 'editable source missing'
      else 'unknown'
    end as reason
  from public.role_knowledge_requirements r
  where r.knowledge_pack_id = p_pack_id
    and r.required = true
    and (
      not exists (
        select 1 from public.documents d
        where d.knowledge_pack_id = r.knowledge_pack_id
          and d.category = r.category
          and d.approval_status = 'approved'
      )
      or (
        r.editable_source_required and not exists (
          select 1 from public.documents d
          where d.knowledge_pack_id = r.knowledge_pack_id
            and d.category = r.category
            and d.approval_status = 'approved'
            and (
              lower(coalesce(d.source_format,'')) in ('ppt','pptx','doc','docx','xls','xlsx','fig','figma','key','pages','numbers')
              or d.editable_source_document_id is not null
            )
        )
      )
    );
$$;

-- -----------------------------------------------------------------------------
-- Per-person AI assistant and founder/owner-controlled automation policy
-- -----------------------------------------------------------------------------

create table if not exists public.assistant_automation_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  name text not null,
  mode text not null default 'draft'
    check (mode in ('manual','draft','auto_routine','fallback_after_timeout')),
  fallback_sla_minutes int not null default 60 check (fallback_sla_minutes >= 1),
  allowed_categories jsonb not null default '[]'::jsonb,
  blocked_categories jsonb not null default '["legal","finance_commitment","salary","discount","contract_signature","production_change"]'::jsonb,
  max_sensitivity visibility_level not null default 'internal',
  version int not null default 1,
  active boolean not null default true,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_ai_assistants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  person_id uuid not null unique references public.people(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  policy_id uuid references public.assistant_automation_policies(id) on delete set null,
  display_name text not null,
  status text not null default 'active' check (status in ('active','paused','retired')),
  disclosure_label text not null default 'AI Assistant',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  assigned_person_id uuid references public.people(id) on delete set null,
  assistant_id uuid references public.person_ai_assistants(id) on delete set null,
  channel text not null default 'brain',
  external_thread_ref text,
  subject text,
  status text not null default 'open' check (status in ('open','waiting_human','ai_handling','closed')),
  sensitivity visibility_level not null default 'internal',
  last_human_reply_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.communication_threads(id) on delete cascade,
  author_type text not null check (author_type in ('human','ai','external','system')),
  author_profile_id uuid references public.profiles(id) on delete set null,
  author_person_id uuid references public.people(id) on delete set null,
  assistant_id uuid references public.person_ai_assistants(id) on delete set null,
  content text not null,
  ai_disclosure boolean not null default false,
  knowledge_refs jsonb not null default '[]'::jsonb,
  automation_policy_snapshot jsonb not null default '{}'::jsonb,
  approval_id uuid references public.approvals(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ai_message_requires_disclosure check (author_type <> 'ai' or ai_disclosure = true)
);

create index if not exists assistant_policy_org_idx on public.assistant_automation_policies(organization_id, active);
create index if not exists person_ai_assistant_org_idx on public.person_ai_assistants(organization_id, status);
create index if not exists communication_thread_assignee_idx on public.communication_threads(assigned_person_id, status, last_message_at desc);
create index if not exists communication_messages_thread_idx on public.communication_messages(thread_id, created_at);

create or replace function public.assistant_takeover_ready(p_thread_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when ap.mode = 'auto_routine' then true
      when ap.mode = 'fallback_after_timeout' then
        coalesce(ct.last_human_reply_at, ct.created_at) <= now() - make_interval(mins => ap.fallback_sla_minutes)
      else false
    end
    from public.communication_threads ct
    join public.person_ai_assistants pa on pa.id = ct.assistant_id and pa.status = 'active'
    join public.assistant_automation_policies ap on ap.id = pa.policy_id and ap.active = true
    where ct.id = p_thread_id
  ), false);
$$;

-- Deactivating employment retires the paired assistant; company knowledge remains in
-- role packs/documents and can later be assigned to a successor role assistant.
create or replace function public.retire_assistant_for_departed_person()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.employment_status in ('terminated','former')
     and old.employment_status is distinct from new.employment_status then
    update public.person_ai_assistants
    set status = 'retired', updated_at = now()
    where person_id = new.id and status <> 'retired';
  end if;
  return new;
end;
$$;

drop trigger if exists people_retire_ai_assistant on public.people;
create trigger people_retire_ai_assistant
after update of employment_status on public.people
for each row execute function public.retire_assistant_for_departed_person();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.role_knowledge_packs enable row level security;
alter table public.role_knowledge_requirements enable row level security;
alter table public.role_certifications enable row level security;
alter table public.assistant_automation_policies enable row level security;
alter table public.person_ai_assistants enable row level security;
alter table public.communication_threads enable row level security;
alter table public.communication_messages enable row level security;

drop policy if exists "knowledge_packs_select_member" on public.role_knowledge_packs;
create policy "knowledge_packs_select_member" on public.role_knowledge_packs for select
using (public.has_organization_access(organization_id));

drop policy if exists "knowledge_packs_write_manager" on public.role_knowledge_packs;
create policy "knowledge_packs_write_manager" on public.role_knowledge_packs for all
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

drop policy if exists "knowledge_requirements_select_member" on public.role_knowledge_requirements;
create policy "knowledge_requirements_select_member" on public.role_knowledge_requirements for select
using (exists(select 1 from public.role_knowledge_packs p where p.id = knowledge_pack_id and public.has_organization_access(p.organization_id)));

drop policy if exists "knowledge_requirements_write_manager" on public.role_knowledge_requirements;
create policy "knowledge_requirements_write_manager" on public.role_knowledge_requirements for all
using (exists(select 1 from public.role_knowledge_packs p where p.id = knowledge_pack_id and public.can_manage_organization_people(p.organization_id)))
with check (exists(select 1 from public.role_knowledge_packs p where p.id = knowledge_pack_id and public.can_manage_organization_people(p.organization_id)));

drop policy if exists "role_certifications_select_scope" on public.role_certifications;
create policy "role_certifications_select_scope" on public.role_certifications for select
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "role_certifications_write_manager" on public.role_certifications;
create policy "role_certifications_write_manager" on public.role_certifications for all
using (public.can_manage_organization_people(organization_id))
with check (public.can_manage_organization_people(organization_id));

-- Every member may inspect their org's automation policy. Only owner/admin can grant or
-- broaden automation authority — an employee cannot increase their own assistant scope.
drop policy if exists "assistant_policies_select_member" on public.assistant_automation_policies;
create policy "assistant_policies_select_member" on public.assistant_automation_policies for select
using (public.has_organization_access(organization_id));

drop policy if exists "assistant_policies_write_owner_admin" on public.assistant_automation_policies;
create policy "assistant_policies_write_owner_admin" on public.assistant_automation_policies for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "person_ai_assistants_select_member" on public.person_ai_assistants;
create policy "person_ai_assistants_select_member" on public.person_ai_assistants for select
using (public.has_organization_access(organization_id));

drop policy if exists "person_ai_assistants_write_owner_admin" on public.person_ai_assistants;
create policy "person_ai_assistants_write_owner_admin" on public.person_ai_assistants for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "communication_threads_select_scope" on public.communication_threads;
create policy "communication_threads_select_scope" on public.communication_threads for select
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = assigned_person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "communication_threads_update_scope" on public.communication_threads;
create policy "communication_threads_update_scope" on public.communication_threads for update
using (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = assigned_person_id and pe.profile_id = public.current_profile_id())
)
with check (
  public.can_manage_organization_people(organization_id)
  or exists(select 1 from public.people pe where pe.id = assigned_person_id and pe.profile_id = public.current_profile_id())
);

drop policy if exists "communication_messages_select_scope" on public.communication_messages;
create policy "communication_messages_select_scope" on public.communication_messages for select
using (exists(
  select 1 from public.communication_threads ct
  where ct.id = thread_id
    and (
      public.can_manage_organization_people(ct.organization_id)
      or exists(select 1 from public.people pe where pe.id = ct.assigned_person_id and pe.profile_id = public.current_profile_id())
    )
));

drop policy if exists "communication_messages_insert_human" on public.communication_messages;
create policy "communication_messages_insert_human" on public.communication_messages for insert
with check (
  author_type = 'human'
  and author_profile_id = public.current_profile_id()
  and exists(
    select 1 from public.communication_threads ct
    where ct.id = thread_id
      and (
        public.can_manage_organization_people(ct.organization_id)
        or exists(select 1 from public.people pe where pe.id = ct.assigned_person_id and pe.profile_id = public.current_profile_id())
      )
  )
);

revoke all on function public.role_knowledge_pack_missing_requirements(uuid) from public;
grant execute on function public.role_knowledge_pack_missing_requirements(uuid) to authenticated;
revoke all on function public.assistant_takeover_ready(uuid) from public;
grant execute on function public.assistant_takeover_ready(uuid) to authenticated;

commit;
