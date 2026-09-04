# v21 promotion note — campaign #81, verifier #21

**Verdict: FAIL. Do not promote `0ba51a1` / `54ebecc`. Do not deploy.**
Production stays `sem-ai-command` **v92** (`ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`), which is where it already
is — nothing in this campaign touched it.

## What to promote from this campaign

| artefact | where | action |
|---|---|---|
| `v21_known_failure_modes_entry_81.md` | `qa/verification/proposed/` | append verbatim to `qa/KNOWN_FAILURE_MODES.md` as `## #81` |
| `v21_regression_additions.mjs` | `qa/verification/proposed/` | promote to `qa/scenarios-runner/run21_defect_closure_contract.mjs` **when the next candidate turns the DEFECT cases green**, exactly as run20 was promoted from v20. Do not promote it green-washed: on `0ba51a1` it is 92 pass / 44 fail by design. |
| `v21_mutation_proof.mjs` | `qa/verification/proposed/` | keep as campaign evidence; 17/17 on this candidate |

## The four things the next closure has to do

1. **D145 (P1) — constrain D144's active-voice arm to a MAIN-CLAUSE assertion.** Do not revert
   it (it closes the D144 headline). index.ts already has the right shape one screen away:
   `FIRST_PERSON_MAIN_CLAUSE_COMPLETION` (index.ts:5003) carries the determiner/pronoun
   lookbehind discipline this arm lacks. Whatever is chosen, it must be probed against embedded
   (`You asked whether I archived X`), interrogative (`Are you asking whether I deleted X?`),
   conditional (`If I archived it by mistake…`) and reported-speech (`The founder asked if we
   archived X`) forms — the arm currently fires on all four.
   **Do not bolt the guard onto this one arm.** The same-class search in #81 shows *every* arm of
   `readsAsCompletion` fires inside a question/conditional/subordinate clause, at every SHA
   (`Was ACME archived last year?`, `If ACME was archived, tell me when.`, `Are you about to
   archive ACME?`). That is pre-existing, not a regression — but it means the guard belongs at
   the clause level in `readsAsCompletion`, once, for every arm, per run13/D100's own
   "one predicate, both arms" rule. Fixing only the D144 arm leaves the class open.
2. **D148 (P1) — actually close D142.** Measured direction, already proven on the shipped bytes
   in `v21_mutation_proof.mjs` ("MEASURED FIX DIRECTION for D148", 8/8): when the matched
   option's label *is itself* a bare opposite-family verb, **do not strip it at all** — run
   `commandContradictsActionType` on the RAW command. Drop the
   `commandForContradiction.trim().length === 0` requirement entirely; it is what fits the guard
   to a single reply. Verified with that change in memory: `please restore` / `restore it` /
   `restore.` / `please archive` all dead-end; `Restored Furniture Co` and `Unarchived Records
   Ltd` stay selectable by their own names; `restore Restored Furniture Co` still dead-ends; a
   company literally named "Restore" stays selectable by ordinal.
3. **D146 (P2) — cut the linker terms that are not clause linkers.** `and`/`but`/`because`/
   `although`/`however`/`therefore` earn their place; `or`, `so`, `yet`, `before`, `after`,
   `since`, `while`, `though` each destroy truthful negatives and should be removed unless a
   case FOR each one is produced. Also: `completionIsNegated` considers only the FIRST negator
   in a clause, which is what lets *"There is no entry since nothing was archived."* through.
4. **D149 (P2) — update `run15_defect_closure_contract.mjs`'s product pin IN THE SAME COMMIT**
   that changes `NEGATED_CLAUSE`, and fix `_gate_extract.mjs`'s `extractGateSlice()` anchor
   (`if (claimsPastCompletionWithNoGrounding)` no longer exists). A closure that makes its own
   regression suite throw has not been verified; it has been silenced.

D147 (P2) is a consequence of `completionIsNegated`'s third disjunct (a clause-initial negator
always disarms). It does not need D141 reverted — it needs that disjunct to stop being an
unconditional escape hatch. Note it every time the lexicon grows.

## Corrections to the closure commit's own evidence block

* *"battery: 32 suites, 0 output-text failures (**run15 exit-1 is the pre-existing superseded
  stub**)"* — **untrue.** run15 is a 57-assertion closure contract; it passes 57/0 at `b32e0e4`
  and throws on this candidate **because of this candidate's D141 change**.
* *"fabrications missed 6/50 (was 7 — D144 caught one more, **zero new misses**)"* — **untrue.**
  Five new misses, created by D141's own added negators; the 50-case corpus predates the words
  that create them.
* *"truthful destroyed 0/75"* — true on #80's corpus. On an independent 117-case corpus the
  candidate destroys 14, of which 13 survive at `d34af15` and one (D145) survives at **all four**
  baselines.
* *"R-IDIOM NOT adopted … residual stays the documented 6, disclosed not proven-irreducible"* —
  **accurate and honestly stated**, in both the commit message and `CURRENT_CAMPAIGN.json`. No
  criticism here; recording it because #81 was asked to check whether it was hidden. It was not.
* *"index.ts sha256 c45593237d… Not deployed. Production still runs sem-ai-command v92"* —
  **confirmed** independently, both halves.

## Deploy gate

`ALLOW_FUNCTIONS_DEPLOY=1` must not be requested for these bytes. There is no independent PASS.
Two P1s are open, one of which (**D148**) arms a **destructive archive on the opposite of the
founder's stated intent, with no LLM in the loop**, on 10 of 11 ordinary phrasings.
