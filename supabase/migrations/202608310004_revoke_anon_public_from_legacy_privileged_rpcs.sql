-- Dedicated security review (2026-08-31, founder-authorized), triggered by the "5 older
-- functions" finding disclosed but not fixed in #44/202608310003: create_mcp_connector_secret,
-- delete_mcp_connector_secret, get_mcp_connector_token, set_company_relationship, and
-- set_person_assignment all carry Supabase's default EXECUTE-to-anon/PUBLIC grant, never
-- explicitly revoked when each was created (oldest from 202608260002, newest from
-- 202608290008) — same "meant to be locked down, one role slipped through" signature as
-- #41-#44, just never actually locked down on the grant side to begin with.
--
-- Per-function live verification performed before writing this migration (not assumed):
-- all five gate on `if not is_founder_or_admin()` (`set_person_assignment` also allows
-- `is_company_manager(target company)`) as literally the FIRST statement in the function
-- body, before any read or mutation. Live-tested as the real `anon` role and as a real
-- non-privileged `authenticated` profile (employee): all five correctly raise/deny with
-- zero side effect (confirmed via begin;...rollback; — no vault.secrets row, no
-- company_relationships row, no person_assignments row ever created). Live-tested as the
-- real founder profile: `set_company_relationship`/`set_person_assignment` correctly reach
-- their real insert logic (proven by hitting a genuine FK-constraint error on the
-- deliberately-nonexistent test ids used, not the authorization check) — the intended
-- path is real, not merely returning true. Confirmed intended callers for all five are
-- real logged-in app users (via `web/lib/data/mcp-connectors.ts`'s session-scoped
-- `createClient()`, and via `supabase/functions/sem-ai-command/index.ts`'s
-- caller-JWT-scoped client for `set_person_assignment`) — `authenticated` is a genuine,
-- needed grant; `anon` and the two explicit `PUBLIC` grants are not.
--
-- Classification: OVERPRIVILEGED / DEFENSE-IN-DEPTH FIX REQUIRED for all five — not
-- LIVE EXPLOITABLE today (the internal gate is unconditional and runs first), but this is
-- exactly the fragile shape the codebase has now found three times: any future refactor
-- that adds so much as a logging call, an early return, or a "preview" branch ahead of the
-- existing `if not is_founder_or_admin()` check would silently reopen each of these to a
-- fully unauthenticated caller, with no grant-level signal to catch it. `get_mcp_connector_token`
-- is the highest-value target of the five (it discloses a live, decrypted third-party
-- bearer token, not just an authorization boundary), so revoking here is not merely
-- theoretical hygiene for that one function specifically.
--
-- Scope: only the five functions named in this review. A sixth function with the
-- identical shape (`validate_organization_graph`, already internally gated) was found
-- during the broader sweep this migration's own regression test performs — deliberately
-- NOT bundled into this migration; flagged separately for its own review, per this
-- project's own established practice of keeping a security migration scoped to what was
-- actually reviewed to full depth.

begin;

revoke all on function public.create_mcp_connector_secret(text, text) from anon;
revoke all on function public.delete_mcp_connector_secret(uuid) from anon;
revoke all on function public.get_mcp_connector_token(uuid) from anon;

revoke all on function public.set_company_relationship(uuid, uuid, public.company_relationship_type, numeric, text) from anon, public;
revoke all on function public.set_person_assignment(uuid, uuid, uuid, uuid, text, uuid, text, numeric, text, boolean, text) from anon, public;

-- authenticated is left untouched on all five: confirmed real, needed callers (see above).
-- service_role/postgres are never affected by these revokes.

commit;
