# v69 PROMOTION NOTE — campaign #129, candidate `0ca756ee`

`index.ts` sha256 measured before and after every step of this campaign:
`006a0c3feeb5f2f13b0b99b55684d3d3d667d86d90484672d8d63a1db2c4d610` (unchanged; the candidate was never
edited by this verifier).

## What to promote, and where

| artifact | promote to | why |
|---|---|---|
| `qa/verification/proposed/v69_regression_additions.mjs` | `qa/scenarios-runner/v69_shape_vocabulary_and_boundary_contract.mjs` | 12 rows: 6 DEFECT (V69-D1..D6, failing on `0ca756ee`) and 6 CONTRACT (holding today, must never regress). Exits non-zero on any failure; source under test via `SEM_INDEX_SRC`, else resolved from the file's own location. |
| `qa/verification/proposed/v69_known_failure_modes_entry_150.md` | `qa/KNOWN_FAILURE_MODES.md` as `## 150` | ledger head is `## 149`; `## 140` and `v65_*` from the launch template are already taken. |
| `qa/verification/scratch/v69/tiers_harness.mjs`, `pipeline.mjs` | keep in scratch | the executor / intent / receipt windows and the whole-turn final-claim window, sliced from real source with a refusing self-test. Reusable by the fixing session. |
| `qa/verification/scratch/v69/concept_map.mjs` | consider `qa/scenarios-runner/` | the mechanised structural question. It is the instrument that found D3/D4; the shipped ratchet cannot. |

## The three changes the fixing session should make to the SHIPPED ratchet

`qa/scenarios-runner/concept_duplication_ratchet_contract.mjs` was green through ten truncated copies.
It needs all three, and the third is the one nobody had named:

1. **See inline vocabularies.** It scans only `const NAME = /…/`. `lastClauseIsMutation` (line 6064) and
   `lexiconObject` (line 6235) are inline regex literals inside expressions, and both ship a P1.
2. **Match stems by prefix.** A copy spelled `archiv|restor|delet` shares zero *exact* members with the
   canonical whole-word list. Prefix matching finds it; exact membership never will.
3. **Score containment, not Jaccard.** `MN_LOAN_VERB` ∩ canonical / |MN_LOAN_VERB| = **1.00**;
   Jaccard = **0.325**, below the 0.60 threshold. A symmetric metric is *least* sensitive to the copies
   that have drifted *furthest*, which is exactly backwards for this guard. Rule: any member set whose
   containment in a canonical definition is ≥ 0.8 and whose size is smaller than the canonical is a copy
   until a registered decision says otherwise.

`v69_regression_additions.mjs` implements all three in its D3/D4/D6 row; lift that scan directly.

## The boundary ruling, for the fix

Do **not** move `IMPERATIVE_OBJECT`'s head region to two modifiers, and do **not** return it to
position-free. Both settings of that integer have now shipped a P1 in opposite directions (#68 →
position-free destroyed truthful reads; #69 → one modifier both blinds real requests and still destroys
truthful reads). The distinguishing evidence is not distance:

* a **request** carries an addressee-free imperative frame, or a determiner, or an identifier-shaped
  token, or a quoted name, anywhere in the object;
* a **headline** is a bare noun phrase whose only extra structure is a prepositional phrase
  (`… for the department`, `… on the Beta deal`) with no target token at all.

Derive the head-region rule from that distinction in the one definition, and keep the read-side pins
(`Transfer pricing for the business unit`, `Close call on the Beta deal today`, `Share price fell after
the announcement`, `Archive policy needs a review`) plus the new read set in `v69_regression_additions.mjs`
as the both-directions gate. **Measure both directions before concluding** — the last three rounds each
closed one and opened the other.

## Also to be fixed with the same edit

* `STATEMENT_FINITE_VERB` must not treat an adjectival participle (`expired`, `created`, `closed`,
  `changed`) as a finite verb when it sits *before* an entity noun in an imperative object.
* `IMPERATIVE_OBJECT` must accept a verb followed by `: - — ; …` as well as whitespace.
* `NEGATED_IMPERATIVE_HEAD` must see a negated mutation clause anywhere in the command, not only at the
  head. `make sure you do not archive ACME` is the case that matters most: the founder said *do not* and
  the model's *done* ships.
* The receipt singulariser: `status` → `statu` is machine output in a founder-facing sentence.

## Residuals this verifier did NOT close, each with its size

* **`mutation_sweep_safety_contract` is still a source-pattern check** accepting one of three regex
  spellings of "gated on survivors". The stronger form — run each tool against a deliberately-surviving
  mutant and assert the exit code — is still not implemented. See the verdict for the exit codes measured
  this round.
* **`SEM_AI_MODEL_CONTEXT_TOKENS = 180000` is one value for every model.** Measured this round: the
  largest request the pack gate can permit is ≈ **32.8k tokens** (11,400-token pack budget × 1.22
  compact→pretty inflation + an 18,824-token system prompt). Headroom against 180k is ≈ 147k and against
  a 128k model ≈ 95k, but against a **32k-context model it is −782 tokens** — an ordinary founder turn
  would 413. Reachable only by pointing an `ai_providers` row at a 32k model, so: registered, sized, not
  a deploy blocker for the current provider row, and no longer merely "range-asserted".
* **V61-D5** (`compactionCheckpoint.summary` untrimmable), the platform request-body limit, wall-clock
  timeout and SSE stream initialisation, the 22 regex-level sweep survivors (ledger #147), and the one
  pre-existing bare CR in `index.ts` — all unchanged by this candidate and unchanged by this round.
* **Ledger #144 (embeddings silently NULL since 2026-08-24)** — `embedTexts` is byte-identical to v92
  (verified normalised for line endings) and the entry is still OPEN and named in two QA documents. The
  deferral remains correct on both halves.
* **`production_write_authority.regression.test.mjs` fails on this machine**: a repository-level GitHub
  Actions secret `SUPABASE_ACCESS_TOKEN` exists. That is a production-write route readable by any workflow
  on any branch, bypassing the environment approval gate. Founder-only to fix; it is not a property of
  this candidate, and it is not new — but it is live.
* **`factory_production_write_inventory.regression.test.mjs` fails by design** (its own header says so):
  **11** factory-runner scripts reach the database through `supabase db query --linked`. The header says
  *ten*. The count has drifted up by one since it was written.
