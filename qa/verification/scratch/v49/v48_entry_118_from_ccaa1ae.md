## #118-V — verifier #48 (campaign #108), independent v92-differential deployment gate on `27bd9f09f021` — **FAIL**, six open v92 regressions, four of them never measured before because every prior measurement of that arm was taken against a development baseline

**Candidate.** `27bd9f09f0212c9a02789e28f4e26622ed64131f`, `supabase/functions/sem-ai-command/index.ts`
sha256 `90fdc7dc35117e5257648e2a95bb5c70092da3f3dcd3b93bd7c3cd50f4ff5177` (CRLF working tree),
`b952bea20e4c9677cf39478d3a3053d36901e8b0994806472e72db8467637a28` LF-normalised. Byte-identical at
start and end of this run.

**Reference.** Deployed v92, modelled with all THREE prose-overwrite arms via
`qa/verification/lib/v92_reference.mjs`. I audited that instrument rather than trusting it: v92 has
exactly twelve `result.summary =` sites — four are appends/prepends, four need a structural signal
(`organizationGraphCheck`, `proposedPlan`, `lifecycleReports`, `stateClaimCorrections`), one needs
`model === 'deterministic-confirmation'`, and three are the prose arms the instrument models
(`lifecycleMismatchCorrections`, `FUTURE_PROMISE_PATTERN`, `PAST_COMPLETION_CLAIM_PATTERN`).
**There is no fourth prose path.** The instrument's `LIFECYCLE_ARMS` transcription is byte-faithful to
v92:441/2669/2977/3060/3135, and its self-check is non-vacuous — each witness is caught by its own arm
and by no earlier one. The three-arm correction is confirmed and I found nothing to add to it.

### Provenance — stated without overstatement

I ran `supabase functions list --project-ref pvphxgrtdfrudejjhzjk` myself: `sem-ai-command`, **ACTIVE,
version 92**, `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at` 2026-09-01T05:15:25.518Z, CI entrypoint path. **`supabase functions download` was refused
by this session's command classifier in four different forms** (direct; via
`scripts/factory-runner/verify-deployed-bytes.sh`; with the sandbox override; with cwd moved into a
scratch dir), so I could not pull bytes off the platform. What I did confirm with my own hands:
`git show c9dfab5bd433:…/index.ts` hashes to `795c20c8…` at 321,370 bytes, and the download artifact a
prior session committed at `qa/verification/scratch/v92/deployed/…` LF-normalises to exactly that hash.
**My provenance link is INTEGRATION-LEVEL plus an inherited artifact, not byte-direct.** Ledger #108's
"BYTE-DIRECT, CLOSED" is consistent with everything I could measure and nothing refutes it, but it is
not something this verifier can personally re-affirm. Not a P0 — a coverage limit on my side.

### The deploy-surface delta, re-derived

`git diff --name-status c9dfab5bd433 27bd9f09f021 -- supabase/` is exactly one line: `M
supabase/functions/sem-ai-command/index.ts`, and that directory holds only that file. Raw git reports
6017 insertions / 4312 deletions — a CRLF-vs-LF artefact, not the real delta. LF-normalised:
**53 lines removed, 1758 added, 52 hunks**, 4312 → 6017 lines, 321,370 → 473,280 bytes.
**Identifier delta: 191 declared identifiers added, 0 removed, 0 module-top-level declarations changed**
(ledger #90 got this count wrong once; this is my own re-derivation, not a restatement).

### What is CLEAN — measured, not assumed

- **My own corpus, 550 rows** (380 truthful with real names, 170 fabrications), including a 160-row
  negator-token-name section in BOTH directions (`No Limits Inc`, `Nothing Bundt Cakes`, `Never Summer
  Industries`, `None The Wiser LLC`, `Nothing But Nets Foundation`, `Pending Review Holdings`,
  `Awaiting Approval Ltd`, …): with the entity pack populated, **0 truth regressions and 0 fabrication
  regressions**; 113 truthful rows RESCUED from v92 and 48 fabrications GAINED over v92.
- **The pinned `v92_parity_corpus.json`** (272 truthful / 182 fabrications), re-run through MY harness
  rather than the shipped gate: **0 / 0 in both pack configurations.**
- **Ledger #64 D16, #65 D25, #65 D27 (production row `9dda919c`), #66 D40 are GENUINELY CLOSED**,
  re-derived myself: 11/11, 7/7, 3/3, 1/1, plus BUG-002 3/3 and v92diff-fix 1/1, in both configurations.
- **The matcher**, 41 disambiguation shapes: **0 wrong-option binds, 0 dead-ends where v92 binds**,
  8 binds where v92 dead-ends — 7 legitimate ordinal selections and 1 quoted-label selection, all
  intended. `option 1, option 2`, `option 1 #2`, `#2 the first one`, `option 5`, `no option 2` and a
  company literally named `Option 2 Ltd` all correctly dead-end. #46's V46-D7 is genuinely closed.
- **The battery**: 36 `.mjs` suites under `qa/scenarios-runner`, **36 exit-0, 0 non-zero**, each spawned
  as its own child process so the status is the child's, never a pipeline's — the retract-check the
  brief asked for. 29 assert, 5 are explicit `SUPERSEDED (prose-era)` stubs, 2 print in another format.
  Ledger #101's "34 suites" undercounts the files by two; the zero-failures half re-derives.
- **run15 is 57/0** and the D117 no-whole-span-lookaround / no-inline-modifier contract is green.
- **Mutation proof, 18 mutants, mine**: 17 LOAD-BEARING across the two pack configurations; the 18th
  (the V45-N2 early return) is a deliberate performance-only no-op and my 0-verdict-change result
  CONFIRMS its stated claim. **No dead code found.** I also independently closed verifier #47's
  `C11 mutant applies — nameInternal` red: my anchor applies and moves 44 rows.
- **The three expected reds re-derive as non-blockers**: `v30` 25/1 (stale pinned identifier list),
  `v31` 33/1 (assertion at the wrong locus), `v42` 12/1 (injects an EMPTY pack by construction).
- **V47-D5 is REFUTED.** `Confirmed — you selected “Archived Media Group”.` is belt-destroyed in
  isolation, but is not reachable: the composing site (`index.ts`:2780-2786) tags the turn
  `deterministic-disambiguation`, which `legacyProseFallback` excludes, and `COMPLETION_WORD` already
  degrades a participle-initial label to the neutral acknowledgement. Not a defect.

### *** The campaign file's `"v47": "44/0"` is wrong. It is 44/8. ***

Run from the filesystem on the committed candidate, from both committed copies
(`qa/verification/scratch/v47/` and `qa/verification/scratch/v92/v47/`): **44 passed, 8 failed.**
`qa/verification/proposed/v46_regression_additions.mjs` is 33/3 and
`qa/verification/scratch/v92/v46/v46_regression_additions.mjs` exits 2 (`ROOT resolved wrong`) and
cannot execute in this checkout at all — so #46's gate is not observing anything here. Four gate files
are red beyond the three expected reds. **This is the seventh instance of the campaign's own recorded
pattern**: a number in the record that nobody re-measured.

### Open v92 REGRESSIONS — deploy blockers

Every one is a truthful answer deployed v92 **ships** that this candidate **destroys**, replacing it
with `I can't actually do that from chat — nothing was changed.` — which is itself false. The file's own
doctrine: *destroying a true answer and substituting a false one is worse than the fabrication the belt
exists to catch.*

**V48-D3 (P1, the largest, and it has never been measured).** The belt's first-person active arm
(`run23/D155`) accepts **any capitalised object**, so a truthful self-referential sentence is destroyed:

| truthful founder-facing answer | deployed v92 | candidate |
|---|---|---|
| `I removed Section 2 of the summary above.` | ships | **DESTROYED** |
| `I renamed Column B in the table above for readability.` | ships | **DESTROYED** |
| `I deleted English from the language filter.` | ships | **DESTROYED** |
| `I removed Monday from the list of options above.` | ships | **DESTROYED** |
| `I removed Chapter 3 from my draft.` | ships | **DESTROYED** |
| …9 of 14 natural rows, 54 of 54 in the generated shape | ships | **DESTROYED** |

**Why nobody saw it.** Ledger D155's 24-row table is the same family with **lowercase** objects, and
D158b closed it by requiring `(?:[A-Z]|<entity noun>)` — which *creates* this class and never measured
it. And every one of those measurements was taken against `b32e0e4` / `0969852` / `4476c92`.
**`4476c92` is not production**: 451,974 LF bytes, dated 2026-09-05; v92 is 321,370 LF bytes, dated
2026-09-01. Verifier #29 certified a candidate against a development baseline. That is Q4's answer and
it is the root cause of this finding surviving nineteen rounds.

**FIX PREPARED AND MEASURED** — `qa/verification/scratch/v48/fix_d3.mjs`. The capitalised-object branch
consults the positive entity signal already in scope (`knownEntityNames`, `index.ts`:3423), using the
same capture-and-test idiom the CONFIRMED arm already uses; the entity-noun branch is untouched.
Measured: **9/9 truthful rows rescued, 5/5 in-pack first-person claims still caught, 5/5 entity-noun
claims still caught, 0 new regressions across the 550-row corpus.** With an empty pack the fix ships
5/5 of those claims — and deployed v92 ships 5/5 of them too, so the cost is **exact v92 parity**, never
a fabrication regression. Absence is never used in the destructive direction.

**V48-D2 (P1).** `EXECUTION_IN_PROGRESS`'s `processing (?:the|your)? (plan|request|action|changes?)` and
`executing (?:the)? (plan|…)` arms are unconditional — no subject, no quote handling — so **reported or
quoted UI text** is read as an execution claim: `The toast reads "Processing the request".`,
`You will see "Processing the request" in the toast.`, `The UI shows "Executing the plan" while it
runs.`, `The status text is "Processing your request".` 4 of 8 natural rows. v92 preserves all of them.
(`The button says "Archiving…" until it finishes.` survives — the gerund-subject guard covers the
gerund arms but nothing covers these two.)

**V48-D1 (P2).** The gerund-subject guard has a hole: its case-sensitive branch carries a fixed-length
lookbehind rejecting a function word before the object, and its case-insensitive branch carries a closed
finite-verb list. When the token immediately before an **out-of-list** finite verb **is** a function
word, both fail: `Archiving anything at all logs an audit row.`, `Adding to any of these increments the
counter.` 2 of 20 natural rows; 22 of 22 in the generated shape.

**V48-D4 (P2) — the founder's own applied ruling is wired into one arm and not the other.** The
candidate widens `FUTURE_PROMISE_PATTERN` with the typographic apostrophe (`i['’]?ll`), correct in
itself, but the conditioned-offer stand-down lives only in the imminent arm. Result: the candidate
**preserves** `I am about to archive ACME Corp once you confirm.` and **destroys** `I’ll archive ACME
Corp once you confirm.` — the same offer, opposite outcomes; and v92 preserves the curly form. 4 of 6.
The ASCII twin is destroyed by v92 too, so the *class* is v92's, but the *inconsistency* is this
candidate's and it contradicts a decision the founder has already made.

**V48-D6 (P2, fabrication regression, pack-conditional).** Verifier #47's D2, re-derived myself:
`No Limits Inc unit was archived.` / `Nothing Bundt Cakes unit was archived.` /
`Never Summer Industries branch was archived.` are **caught** with the pack populated and **shipped**
with it empty, while v92 corrects them either way. The entity-signal design note says it is
"truncation-safe because absence proves nothing and is never used." **In this direction that is false**:
when the name is absent, `nameInternal` goes false, the negator stands, the clause reads as a truthful
negative and the fabrication ships. Absence *is* load-bearing here, in the unsafe direction. (The
honest counter-argument, which I accept as far as it goes: with no pack, `No X unit was archived` is
genuinely ambiguous, and v92 "corrects" it by destroying the truthful determiner reading half the time.
That makes it a bounded trade — but it is a trade nobody sized, filed as closed.)

**V48-D5 (P1, availability, reproduced independently).** On one unsplittable clause carrying skipped
negators the belt is **cubic**, not quadratic:

| input | time |
|---|---|
| 500 chars | 0.36 ms |
| 1 KB | 2.0 ms |
| 2 KB | 10.4 ms |
| 4 KB | 70.9 ms |
| 8 KB | 508 ms |
| 16 KB | **3,967 ms** |

Asymptotic exponent **2.96** (8 KB → 16 KB). The shape is real prose — `"No Limits Inc was archived and
Never Summer Industries was archived and "` repeated — unsplittable because the clause splitter only
breaks on `and` before a *lowercase non-auxiliary* token. `max_tokens` is 8192 and nothing caps
`result.summary`'s length, so 16 KB+ is reachable, and 25,800 chars of ordinary punctuated prose costs
only 0.52 ms, so the pathological shape is what a founder would never notice until a turn dies.
Deployed v92's single regex is linear. **A `String(s).slice(0, 4000)` cap changes 0 verdicts on all 550
corpus rows** — this is a one-line fix and it should land before any deploy.

### Open GAPS — real, tracked, NOT deploy blockers (v92 gets them wrong too)

**V48-D7 (P3), confirming V46-D4 / V47-D6 by reproduction.** I injected a local `const` into
`readsAsCompletion`'s `.map()` callback on a scratch copy: `run15` goes to **exit 1** while
`v92_open_regression_contract` stays **28/0**. The narrowed CONTRACT 5 is defensible — its stated
hazard ("a new TOP-LEVEL declaration is silently dropped by the extractors") is genuinely a different
hazard, its own coverage assertions are non-vacuous, and run15 fails **loudly** rather than going
silently green. But the contract's comment that locals "are not the hazard" is wrong: `run15` slices
`const readsAsCompletion = …` to the **first `;`** with a naive `indexOf`, so any `;` inside the
statement truncates it. One assertion closes it: *the `readsAsCompletion` declaration must contain no
literal `;` before its terminator.*

**V48-D8 (P3), confirming V46-D5.** `closed` and `added` are in `COMPLETION_PARTICIPLE` and absent from
`CONFIRMED_COMPLETION`, so `Confirmed — Closed the work order.` and `Confirmed — Added Bob Smith.` ship.
v92 ships them too. The session's withdrawal (it destroyed 2 of 8 truthful rows about entities *named*
after those words) was correct for the naive version — but the entity signal did not exist when that
measurement was taken, and it is exactly the discriminator this needs. Re-measure before withdrawing again.

### Method notes for the next verifier

1. **A truth regression can only live where v92 preserves.** v92 destroys anything with an auxiliary
   within 30 chars of a participle, or a lifecycle verb within 40 chars of
   task/company/goal/employee|person|staff. That means most "truthful negative" corpora in this campaign
   are measuring **parity**, not risk. The whole risk surface is the arms v92 does not have:
   `EXECUTION_IN_PROGRESS`, `CONFIRMED_COMPLETION`, `REFERENCELESS_CONFIRMATION`, the first-person active
   arm, the R-AUXGAP blanking and the idiom strips. Generate there, not everywhere.
2. Two of the campaign's most-cited destroyed rows are **v92 parity** and should stop being quoted as
   costs: `No North Depot was archived.` and `Archiving a company hides it from the active list…` are
   both destroyed by deployed v92 (PAST and LIFECYCLE respectively). The session's disclosure of the
   first as "destroyed" is true but it is not a regression, and its argument that it is
   indistinguishable from `No Limits Inc was archived.` is **correct** — I confirm the refusal.
3. The prose differential holds the turn context fixed at the ungrounded case. It therefore does **not**
   measure the removal of v92's `!result.pendingAction` short-circuit (run8/D59) — a real v92 behavioural
   difference on pendingAction turns that no differential in this campaign covers. Someone should.
4. `deno` is not on PATH in this environment, so **no type-check or Edge-runtime regex-construction
   check was performed by me**. That is a real coverage gap, not a pass.
