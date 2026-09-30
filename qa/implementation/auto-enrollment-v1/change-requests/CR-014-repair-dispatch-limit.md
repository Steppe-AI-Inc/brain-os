# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-014 — May the scheduler hold back, limit or park a work order whose repairs keep reproducing a FAILED candidate's content? If so:
the rule, its constant, where it sits in the gate order, and its refusal name**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a request for a new dispatch rule. No Director text is edited.
- **Until the Director decides, the candidate keeps r3 dispatch:** after a refused resubmission the work order is back in the queue
  at once, with nothing withholding it, and the candidate report states this. The candidate does not rely on this request.

## Requirement (the r3 texts)

- **Contract §2 Verification** (`docs/architecture/features/factory-node-management-auto-enrollment.md`): "VERIFICATION_FAILED ->
  IMPLEMENTED: a **new** candidate (a new authoring run) through repair"; "A new candidate whose content is identical to a FAILED one
  (the same tree) is refused as a resubmission, whoever submits it."
- **P-6 / AC-15 / WO-5**: hard gates in the founder's order, then ranking; "No ranking factor ... excludes an eligible node. All
  ranking together may delay eligible work by **at most 30 s**. Only an S-16 milestone restriction excludes." A refusal "names the
  **first** failing gate". Product dispatch "uses these rules alone".
- **P-9**: every refusal names its cause. **P-10 / AC-16**: return to repair needs no founder keystroke.

No r3 text limits how often a work order may return to repair, or how many authoring runs it may accumulate.

## The question

Whether r3 should bound how often a work order may return to repair after a refused resubmission, and if so by which rule. The
implementer's analysis of why the question matters (S-13, P-6, AC-16) went to the Director privately, through the founder
(ledger rule 3).

## Evidence (what the candidate does)

- The refused resubmission is named on the run (`termination_reason resubmission_refused`), audited, and named on the work order
  (`verification_reason`: the refusal and the refused tree). The next repair's claimed view shows `verification_state`,
  `verification_reason` and every FAILED tree (`failed_candidate_trees`), so a repair can tell that it must bring different content.
- The work order keeps its queue age through the FAIL and the refusal.
- The work order is claimable again at once: no hold, no count, no park (`supabase/control-plane/v1/120_node_lifecycle.sql`,
  `node_complete`). Regression: `qa/factory/v1/independence_acceptance.mjs` (o3).
- An earlier, unpublished developer revision held such a work order back for a constant 300 s (a `not_before` column, a pick
  filter and a `not_yet_claimable` refusal before the gates). It was withdrawn in the verifier follow-up, before this branch was
  published: under P-6 only an S-16 restriction may keep eligible work from being claimed, and each refusal has to name the first
  gate that failed.
  None of it is in this branch's history; the row above (o3) holds the behaviour the candidate has instead.

## Why it must be the Director's decision

Holding back work that passes every gate is a new exclusion, and a new refusal changes the gate model of P-6 / WO-5. Both are
binding text. The implementer may not add either by its own reading.

## Requested decision (any one)

1. **A fixed hold after each refused resubmission** (for example 300 s, measured from the refusal against the database clock, with
   no count). State whether it is a gate (and its position and name, for example after gate 1), or a queue rule outside the gates,
   and the refusal a claim naming the work order receives. If it is a queue rule, a claim naming the work order must still be
   refused by its first failing gate before any hold refusal.
2. **A cap:** after N refused resubmissions on one work order, the work order is parked in a named state that only a Factory admin
   action (audited) returns to the queue. State N, the state name and the admin action.
3. **Both**, as the Director specifies.
4. **None:** the r3 behaviour stands (immediate return to the queue, every refusal named). The Director records this.

## Alternative considered (and why not adopted)

Keeping the 300 s hold without a decision: it withholds work that passes every gate, which P-6 reserves for S-16. Not kept.

## Impact

- Option 1: a nullable column on `work_orders`, one pick condition and one named refusal, and a regression that the hold ends on its
  own; the compatibility matrix claim row names it.
- Option 2: a state, an admin operation, the Computers page's work card, and regressions for the cap and the return.
- Option 4: none.
- VERIFICATION_SPEC §3.4: options 1 and 2 compare the Factory's own rows with the database clock or with a count that this request
  would make a stated rule; neither reads a plane-identity value.
