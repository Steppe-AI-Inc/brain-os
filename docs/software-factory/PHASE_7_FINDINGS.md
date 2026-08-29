# Phase 7 — Software Factory Control Center UI

## What shipped

`web/app/(app)/software-factory/page.tsx` (overview) and
`web/app/(app)/software-factory/[id]/page.tsx` (Work Order detail), backed by
`web/lib/data/factory.ts` — a real server-action data layer against the schema Phase 5/6
already proved live (`canonical_work_orders`, `tasks`, `agent_runs`,
`agents_with_live_status`). No new schema needed for this phase.

Overview shows the master plan's own required set: Active Work Orders, Running Agents,
Verification Failures, Waiting Approvals, Release Ready, Blocked — plus a Recent Work
Orders list and a Registered Agents list with real `live_status`
(`RUNNING`/`IDLE`/`FAILED`/`UNKNOWN`, computed from actual `agent_runs` rows, never
stored). Detail view shows objective, acceptance criteria, tasks, and agent runs
(branch/commit/verification status) for one canonical Work Order.

## Real bug caught before shipping

`tsc --noEmit` caught two real type errors: `agents_with_live_status.id`/`name` are
typed nullable by the generator (a view, not a table — Supabase can't prove non-null the
way it can for a real PK/NOT NULL column), and `tasks.created_at` is genuinely nullable
in the schema. Fixed by a real runtime filter (not a type-cast workaround) for the
former and widening the type honestly for the latter, rather than forcing a false
non-null guarantee.

## Naming collision, resolved

The existing `/software` route (a spec/ticket tracker, unrelated to live code
execution) was already labeled "Software Factory" in the sidebar — adding a second
"Software Factory" label for this new live-execution control center would have put two
different things under the same name in the same sidebar. Renamed the existing entry to
"Software Specs" (route/behavior unchanged, label only) and labeled the new entry
"Agent Control Center".

## Verification

`tsc --noEmit` clean, `eslint` clean (one real `react/no-unescaped-entities` catch,
fixed), a real production `npm run build` succeeded with both new routes appearing in
the build manifest. Deployed via the existing Vercel auto-deploy on push to `master`
(commit `a4b2c53`), confirmed via `gh api .../commits/a4b2c53/status` ->
`"state":"success"`.

**Live-verified in the browser against real production** (`brain.open-spot.ai`, an
already-authenticated real session — no credentials entered or captured): both routes
render correctly with real data. The overview shows the real Phase 5 bootstrap Work
Order ("Create a harmless factory verification artifact", SEM Technologies LLC,
"Software Factory Bootstrap" goal, 1 task, `qa review`) and all 7 registered agents with
correct computed statuses — `Product Architect` and `Release Operator` correctly show
`UNKNOWN` (design-only, no `execution_provider`, never dispatched by the Runner),
`Implementation Engineer` correctly shows its real `last run: done`. The detail page for
that Work Order shows the real task, the real agent run
(`brain-os-implementation-engineer`, `e2e verified`, `done`, real commit `f27997b`,
branch `master`, provider run `dbf0e5ed`) — every field traced back to real rows created
in Phase 5/6, not fixture data. Zero console errors on either page across two loads.

## What Phase 7 deliberately does not do yet

No create/edit/dispatch actions from the UI (read-only control center for now — matches
the master plan's own sequencing: Brain Chat -> Factory Director wiring, Phase 8, is
what will actually let a founder create a Work Order that reaches this UI through the
factory rather than through a script). No release/approval actions wired to buttons. No
real-time/live-updating (a hard reload re-queries real state; no polling or subscription
yet — reasonable for a first pass, not a defect).
