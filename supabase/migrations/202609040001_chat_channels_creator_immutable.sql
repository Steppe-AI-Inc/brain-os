-- ROUND 5 / R5-1 (P1) — chat_channels.created_by_profile_id is the OWNERSHIP signal that
-- migration 202609020003's channel-binding gate (R4-3) trusts, and 202608260008's
-- chat_channels_write_scope policy (FOR ALL, `is_founder_or_admin() OR created_by_profile_id
-- = current_profile_id() OR is_company_manager(company_id)`) lets a company manager UPDATE
-- that very column. The independent DB review (round 5) proved the bypass in one
-- transaction: a manager takes ownership of the founder's channel, plants a disabled
-- transport binding on it, and hands ownership back — the R4-3 gate sees the manager as the
-- owner throughout. The gate is correct; its PREMISE was writable. This is the same class as
-- the retry-column guard (D): guard the authority, and the input the authority reads.
--
-- FIX: created_by_profile_id is immutable after creation except to the founder/admin. No
-- legitimate flow re-assigns a channel's creator, so this only removes the escalation. The
-- column stays freely SETTABLE at INSERT (that is how a channel acquires its creator);
-- 202608260008's own default (current_profile_id()) is unchanged.
--
-- This migration touches a LIVE table's behaviour by adding a BEFORE UPDATE trigger; it adds
-- no column, changes no policy, and is purely restrictive. Rollback: drop the trigger and
-- the function. It is sequenced with migration C (messaging transport) because C's binding
-- gate is what depends on the guarantee; both are outside the A/B/D authorization batch and
-- gated on the Phase 11 sequencing decision.

begin;

create or replace function public.chat_channels_creator_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- current_user is rebound inside SECURITY DEFINER; this trigger is SECURITY INVOKER, so
  -- is_founder_or_admin() reflects the real caller. Only they may reassign a channel's creator.
  if new.created_by_profile_id is distinct from old.created_by_profile_id
     and not public.is_founder_or_admin() then
    raise exception 'chat_channels: created_by_profile_id is immutable — only the founder or an admin may reassign a channel''s creator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.chat_channels_creator_immutable() from public, anon, authenticated;

drop trigger if exists chat_channels_creator_immutable_guard on public.chat_channels;
create trigger chat_channels_creator_immutable_guard
  before update on public.chat_channels
  for each row execute function public.chat_channels_creator_immutable();

commit;

-- ROLLBACK (for the reviewer; not executed by this file):
--   drop trigger if exists chat_channels_creator_immutable_guard on public.chat_channels;
--   drop function if exists public.chat_channels_creator_immutable();
