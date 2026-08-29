-- Canonical Work Order model — Deployment A (expand-only, zero-downtime by construction).
--
-- REDESIGNED after a deployment-safety review (2026-08-29) found the original version
-- unsafe: it renamed the live, actively-queried `public.work_orders` table to
-- `ai_command_runs` in the same migration that introduced a new canonical table under the
-- freed-up `work_orders` name. `supabase db push` (DB), `supabase functions deploy`
-- (Edge Function), and the Vercel deploy (web/) are three separate, non-atomic
-- operations. During the real window between them, the CURRENTLY DEPLOYED Edge
-- Function/web code — still calling `create_pending_work_order`/`mark_work_order_failed`,
-- still selecting `command`/`output`/`channel_id` from `work_orders` — would have hit the
-- new canonical table (wrong columns entirely) or a dropped function, breaking the core
-- chat product for the length of that window. Rollback-testing the migration in isolation
-- never exercises this: it proves the DDL is internally consistent, not that a currently
-- running process survives the rollout.
--
-- Fix: expand -> migrate -> contract, per founder direction. This migration is
-- Deployment A only — pure expand, zero renames, zero drops, zero changes to any
-- function/RLS policy/column the live app currently depends on:
--   - New table `public.canonical_work_orders` (deliberately NOT named `work_orders` yet
--     — that name stays exactly what it is today until a later, coordinated cutover).
--   - `public.tasks` gains a new nullable `canonical_work_order_id` column.
--   - The EXISTING, unchanged `public.work_orders` (the AI chat-command audit log) gains
--     a new nullable `canonical_work_order_id` column — this is how "AI Command Run ->
--     optional canonical Work Order" is expressed without renaming anything or forcing
--     informational chat commands to create one.
--   - New table `public.agent_runs` (Task -> Agent Assignment -> Agent Run) — no
--     collision risk, brand new concept.
--
-- Because nothing existing is renamed, dropped, or has its shape changed, the currently
-- deployed Edge Function and web/ code are provably unaffected before, during, and after
-- this migration — no coordinated app deploy is required to push it safely. See
-- docs/software-factory/CANONICAL_WORK_ORDER_MIGRATION.md for the full deployment-safety
-- review, old-code compatibility proof, and the deferred Deployment B/C plan for the
-- eventual work_orders/ai_command_runs rename cutover (not part of this migration).

begin;

-- ============================================================================
-- Company -> Goal -> Work Order -> Task (temporarily named canonical_work_orders)
-- ============================================================================

create table public.canonical_work_orders (
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
create index canonical_work_orders_company_status_idx on public.canonical_work_orders (company_id, status);
create index canonical_work_orders_goal_idx on public.canonical_work_orders (goal_id);

-- Same "unconditional BEFORE INSERT force-creator" pattern as force_task_creator/
-- force_goal_creator/force_company_creator — those were each added after a real bug where
-- both the manual UI path and the AI-creation RPC path left created_by_profile_id null.
create or replace function public.force_canonical_work_order_creator()
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
create trigger canonical_work_orders_force_creator
  before insert on public.canonical_work_orders
  for each row execute function public.force_canonical_work_order_creator();

alter table public.canonical_work_orders enable row level security;

-- Exact three-tier pattern already proven on tasks/goals/companies: founder/admin,
-- company manager, creator-with-active-membership, plus an owner-person self-view branch
-- (mirrors tasks_select_scope's owner_person_id EXISTS clause).
create policy "canonical_work_orders_select_scope" on public.canonical_work_orders for select using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or created_by_profile_id = public.current_profile_id()
  or exists (select 1 from public.people pe where pe.id = canonical_work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
);

create policy "canonical_work_orders_insert_scope" on public.canonical_work_orders for insert with check (
  public.is_founder_or_admin() or public.has_company_access(company_id)
);

create policy "canonical_work_orders_update_scope" on public.canonical_work_orders for update using (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = canonical_work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = canonical_work_orders.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
) with check (
  public.is_founder_or_admin()
  or public.is_company_manager(company_id)
  or exists (select 1 from public.people pe where pe.id = canonical_work_orders.owner_person_id and pe.profile_id = public.current_profile_id())
  or (
    created_by_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = canonical_work_orders.company_id and m.profile_id = public.current_profile_id() and m.active = true
    )
  )
);

-- Delete is manager+/admin only, deliberately narrower than update — same rule as
-- tasks_delete_scope.
create policy "canonical_work_orders_delete_scope" on public.canonical_work_orders for delete using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- Additive only: a brand new nullable column on the LIVE, unchanged tasks table. Old code
-- never selects it, never references it — this is invisible to every currently deployed
-- process. Real FK, not free-text association (tasks.parent_goal was free text — this
-- deliberately does not repeat that gap for the new relationship).
alter table public.tasks add column canonical_work_order_id uuid references public.canonical_work_orders(id) on delete set null;
create index tasks_canonical_work_order_idx on public.tasks (canonical_work_order_id);

-- Additive only: a brand new nullable column on the LIVE, unchanged work_orders table
-- (today's AI chat-command audit log — untouched otherwise by this migration). This is
-- how "AI Command Run -> optional canonical Work Order" is expressed without renaming
-- work_orders or forcing informational chat commands to create one — nullable, set only
-- when a command actually creates/executes a persistent canonical Work Order (not wired
-- up by this migration; that's later application-code work, sequenced after this schema
-- exists and is proven).
alter table public.work_orders add column canonical_work_order_id uuid references public.canonical_work_orders(id) on delete set null;
create index work_orders_canonical_work_order_idx on public.work_orders (canonical_work_order_id);

-- ============================================================================
-- public.agent_runs (Task -> Agent Assignment -> Agent Run)
-- ============================================================================
-- An Agent Definition (public.agents, already exists) and one execution of that agent are
-- genuinely different concepts. This is the one real gap with no canonical equivalent.
-- Execution EVENTS reuse audit_logs (entity_type = 'agent_run') rather than a new table —
-- audit_logs already models append-only entity/event/metadata exactly. Brand new table,
-- zero collision risk with anything live.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  canonical_work_order_id uuid references public.canonical_work_orders(id) on delete set null,
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
create index agent_runs_canonical_work_order_idx on public.agent_runs (canonical_work_order_id);
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
