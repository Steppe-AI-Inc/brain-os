-- External messaging transport foundation (P4). STATUS: FIX PREPARED / REVIEW
-- REQUIRED — NOT pushed; requires founder authorization at `supabase db push`.
-- Design rationale and the one-adapter-interface architecture:
-- docs/MESSAGING-TRANSPORT-ARCHITECTURE.md. Non-negotiables enforced here:
--   * chat_channels stays the ONE canonical channel layer — transports bind to it,
--     never replace it (DO NOT BUILD ANOTHER MESSENGER);
--   * every transport binding names the company it speaks for (explicit org binding);
--   * unknown external users never get employee authority: identity mapping is an
--     explicit founder/manager-created row, absence means no profile, no context,
--     no execution — there is no default;
--   * outbound is governed: every send is an auditable queue row first, and a
--     disabled binding blocks sends at the queue.

begin;

-- ---- 1. Transport -> canonical channel -> organization binding. --------------------
create table if not exists public.channel_transport_bindings (
  id uuid primary key default gen_random_uuid(),
  transport text not null check (transport in ('telegram', 'slack', 'whatsapp', 'messenger', 'viber')),
  -- The transport-side conversation identity (chat id, channel id, phone …) — opaque
  -- text, unique per transport so two canonical channels can never claim one external
  -- conversation.
  external_conversation_id text not null,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  -- The organization this binding speaks for. Explicit and required: an external
  -- conversation with no org binding has no business reaching company data.
  company_id uuid not null references public.companies(id) on delete cascade,
  enabled boolean not null default false, -- OFF until explicitly enabled post-review
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (transport, external_conversation_id)
);

alter table public.channel_transport_bindings enable row level security;
drop policy if exists "channel_transport_bindings_manage_scope" on public.channel_transport_bindings;
create policy "channel_transport_bindings_manage_scope" on public.channel_transport_bindings for all using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
) with check (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);

-- ---- 2. External identity -> profile mapping. AUTHORITY-CRITICAL. -------------------
-- The ONLY way an external sender acquires any Brain OS identity. No row (or a revoked
-- row) means the inbound pipeline refuses the message before any context is read.
create table if not exists public.external_identity_bindings (
  id uuid primary key default gen_random_uuid(),
  transport text not null check (transport in ('telegram', 'slack', 'whatsapp', 'messenger', 'viber')),
  external_user_id text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- One live mapping per external identity per transport: an external user is exactly
  -- one person or nobody, never a choice resolved at message time.
  unique (transport, external_user_id)
);

alter table public.external_identity_bindings enable row level security;
-- Founder/admin only. Deliberately NOT company-manager tier: an identity mapping is
-- platform-wide authority (the mapped profile's memberships decide org reach), so the
-- narrowest existing tier that can reason about the whole platform owns it.
drop policy if exists "external_identity_bindings_founder_scope" on public.external_identity_bindings;
create policy "external_identity_bindings_founder_scope" on public.external_identity_bindings for all
  using (public.is_founder_or_admin())
  with check (public.is_founder_or_admin());

-- ---- 3. Governed outbound queue. ---------------------------------------------------
create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.channel_transport_bindings(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'blocked')),
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  transport_message_id text,
  error text
);

alter table public.outbound_messages enable row level security;
-- Queueing/reading an outbound message requires the channel's WRITE tier — same
-- spelled-out predicate as chat_channel_state (a channel viewer must not be able to
-- speak AS the company externally).
drop policy if exists "outbound_messages_channel_write_scope" on public.outbound_messages;
create policy "outbound_messages_channel_write_scope" on public.outbound_messages for all using (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.chat_channels c
    where c.id = outbound_messages.channel_id
      and (c.created_by_profile_id = public.current_profile_id()
           or (c.company_id is not null and public.is_company_manager(c.company_id)))
  )
) with check (
  public.is_founder_or_admin()
  or exists (
    select 1 from public.chat_channels c
    where c.id = outbound_messages.channel_id
      and (c.created_by_profile_id = public.current_profile_id()
           or (c.company_id is not null and public.is_company_manager(c.company_id)))
  )
);

-- anon gets nothing anywhere (privileged-surface sweep discipline, 202608310004).
revoke all on public.channel_transport_bindings from anon, public;
revoke all on public.external_identity_bindings from anon, public;
revoke all on public.outbound_messages from anon, public;
grant select, insert, update, delete on public.channel_transport_bindings to authenticated;
grant select, insert, update, delete on public.external_identity_bindings to authenticated;
grant select, insert, update, delete on public.outbound_messages to authenticated;

commit;

-- ROLLBACK STRATEGY (for the reviewer; not executed by this file): drop the three
-- tables in reverse order (outbound_messages, external_identity_bindings,
-- channel_transport_bindings). Purely additive — nothing existing reads them until the
-- adapter phase ships behind its own feature flag and deploy authorization.
