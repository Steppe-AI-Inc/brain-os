# Home PC → Work PC handoff

First use of this directory (per `qa/IMPLEMENTATION_HANDOFF.md`'s own protocol: Home PC
publishes fix reports here instead of editing `qa/BUG_QUEUE.json` directly). Originally
written 2026-09-01 at master `a905df5`; the "new finding" section below was corrected the
same day at master `8f9ae98` after an independent verifier expanded its scope — see the
correction note inline.

## Fix reports (this batch)

- `fixes/BUG-004.json` — **FIX_PUSHED, P1 security, recommend retesting first.**
- `fixes/BUG-001.json` — FIX_PUSHED, but only 2 of 24 occurrences of the failure class.
  Explicitly scoped — do not retest expecting the other 18 to be fixed.
- `fixes/BUG-003.json` — FIX_PUSHED.
- `fixes/BUG-002.json` — **NOT_DEPLOYED.** Fix is written and unit-tested but blocked on
  founder authorization to deploy the Edge Function it touches. Not ready for retest.

All four fix reports for BUG-001/003/004 were independently re-verified by a genuinely
separate `brain-os-verifier` session (not the implementing session) before being reported
here — see `qa/KNOWN_FAILURE_MODES.md` #52/#55/#56/#57 for the full evidence trail. This
report describes what was verified; it does not itself close anything — only an
independent Work-PC retest against the deployed build can do that, per your own stated
authority rule.

## New work this batch, not tied to an existing BUG_ID (nothing for you to retest yet — new territory for you to test fresh)

**Multi-organization milestone (Priority 1 of an overnight founder-directed cycle)**:
- A real organization selector (sidebar, httpOnly cookie, server-revalidated against real
  `company_memberships` on every read) now scopes Dashboard, People, Projects, Tasks,
  Goals, Documents, Memory, and KPI queries by the active org when a user belongs to more
  than one.
- `create_own_company()` (an employee can create and become sole owner of their own,
  fully independent company — founder's explicit "employee creates their own company"
  requirement) is live in production and has a "Create organization" (+) button in the
  sidebar.
- A live isolation acceptance test was run directly against production (not just a
  rolled-back synthetic transaction) across 5 real personas and 8 data surfaces — see
  `qa/KNOWN_FAILURE_MODES.md` #58 for full detail, and
  `qa/scenarios-runner/sc081_create_own_company_full_isolation.sql` /
  `sc081_anon_persona_isolated.sql` to re-run it yourself.
- A "Manager" column was added to `/people`, resolved per-organization from
  `person_assignments` — currently shows "—" for everyone since no real manager data
  exists in production yet (0 of 16 people, 0 of 4 assignments have a manager set). This
  is a real, honest gap in data, not a code defect — worth knowing before you go looking
  for a bug that isn't there.

**Suggested test surface for you**: employee with 2+ real company_memberships switching
active org and confirming People/Projects/Tasks/Goals/Documents/Memory/KPI/Dashboard
actually change; a real employee using "Create organization," confirming their employer
membership is untouched and nobody else at the employer can see the new company; the
Manager column rendering "—" correctly (not a fixture yet, but confirm it doesn't error
or leak another org's manager name).

## New finding, unrelated to anything above — recommend you file this as a fresh BUG_ID

**CORRECTION, 2026-09-01: the note originally posted here understated this finding's
scope as companies-only. A genuinely separate, independent `brain-os-verifier` session
(not the Home PC implementer) re-checked it and expanded the confirmed blast radius to
5 tables. This entry replaces the original one — the corrected scope below is what's
actually true, not an update layered on top of a still-valid partial finding.**

**Anonymous queries against 5 tables — `companies`, `goals`, `financial_reports`,
`documents`, `memories` — crash instead of returning cleanly empty.**

Root cause chain, precise:
1. Each of these 5 tables' SELECT policy (all from
   `202608280004_investor_viewer_scope.sql`) is `has_company_access(id) OR
   is_investor_viewer_of(id)`.
2. `is_investor_viewer_of()` has `EXECUTE` granted to
   `authenticated`/`service_role`/`postgres` only — never to `anon`.
3. Postgres cannot short-circuit away the second `OR` operand once the query planner
   needs to evaluate it, so an anonymous caller — who correctly gets `false` from
   `has_company_access(id)`, no grant issue there — hits the ungranted
   `is_investor_viewer_of()` and Postgres raises `insufficient_privilege` (42501).
4. Result: anonymous reads against these 5 tables throw a hard SQL/HTTP error instead of
   the RLS predicate simply evaluating its second operand to `false` and returning an
   empty result — the same clean-empty-for-anon contract every other table in this
   schema honors.

**Classification, precise — this is NOT an authorization bypass and NOT fail-open.** No
anonymous caller could ever see protected data with or without a fix: `has_company_access`
already denies anon cleanly, and `is_investor_viewer_of()`'s own body requires
`auth.uid()` to match a real, active `investor_viewer` membership — for `anon`,
`auth.uid()` is `NULL`, so the function can only ever return `false` regardless of the
company id passed in. This is a **fail-crash / availability and RLS-evaluation-
correctness defect**: anonymous callers get a 400/42501 where they should get a clean
empty array. No data leak was demonstrated — it was proven not possible, not merely
untested (see the adversarial proof below).

**Pre-existing, confirmed via git history — from `202608280004_investor_viewer_scope.sql`
(2026-08-28), three days before tonight's `create_own_company` migration.** Not
introduced by, or related to, tonight's multi-org work — only surfaced by tonight's
verifier while re-checking something unrelated.

**Fix status: PREPARED, NOT YET PUSHED.** A minimal, single-statement migration
(`supabase/migrations/202609010002_fix_investor_viewer_anon_rls_helper_grant.sql` —
`GRANT EXECUTE ON FUNCTION public.is_investor_viewer_of(uuid) TO anon;`, nothing else —
`authenticated`'s existing grant untouched, `PUBLIC` never granted, no table/service-
role/founder authority touched, no function-body change) has been adversarially proven
live against production: a temporary in-transaction `GRANT` made all 5 tables return a
clean empty result for anon, and a direct enumeration attempt against the function with
3 real company UUIDs plus 1 random nonexistent UUID all returned `false` with zero
differentiation (cannot be used to enumerate real vs. fake company IDs, or investor
relationships, by an anonymous caller) — then rolled back, zero residue confirmed. Full
evidence: `qa/KNOWN_FAILURE_MODES.md` #58 (original, companies-only), #59 (verifier's
scope expansion to 5 tables), #60 (migration preparation + adversarial proof). Regression:
`qa/scenarios-runner/is_investor_viewer_of_anon_grant_fix.sql`.

**This migration is still `BLOCKED — DB PUSH`, pending founder authorization** — not
deployed, not ready for your retest yet. When you file this as a fresh BUG_ID, it's fine
to note a fix already exists and is proven safe; please don't mark it FIX_PUSHED until we
report back that it's actually live.

Likely severity per your own rubric: probably P2/P3 (not a data leak, fails closed just
noisily/incorrectly — a 400/42501-class error to any anonymous caller hitting one of
these 5 tables) — your call to grade, not ours.
