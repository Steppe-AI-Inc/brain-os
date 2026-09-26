> **SUPERSEDED — NOT CANONICAL.** This file is an implementer draft written on 2026-09-26 on branch `factory/auto-enrollment-v1-contract` under an instruction that the founder has since superseded. The canonical contract, state machines, invariants, security/tenancy contract, governance ADR, WO-1..WO-10, acceptance criteria and verification specification belong to the DIRECTOR on branch `factory/auto-enrollment-v1-director`. Implementation happens on `factory/auto-enrollment-v1-implementation`, based on the exact Director SHA. This file binds nothing. It is retained only as read-only mapping and analysis the Director may consult. Where it differs from the Director branch, the Director branch is right.

# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-002 — The verification state machine has no failure state**
Filed 2026-09-26 by the implementer. Status: **OPEN — NOT IMPLEMENTED.**

## Requirement affected

The binding verification state machine:

`IMPLEMENTED → WAITING_FOR_INDEPENDENT_VERIFICATION → VERIFICATION_CLAIMED → VERIFIED → COMPLETE`

It adds: "If no eligible independent verifier exists: remain WAITING. Never self-certify."

## Observed evidence

- A certifying run can return a FAIL verdict: the candidate does not satisfy the verification.
- The binding machine names no state for that outcome.
- The baseline (69df2f52) had no gate at all:
  - an implementation work order went `done` at completion (`scripts/factory-runner/claim.mjs:448-473`);
  - a refused verification failed the *verify* work order terminally (`handlers/factory-acceptance.mjs:100-102`) and left the
    authored run's work order `done`.

## Why implementation cannot satisfy it safely

Choosing a failure state, and what follows it (repair, re-verification, or terminal failure), is a verification rule. The
implementer may not define one. Moving a failed candidate to COMPLETE or VERIFIED would self-certify, so those are ruled out.

## Proposed alternative

Add `VERIFICATION_FAILED`: the candidate is not complete, dependents stay blocked, and the director's existing
`repair_required` transition takes it from there. A new candidate produces a new authoring run, and therefore a new WAITING.

## Interim behavior (fail closed, binding states only) until the Director decides

- On a FAIL verdict the parent work order stays `WAITING_FOR_INDEPENDENT_VERIFICATION` with
  `verification_waiting_reason = 'last_verification_failed:<certifying_run_id>'`.
- It is never VERIFIED or COMPLETE, and dependents stay blocked.
- **No new verification work order is created automatically.** Re-verifying the same candidate automatically would loop.
- The Computers dashboard and the waiting-verifications list show the reason.

## Compatibility / security impact

None on legacy work types: `requires_verification` defaults to false for them. The interim can only under-complete work; it can
never over-complete it.
