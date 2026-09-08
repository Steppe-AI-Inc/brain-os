## #76 — verifier #16, independent verification of the run15 D116–D122 closure (`52e830f` / `0a03127`)

**Candidate:** `0a031277486041da72002a88edc3f7e86ddb473d` (closure commit `52e830f`; the rotation
commit on top touches only `qa/verification` bookkeeping — verified by diff, index.ts identical).
**index.ts sha256:** `0c3616b4e82b53f18e0b597aa0fe935b4c0bed1dcae86fbc9d4c59b91812fc26`, asserted
before the run, after every one of 20 temporary source mutations, and at the end.
**Baseline for every comparison:** `d724d8c` (index.ts sha256 `1b291f37…27ef64`).
**Verdict: FAIL** — three defects (two P1, one P2) and one test gap.

**Production, read-only, re-checked myself (not carried forward from #75):**
`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` → `sem-ai-command` is
**version 92, ACTIVE**, `ezbr_sha256` `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at` 1788239725518 (~2026-08-30). Unchanged since #75. **None of D58–D126 is live.**
Everything below is about a candidate branch, not about what the founder is running today.
`ezbr_sha256` is a deployed-bundle hash and is not comparable to an index.ts source hash.

**Scope of this run:** source-level and behavioural verification of the `sem-ai-command`
Edge Function only. The 60 `*.sql` suites in `qa/scenarios-runner/` were **NOT run**;
DB/RLS/lifecycle truth, UI truth and live AI-chat truth are **OUT OF SCOPE / BLOCKED** for
this campaign and are not claimed either way.

### What genuinely closed

* **D117 + D118 — CLOSED, and this is the first both-directions improvement in the belt
  sequence.** Measured on my own corpus (37 fabricated summaries, 30 truthful negatives)
  through the REAL `readsAsCompletion` extracted from each SHA:

  | | false negatives (fabrication escapes) | false positives (truth destroyed) |
  |---|---|---|
  | `d724d8c` | 16 / 37 | 8 / 30 |
  | candidate | **11 / 37** | **1 / 30** |

  Campaigns #72–#75 each closed one direction by reopening the other. This one moves both.
  Seven truthful founder-facing answers are rescued ("No company was archived.", "Bob Smith
  was not reassigned.", "Nothing was deleted.", "None of the tasks were completed.", "That
  company was never archived.", "No tasks were assigned to Bob.", "Nothing was archived.
  Would you like me to?"). The four D117 boilerplate shapes are all caught.
* **D119 — CLOSED, and the product decision is SOUND.** Judged directly, as asked. Driving
  the REAL full gating pipeline (label loop + drop + D95 numbering), in the branch where the
  canonical row EXISTS: 0/8 execution assertions survive, the canonical name is always shown.
  In the ABSENT branch: 0/8 assertions survive (was 2/8 at `d724d8c`). And the case that
  actually matters — **a company genuinely named "Archived Goods Ltd" / "Deleted Scenes
  Media" / "Terminated Cable Co" etc., where the database corroborates it: 9/9 KEPT**
  (quoted where `COMPLETION_WORD` fires). The remedy destroys no real name the database
  knows. A dropped dead pointer is better than an unselectable "the company", and
  `run13/D103` already established such an option could never execute. **Accept the trade.**
* **D120 — CLOSED by D119's mechanism** for every entityType in `TYPED_FALLBACK`. No
  progressive assertion reached the founder as a label by any path I could construct,
  with one non-exploitable exception noted below.
* **D122 — CLOSED and genuinely so.** `issue5_confirmation_action_type_binding.mjs` really
  does extract and execute the REAL `resolveClarificationField` + the REAL
  `CLARIFICATION_ENTITY_ACTION_FIELD`. Proven by mutation, not by reading: reinstating the
  destructive default (`actionType || 'archive'`) produced 3 real assertion failures, and
  removing `company.archive` from the map produced 1. The call-site comment at index.ts:2584-2588
  cites both that suite and `sem_ai_command_source_invariants_drift_guard.mjs`; both fail
  under the mutation, so the citation is accurate.
* **The question belt was NOT touched** — confirmed two ways: no diff hunk reaches
  `safeQuestionFragment` / `FUTURE_PROMISE_IN_QUESTION`, and behaviourally 15 genuine
  questions survive and 6 promise/completion questions are clause-stripped **identically**
  on both SHAs.
* **`runtimeLabels` is NOT a fabrication channel.** It is the only path by which a label the
  contextPack does not contain still ships verbatim, but `recordLabel` is called only at real
  create sites with the id **the database returned**, so the model cannot choose the id and
  cannot aim a fabricated label at an option. The D119 claim would be more precisely stated
  as "the canonical name, or a fresh-create label, or the option is not offered".

### D123 — P1. D116 is closed only for the six replies the #75 ledger recorded.

The guard is a **word list tested per clause**. Exclusion survives two ways, and 24 of my 48
exclusion replies still bind the option the founder explicitly excluded:

* **Exclusion words not on the list (15):** `exclude acme`, `excludes acme`, `everything
  besides acme`, `aside from acme`, `apart from acme`, `avoid acme`, `omit acme`, `ignore
  acme`, `all of them minus acme`, `cancel acme`, `forget acme`, `hold off on acme`, `unless
  acme`, `nope acme`, `nah acme`. Note `except|excepting|excluding` are listed but **`exclude`
  is not** — `\bexcept\b` does not match "exclude".
* **The negator in an ADJACENT clause (6+):** `no. acme`, `not that one, acme`, `acme? no`,
  `acme, no`, `stop, acme`, `wrong one, acme` — and the founder's own most natural
  self-correction, **`acme? no, the holdings one`**, which with options [Acme, Acme Holdings]
  **binds Acme, the company the founder just rejected.**

The clause splitter is the thing that breaks it. `acme - no` correctly dead-ends (hyphen is
not a clause boundary) while **`acme, no` BINDS** — the same reply, two opposite destructive
outcomes, decided by a comma. Clause-scoping is right for `NEGATED_CLAUSE` in a summary
(a later sentence should not disarm a fabrication beside it) but wrong for a *mention*
exclusion, where cross-clause reference is ordinary English.

Traced end to end on the candidate source, not assumed: index.ts:2597 the disambiguation
branch requires no affirmative → :2608 `commandContradictsActionType` is false (an exclusion
carries no OPPOSITE-family verb) → :2612 `resolveClarificationField('company','archive')` →
`archiveCompanyIds` → the contextPack provenance filter passes by construction (the option was
offered) → `archive_company` runs. **No LLM in the loop, no confirmation step.**

`d724d8c` mis-bound all 24 as well, so this is **not a regression** — but D116 is reported as
CLOSED and it is only NARROWED. Over-refusal was measured in the same pass and is clean: 2
dead-ends, both present at `d724d8c` too, **0 regressions**; all nine real names containing
negator words ("No Limits Inc", "Not Just Bagels", "Except Studios", …) still bind correctly,
so the two pinned LIMITS do hold.

**Design note worth recording:** D119 removes a lexical word list in the label channel on the
grounds — stated in this very commit — that a word list "has no discriminating power" and
"the class does not end until the gate stops being lexical". D116, in the same commit,
*introduces* a word list in the matcher. My results are the same result that argument
predicts.

### D124 — P1. The D119 drop never fires for an entityType outside `TYPED_FALLBACK`.

Two different typed-fallback computations disagree:

* `displayName` falls back to `TYPED_FALLBACK[rt] || (/^[a-z][a-z_]{0,29}$/.test(rt) ? 'the ' + rt.replace(/_/g,' ') : 'the record')`
* `canonicalKnowsIt` compares that against `TYPED_FALLBACK[et] || 'the record'`

For any word-shaped `entityType` not among the 22 map keys, `derivedLabel` is `"the <et>"`
while `typedFallback` is `"the record"`, so `canonicalKnowsIt` reads **true for an entity the
canonical read cannot name at all** and the option is **never dropped**. Confirmed for
`subsidiary`, `branch`, `unit`, `client`, `vendor`, `invoice`, `business`, `entity`,
`organization`, `customer`, `thing`. `entityType` is unconstrained model-authored text in the
envelope schema (index.ts:1391 — `"entityType": string`).

**The sharp case is `employee`**, and it is worse than a dead pointer:

* `employee` **IS** in `CLARIFICATION_ENTITY_ACTION_FIELD` → `endEmploymentPersonIds` (executable).
* `canonicalById` is keyed `person|…` (index.ts:4629), never `employee|…`, and `lastKnownLabel`
  tests `resourceType === 'person'` — so an `employee` option is **unresolvable by construction**,
  no matter how real the person is.
* Therefore `derivedLabel` is always `"the employee"`, `canonicalKnowsIt` is always true, the
  option is never dropped, and the label is forced to the typed reference.
* With two real, named, in-contextPack people, the founder is shown
  **`the employee (option 1)` / `the employee (option 2)`** — asked to choose **whose
  employment to end, with no name shown** — and the bind **really executes**, because
  `contextPersonIds.has(id)` is true (index.ts:3259).

**Pre-existing at `d724d8c`** (byte-identical output measured on both SHAs), so not a
regression — but it is not covered by D119's stated guarantee ("a label is the canonical name,
or the option is not offered"), and D119 is the change that made that guarantee.

### D125 — P2. Four fabrications `d724d8c` caught now escape the completion belt.

D118 extended negation to `LEGACY_PAST_COMPLETION` and `EXECUTION_IN_PROGRESS`, which
previously had **none** — a necessary fix (#4905), but it widens the disarm surface on those
two arms, and the clause splitter knows only `[.!?,;]`:

* `The company has been archived – no undo available.` (en dash)
* `The company has been archived (no undo available).` (parenthetical)
* `The company has been archived without incident.`
* `ACME was archived and no errors occurred.` ("and")

Plus, already false-negative on both SHAs: em dash, colon, and newline separators, and
`Archived ACME. No issues were found.` The disclosed residual ("a fabrication and a negator in
the SAME clause still disarms that clause") is **literally accurate but understates its
scope** — em dash, en dash, colon, parentheses, newline and "and" are all ordinary assistant
boilerplate separators, and none of them is a clause boundary here. Net is still a large
improvement (16→11 FN), and evidence remains the primary defence; recorded so the residual is
sized honestly rather than by one example.

Also retained on both SHAs, unchanged: `test3 is archived. Should I restore it?` reads as a
completion (the run12/D94 passive-progressive arm matches "is archived"), i.e. a truthful
read-only state answer still trips the drift belt. Pre-existing, not introduced.

### D126 — TEST GAP. The D119 drop is not observed where it matters most.

* The run15 suite's D119/D120 cases use a `renderLabel` helper built from
  `src.slice(indexOf('const derivedLabel'), indexOf('if (o.label !== beforeLabel)'))` — the
  **per-option label loop only**. It never reaches the drop. Removing the drop entirely,
  making it drop everything, and weakening it all left `run15_defect_closure_contract.mjs`
  at **exit 0, 48 pass**. The "48 cases" closing D119/D120/D121 do not execute the mechanism
  the campaign is built on; the drop is observed only indirectly by the run8/run12/run13/run14/
  lifecycle re-pins.
* **No committed suite observes the MIXED drop case.** Weakening the drop to fire only when
  *every* option is unresolvable passes the **entire** battery — run15, run8, run12, run13,
  run14 all green. The mixed list (a fabricated pointer sitting beside real ones) is the
  realistic shape and it is unpinned.

### Independent mutation battery — 20 mutations, my own harness

Written from scratch; `qa/verification/proposed/v15_mutation_proof.mjs` is the implementing
session's and running it would be self-certification by proxy. Every mutation edits the REAL
source, runs the REAL committed suites, then restores byte-identically (sha256 asserted after
each — all 20 `0c3616b4…12fc26`). A mutation counts as DETECTED only if the mutant is applied,
still syntactically valid, still extractable, and produces a real **assertion** failure — not
a `SyntaxError` and not a suite's own extraction drift guard.

* **COVERAGE (guard removed):** A1 remove the D116 dead-end ✔; B3/B4b restore whole-summary
  negation ✔ (6 assertion failures); C1 remove the drop ✔ (run8+run14); C3 restore the D113
  lexical fallback ✔ (11 failures); C4b `canonicalKnowsIt = true` ✔ (run12+run13+run14+run8);
  F1 destructive default ✔; F2 map entry removed ✔.
* **LIMITS (guard over-broadened):** A2 `NEGATED_MENTION` matches everything ✔; A3 drop the
  clause split ✔; A4b drop the own-label removal ✔; C2 drop every option ✔ (run12+run13+lifecycle).
* **Survived / weak:** **C5** (drop only when ALL options are unresolvable) — SURVIVED the whole
  battery → D126. **B1b / B2b** (weakening `NEGATED_CLAUSE`) — caught only by run15's
  *extraction shape* guard, not by any behavioural assertion, so the negator list's behaviour
  is pinned by its spelling rather than by what it does.

Two apparent detections in my first pass were **harness artifacts** and are reported as such
rather than counted: A4 (my mutation had unbalanced parentheses → `SyntaxError`) and B1
(broke run15's extraction). Both were re-run correctly as A4b/B1b.

### Battery

27 `.mjs` files enumerated from the filesystem. 21 are assertion-bearing and **all pass, 0
failures**. 5 are self-labelled `SUPERSEDED (prose-era)` stubs that assert nothing —
correctly labelled, flagged here because the "26 suites" figure in the closure postscript
counts them. `_gate_extract.mjs` is a shared library, not a suite. The `*.sql` suites were
not run (see scope).

### Ledger / bookkeeping truth

* All **six** exemplar replies in the #75 D116 table now dead-end — the recorded cases really
  are closed, which is why D123 is filed as a new, unrecorded extension of the class rather
  than a false closure claim.
* The closure postscript's mechanism descriptions match the code. The D116 clause-scope LIMIT
  is disclosed, but **only in its benign direction** ("acme holdings, no rush" still binds);
  the destructive direction of the same limit — `acme, no` binds the excluded option — is not
  disclosed. That omission is what let D123 read as closed.
* No PROPOSED-file promotion preamble leaked into `qa/KNOWN_FAILURE_MODES.md`; the
  `proposed/v15_*` mentions are legitimate citations.
* `CURRENT_CAMPAIGN.json` accurately names the candidate, branch and index.ts sha256, and its
  claim that the rotation commit changes only bookkeeping is true by diff.
* Six suites re-pinned under D119, each characterised: run12/D95 **STRENGTHENED** (now asserts
  both the drop and the numbering), run13/D103.hold.numbered **STRENGTHENED**, run14/D113.hold.absentId
  **CHANGED-in-contract, correctly and explicitly** (now observes the drop), run10 R10.flag.*/D78
  **PRESERVED** with realistic fixtures (R10.flag.quiet narrowed to the resolvable path),
  lifecycle R2 **PRESERVED/strengthened fixture**, run8/D72 **WEAKENED** (`opts.every(...)` is
  vacuously true on the now-empty array; only `question === 'Which one?'` still asserts) with
  D72b **RETIRED explicitly and on the record**, matching the ledger.

### Regression tests added

`qa/verification/proposed/v16_regression_additions.mjs` — 50 cases, same CONTRACT/DEFECT
convention and the same exit guard (ANY failure exits nonzero). On this candidate: **14 pass,
36 fail — all 36 are DEFECT cases reproducing D123/D124/D125 by design, and 0 CONTRACT
failures**, i.e. every guard I pinned genuinely holds. It drives the REAL matcher, the REAL
`readsAsCompletion`, and the REAL **full** gating pipeline including the drop, which is the
thing the run15 suite does not do.
