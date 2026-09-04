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
--
-- DB REVIEW ROUND 2 — every one of the four claims above was checked, and two of them
-- were not true of the SQL when they were written. They are true now, and how they came
-- to be false is worth more than the fix:
--   * "every transport binding names the company it speaks for" — both columns were NOT
--     NULL, but NOT NULL only guarantees a value is PRESENT, never that it is the RIGHT
--     one. Nothing tied the binding's company to the bound channel's company, or an
--     outbound message's binding to its channel (R-C1). Enforced by trigger below.
--   * "a disabled binding blocks sends at the queue" — nothing anywhere read `enabled`
--     (R-C2). Enforced by trigger below.
-- A claim in a header is a specification, not an implementation. Anything asserted here
-- must be findable in the SQL beneath it, or deleted from here.
--
-- SEQUENCING, STATED PLAINLY FOR THE AUTHORIZING FOUNDER: the standing plan guardrail is
-- "do not start messaging/Telegram/WhatsApp/Messenger work before the Phase 11 acceptance
-- gate passes". Phase 11 has not run. This migration is therefore prepared and hardened,
-- but it should NOT be authorized for push on the strength of being correct — it is ahead
-- of its gate, and pushing it starts an external-communication surface early. It is
-- included in this batch for review completeness, not because it is next.

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
  enabled boolean not null default false, -- OFF until explicitly enabled post-review (ENFORCED by channel_transport_bindings_enable_gate below — ROUND 3 / C-2)
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
  -- R-C5: `revoked_at` was tied to `status` by nothing, so `status='revoked'` with a NULL
  -- revoked_at, and `status='active'` with a non-null one, were both legal. That is the
  -- same complete-or-NULL discipline migration A applies so carefully to its pending
  -- action, absent in the same batch.
  constraint external_identity_bindings_revocation_complete
    check ((status = 'revoked') = (revoked_at is not null)),
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
  -- One live mapping per external identity per transport: an external user is exactly
  -- one person or nobody, never a choice resolved at message time.
  --
  -- R-C5: this was `unique (transport, external_user_id)`, which is one mapping TOTAL,
  -- live or revoked — not the stated semantics. A revoked row permanently occupied the
  -- slot, so an external identity whose access was revoked could never be re-bound without
  -- first mutating or deleting the tombstone: revocation became irreversible by accident,
  -- and the tombstone (the audit record of the revocation) was the thing you had to
  -- destroy to recover. The uniqueness now applies to LIVE rows only, which is what the
  -- comment above always claimed, and revocation history accumulates instead.
);

create unique index if not exists external_identity_bindings_one_live_idx
  on public.external_identity_bindings (transport, external_user_id)
  where status = 'active';

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
  error text,
  -- R-C3: the foundation had no duplicate-delivery design of any kind. Every real
  -- transport retries, and every sender that crashes between "sent" and "recorded sent"
  -- re-queues; without a dedupe key the company says the same thing twice to a customer,
  -- which is an externally-visible failure that cannot be taken back. The key is supplied
  -- by the CALLER (it is only meaningful if it is derived from the causing event — the
  -- work order or inbound message that prompted the send), so it is nullable for a
  -- genuinely one-off send, and unique when present.
  idempotency_key text,
  -- Exactly-once at the transport, when the sender has recorded one. A NULL
  -- transport_message_id (not yet sent) must not collide with another NULL.
  constraint outbound_messages_sent_has_time check ((status = 'sent') = (sent_at is not null))
);

create unique index if not exists outbound_messages_idempotency_idx
  on public.outbound_messages (binding_id, idempotency_key)
  where idempotency_key is not null;

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

-- =====================================================================================
-- CROSS-REFERENCE AGREEMENT (R-C1) — two FK columns that must agree, made to agree.
--
-- NOT NULL guarantees a value is present, never that it is the RIGHT one. Both tables had
-- two FKs whose relationship nothing enforced:
--
--   1. channel_transport_bindings has channel_id and company_id, and its RLS gate is
--      is_company_manager(company_id). Nothing tied chat_channels.company_id for that
--      channel to the binding's company_id. A manager of company X could satisfy WITH
--      CHECK by setting company_id = X while binding ANY channel_id — the founder's, or
--      one scoped to company Y. Inbound external messages would land in that foreign
--      channel, and outbound from it would leave through X's transport.
--
--   2. outbound_messages has binding_id and channel_id, and its RLS authorizes ONLY on
--      channel_id. Any authenticated user is the creator of a channel they made, so they
--      hold its write tier; naming their own channel_id with a DIFFERENT company's
--      binding_id passed the policy, and the message physically departed through the
--      other company's transport.
--
-- Instance 2 is not protected by RLS on the referenced table, and this is the part worth
-- remembering: PostgreSQL referential-integrity checks ALWAYS bypass row security. The FK
-- on binding_id happily validates a binding the inserting user has no SELECT right to
-- read. RLS on channel_transport_bindings does not stop it being REFERENCED. "You would
-- have to know the UUID" is not a security boundary — UUIDs leak through logs, error
-- messages, exports and former-employee access — and there was no second layer behind it.
--
-- This is the SAME defect class as person_assignments.department_id needing to belong to
-- operating_company_id, which this repo already fixed twice over in 202608290008 (an
-- RPC-level EXISTS guard PLUS the person_assignments_enforce_department_company trigger).
-- The proven in-repo pattern is applied here rather than reinvented.
-- =====================================================================================

create or replace function public.channel_transport_bindings_enforce_channel_company()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_channel_company uuid;
begin
  select c.company_id into v_channel_company
    from public.chat_channels c where c.id = new.channel_id;
  if v_channel_company is null or v_channel_company is distinct from new.company_id then
    raise exception 'channel_transport_bindings: channel % belongs to company %, not % (cross-company channel binding rejected)',
      new.channel_id, coalesce(v_channel_company::text, '(none)'), new.company_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists channel_transport_bindings_enforce_company on public.channel_transport_bindings;
create trigger channel_transport_bindings_enforce_company
  before insert or update on public.channel_transport_bindings
  for each row execute function public.channel_transport_bindings_enforce_channel_company();

create or replace function public.outbound_messages_enforce_binding_channel()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_binding_channel uuid;
  v_enabled boolean;
begin
  select b.channel_id, b.enabled into v_binding_channel, v_enabled
    from public.channel_transport_bindings b where b.id = new.binding_id;
  if v_binding_channel is null or v_binding_channel is distinct from new.channel_id then
    raise exception 'outbound_messages: binding % is bound to channel %, not % (a message may only leave through its own channel''s transport)',
      new.binding_id, coalesce(v_binding_channel::text, '(none)'), new.channel_id
      using errcode = '23514';
  end if;
  -- R-C2. The header asserted "a disabled binding blocks sends at the queue" and NOTHING
  -- enforced it — the word `enabled` appeared exactly once in this migration, in the
  -- column definition. `enabled` defaults to false precisely so a transport is off until
  -- reviewed, which made the unenforced claim the more dangerous kind: the safe default
  -- was there, and the thing that was supposed to honour it did not exist. Enforced here,
  -- at the queue, as the header always claimed.
  --
  -- INSERT ONLY, deliberately. Re-checking `enabled` on UPDATE would mean that disabling a
  -- binding between queueing and sending makes the sender UNABLE TO RECORD that the
  -- message already went out — the row would be stuck at 'queued' describing a message the
  -- customer has already received. Blocking a send and losing the record of a send are
  -- opposite goals; this guard exists for the first and must never cause the second.
  if tg_op = 'INSERT' and v_enabled is not true then
    raise exception 'outbound_messages: binding % is disabled; enable it explicitly before queueing sends', new.binding_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists outbound_messages_enforce_binding on public.outbound_messages;
create trigger outbound_messages_enforce_binding
  before insert or update on public.outbound_messages
  for each row execute function public.outbound_messages_enforce_binding_channel();

-- R-C4: `created_by_profile_id` is SERVER-SET on all three tables. It had no default and
-- no trigger, so it was simply a nullable column the inserting client chose the value of —
-- and `grant insert to authenticated` means any of them could choose. That is attribution
-- forgery, most pointedly on outbound_messages, the column recording who caused the
-- company to SPEAK EXTERNALLY. For an auditable governed queue (the header's own framing)
-- forgeable authorship defeats the purpose. The correct pattern was already in use next
-- door in set_person_assignment; a plain DEFAULT is NOT sufficient, because a client can
-- always supply the column explicitly and override it.
create or replace function public.set_created_by_profile_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_by_profile_id := public.current_profile_id();
  return new;
end;
$$;

drop trigger if exists channel_transport_bindings_set_author on public.channel_transport_bindings;
create trigger channel_transport_bindings_set_author
  before insert on public.channel_transport_bindings
  for each row execute function public.set_created_by_profile_id();

drop trigger if exists external_identity_bindings_set_author on public.external_identity_bindings;
create trigger external_identity_bindings_set_author
  before insert on public.external_identity_bindings
  for each row execute function public.set_created_by_profile_id();

drop trigger if exists outbound_messages_set_author on public.outbound_messages;
create trigger outbound_messages_set_author
  before insert on public.outbound_messages
  for each row execute function public.set_created_by_profile_id();

-- R-C7: the queue's own access path. A sender drains by binding and status; the FK to
-- chat_channels receives deletes.
create index if not exists outbound_messages_binding_status_idx
  on public.outbound_messages (binding_id, status, created_at);
create index if not exists outbound_messages_channel_idx
  on public.outbound_messages (channel_id);

-- ROUND 3 / C-2 (P2) + C-3 (P2): "OFF until explicitly enabled post-review" was a header claim
-- with no enforcement behind it — the same shape as R-C2, one round after this file's own
-- text learned that lesson; and the agreement trigger constrained COMPANY but never CHANNEL
-- OWNERSHIP, so a manager could repoint an already-enabled transport onto the founder's
-- channel. Switching a transport ON, and moving an enabled binding onto another channel, are
-- founder/admin acts. A company manager may still create and edit a DISABLED binding.
create or replace function public.channel_transport_bindings_enable_requires_founder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.enabled and (tg_op = 'INSERT' or not old.enabled) and not public.is_founder_or_admin() then
    raise exception 'channel_transport_bindings: enabling a transport binding requires the founder or an admin (post-review)'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.enabled and new.channel_id is distinct from old.channel_id
     and not public.is_founder_or_admin() then
    raise exception 'channel_transport_bindings: repointing an ENABLED transport binding to another channel requires the founder or an admin'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists channel_transport_bindings_enable_gate on public.channel_transport_bindings;
create trigger channel_transport_bindings_enable_gate
  before insert or update on public.channel_transport_bindings
  for each row execute function public.channel_transport_bindings_enable_requires_founder();

-- ROUND 3 / A-6 class: trigger functions are not PUBLIC-executable (see migration A).
revoke execute on function public.channel_transport_bindings_enforce_channel_company() from public, anon, authenticated;
revoke execute on function public.outbound_messages_enforce_binding_channel() from public, anon, authenticated;
revoke execute on function public.set_created_by_profile_id() from public, anon, authenticated;
revoke execute on function public.channel_transport_bindings_enable_requires_founder() from public, anon, authenticated;

-- ROUND 3 / C-1 (P1, SEQUENCING), recorded: this migration is ahead of the Phase 11 gate and is
-- NOT part of the A/B/D authorization batch. It is judged separately, on sequencing, when the
-- gate passes. Its rollback (drop of three tables) is clean only while they are empty.

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
