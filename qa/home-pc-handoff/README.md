# Home PC → Work PC handoff

First use of this directory (per `qa/IMPLEMENTATION_HANDOFF.md`'s own protocol: Home PC
publishes fix reports here instead of editing `qa/BUG_QUEUE.json` directly). Written
2026-09-01 by the Home PC implementation session, current master `a905df5`.

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

**Anonymous queries against `public.companies` crash instead of returning cleanly
empty.** Root cause: the `companies_select_member` RLS policy is `has_company_access(id)
OR is_investor_viewer_of(id)`, and `is_investor_viewer_of()` has `EXECUTE` granted to
`authenticated`/`service_role`/`postgres` only — never to `anon`. An unauthenticated
request against `companies` throws `permission denied for function
is_investor_viewer_of` (a hard SQL/HTTP error) instead of an empty result set. Confirmed
real and reproducible via `qa/scenarios-runner/sc081_anon_persona_isolated.sql`'s
sibling test (querying `companies` directly instead of `tasks`). Pre-existing —
unrelated to tonight's `create_own_company` migration, not introduced by it. Not fixed
here: needs its own migration (a grant fix), which needs its own authorization. Full
detail in `qa/KNOWN_FAILURE_MODES.md` #58.

Likely severity per your own rubric: probably P2/P3 (not a data leak — it fails closed,
just noisily/incorrectly, likely surfacing as a 500-class error to any caller that hits
`companies` while unauthenticated) — your call, not ours to grade.
