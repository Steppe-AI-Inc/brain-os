# The entity signal — design, and the one constraint that blocks wiring it

Written after ledger #103 moved this work onto the critical path to deploy. It is no longer the
agreed next improvement; a truthful answer deployed v92 preserves cannot be rescued without it.

## What it has to do

`"Confirmed - Archived Media Group. It is still active."` is truthful. Deployed v92 preserves it.
The candidate destroys it and persists the false refusal to `work_orders.output`. Every pattern-level
fix was measured and refuted (ledger #103): `"Confirmed - Archived ACME."` is a fabrication with the
identical surface form, so no rule over the text alone separates them. Only the referent does.

The signal: **a capitalised run that EQUALS a known entity name is a NAME, never a predicate.**

## Where the data already is

`canonicalById` (index.ts:4769) is a real per-turn read built from `contextPack`, RLS-scoped, in the
same function scope as the belt and about 900 lines above it. Names are already resolved beside it:

| Source | Covers |
|---|---|
| `companyNameById`, `taskTitleById`, `personNameById` | rows present in this turn's context pack |
| `runtimeLabels` | rows created THIS turn, which are absent from every context-pack map by definition (run8/D67) |

Both are needed. A name created this turn is exactly the case a founder is most likely to ask about.

## POSITIVE ONLY — this is a correctness requirement, not a style preference

A name being IN the set proves it is a name. A name being ABSENT proves nothing at all, because the
context pack is truncated. Verifier #39 pinned this as `V39-C-ENTITY.absenceIsNeverUsedAsEvidence`,
which passes today and must keep passing: no negated use of the set may appear in the belt block.
Its companion `V39-C-ENTITY.beltConsultsKnownEntityNames` is red on purpose until the wiring lands.

## THE CONSTRAINT THAT BLOCKS IT, AND WHY IT IS NOT MINE TO REMOVE

Verifier #37 pins a contract that the belt block declares **no new top-level `const`**, because the
source-extracting suites slice the block and would silently drop anything they do not know about. The
permitted names are a fixed list in `v37_regression_additions.mjs`. A natural `const entityNameSet =`
would fail that gate.

**I am not editing a verifier's gate so that my own change passes it.** That is the same move as
recording a red gate as a disclosed residual, which is what ledger #102 and #103 are about. The
options, for a verifier to choose between rather than for me to pick:

1. Reference the existing maps inline at the point of use inside the CONFIRMED arm, adding no
   top-level declaration at all. Smallest change, satisfies both #39 tests, keeps #37 green. Cost: the
   lookup is expressed inside an already-dense condition.
2. Teach the extractors to carry a new declaration, then have a verifier extend #37's list. This
   removes the constraint's actual reason rather than working around it, and is the better end state.
3. Declare it inside a nested block so it is not top-level. Satisfies the letter of the gate and not
   its purpose. Recorded here only so it is visibly rejected.

Option 1 is what I would build; option 2 is what should follow it. Neither is applied, because
verifier #41 is running against the current exact bytes.

## What must be measured before it is believed

The same two controls ledger #103 used, plus one new one:

- the six truthful `Confirmed - <Participle> <Name>` rows are preserved;
- the fabrication rows v92 corrects stay caught, including v38's D6, v35's F5, v36's F2 controls,
  v39's D4 and v40's D2 — the six gates that refuted the pattern-level attempt;
- **a name that is NOT in the set changes nothing**, proven by running the same corpus with an empty
  set and getting byte-identical verdicts. Without that, absence has become evidence by accident.
