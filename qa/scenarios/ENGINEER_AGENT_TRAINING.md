# Engineer Agent Training (SC-113)

Mandatory reading for any engineer or coding agent implementing features in Brain OS. The
governing rule:

> **If security blocks the functionality you want, fix the AUTHORIZATION MODEL correctly.
> Never weaken security to make a test pass.** If a test fails, either the policy or the
> test was wrong — find out which before changing either (BRAIN_OS_CONSTITUTION.md step 7).

## Forbidden shortcuts — never do any of these

1. **Disabling RLS** — `alter table … disable row level security` is forbidden, even
   "temporarily" in a migration. A migration rebuilds policies with RLS staying enabled
   (SC-124). RLS is the primary authorization boundary (CLAUDE.md §7).
2. **Using `service_role` in a user-facing request** — no Edge Function or server action
   may construct a service-role client to serve a user request. All 6 Edge Functions use
   the anon key + the caller's JWT so RLS applies (SC-092). A service-role client in a
   request path is an instant security failure.
3. **Making `manager` universal** — a company manager is NOT an admin. They cannot approve
   salary/finance/legal, cannot read cash/ownership, cannot cross companies (SC-057). Do
   not add a manager branch to a founder-only or hr_finance-only policy.
4. **Making `authenticated` universal** — `using (auth.uid() is not null)` on a table with
   company-scoped or sensitive data is a company-blind leak. Gate by
   `has_company_access`/`is_company_manager`/`is_hr_finance`/`is_founder_or_admin`
   (SC-125 signal 3). The only intentional `authenticated`-wide SELECTs are catalog tables
   (`agents`, `ai_providers`), documented as exceptions.
5. **Moving authorization to the frontend** — hiding a button is not security (SC-105). The
   data must be blocked at the DB, not just hidden in the UI. There is no application-level
   permission layer in `web/lib/supabase/server.ts` by design — RLS is it.
6. **Downgrading restricted → internal** — never relax a document/memory sensitivity or a
   policy tier to make data visible for convenience (SC-073). A classification change is
   itself a protected action.
7. **Bypassing approval** — never let a code path (or an LLM instruction) skip the
   forced-approval gate for finance/salary/legal/deletion/external-comms (SC-065, SC-084).
   `detectForcedApprovalKeywords` is server-side for exactly this reason.
8. **Trusting a client- or model-supplied id** — always cross-check against context /
   validate the tenant server-side (SC-071, SC-101). An id is authorization-relevant only
   after it resolves under the caller's own RLS.
9. **Leaving a broad `for all` policy beside a narrow one** — PERMISSIVE policies OR
   together; a leftover broad policy silently wins (KNOWN_FAILURE_MODES.md #1). One
   write policy per table, or a deliberate reviewed combination.
10. **Assuming a safe SELECT implies a safe UPDATE/DELETE** — test every operation
    separately (SC-118). This session found real drift exactly this way.

## The workflow for any change touching a table/approval/agent/external action

Follow BRAIN_OS_CONSTITUTION.md's six steps: security invariants → data classification →
capability matrix → risk level → real RLS/backend enforcement → live impersonation test.
Update the relevant `governance/` file in the SAME change (SC-107). Add a live-impersonation
regression proving both an authorized and an unauthorized persona (SC-118/119 pattern).

## When you find a bug

Do NOT patch only the one instance. Classify the failure class and search the whole
codebase for it (CLAUDE.md §12/§13). Write the regression FIRST/alongside the fix. See
`REGRESSION_RULE.md`. Schema/RLS/SECURITY-DEFINER pushes need explicit live founder
authorization before `supabase db push` — never push one unattended.
