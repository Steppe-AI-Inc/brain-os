# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-016 — S-6's per-tenant pairing cap: which recorded requests count toward it**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`, after the A5 verifier review.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a question about S-6's tenant cap as written, separate from CR-015 (the address the hosted Edge runtime reports). No
  Director text is edited.
- **Until the Director decides, the candidate keeps the reading closest to the r3 text** (the literal reading, below). Nothing here is
  implemented, and the candidate does not rely on this request.

## Requirement (the r3 texts)

- **S-6** (`docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md`): "**≤ 20 attempts per source IP
  per hour** ... and **≤ 60 per tenant per hour**, unknown locators included. ... every attempt is audited".
- **WO-3** (`qa/work-orders/auto-enrollment-v1/WO-3.md`): "≤ 60 attempts per tenant per hour, unknown locators included." and
  "Every attempt is audited."
- **AC-1 / P-4:** a clean PC enrolls with the three human steps; zero-touch enrollment must be possible.

## What the candidate does

- Every request to `POST /v1/enroll/start` and `POST /v1/enroll/complete` writes exactly one `factory.pairing_attempts` row with its
  named outcome (L3-F7).
- `factory._pairing_limits` (part 150) applies both S-6 caps to the recorded rows under the literal reading of S-6. Which outcomes
  count, and how a request is attributed to a tenant under that reading, went to the Director privately, through the founder
  (ledger rule 3).

## Evidence

- Two developer rows hold the measured outcome at every commit of this branch: `qa/factory/v1/enrollment_acceptance.mjs`
  EN12 and EN12v (both pass).
- The implementer's measured sequence, and what it means for AC-1 / P-4, went to the Director privately, through the founder
  (ledger rule 3).

## Why a decision is needed

Which requests count toward the tenant cap is a reading of "attempt" in S-6. Each answer changes what must be true for AC-1 / P-4
or for S-6's bound on guessing. The implementer may not choose (CLAUDE.md §8).

## Options for the Director

- **(A)** Narrow which recorded outcomes count toward the tenant cap, keeping every request recorded and audited.
- **(B)** Change how a request whose locator matches no code is attributed, keeping guessing bounded.
- **(C)** Keep S-6 as written and record its consequence for AC-1 / P-4 before certification, as an accepted risk.

The detail of each option, with the outcomes and bounds it concerns, went to the Director privately. (A) and (B) combine. Each would
come with its own acceptance rows.

## Impact on the candidate

- None while undecided: the literal reading stays.
- The static gate inventory (`qa/scenarios-runner/factory_v1_static_contract.mjs`, rows `rate_limited_tenant`, `pepper_unavailable`,
  `peer_unavailable`) names this request. The candidate report must state it as an open Director decision, never as a verified
  property.
- If (A) or (B) is ratified, the change is confined to part 150 (`factory._pairing_limits` and the keys it counts), with its own
  acceptance rows.
