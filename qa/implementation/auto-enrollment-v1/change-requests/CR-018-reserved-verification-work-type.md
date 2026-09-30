# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-018 — an authoring work order submitted with the work type `verification`: accepted today, never claimable by an enrolled node;
should submission refuse it by name? (P-7; contract §2 "chosen automatically by the scheduler")**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`, after the A7 verifier review
  (an L5-F2 sibling).
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a new admin-visible refusal that the r3 texts do not state. No Director text is edited.
- **Until the Director decides, the candidate keeps the r3 behaviour:** `submit-work-order` accepts any work type, including
  `verification`. Nothing here is implemented, and the candidate relies on nothing requested here.

## Requirement (the r3 texts)

- Contract §2: the assignment kind (authoring or verification) is "chosen automatically by the scheduler"; P-7: priority decides
  across both kinds. The r3 texts name no work type and do not say which work types an admin may submit.

## What the candidate does

- The enrolled runtime makes one claim naming every authoring type it has a handler for plus the reserved type `verification`
  (`scripts/factory-runner/enrolled/worker.mjs` `CLAIM_TYPES`). The claim door (`factory._claim`,
  `supabase/control-plane/v1/120_node_lifecycle.sql`, `authoring_types := array_remove(types, 'verification')`) reads that listed
  type as "offer verification work" and matches AUTHORING work orders against the listed types without it. So an authoring work
  order whose work type is `verification` is never offered through the reserved type (eligibility row Y4).
- `factory.admin_submit_work_order` (`supabase/control-plane/v1/220_admin_releases_policies_work.sql`, the `insert` near line 255)
  takes `work_type` from the body with no check for the reserved name. Such a work order is accepted, stays `queued`, and no enrolled
  node ever claims it. The admin gets no signal. Before the one ranked pick, no enrolled runtime listed `verification`, so the
  outcome is not new; the reservation is now explicit on the claim side only.

## Evidence

- `node qa/factory/v1/eligibility_acceptance.mjs`, row Y4: an authoring work order typed `verification` (priority 98) stays queued with
  no run while the claimer takes other work through the reserved type.

## Why a decision is needed

Refusing the name at submission is a new, admin-visible behaviour of the Admin API (a new named refusal). The implementer may not add
it without ratification.

## Alternatives (for the Director)

1. **Refuse the reserved type at submission** with a named refusal (for example `reserved_work_type`, HTTP 400, nothing written,
   audited as refused), in the one front door, with a developer row and a mutant. The Computers UI would show the refusal.
2. **Keep r3 behaviour** and record it as a known limitation in the candidate report: a work order typed `verification` is accepted
   and never runs.

## Impact

- On the candidate: none until decided. The candidate report lists it as a known limitation.
- If (1) is ratified: one SQL front-door check, one Edge pass-through of the refusal name, one eligibility row, one mutant, and the
  regenerated COMPATIBILITY_MATRIX.md / INVENTORY.md.
