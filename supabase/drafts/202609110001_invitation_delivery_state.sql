-- DELIVERY STATE BELONGS TO THE INVITATION — BUG-037's remaining half.
--
-- DELIBERATELY OUTSIDE supabase/migrations/. This file is a DRAFT. It is not in the applied migration path
-- and `supabase db push` will not see it. Applying it is a PRODUCTION DB MIGRATION and therefore
-- BLOCKED — FOUNDER AUTHORIZATION, exactly like 202609090001 in the same directory. Moving it into
-- migrations/ is the authorization, and nothing else should be read as one.
--
-- WHY IT IS NEEDED. The founder's 2026-09-11 contract says "delivery state belongs to the invitation" and
-- "SENT must mean the defined delivery contract reached its terminal success state". company_invitations
-- carries `status` — pending / accepted / revoked / expired — which is the INVITATION axis. There is no
-- DELIVERY axis at all. So today DELIVERY_PENDING and DELIVERY_FAILED exist only in the reply to a single
-- click: reload the page and the distinction is gone, and SENT can never be set by anything, because
-- nothing has anywhere to write it.
--
-- That is why `qa/scenarios-runner/invitation_delivery_state_contract.mjs` row DS-D1 is RED BY DESIGN. It
-- goes green when this lands, and not one hour earlier.
--
-- THE TWO AXES STAY SEPARATE, AND THAT IS THE WHOLE POINT. An invitation that was accepted is not a
-- delivery outcome, and a delivery that failed does not cancel an invitation. Collapsing them back into one
-- column is how "the provider accepted the API request" came to mean "sent" in the first place.
--
--   status          pending -> accepted | revoked | expired          (the INVITATION)
--   delivery_state  pending -> sent | failed                          (the MESSAGE)
--
-- NO PROVIDER TEXT IS STORED. `delivery_error_code` is a short classified code from the application's own
-- vocabulary — the same classification the UI shows — never the provider's string. A provider message names
-- hosts, ports, credentials and internal states, and a database column is a worse place for one than a log.

begin;

alter table public.company_invitations
  add column if not exists delivery_state text not null default 'pending'
    check (delivery_state in ('pending', 'sent', 'failed')),
  -- When the last delivery ATTEMPT was made. Distinct from created_at: a resend does not create a row.
  add column if not exists delivery_attempted_at timestamptz,
  -- When the delivery contract reached TERMINAL SUCCESS. This is the only thing that may justify 'sent',
  -- and it is nullable because nothing can set it until a provider confirmation path exists.
  add column if not exists delivered_at timestamptz,
  -- A code from the application's own outcome vocabulary. Never provider text.
  add column if not exists delivery_error_code text,
  -- How many times delivery has been attempted, so a retry is visible rather than inferred.
  add column if not exists delivery_attempts integer not null default 0;

-- 'sent' WITHOUT A CONFIRMATION TIMESTAMP IS THE DEFECT THIS WHOLE WORK ORDER IS ABOUT.
-- The constraint makes the false SENT unrepresentable rather than merely discouraged: code cannot write
-- 'sent' without also writing the moment delivery was confirmed.
alter table public.company_invitations
  drop constraint if exists company_invitations_sent_requires_confirmation;
alter table public.company_invitations
  add constraint company_invitations_sent_requires_confirmation
  check (delivery_state <> 'sent' or delivered_at is not null);

-- A failure must say which failure, or "retryable" is a guess.
alter table public.company_invitations
  drop constraint if exists company_invitations_failed_requires_code;
alter table public.company_invitations
  add constraint company_invitations_failed_requires_code
  check (delivery_state <> 'failed' or delivery_error_code is not null);

-- Resending is a normal operation, so finding what needs one must not be a table scan.
create index if not exists company_invitations_delivery_retry_idx
  on public.company_invitations (company_id, delivery_state)
  where status = 'pending' and delivery_state <> 'sent';

-- DELIVERY STATE IS NOT CLIENT-WRITABLE. Management RLS already scopes the row to founder/admin or a
-- manager of the company, which is the right audience for READING a delivery state. Writing one is a
-- statement about what a mail provider did, so it belongs to the server identity that talked to the
-- provider, never to a browser session.
--
-- This function is the one writer. SECURITY DEFINER with an explicit authority check rather than an open
-- grant: the same shape as accept_company_invitation, and for the same reason — one narrow audited gate.
create or replace function public.record_invitation_delivery(
  p_invitation_id uuid,
  p_state text,
  p_error_code text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
begin
  if p_state not in ('pending', 'sent', 'failed') then
    raise exception 'unknown delivery state';
  end if;

  select company_id into v_company from public.company_invitations where id = p_invitation_id;
  if v_company is null then
    raise exception 'invitation not found';
  end if;
  if not (public.is_founder_or_admin() or public.is_company_manager(v_company)) then
    raise exception 'not authorized to record delivery for this invitation';
  end if;

  -- 'sent' sets delivered_at HERE, from the database clock, so a caller cannot claim an arbitrary moment
  -- of confirmation. The constraint above makes the pair inseparable; this makes it truthful.
  update public.company_invitations
  set delivery_state = p_state,
      delivery_attempted_at = now(),
      delivery_attempts = delivery_attempts + 1,
      delivered_at = case when p_state = 'sent' then now() else delivered_at end,
      delivery_error_code = case when p_state = 'failed' then p_error_code else null end
  where id = p_invitation_id;
end;
$$;

revoke all on function public.record_invitation_delivery(uuid, text, text) from public, anon;
grant execute on function public.record_invitation_delivery(uuid, text, text) to authenticated;

commit;

-- WHAT THIS FILE STILL DOES NOT GIVE YOU, stated so landing it is not mistaken for closing BUG-037.
--
-- A column for 'sent' is not a confirmation that anything arrived. Setting it truthfully needs a provider
-- that reports delivery — a webhook, or a delivery query — and that is a separate piece of work with its
-- own authorization (a provider account, a secret, a public endpoint). Until it exists, delivery_state
-- moves between 'pending' and 'failed' only, and DS-D1's sibling row should say so rather than let a
-- reachable-looking state imply an unreachable one.
