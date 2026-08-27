# Release Rehearsal (SC-114)

A full simulated business day, 09:00–19:00, exercising Brain OS end to end across personas
and domains. Each beat notes whether it is **RUNNABLE TODAY** (against the live system) or
**ASPIRATIONAL** (needs a not-yet-built subsystem). Run before any significant release.

| Time | Beat | Persona | Expected | Status |
|---|---|---|---|---|
| 09:00 | Founder issues a strategic task ("plan Q4 CLIX GPS expansion") | FOUNDER | goal + work order + atomic tasks persist atomically; audit row | RUNNABLE (chat live; ACCEPTANCE_TESTS #2/#3) |
| 09:30 | Country manager reviews their company's work | MONGOLIA_COUNTRY_MANAGER | sees only CLIX GPS tasks/projects/finance; 0 of other companies | RUNNABLE (SC-056, SC-118) |
| 10:00 | Technician opens assigned field task, attaches a site photo | TECHNICIAN | sees only own task; image accepted by sem-ai-command; cannot see revenue | RUNNABLE (SC-054; image path live) |
| 10:30 | Telegram sales inquiry arrives | EXTERNAL_CUSTOMER | inbound mapped to one company, non-privileged AI handling | **ASPIRATIONAL** — NOT APPLICABLE (SC-075) |
| 11:00 | AI drafts a sales quote; salesperson must approve before send | SALES_EMPLOYEE | commitment forced into external_comms/finance approval; not sent until approved | PARTIAL — approval half RUNNABLE (SC-084/SC-057); send ASPIRATIONAL |
| 11:30 | Bookkeeper enters an expense; CFO reviews | BOOKKEEPER→CFO | expense recorded; **SoD gap**: CFO/bookkeeper are same role, self-approval possible | RUNNABLE as **KNOWN GAP** (SC-058) |
| 12:00 | Country manager tries to approve a payroll increase | COUNTRY_MANAGER | DENIED — not hr_finance | RUNNABLE ✅ (SC-057) |
| 13:00 | Founder approves a supplier payment workflow | FOUNDER | approval decided once; linked work resumes; audit records it | RUNNABLE (logic; decide_approval deploy PENDING — SC-059) |
| 13:30 | WhatsApp support conversation | CUSTOMER_SUPPORT | conversation company-scoped; injection can't leak internals | **ASPIRATIONAL** — NOT APPLICABLE (SC-078) |
| 14:00 | Employee asks Brain AI for payroll totals | ORDINARY_EMPLOYEE | denied — no salary/finance rows in context | RUNNABLE ✅ (SC-055/069/074) |
| 14:30 | Uzbekistan manager tries to read Mongolia data | UZBEKISTAN_COUNTRY_MANAGER | 0 rows both directions | RUNNABLE ✅ (SC-056) |
| 15:00 | Founder runs "delete all Done tasks" | FOUNDER | exact ids captured; approve → only those deleted; idempotent; audit count | RUNNABLE (logic ✅ SC-059/094; deploy PENDING) |
| 15:30 | Provider webhook retry (duplicate delivery) | system | dedup — one effect | **ASPIRATIONAL** — NOT APPLICABLE (SC-076) |
| 16:00 | A channel token expires | operator | health = EXPIRED/REAUTH_REQUIRED; no token in UI/logs | **ASPIRATIONAL** — NOT APPLICABLE (SC-086; MCP-vault template exists) |
| 17:00 | Founder reviews the day's audit trail | FOUNDER | every sensitive transition present; ordinary users can't tamper | RUNNABLE ✅ (SC-070, SC-103) |
| 18:00 | Cross-company isolation spot-check | EMPLOYEE (both companies) | 0 rows across the boundary, both ways | RUNNABLE ✅ (SC-056) |
| 19:00 | End-of-day regression sweep | QA | full `qa/scenarios-runner/` suite green + gaps unchanged | RUNNABLE ✅ (RESULTS.md) |

## How to run the runnable beats

The RUNNABLE beats reduce to the automated runner scripts (`qa/scenarios-runner/`) plus a
handful of live `/chat` interactions (the AI-refusal beats, MANUAL). Execute the runner
suite first for the data-layer guarantees, then do the live chat beats as the founder and
as the employee fixture. Record results in `RELEASE_EVIDENCE.md` with PASS/FAIL/KNOWN-GAP/
NOT-APPLICABLE per beat — never a bare "release looks good."

## What this rehearsal proves and does NOT prove

It proves the authorization/approval/isolation spine works across a realistic day. It does
NOT prove the messaging beats (they are NOT APPLICABLE) and it does NOT clear the two
KNOWN GAPS (SoD, payload immutability) or the pending `decide_approval` deployment — those
must be stated in the release notes, not glossed. A release is `PRODUCTION ACCEPTED` only
per CLAUDE.md §16, never "everything works."
