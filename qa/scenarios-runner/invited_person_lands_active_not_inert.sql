-- PERMANENT REGRESSION — founder-invited profiles must never be left inert.
--
-- Real regression found live while building tonight's multi-org/invite UI work:
-- handle_new_auth_user() (202608310009, BUG-004) makes every new signup inert
-- (active=false) by design - correct for public self-signup. But
-- web/lib/data/people.ts's invitePerson() (the pre-existing, already founder/admin-
-- gated "Invite" button on /people) used to leave the resulting profile permanently
-- inert too, since it never called accept_company_invitation() or set active itself -
-- a founder using a completely legitimate, already-authorized invite flow would
-- produce an account stuck on /pending-activation forever. Fixed by explicitly setting
-- active=true in invitePerson() right after the profile is created.
--
-- This SQL cannot exercise invitePerson() itself (it calls Supabase Auth's real
-- inviteUserByEmail(), a live email-sending API) - it instead asserts the INVARIANT the
-- fix restores: production must never have a profile that both (a) belongs to a real
-- company_membership (proof someone deliberately granted them org access) and
-- (b) is active=false, for longer than a moment mid-provisioning. A live Work-PC
-- Playwright test of the actual /people "Invite" button remains the authoritative
-- end-to-end check.

select
  coalesce(jsonb_agg(jsonb_build_object('profile_id', p.id, 'email', p.email, 'company_id', cm.company_id)), '[]'::jsonb) as inert_profiles_with_membership,
  count(*) = 0 as all_pass
from public.profiles p
join public.company_memberships cm on cm.profile_id = p.id and cm.active = true
where p.active = false;
