# Implementation Handoff — Work PC → Home PC

Human-readable companion to `qa/BUG_QUEUE.json`. This is what a Home-PC session should read
first to know what is waiting on it. **No chat history or founder copy/paste required.**

How to consume this handoff:

```bash
git fetch origin qa/work-pc
git show origin/qa/work-pc:qa/HANDOFF_STATE.json     # machine-readable status
git show origin/qa/work-pc:qa/BUG_QUEUE.json         # the queue, P0 -> P1 -> P2 -> P3
git show origin/qa/work-pc:qa/bugs/BUG-001.md        # full report for a specific bug
```

**Ownership rules (non-negotiable):**
- `qa/BUG_QUEUE.json` is **Work-PC-owned**. Do not edit it.
- Publish fix reports to `qa/home-pc-handoff/fixes/<BUG_ID>.json` instead; the Work PC reads
  those and updates its own queue.
- **Home PC never sets `CLOSED`.** Only an independent Work-PC retest closes a defect, and
  only after the fix is confirmed present in the **deployed** build — a merge to master is
  not sufficient.

---

## Batch 001 — 2026-08-31

**Product commit tested:** `266f86a` (deployed, Vercel-API verified)
**Campaign:** C001 · **Release state:** `FAILED` (1 open defect)

### Ready for implementation

| Bug | Sev | Title | Regression |
|---|---|---|---|
| [BUG-001](bugs/BUG-001.md) | **P2** | `/departments` presents departments of archived companies as active and unmarked, contradicting the same page's own company picker | `qa/scenarios-runner/departments_hide_or_mark_archived_parent.sql` (EXPECTED_FAIL) |

#### BUG-001 — what makes this unambiguous

The `/departments` page contradicts **itself**, on one screen:

- its company picker is built from `getCompaniesForSelection()` → `get_effectively_active_companies`,
  which **correctly excludes** the archived company;
- its table, rendered from `getDepartments()`, **still shows** that same archived company as
  an ordinary parent, with no archived marker.

`getDepartments()` (`web/lib/data/departments.ts`) selects `companies(name)` — never
`companies.status` — and applies no parent-status filter, so the UI could not render an
archived badge even if it wanted to.

**The DB is correct.** Archive/restore both verified clean: row preserved, `status` flips
correctly, `updated_at` advances, the child department stays linked (which is exactly what
makes restore coherent, and exactly what the archive dialog promises). This is purely a
presentation-truth defect — hence **P2, not P1**.

**Recommended fix** (QA does not implement):
1. Add `companies(name, status)` to the `getDepartments()` select.
2. Render an "Archived" badge / muted treatment when the parent is archived.
3. **Audit the failure class, not just this instance** — check sibling surfaces that join to
   `companies` (projects, goals, people) for the same missing parent-status handling before
   marking this done.

**Definition of done:** `/departments` either omits the department or visibly marks its
archived parent, **and** the SQL regression flips to `all_pass: true` with its precondition
guard still `true`.

---

### Also requested of Home PC (not a defect — a build request)

**`QA-PLATFORM-REALTIME-CONTROL-PLANE`** — the real-time QA Command Center.

3 capabilities are `BLOCKED` on it: `CAP-QA-COMMAND-CENTER-DASHBOARD`, `-REALTIME`,
`-COMMANDS`. The Work PC authors the contract and its own publisher side but must not
implement production schema/RLS/UI — that separation is why this is a handoff rather than
something QA shipped itself.

Spec to be authored by the Work PC at `qa/QA_CONTROL_PLANE_SPEC.md` +
`qa/QA_CONTROL_PLANE_SCHEMA.json`. **Not yet written** — it is queued behind live QA
execution, deliberately: the plan's own instruction is not to postpone the sweep for
dashboard work.

Security constraint to honor when it is built: the Work PC must receive a **narrowly scoped**
principal (publish own telemetry, read authorized commands, acknowledge them) — **never an
unrestricted service-role key**, and never a generic `execute_qa_sql()`-style interface.

---

## Open questions back to the founder (non-blocking)

1. **Distinct browser personas** — blocked on there being no service-role key to mint
   synthetic logins. Before accepting that as final, the Work PC still needs to investigate
   product-supported paths (public signup, workspace-admin creation, `invitePerson()` plus a
   safe email sink). Queued in `qa/QA_COVERAGE_GAPS.md` §3.
2. **Fixture cleanup policy** — `QA-SWARM-TEST-CO-VIA-CHAT` and its department are currently
   retained as active regression fixtures. Confirm whether QA fixtures should be cleaned up
   at campaign end or kept as permanent fixtures (the repo already has a
   `permanent_fixture_company_cleanup` precedent).
