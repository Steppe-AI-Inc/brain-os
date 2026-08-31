-- CRITICAL SECURITY FIX — real, live, actively-exploitable defect found during
-- independent verification of Phase 4 (2026-08-31), NOT pushed by the verifying agent
-- per this project's own standing "no autonomous db push" rule. GATED — requires explicit
-- founder authorization before `supabase db push`.
--
-- 202608310001_factory_notification_event_model.sql revoked EXECUTE on
-- create_founder_notification from `authenticated` and `public` after a live-caught
-- vulnerability where a non-admin AUTHENTICATED user could call it directly (see
-- qa/KNOWN_FAILURE_MODES.md #41). That fix was INCOMPLETE: Supabase's own default
-- privileges (`pg_default_acl`, `postgres` role, schema `public`) grant EXECUTE on every
-- newly created function to `anon`, `authenticated`, AND `service_role` automatically.
-- The migration never explicitly revoked from `anon` — leaving the function callable by
-- a completely UNAUTHENTICATED caller (the public `anon` key, present in every client
-- bundle, no login required at all — strictly worse than the authenticated-only hole
-- already found and fixed).
--
-- Live-proven exploit (independent verification, rolled back, zero residue):
--   begin; set local role anon;
--   select public.create_founder_notification('FACTORY_APPROVAL_REQUIRED','critical',
--     'ANON-ATTACKER-INJECTED','test body', null, null, 'anon-exploit-test-key', true);
--   -- succeeded: returned a real new id, row genuinely inserted.
--   rollback;
-- An unauthenticated attacker could (a) spam arbitrary fake critical founder
-- notifications, and (b) permanently squat a real future dedupe_key (e.g.
-- `agent_stale:<a-real-run-id>` or `work_order_blocked:<a-real-wo-id>:<updated_at>`,
-- both guessable/observable from other public-ish surfaces) to silently suppress a real
-- future founder notification via the same partial-unique-index mechanism the original
-- fix relied on — again with zero authentication required.
--
-- Same-defect-class search performed live (2026-08-31): queried pg_proc for every
-- SECURITY DEFINER function in `public` where `anon` has an EXECUTE grant but
-- `authenticated` does not (the exact signature of "meant to be locked down, anon slipped
-- through") — create_founder_notification is the ONLY function in this database with
-- this shape as of this migration. Not a systemic pattern, but a real, isolated, live
-- security hole nonetheless.

begin;

revoke all on function public.create_founder_notification from anon;

commit;
