# The entity signal — design, and what prototyping it actually measured

Ledger #103 moved this work onto the critical path to deploy. It is no longer the agreed next
improvement: a truthful answer deployed v92 preserves cannot be rescued without it.

## What it has to do

`"Confirmed — Archived Media Group. It is still active."` is truthful. Deployed v92 preserves it.
The candidate destroys it and persists the false refusal to `work_orders.output`. Every pattern-level
fix was measured and refuted (ledger #103): `"Confirmed — Archived ACME Holdings."` is a fabrication
with the identical surface form, so no rule over the text alone separates them. Only the referent does.

The signal: **a capitalised phrase that EQUALS a known entity name is a NAME, never a predicate.**
Note what is compared — the phrase INCLUDING the participle. In the truthful row the whole phrase
`"Archived Media Group"` is the company's name. In the fabrication the name is `"ACME Holdings"` and
`"Archived ACME Holdings"` is not a name at all. That is the separation.

## RESULT 1 — the design works. Measured, not argued.

`qa/verification/scratch/v92/v42_entity_signal_probe.mjs`, against a build carrying the signal:

| Property | Result |
|---|---|
| Truthful rows v92 preserves that the candidate destroys | **4 → 0** with the name known |
| Fabrication twins lost to the signal | **0** — `"Confirmed — Archived ACME Holdings."` still caught |
| Rows where an EMPTY name set changes any verdict | **0** — absence is never evidence |

The third row is the one that matters for correctness. The context pack is truncated, so a name being
absent must prove nothing, and it provably does not. Verifier #39 pinned that as
`V39-C-ENTITY.absenceIsNeverUsedAsEvidence`; it holds by construction here.

## RESULT 2 — the obvious wiring is not viable, and this is why

Option 1 of the earlier draft — reference the per-turn name maps inline in the belt — was built and
run against everything:

**7 battery suites and 11 of the 12 verifier gates die with `companyNameById is not defined`.**

The cause is precise and worth stating exactly, because it constrains every future belt change:

> Every extracting harness in this campaign evaluates the belt **standalone**, in a `new Function`,
> with a **FIXED list of injected stubs**. Verifier #33's is
> `verifiedClaims, model, groundedOutcomeThisTurn, claimsFutureActionWithNoPlan, result, rawClaims,`
> `deterministicPrefix, claimExecutionEvidence, hasRejectedClaims`.
> **The belt's extracted regions may not gain ANY new free identifier — not in the predicates and
> not at the call sites.** Each verifier wrote its own self-contained harness, so this is not one
> file to fix; it is twelve, and eleven of them belong to verifiers, not to me.

Threading the set in as a second parameter (`readsAsCompletion(s, __known)`) removes the free
identifier from the predicate — the extractors call it with one argument, get the empty default, and
by RESULT 1 that is byte-identical to today. But the **call sites** still need somewhere to get the
names from, and naming any new variable there re-creates the same breakage. That last hop is the
open design question.

## THE RULING THIS NEEDS, AND WHY I AM NOT MAKING IT

Three ways to close the last hop:

1. **Pass the names on an object every harness already injects** (`result.__knownNames`). No new free
   identifier anywhere; undefined in a harness, which yields the empty set, which is proven inert.
   Cost: it puts a field on `result` for the belt's benefit.
2. **Extend the harnesses' stub lists.** Honest and permanent, and it removes the constraint's cause
   rather than routing around it. Cost: it edits eleven verifiers' gates.
3. Declare the set inside a nested block so it is not top-level. Satisfies the letter of verifier
   #37's contract and not its purpose. Recorded so it is visibly rejected.

I would build (1) and follow it with (2). **I did not land either.** Editing eleven verifiers' gates
so that a change of mine passes them is the same move as filing a red gate as a disclosed residual,
which is what ledger #102 and #103 are about. Verifier #42 has been asked to rule, and it holds the
current bytes.

## What must be measured before any wiring is believed

- the six truthful `Confirmed — <Participle> <Name>` rows are preserved;
- the fabrications v92 corrects stay caught, including v38's D6, v35's F5, v36's F2 controls, v39's
  D4 and v40's D2 — the six gates that refuted the pattern-level attempt;
- **the empty set produces byte-identical verdicts**, or absence has become evidence by accident;
- the full battery and all twelve gates run clean, with `deno` at the 23-error baseline. The
  parameter needs an explicit type or the baseline goes to 24 on `TS7006 implicitly has an 'any'`.

## A trap this prototype walked into, recorded because it is generic

The first working build read as "changes nothing" — every row identical to the current build. The
cause was a name-token class of `[\w.&'-]*`, which swallowed the sentence period and kept going, so
`"Confirmed — Archived Media Group. It is still active."` yielded the phrase
`"Archived Media Group. It"`, which can never equal a name. **A signal that is inert and a signal
that is genuinely neutral produce the same table.** The probe now asserts that the CURRENT build has
blockers before it credits the prototype with removing them.
