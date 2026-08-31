# Work-PC QA Status Dashboard

Human-readable companion to `qa/HANDOFF_STATE.json` / `qa/COVERAGE_LEDGER.json`.
All numbers are computed from `CAPABILITY_INVENTORY.json` by
`qa/runner/compute-coverage.mjs` — never hand-typed, never estimated.

---

## Current state

| | |
|---|---|
| **Campaign** | `C001` |
| **Campaign state** | `PLATFORM_BOOTSTRAP` |
| **Environment** | production (`https://brain.open-spot.ai`) |
| **Deployed product SHA** | `256f183` ✅ *Vercel-API verified, not inferred* |
| **Latest implementation SHA** | `256f183` (`origin/master`) |
| **QA artifact branch** | `qa/work-pc` |
| **Release state** | **PARTIALLY VERIFIED** |
| **Platform state** | **AUTONOMOUS QA PLATFORM — PARTIALLY VERIFIED** |

### Deployment provenance

`brain.open-spot.ai` → deployment `dpl_9eRgBvspSjcuH7h2NdatQ2pvTdyv` → commit `256f183`,
confirmed via the Vercel REST API (`meta.githubCommitSha`) **and** by confirming that
deployment's alias list actually contains the QA target URL. Not inferred from
`origin/master` HEAD, not inferred from `vercel ls` ordering.

At this moment `deployed_product_sha == latest_implementation_sha`. That is a **verified
coincidence, not a standing assumption** — the deployment watcher re-verifies every campaign
start, because master routinely runs ahead of the deployed build.

---

## Coverage

```
Required capabilities: 40
PASS:        5
FAIL:        0
FLAKY:       0
BLOCKED:     4
NOT TESTED: 31
→ 12.5% executed (5/40)   →   PARTIALLY VERIFIED
```

> ⚠️ **The denominator is a floor, not the truth.** 40 capabilities come from static
> enumeration (35 routes, ~150 server actions, Brain-Chat schema fields). The live per-page
> control inventory has not run yet, so the real total is substantially higher. See
> `qa/QA_COVERAGE_GAPS.md` §1.

| Domain | PASS | NOT_TESTED | BLOCKED |
|---|---|---|---|
| companies | 3 | 5 | — |
| departments | 2 | 3 | — |
| business-units | — | 3 | — |
| people | — | 2 | — |
| employment | — | 2 | — |
| projects | — | 4 | — |
| goals | — | 1 | — |
| tasks | — | 2 | — |
| approvals | — | 2 | — |
| brain-chat | — | 4 | — |
| navigation | — | 1 | — |
| relationships | — | 2 | — |
| qa-platform | — | — | 3 |
| permissions | — | — | 1 |

---

## Defects

**0 open.** This is an honest zero: Campaign C001 live execution has not started, and the
carried-over C000 smoke pass produced no defects. It is not an unpopulated placeholder.

| Severity | Open |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

Awaiting implementation: none · Awaiting retest: none

---

## Evidence carried forward (campaign C000, pre-platform)

Preserved per the explicit "do not restart completed evidence collection" instruction:

| Capability | Result |
|---|---|
| Company create (UI) | PASS |
| Company edit/rename (UI) | PASS — persisted |
| Company rename (Brain Chat) | PASS — **independently DB-verified**, AI truth = PASS |
| Department create (UI) | PASS |
| Department edit/rename (UI) | PASS — persisted |

⚠️ SHA-attribution caveat: tested before deployment-provenance discipline existed; attributed
to local master `b04cedb`. Re-verify against the confirmed deployed SHA during C001 (see
`QA_COVERAGE_GAPS.md` §4).

---

## Blocked (4) — with explicit reasons, never silently dropped

1. **`LIVE QA DASHBOARD — NOT YET IMPLEMENTED`** ×3 — needs the Home-PC
   `QA-PLATFORM-REALTIME-CONTROL-PLANE` implementation. Does not block C001.
2. **`DISTINCT BROWSER PERSONAS UNAVAILABLE`** ×1 — no service-role key.
   **Not accepted as final** until product-supported account paths are investigated.

---

## Real-business acceptance (IQParking)

**Status:** not started. Canonical entities already resolved read-only so nothing is
duplicated: SEM LLC, SEM Global Robotics Technologies LLC, SEM Technologies LLC, CLIX GPS,
Aldajan Zagila, and the project *IQParking & OpenSpot Hardware Operations* all exist.
**SpoonTech LLC does not exist** in Brain OS — it will be recorded as `FOUNDER_SPEC` (real
name supplied by the founder, `real_canonical_id: null`) rather than fabricating a real record.

---

## Next action

**Actor:** WORK_PC. Finish platform scaffolding, then begin Campaign C001 live execution —
Company archive/restore first, building the real-name synthetic digital twin in parallel.
