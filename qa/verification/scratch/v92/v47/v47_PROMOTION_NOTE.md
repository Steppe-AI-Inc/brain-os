# v47 PROMOTION NOTE — campaign #107, candidate `bbc37ba0`

**VERDICT: FAIL. Do not deploy. Production stays v92 (`c9dfab5bd433`).**

Read `v47_known_failure_modes_entry_114.md` for the full record. This note is the operator's
shortlist.

---

## Do these four things, in this order

### 1. Apply the two prepared fixes (both are one expression each; both are mutation-proven)

```
node qa/verification/scratch/v47/v47_build_namefix.mjs        # V47-D2  -> index.namefix.ts
node qa/verification/scratch/v47/v47_build_ordinal_fix.mjs    # V47-D3  -> index.ordfix.ts
```

Each builder reads the committed `index.ts`, writes a patched copy beside itself, and asserts the
source is unchanged. They are independent and both edits can be merged into one build. Do **not**
write `new Set<number>()` — the generic type argument takes nine suites to `SyntaxError`; the
prepared fix uses an inferred `new Set()` and says why in its own comment.

Evidence already on file for each:

| | closes | truth cost | battery |
|---|---|---|---|
| V47-D2 namefix | 224 of 264 shipped fabrications (populated pack) | **0 of 448** truthful twins, corpus T-reg unchanged at 49 | 36 suites / 0 failures |
| V47-D3 ordfix | 5 of 5 two-ordinal binds | 0 of 36 other matcher shapes changed | 36 suites / 0 failures |

### 2. Fix the instrument before quoting any number again

`qa/verification/lib/v92_reference.mjs` must model **three** arms, not two. Add
`claimsLifecycleClaim` (extracted from the pinned v92 source, not retyped) over the four call-site
alternations, and keep the self-check that each arm is independently reachable. Witness for the new
arm: `"Deleting the task now."`.

Then **re-derive every count in the ledger.** The omission is one-directional (it can only have
overstated truth regressions — proved by byte-identical arm-3 code in both builds and 0/420
arm-3-only misses), so no past PASS is invalidated. No past magnitude survives.

### 3. Make the parity gate able to fail

`qa/scenarios-runner/v92_parity_corpus.json` contains **zero** `Let me …` conditioned offers and
**zero** negator-token-name fabrications. Both open classes on this candidate are invisible to
`v92_parity_contract.mjs`, which is the gate named for exactly them and currently reads 46/0. Add
both classes. This is the **sixth** time this campaign a gate was green because its corpus never
generated the shape.

### 4. Clean up the estate — and note that this run made it worse

44 executable `.mjs` artifacts hard-code `C:/Users/Dell/dev/brain-os`, a **different checkout**.
Several **write** there. Running `qa/verification/scratch/v92/v31_mutation_proof.mjs` from this
isolated worktree wrote temp mutants into that other repo — **I did that during this run and could
not clean it up**, because the path is outside my sandbox. Please delete
`C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/mut31/` and any sibling `mut3x/` directories
manually.

`v47_guard_repro.mjs` — written this round to replace a retracted vacuous probe — reads its ROOT, its
git ref, its "candidate" and the v92 reference from that other checkout, and its `GUARD` anchor is
absent from the committed candidate, so against these bytes it exits 2 with `STALE`. **It is inert on
the build it exists to measure.**

---

## What is NOT blocking, so nobody re-litigates it

* **Conditioned offer, 49 rows** (7 more are v92 parity via the FUTURE arm). Still the founder's
  product call. My opinion, offered as an opinion: ship the prepared option — overwriting
  "Let me archive the company once you confirm." with "I can't actually do that from chat" is a false
  statement about the system's own capability, a worse error than the one the arm prevents.
* **Runtime.** I could not reproduce e = 2.97 / 3.9 s. Across four unsplittable-clause shapes I
  measure **e ≈ 1.83** and a worst case of **62 ms at 16 KB**. Real characteristic v92 lacks
  (~1700× its single regex), not a blocker. Optional insurance: cap the belt's input length.
* **`CONFIRMED_COMPLETION` missing `closed|added`.** v92 misses those six fabrications too, so
  shipping them is **parity**, not a regression, and the naive fix buys it with a **new** truth
  regression. Do not ship the naive version. If someone returns to it: the entity whitelist fails to
  rescue `"Confirmed — Added Value Ltd was not archived."` only because it tests the tail for **any**
  completion participle rather than a **negated** one.
* **The three "refused" residuals are already closed.** All three are caught by the committed
  candidate and are now pinned as CONTRACTs in `v47_regression_additions.mjs`.
* **Ledger #64 D16 / #65 D25 / #65 D27 (production row 9dda919c) / #66 D40:** 26 pinned production
  shapes, **0 shipped**. Genuinely closed, re-derived.
* **v28 / v29 gates no longer run** (`ReferenceError: knownEntityNames is not defined`). Not a product
  defect; two historical gates were silently disabled by the entity-signal threading. Fix or retire
  them explicitly.

---

## The measurement everyone should carry forward

The belt is **not** the last word on what the founder reads. `lifecycleMismatchCorrections`
overwrites `result.summary` **earlier in the same else-if chain**, and it is byte-identical in v92
and the candidate. **60 of 369 (16.3 %) of the belt's truth-preservation wins never reach the
founder** — including the campaign's own headline row,
`"No company named Ulaanbaatar — North Depot was archived."`, which several suites pin as "the paired
real name survives". It survives `readsAsCompletion`; it does not survive production. Any future
"truthful answer preserved" claim should be measured at the product decision, not at the belt.

---

## Rollback

`c9dfab5bd43346bad501ab44d7bfbc5211e90ed5` — present in this repo, index.ts sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`. Verify any deploy or rollback
with `scripts/factory-runner/verify-deployed-bytes.sh <ref>` and never from a deploy command's exit
status.

**Candidate `bbc37ba0` index.ts sha256, start and end of this run, unchanged:**
`db0aa63588d8b3f67d5c4bbba0b4bd9d6df97c03ef03685bbe564afc8fd78e63`

**EDGE STATUS = NOT DEPLOYMENT READY.**
