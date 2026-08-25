-- Founder governance doc, section 5: every active employee may have a paired AI
-- assistant ("Aigerim" / "Aigerim AI Assistant"). Conversation policy (how much that
-- assistant is allowed to do on its own) is set by an authorized founder/owner, not by
-- the employee themselves. One row per person; a person with no row defaults to
-- 'manual' (human replies only) in application code, not a default row every insert
-- has to create.
create table if not exists public.person_ai_policy (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people(id) on delete cascade,
  mode text not null default 'manual' check (mode in ('manual', 'draft', 'auto_routine', 'fallback_after_timeout')),
  fallback_sla_minutes integer default 60 check (fallback_sla_minutes > 0),
  allowed_categories jsonb not null default '[]'::jsonb,
  updated_by_profile_id uuid references public.profiles(id),
  updated_at timestamptz default now()
);

alter table public.person_ai_policy enable row level security;

-- Read: founder/admin, the company manager, or the person themselves (they can see their
-- own assistant's authority level, just not change it).
drop policy if exists "person_ai_policy_select" on public.person_ai_policy;
create policy "person_ai_policy_select" on public.person_ai_policy for select using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.people pe
    where pe.id = person_ai_policy.person_id
      and (pe.profile_id = public.current_profile_id() or public.is_company_manager(pe.company_id))
  )
);

-- Write: founder/admin only — "An ordinary employee should not be able to grant their
-- own AI broader authority" (governance doc). Deliberately tighter than the manager-tier
-- write access most other operating tables use.
drop policy if exists "person_ai_policy_write" on public.person_ai_policy;
create policy "person_ai_policy_write" on public.person_ai_policy for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

-- Every AI-authored reply logs actor identity, what it represented, and why it fired —
-- the audit trail the governance doc requires ("actor type, assistant identity,
-- human/role represented, source conversation, knowledge/evidence references,
-- automation policy, timestamp, and approval if applicable").
create table if not exists public.ai_reply_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  channel_id uuid references public.chat_channels(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  mode text not null check (mode in ('draft', 'auto_routine', 'fallback_after_timeout')),
  reply_text text not null,
  evidence_refs jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.ai_reply_log enable row level security;

drop policy if exists "ai_reply_log_select" on public.ai_reply_log;
create policy "ai_reply_log_select" on public.ai_reply_log for select using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.people pe
    where pe.id = ai_reply_log.person_id
      and (pe.profile_id = public.current_profile_id() or public.is_company_manager(pe.company_id))
  )
);

drop policy if exists "ai_reply_log_insert" on public.ai_reply_log;
create policy "ai_reply_log_insert" on public.ai_reply_log for insert with check (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.people pe
    where pe.id = ai_reply_log.person_id and public.is_company_manager(pe.company_id)
  )
);
