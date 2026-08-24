-- SEM Brain v1 — configurable Work Boards.
--
-- Boards are company-scoped collections of existing public.tasks. Cards never copy
-- task data: board_items stores only membership, column, and rank.

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  color text not null default '#007aff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by_profile_id uuid not null default public.current_profile_id() references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists boards_company_active_name_idx
  on public.boards (company_id, lower(name)) where archived_at is null;
create index if not exists boards_company_updated_idx
  on public.boards (company_id, updated_at desc) where archived_at is null;

create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  canonical_status work_status not null default 'queued',
  color text not null default '#8e8e93' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0 check (position >= 0),
  wip_limit integer check (wip_limit is null or wip_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, board_id)
);
create index if not exists board_columns_board_position_idx
  on public.board_columns (board_id, position, created_at);

create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  position numeric(20,6) not null default 1000,
  added_by_profile_id uuid not null default public.current_profile_id() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, task_id),
  foreign key (column_id, board_id)
    references public.board_columns(id, board_id) on delete restrict
);
create index if not exists board_items_column_position_idx
  on public.board_items (column_id, position, created_at);
create index if not exists board_items_task_idx on public.board_items (task_id);

create or replace function public.sem_audit_board_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.boards;
  v_event text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  v_event := case
    when tg_op = 'INSERT' then 'board_created'
    when tg_op = 'DELETE' then 'board_deleted'
    when old.archived_at is null and new.archived_at is not null then 'board_archived'
    else 'board_updated'
  end;

  insert into public.audit_logs (
    actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id,
    message, metadata
  ) values (
    public.current_profile_id(), public.current_role(), v_event, 'board',
    v_row.id, v_row.company_id, 'Work board changed',
    jsonb_build_object('name', v_row.name)
  );
  return null;
end;
$$;

create or replace function public.sem_audit_board_column_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.board_columns;
  v_company_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  select company_id into v_company_id from public.boards where id = v_row.board_id;

  insert into public.audit_logs (
    actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id,
    message, metadata
  ) values (
    public.current_profile_id(), public.current_role(),
    case when tg_op = 'INSERT' then 'board_column_created'
         when tg_op = 'DELETE' then 'board_column_deleted'
         else 'board_column_updated' end,
    'board_column', v_row.id, v_company_id, 'Work board column changed',
    jsonb_build_object(
      'boardId', v_row.board_id,
      'name', v_row.name,
      'status', v_row.canonical_status
    )
  );
  return null;
end;
$$;

create or replace function public.sem_audit_board_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.board_items;
  v_company_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  select company_id into v_company_id from public.boards where id = v_row.board_id;

  insert into public.audit_logs (
    actor_profile_id, actor_role, event_type, entity_type, entity_id, company_id,
    message, metadata
  ) values (
    public.current_profile_id(), public.current_role(),
    case when tg_op = 'INSERT' then 'board_item_added'
         when tg_op = 'DELETE' then 'board_item_removed'
         else 'board_item_moved' end,
    'task', v_row.task_id, v_company_id, 'Work board card changed',
    jsonb_build_object(
      'boardId', v_row.board_id,
      'columnId', v_row.column_id,
      'position', v_row.position
    )
  );
  return null;
end;
$$;

drop trigger if exists board_audit_change on public.boards;
create trigger board_audit_change
after insert or update or delete on public.boards
for each row execute function public.sem_audit_board_change();

drop trigger if exists board_column_audit_change on public.board_columns;
create trigger board_column_audit_change
after insert or update or delete on public.board_columns
for each row execute function public.sem_audit_board_column_change();

drop trigger if exists board_item_audit_change on public.board_items;
create trigger board_item_audit_change
after insert or update or delete on public.board_items
for each row execute function public.sem_audit_board_item_change();

alter table public.boards enable row level security;
alter table public.board_columns enable row level security;
alter table public.board_items enable row level security;

create or replace function public.can_manage_board_item(p_board_id uuid, p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.boards b
    join public.tasks t on t.id = p_task_id and t.company_id = b.company_id
    where b.id = p_board_id
      and b.archived_at is null
      and (
        public.is_founder_or_admin()
        or public.is_company_manager(b.company_id)
        or exists (
          select 1 from public.people pe
          where pe.id = t.owner_person_id
            and pe.profile_id = public.current_profile_id()
        )
      )
  ), false);
$$;

drop policy if exists "boards_select_scope" on public.boards;
create policy "boards_select_scope" on public.boards for select using (
  public.is_founder_or_admin() or public.has_company_access(company_id)
);
drop policy if exists "boards_insert_manager" on public.boards;
create policy "boards_insert_manager" on public.boards for insert with check (
  public.is_founder_or_admin()
  or (public.is_company_manager(company_id) and created_by_profile_id = public.current_profile_id())
);
drop policy if exists "boards_update_manager" on public.boards;
create policy "boards_update_manager" on public.boards for update using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
) with check (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);
drop policy if exists "boards_delete_manager" on public.boards;
create policy "boards_delete_manager" on public.boards for delete using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

drop policy if exists "board_columns_select_scope" on public.board_columns;
create policy "board_columns_select_scope" on public.board_columns for select using (
  exists (
    select 1 from public.boards b
    where b.id = board_columns.board_id
      and (public.is_founder_or_admin() or public.has_company_access(b.company_id))
  )
);
drop policy if exists "board_columns_write_manager" on public.board_columns;
create policy "board_columns_write_manager" on public.board_columns for all using (
  exists (
    select 1 from public.boards b
    where b.id = board_columns.board_id
      and (public.is_founder_or_admin() or public.is_company_manager(b.company_id))
  )
) with check (
  exists (
    select 1 from public.boards b
    where b.id = board_columns.board_id
      and (public.is_founder_or_admin() or public.is_company_manager(b.company_id))
  )
);

-- A member can discover a board, but sees only cards whose tasks pass task RLS.
drop policy if exists "board_items_select_scope" on public.board_items;
create policy "board_items_select_scope" on public.board_items for select using (
  exists (
    select 1 from public.boards b
    where b.id = board_items.board_id
      and (public.is_founder_or_admin() or public.has_company_access(b.company_id))
  )
  and exists (select 1 from public.tasks t where t.id = board_items.task_id)
);
drop policy if exists "board_items_insert_scope" on public.board_items;
create policy "board_items_insert_scope" on public.board_items for insert with check (
  public.can_manage_board_item(board_id, task_id)
);
drop policy if exists "board_items_update_scope" on public.board_items;
create policy "board_items_update_scope" on public.board_items for update using (
  public.can_manage_board_item(board_id, task_id)
) with check (
  public.can_manage_board_item(board_id, task_id)
);
drop policy if exists "board_items_delete_scope" on public.board_items;
create policy "board_items_delete_scope" on public.board_items for delete using (
  public.can_manage_board_item(board_id, task_id)
);

grant select, insert, update, delete on public.boards to authenticated;
grant select, insert, update, delete on public.board_columns to authenticated;
grant select, insert, update, delete on public.board_items to authenticated;

create or replace function public.create_board_with_defaults(
  p_company_id uuid,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_board_id uuid;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'Board name is required';
  end if;

  insert into public.boards (company_id, name, description, created_by_profile_id)
  values (p_company_id, btrim(p_name), nullif(btrim(p_description), ''), public.current_profile_id())
  returning id into v_board_id;

  insert into public.board_columns (board_id, name, canonical_status, color, position)
  values
    (v_board_id, 'Backlog', 'queued', '#8e8e93', 0),
    (v_board_id, 'In progress', 'in_progress', '#007aff', 1000),
    (v_board_id, 'Blocked', 'blocked', '#ff9500', 2000),
    (v_board_id, 'Done', 'done', '#34c759', 3000);

  return v_board_id;
end;
$$;

create or replace function public.create_board_task(
  p_board_id uuid,
  p_column_id uuid,
  p_title text,
  p_description text default null,
  p_priority priority_level default 'medium',
  p_owner_person_id uuid default null,
  p_deadline timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id uuid;
  v_status work_status;
  v_task_id uuid;
  v_position numeric(20,6);
  v_owner_person_id uuid := p_owner_person_id;
  v_caller_person_id uuid;
begin
  if nullif(btrim(p_title), '') is null then
    raise exception 'Task title is required';
  end if;

  select b.company_id, c.canonical_status
  into v_company_id, v_status
  from public.boards b
  join public.board_columns c on c.board_id = b.id
  where b.id = p_board_id and c.id = p_column_id and b.archived_at is null;

  if v_company_id is null then
    raise exception 'Board or column was not found';
  end if;
  if p_owner_person_id is not null and not exists (
    select 1 from public.people pe
    where pe.id = p_owner_person_id and pe.company_id = v_company_id
  ) then
    raise exception 'Assignee must belong to the board company';
  end if;
  if not (
    public.is_founder_or_admin()
    or public.is_company_manager(v_company_id)
  ) then
    select pe.id into v_caller_person_id
    from public.people pe
    where pe.company_id = v_company_id
      and pe.profile_id = public.current_profile_id()
    limit 1;

    if v_caller_person_id is null then
      raise exception 'A company person record is required to create a board task';
    end if;
    if p_owner_person_id is not null and p_owner_person_id <> v_caller_person_id then
      raise exception 'Employees may assign board tasks only to themselves';
    end if;
    v_owner_person_id := v_caller_person_id;
  end if;

  select coalesce(max(position), 0) + 1000 into v_position
  from public.board_items where column_id = p_column_id;

  insert into public.tasks (
    company_id, title, description, owner_type, owner_person_id, status,
    priority, deadline, source, created_by_profile_id
  ) values (
    v_company_id, btrim(p_title), nullif(btrim(p_description), ''), 'human',
    v_owner_person_id, v_status, p_priority, p_deadline, 'work_board',
    public.current_profile_id()
  ) returning id into v_task_id;

  insert into public.board_items (
    board_id, column_id, task_id, position, added_by_profile_id
  ) values (
    p_board_id, p_column_id, v_task_id, v_position, public.current_profile_id()
  );

  return v_task_id;
end;
$$;

create or replace function public.move_board_item(
  p_item_id uuid,
  p_target_column_id uuid,
  p_position numeric default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_board_id uuid;
  v_company_id uuid;
  v_task_id uuid;
  v_status work_status;
  v_position numeric(20,6);
begin
  select bi.board_id, b.company_id, bi.task_id
  into v_board_id, v_company_id, v_task_id
  from public.board_items bi
  join public.boards b on b.id = bi.board_id
  where bi.id = p_item_id
  for update of bi;

  if v_board_id is null then
    raise exception 'Board item was not found';
  end if;
  select canonical_status into v_status
  from public.board_columns
  where id = p_target_column_id and board_id = v_board_id;
  if v_status is null then
    raise exception 'Target column does not belong to this board';
  end if;

  if p_position is null then
    select coalesce(max(position), 0) + 1000 into v_position
    from public.board_items where column_id = p_target_column_id;
  else
    v_position := p_position;
  end if;

  update public.board_items
  set column_id = p_target_column_id, position = v_position, updated_at = now()
  where id = p_item_id;
  update public.tasks set status = v_status, updated_at = now() where id = v_task_id;

end;
$$;

-- The RPCs are SECURITY INVOKER, so table grants and RLS both apply.
grant select on public.companies, public.profiles, public.company_memberships, public.people, public.tasks, public.audit_logs to authenticated;
grant insert, update on public.tasks to authenticated;

revoke all on function public.sem_audit_board_change() from public, anon, authenticated;
revoke all on function public.sem_audit_board_column_change() from public, anon, authenticated;
revoke all on function public.sem_audit_board_item_change() from public, anon, authenticated;
revoke all on function public.can_manage_board_item(uuid, uuid) from public, anon;
revoke all on function public.create_board_with_defaults(uuid, text, text) from public, anon;
revoke all on function public.create_board_task(uuid, uuid, text, text, priority_level, uuid, timestamptz) from public, anon;
revoke all on function public.move_board_item(uuid, uuid, numeric) from public, anon;
grant execute on function public.can_manage_board_item(uuid, uuid) to authenticated;
grant execute on function public.create_board_with_defaults(uuid, text, text) to authenticated;
grant execute on function public.create_board_task(uuid, uuid, text, text, priority_level, uuid, timestamptz) to authenticated;
grant execute on function public.move_board_item(uuid, uuid, numeric) to authenticated;
