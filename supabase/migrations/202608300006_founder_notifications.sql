-- Software Factory — founder notification mechanism.
--
-- Brain OS itself must own founder-blocker notifications (today the founder only learns
-- about blockers via terminal/Claude Code notifications, which is exactly the gap this
-- closes). In-app first: a real table + Supabase Realtime subscription in the web app.
-- Web Push is a deliberately separate, later slice — not part of this table's scope.
--
-- Founder/admin-only RLS, same shape as every other operator-facing table this session
-- has added (mcp_connectors, plugin_sources, plugin_components).

begin;

create table if not exists public.founder_notifications (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'approval_required','destructive_confirmation_required','db_push_required',
    'production_deploy_required','agent_failed','agent_stale','security_verifier_failed',
    'work_order_blocked','work_order_completed','release_completed','provider_unavailable'
  )),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null,
  body text,
  work_order_id uuid references public.canonical_work_orders(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists founder_notifications_unread_idx
  on public.founder_notifications (created_at desc) where read_at is null;
create index if not exists founder_notifications_work_order_idx on public.founder_notifications (work_order_id);

alter table public.founder_notifications enable row level security;

drop policy if exists "founder_notifications_founder_only" on public.founder_notifications;
create policy "founder_notifications_founder_only" on public.founder_notifications for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

-- Realtime: the web app subscribes to INSERTs on this table for live in-app delivery.
-- Guarded (do/exception, matching this repo's own supabase_vault-extension convention)
-- since this is the first table in this codebase to opt into the supabase_realtime
-- publication — defensive against an environment where it's already added or configured
-- differently, never a hard migration failure over a non-essential add.
do $$ begin
  alter publication supabase_realtime add table public.founder_notifications;
exception when duplicate_object then null; end $$;

commit;
