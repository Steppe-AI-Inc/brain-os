-- CLAUDE.md-mandated deployment-chain audit (2026-08-27): diffing every live public-schema
-- RLS policy (via pg_policy/pg_get_expr on the linked project) against every policy in
-- schema-v0.7-production-core.sql found three tables live in production with ZERO tracked
-- source anywhere in this repo - no migration file, not in the consolidated schema file:
-- `boards`, `board_columns`, `board_items` (a Kanban-style board feature). Same failure
-- class as KNOWN_FAILURE_MODES.md #6 (sem-artifact-analyze), now for schema instead of an
-- Edge Function.
--
-- Verified NOT an active security risk before recovering as-is: RLS is enabled on all
-- three tables (relrowsecurity=true), all three have 0 rows in production, and no file
-- under web/ references them outside the auto-generated `web/types/database.ts` - meaning
-- no shipped UI path reads or writes this feature. Recovered verbatim from live
-- introspection (pg_get_functiondef, information_schema.columns, pg_constraint) purely so
-- this doesn't stay an undocumented, driftable surface - not a functional addition.
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) >= 1 and char_length(name) <= 120),
  description text,
  color text not null default '#007aff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by_profile_id uuid not null default public.current_profile_id() references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (char_length(name) >= 1 and char_length(name) <= 80),
  canonical_status work_status not null default 'queued',
  color text not null default '#8e8e93' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0 check (position >= 0),
  wip_limit integer check (wip_limit is null or wip_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, board_id)
);

create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  position numeric not null default 1000,
  added_by_profile_id uuid not null default public.current_profile_id() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, task_id),
  foreign key (column_id, board_id) references public.board_columns(id, board_id) on delete restrict
);

alter table public.boards enable row level security;
alter table public.board_columns enable row level security;
alter table public.board_items enable row level security;

create or replace function public.can_manage_board_item(p_board_id uuid, p_task_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
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
create policy "boards_select_scope" on public.boards for select using (public.is_founder_or_admin() or public.has_company_access(company_id));
drop policy if exists "boards_insert_manager" on public.boards;
create policy "boards_insert_manager" on public.boards for insert with check (public.is_founder_or_admin() or (public.is_company_manager(company_id) and created_by_profile_id = public.current_profile_id()));
drop policy if exists "boards_update_manager" on public.boards;
create policy "boards_update_manager" on public.boards for update using (public.is_founder_or_admin() or public.is_company_manager(company_id)) with check (public.is_founder_or_admin() or public.is_company_manager(company_id));
drop policy if exists "boards_delete_manager" on public.boards;
create policy "boards_delete_manager" on public.boards for delete using (public.is_founder_or_admin() or public.is_company_manager(company_id));

drop policy if exists "board_columns_select_scope" on public.board_columns;
create policy "board_columns_select_scope" on public.board_columns for select using (
  exists (select 1 from public.boards b where b.id = board_columns.board_id and (public.is_founder_or_admin() or public.has_company_access(b.company_id)))
);
drop policy if exists "board_columns_write_manager" on public.board_columns;
create policy "board_columns_write_manager" on public.board_columns for all using (
  exists (select 1 from public.boards b where b.id = board_columns.board_id and (public.is_founder_or_admin() or public.is_company_manager(b.company_id)))
) with check (
  exists (select 1 from public.boards b where b.id = board_columns.board_id and (public.is_founder_or_admin() or public.is_company_manager(b.company_id)))
);

drop policy if exists "board_items_select_scope" on public.board_items;
create policy "board_items_select_scope" on public.board_items for select using (
  exists (select 1 from public.boards b where b.id = board_items.board_id and (public.is_founder_or_admin() or public.has_company_access(b.company_id)))
  and exists (select 1 from public.tasks t where t.id = board_items.task_id)
);
drop policy if exists "board_items_insert_scope" on public.board_items;
create policy "board_items_insert_scope" on public.board_items for insert with check (public.can_manage_board_item(board_id, task_id));
drop policy if exists "board_items_update_scope" on public.board_items;
create policy "board_items_update_scope" on public.board_items for update using (public.can_manage_board_item(board_id, task_id)) with check (public.can_manage_board_item(board_id, task_id));
drop policy if exists "board_items_delete_scope" on public.board_items;
create policy "board_items_delete_scope" on public.board_items for delete using (public.can_manage_board_item(board_id, task_id));
