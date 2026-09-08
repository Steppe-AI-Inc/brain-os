# v28 PROMOTION NOTE — campaign #88, verifier #28

Verdict: **FAIL**. Nothing here should be promoted as a closure. What follows is what the next
implementing session has to do, and what it must NOT do.

## 1. Where the artefacts go

| artefact | destination | when |
|---|---|---|
| `v28_known_failure_modes_entry_88.md` | appended to `qa/KNOWN_FAILURE_MODES.md` as `## #88`, above `## #87` | with the next closure commit |
| `v28_regression_additions.mjs` | `qa/scenarios-runner/run28_defect_closure_contract.mjs` | **only when its `[DEFECT]` groups are green** — it is RED on `45d05cc` by design (94 pass / 16 fail) |
| `v28_extract.mjs`, `v28_attack.mjs`, `v28_three_way.mjs`, `v28_mutation_proof.mjs`, `v28_lexical_branch.mjs`, `v28_fixI_falsepos.mjs`, `v28_fixJ_measure.mjs` | stay in `qa/verification/scratch/` | evidence, not suites |

`v28_regression_additions.mjs` is deliberately runnable **now** (`node
qa/verification/proposed/v28_regression_additions.mjs`, or with `SEM_INDEX_SRC=<path>`); a
candidate fix is only real when that file exits 0 with no expectation edited.

## 2. What is genuinely closed and must not be re-opened by the next fix

- **D163 / FIX-H** — closed, 13/13 on my own corpus (all six modals, a one-character name, a
  digit-only name, `have been` plural, lexicon-word-then-subject). Mutation-proven load-bearing.
  **Do not revert the lexicon to `[a-z]+` to "fix" D168** — that reopens D163.
- **D164 / FIX-I** — closed on verifier #27's exact five sentences plus the two linker-free ones,
  and the negated-NP evidential still survives 7/7. **The class is not closed (D166/D167).**

## 3. The two defects that must be fixed before this candidate can pass

Both are the same line (5593). Fixing one direction without measuring the other is what produced
them, so treat them as one problem with two corpora.

- **D166 (P2)** — the lookahead sees a one-token subject only. 5 shapes CAUGHT at `4476c92`,
  MISSED here.
- **D167 (P2)** — the lookahead's evidential slot matches ordinary NOUNS (`our records`,
  `their reports`, `the notes`, `my statements`), so a negated subject with a determiner-led
  prepositional phrase is destroyed. 8 of 10, all surviving at `a3fc006`.

**Prepared and measured, NOT recommended as-is (`qa/verification/scratch/v28_fixJ_measure.mjs`):**

```
-  \s+\w+\s+(?:show|prove|indicate|say|state|record|confirm|establish|suggest|report|mention|note)\w*\b)
+  (?:\s+[\w'’-]+){1,3}\s+(?:show|prove|indicate|say|state|record|confirm|establish|suggest|report|mention|note)\w*\b)
```

Measured on a 13-fabrication / 15-truthful-negative corpus:

| | fabrications missed | truthful destroyed |
|---|---|---|
| `4476c92` | 0 | 8 |
| `a3fc006` | 7 | 0 |
| **candidate `45d05cc`** | **5** | **1** |
| candidate + FIX-J (1–3 tokens) | **0** | **2** |
| candidate + FIX-J2 (1–2 tokens) | **0** | **2** |

FIX-J closes D166 completely and costs one more truthful negative
(`No record however of the internal audit shows ACME was archived.`). **It does not touch D167 at
all** — the noun/verb ambiguity in the evidential list is independent of the subject's token count.
A real close needs both: a token-count widening AND something that stops `records`/`reports`/
`notes`/`statements` counting as evidentials when they are the object of a preposition. Measure any
candidate on **both** corpora (`v28_fixJ_measure.mjs` and `v28_fixI_falsepos.mjs`) before adopting.

If neither direction can be closed without paying for the other, the honest outcome is to **revert
FIX-I** and re-open D164 as a disclosed residual — the belt is defence-in-depth, evidence is
primary, and a rescue that destroys 8 truthful negatives to catch 5 fabrications is the trade
index.ts's own comments say to refuse.

## 4. Disclose these; do not silently carry them

- **D168 (P3)** — FIX-H's hedge cost, 13 shapes. Not a regression vs `4476c92`; pinned `[RESIDUAL]`.
  The disclosure is the deliverable, not a fix.
- **D169 (P3)** — the modal guard drops a whole clause; a hedge disarms the fabrication beside it,
  3 shapes, CAUGHT at `4476c92`. Pinned `[DEFECT]` because it is a baseline regression, but it
  arrived with FIX-E (run25), not with this candidate.
- **D170 (P3)** — `CONFIRMED_COMPLETION`'s `(?<!\d )` exempts any name ending in a digit (`test3`,
  `Unit 42`, `Q4`). Pre-existing everywhere; pinned `[RESIDUAL]` with controls on both sides.

## 5. Bookkeeping the next closure must repair

- The DOCUMENTED RESIDUALS line claims **D158b, D154/D158c, D146b** are *"pinned [RESIDUAL] in
  run27"*. They are not in that file at all; their pins died with `run24`/`run25`/`run26`, none of
  which exists on disk. Either re-pin them in the successor suite or stop claiming they are pinned.
- The axis claim's premise is now correctly scoped per-corpus (the #87 self-contradiction is fixed
  — keep that), but its conclusion (*"no longer worse on the fabrication axis"*) drops the scope
  and is false on an independent corpus. State the conclusion with the same scope as the premise.
- `run27`'s `modalWindow.hedgeOverThreeWords` note describes a `{0,2}` window FIX-H deleted. The pin
  still passes, for a different reason. Fix the note.
- Battery is honestly 26 assertion-executing suites + 5 retired `DOES NOT RUN` suites + 1 helper,
  not "31 executable + helper".

## 6. Standing rules this campaign adds

- **(e)** NARROWING a rescue disjunct must be measured on the corpus the rescue was adopted to
  save, at full strength — including the shapes that reach the rescue only because an earlier
  disjunct does not. (`run27`'s D156/D162b pins are all linker-free, so they cannot observe FIX-I's
  cost at all; that is why D167 shipped unseen.)
- **(f)** Retiring a regression suite must carry every `[RESIDUAL]` and `[CONTRACT]` pin it held
  into the successor suite in the same change, and the ledger's residual list must name the file
  that actually holds each pin.
- **(g)** A closed LEXICON is a bounded window by another name: standing rule (c) applies to it, and
  the corpus defending it must contain at least one member from OUTSIDE the lexicon. (D161's hedge
  corpus is built entirely from lexicon words, which is why FIX-H's cost was invisible.)

## 7. Deployment

**Do not deploy.** Production `sem-ai-command` is v92 (`ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`), unchanged since #75.
No `ALLOW_FUNCTIONS_DEPLOY=1` question arises: this campaign did not produce an independent PASS.
Deno type-check is **BLOCKED** in this environment (no `deno` binary; `npx deno@2` gated) — a
passing deno check is still owed on whatever bytes are eventually proposed.
