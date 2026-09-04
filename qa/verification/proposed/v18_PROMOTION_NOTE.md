# v18 promotion note — campaign #78, verifier #18

Base `fbafded912e0fef7ddc7d5119308df8ab8be72e9` (closure commit `a559f8f`).
index.ts sha256 `cf4b6f4defe9b5ed72cee29b08c4e2731651fac0d080f3ba30e1ed601e056deb`,
observed at the start, after every one of 14 temporary source mutations, and at the end.

## Verdict

**FAIL.** Do not deploy `a559f8f`/`fbafded`. Production stays at `sem-ai-command` **v92**
(`ezbr_sha256` `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`), which is
where it already was; nothing was deployed by this campaign and this process has no
production authority of any kind.

## Files

| file | what it is |
|---|---|
| `qa/verification/proposed/v18_known_failure_modes_entry_78.md` | the `## #78 —` ledger entry, no preamble, ready to append to `qa/KNOWN_FAILURE_MODES.md` |
| `qa/verification/proposed/v18_regression_additions.mjs` | 56 cases, CONTRACT/DEFECT convention, ANY failure exits nonzero, `index.ts` resolved as `../../../supabase/functions/sem-ai-command/index.ts` |
| `qa/verification/scratch/v18/*` | the evidence: my own belt/matcher/gate extractors, the corpora, the mutation harness, the claim cross-check |

`v18_regression_additions.mjs` on the candidate: **15 pass, 41 fail — all 41 DEFECT cases
reproducing D130/D131/D132/D133 by design, 0 CONTRACT failures.** Exit code 1. That is the
file working as intended; it goes green when the four defects are closed.

## What must be true before this file is promoted to `qa/scenarios-runner/run18_defect_closure_contract.mjs`

Promote only when all 56 cases pass. Expect these closure edits, mirroring run16→run17:

1. **Path.** `resolve(HERE, '..', '..', '..', 'supabase', …)` becomes
   `resolve(HERE, '..', '..', 'supabase', …)` when the file moves up one directory.
2. **Extraction anchors.** The file refuses to report if `SELECTION_FILLER`,
   `cleanSelection`, `ACTION_FAMILY_VERBS`, `ENTITY_NOUNS`, `readsAsCompletion`,
   `COMPLETION_VOCAB`, `NEGATED_CLAUSE` or `ownNumber` are missing, and if
   `readsAsCompletion` stops consulting either `NEGATED_CLAUSE` or `COMPLETION_VOCAB`. If a
   D130 fix removes `COMPLETION_VOCAB` entirely (a legitimate outcome — see below), that
   second guard must be *deliberately* relaxed with the reason on record, not deleted quietly.
3. **`D131.disclosedResidual.pinnedNotAccepted`** is written as a CONTRACT asserting the
   residual still exists (`readsAsCompletion(...) === false`). If a fix closes it, flip that
   case to `=== true` in the same change and say so — do not delete it.
4. **`D133.numberedFallbackStillDeadEnds`** asserts that `option 1` / `#1` / `the first one`
   BIND the first option. If the product decides instead that an ordinal must never bind
   deterministically, that is a defensible product call — but then the D95 numbering comment
   at index.ts:5271–5276 ("*so every option stays uniquely selectable*") is false and must be
   corrected, and this case flips to a CONTRACT pinning the dead-end with the decision on
   record. Do not leave the code and the comment disagreeing.

## Direction for the four defects (not prescriptions — the trade is the founder's/implementer's)

* **D130 (P1).** The order rule needs the part-of-speech guard D112 already wrote. A
  completion word preceded by a determiner, a possessive or a cardinal (`the archived list`,
  `3 archived companies`, `Bob's completed tasks`) is a NOUN and must not count as the
  "completion vocabulary" the negator is ranked against; a completion word that is part of a
  capitalised multi-word entity name is the same problem in a different dress. The cheaper,
  strictly-safer alternative is to drop the ordering comparison and go back to `52e830f`'s
  "any negator in the clause disarms it" (mutant M6, which the battery kills for D125
  reasons) — that scores 0/25 and 0/26 on the false-positive corpora and 18/19 on the
  false-negative one. **Which direction to take is a real trade, and index.ts's own standing
  position (5388–5391) is that destroying a true answer is the worse failure.**
* **D131 (P2).** Same mechanism, other direction. Anything that fixes D130 by scoping
  should also decide whether a negator that scopes a *different* verb ("Not the task — the
  company was archived") is allowed to disarm. Note the belt is defence-in-depth: evidence,
  not this belt, is the primary defence against a fabricated completion, which is why D130
  outranks D131.
* **D132 (P2).** Two lines. Guard the lookups (`Object.prototype.hasOwnProperty.call(...)`
  or `Object.create(null)` / a `Map`), and validate `actionType` in the option gate the way
  `entityType` already is, so a hostile value never persists in the first place.
* **D133 (P3).** Either strip an `(option N)` / `#N` / bare-`N` reply against the option at
  index N-1 *before* the label match (with the same "only that option's own number" rule), or
  correct the D95 comment. Both are acceptable; the current state — the product renders a
  selector the founder cannot use — is not.

## Coverage debt to fix in the same change

Three mutants survive the whole 28-suite battery today; the three `D134.coverage.*` cases in
`v18_regression_additions.mjs` kill them and should be promoted even if nothing else is:

* **M3** — the newline the candidate added to the clause splitter is unobserved.
* **M10** — the `ACTION_FAMILY_VERBS` scoping that *is* the headline half of D127 is
  unobserved; unioning it back makes `reopen acme` arm `archiveCompanyIds` against a pending
  archive and the battery stays green.
* **M12** — `run17`'s `D129.hold.bareDigitStillDeadEnds` tests a digit that is never the
  winner's own number, so it cannot observe the limit it claims to.

## Bookkeeping to correct at the same time

The closure postscript's battery line ("28 suites … 22 assertion-bearing — the verifier's
count, adopted") is a pre-change count adopted after the change that made it **29 = 1
library + 5 stubs + 23 assertion-bearing**. This is the same error #77's entry corrected one
generation earlier. Recount from the filesystem at the SHA being reported on, every time.

## Coverage this campaign did NOT have (do not read the FAIL as covering these)

* The 60 `*.sql` suites were **not run** — `npx supabase db query --linked` is
  permission-gated in this process. DB / RLS / archive-restore-ownership lifecycle truth is
  **BLOCKED**, not claimed either way.
* No browser/MCP tooling was available: **UI truth and live AI-chat truth are BLOCKED**.
* `deno` is gated here, so the postscript's `deno check` claim is **NOT INDEPENDENTLY
  VERIFIED**.
* No synthetic `QA-VERIFY-*` data was created, because nothing in this campaign writes: it
  is a pure source/behavioural campaign against extracted product code plus one read-only
  `functions list`. There is therefore nothing to clean up.
