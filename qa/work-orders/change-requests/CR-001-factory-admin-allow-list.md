> **SUPERSEDED — NOT CANONICAL.** This file is an implementer draft written on 2026-09-26 on branch `factory/auto-enrollment-v1-contract` under an instruction that the founder has since superseded. The canonical contract, state machines, invariants, security/tenancy contract, governance ADR, WO-1..WO-10, acceptance criteria and verification specification belong to the DIRECTOR on branch `factory/auto-enrollment-v1-director`. Implementation happens on `factory/auto-enrollment-v1-implementation`, based on the exact Director SHA. This file binds nothing. It is retained only as read-only mapping and analysis the Director may consult. Where it differs from the Director branch, the Director branch is right.

# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-001 — Factory admin authority: add a Factory-side admin allow-list (`factory.tenant_admins`)**
Filed 2026-09-26 by the implementer (DESKTOP-8P5HVAO placement). Status: **OPEN — NOT IMPLEMENTED.**

## Requirement affected

The Factory admin authority that governs Computers management: Add Computer, envelope edits, pairing codes, revoke, drain,
archive.

The ratified rule, from the existing governance and RLS pattern (`workers`, `founder_notifications`,
`plugin_operation_requests`), is **founder | holding_admin, re-derived per request**. The factory-admin-api implements exactly
this: it calls Brain OS `/auth/v1/user` and then `rpc/is_founder_or_admin` under the caller's own token.

## Observed evidence

Side finding S1 (source level, PRODUCTION STATE NOT VERIFIED):
- `supabase/migrations/202606190001_sem_brain_v071_production_core.sql:439` creates `profiles_update_self_or_admin` as
  `using (id = public.current_profile_id() or public.is_founder_or_admin())`.
- It has no `with check`, no column-level grant and no guard trigger anywhere in `supabase/`.
- At source level, an authenticated employee can therefore run `update public.profiles set role = 'founder' where id = <own>`.
- After that, `is_founder_or_admin()` returns true for that employee.

The ratified admin rule inherits this: a self-promoted employee would pass the Factory admin check.

## Why implementation cannot satisfy it safely under the current rule

The Factory admin API can only be as strong as the Brain OS fact it re-derives. Fixing S1 is a production migration, which is
BLOCKED — FOUNDER. Adding a second, independent authority source is a security-boundary change, which the implementer may not
make autonomously.

## Proposed alternative

Admin authority = **both**:
- (a) the live Brain OS role `founder | holding_admin`, re-derived per call exactly as today; **and**
- (b) the caller's `auth_user_id` is present in `factory.tenant_admins(tenant_id, brain_os_auth_user_id)`. Only the founder's
  provisioning step writes this table; no API path does.

(b) is stricter than the ratified rule. It never widens authority.

## Compatibility / security impact

- No existing path is affected: the Factory admin API is new.
- The founder must seed `tenant_admins` at provisioning, or nobody can manage Computers. That is fail-closed and visible:
  `denied: not_a_factory_admin`.
- **Until the Director decides:**
  - The admin API implements only the ratified rule.
  - `admin_api_acceptance.mjs` reports the self-promoted-employee row as **EXPOSED — pending CR-001 / S1**. It is never PASS.
  - The handoff states that deploying the admin API before S1 is fixed or this CR is decided exposes Factory administration to
    self-promoted users.
