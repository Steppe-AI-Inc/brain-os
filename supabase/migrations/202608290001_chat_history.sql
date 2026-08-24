-- SEM Brain v1 — persistent private AI Chat history.
-- Conversation content is private to its authenticated owner. Commands may still
-- create separately audited work orders/tasks/approvals through the orchestrator.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  created_by_profile_id uuid not null default public.current_profile_id()
    references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  archived_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_threads_owner_recent_idx
  on public.chat_threads (created_by_profile_id, last_message_at desc)
  where archived_at is null;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  author_profile_id uuid not null default public.current_profile_id()
    references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null check (char_length(content) between 1 and 100000),
  status text not null default 'done' check (status in ('streaming', 'done', 'error')),
  result jsonb,
  usage jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at, id);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_threads_select_own on public.chat_threads;
drop policy if exists chat_threads_insert_own on public.chat_threads;
drop policy if exists chat_threads_update_own on public.chat_threads;
drop policy if exists chat_threads_delete_own on public.chat_threads;
drop policy if exists chat_messages_select_own_thread on public.chat_messages;
drop policy if exists chat_messages_insert_own_thread on public.chat_messages;

create policy chat_threads_select_own
on public.chat_threads for select
using (created_by_profile_id = public.current_profile_id());

create policy chat_threads_insert_own
on public.chat_threads for insert
with check (created_by_profile_id = public.current_profile_id());

create policy chat_threads_update_own
on public.chat_threads for update
using (created_by_profile_id = public.current_profile_id())
with check (created_by_profile_id = public.current_profile_id());

create policy chat_threads_delete_own
on public.chat_threads for delete
using (created_by_profile_id = public.current_profile_id());

create policy chat_messages_select_own_thread
on public.chat_messages for select
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and t.created_by_profile_id = public.current_profile_id()
  )
);

create policy chat_messages_insert_own_thread
on public.chat_messages for insert
with check (
  author_profile_id = public.current_profile_id()
  and exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and t.created_by_profile_id = public.current_profile_id()
  )
);

create or replace function public.sem_audit_chat_thread_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (
    actor_profile_id,
    actor_role,
    event_type,
    entity_type,
    entity_id,
    company_id,
    message,
    metadata
  ) values (
    public.current_profile_id(),
    public.current_role(),
    'chat_thread_deleted',
    'chat_thread',
    old.id,
    old.company_id,
    'Private chat thread deleted',
    jsonb_build_object('title', old.title)
  );
  return old;
end;
$$;

revoke all on function public.sem_audit_chat_thread_delete() from public, anon, authenticated;

drop trigger if exists chat_thread_audit_delete on public.chat_threads;
create trigger chat_thread_audit_delete
after delete on public.chat_threads
for each row execute function public.sem_audit_chat_thread_delete();

grant select, insert, update, delete on public.chat_threads to authenticated;
grant select, insert on public.chat_messages to authenticated;
revoke update, delete on public.chat_messages from anon, authenticated;

comment on table public.chat_threads is
  'Private, RLS-owned AI Native Chat conversations. Not company-visible by default.';
comment on table public.chat_messages is
  'Immutable user/assistant messages belonging to an RLS-owned chat thread.';