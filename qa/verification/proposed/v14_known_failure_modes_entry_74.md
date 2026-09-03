## #74 — f1722f2 (run13 D98–D103 closure) verified by #14 (fully executed): DO NOT DEPLOY — the label matcher can now bind a founder's reply to the WRONG entity, and the question belt reopened the class it replaced

Verifier #14, campaign #74, base `f1722f2`, `index.ts` sha256
`10db5838…a70d2a` — asserted before the run, after every one of 39 temporary source
mutations, and at the end; every mutation restored from the original bytes and
sha-verified, and the runner aborts the whole campaign on any restore mismatch. The
working tree's `index.ts` is byte-identical to the commit.

Independently executed, with a harness written from scratch rather than
`qa/verification/proposed/v13_mutation_proof.mjs` (running the implementing session's own
proof and reporting its result is not verification): the full 25-suite `.mjs` battery
enumerated FROM THE FILESYSTEM (not a hardcoded list), a 34-mutant mutation battery
covering each of the seven new guards' COVERAGE **and** LIMITS, a three-SHA A/B
differential (`fdb4564` / `ace9b6a` / `f1722f2`), four adversarial corpora written for this
campaign (34 completion-shaped summaries, 30 legitimate summaries, 16 negation/status
answers, 25 assertion fragments + 27 clarifications, 20 curated interrogative-led
first-person assertions), and a read-only production check.

**Battery: 25 `.mjs` suites, all exit 0, zero failure lines counted from OUTPUT TEXT.** One
suite (`_gate_extract.mjs`) is a shared library and asserts nothing by design; five are
explicit `SUPERSEDED (prose-era)` stubs that assert nothing
(`claim_segmentation_and_present_tense_fp`, `d3_past_completion_gate_not_shortcircuited_by_pending_action`,
`mixed_claim_grounding`, `past_completion_gate_behavior`, `per_resource_grounding_contract`);
19 suites assert. `sem_ai_command_execution_plan_truth` appears to report a failure to a
naive parser — that is a false parse of the prose "the failing dependency"; its own last
line is `ALL REGRESSIONS PASSED`. No provider-capacity or session-limit text anywhere.
The `*.sql` suites were NOT run: DB/RLS/lifecycle truth is out of scope for this campaign,
which is an Edge-Function source campaign.

**Production, read-only:** `sem-ai-command` is version **92**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, last updated
2026-09-01T05:15:25Z. The branch under test is **28 commits ahead of `origin/master`**
(`80074c2`), and every closure from run9 onward — including this one — is unshipped. The
byte-level comparison between production and the candidate was deliberately NOT performed:
`supabase functions download` writes into `supabase/functions/sem-ai-command/`, which would
have destroyed this campaign's sha discipline, and commit `4b173a3` already makes that a
standing repo rule. Recorded as a deliberate, scoped gap, not a silent one.

**What is genuinely closed, measured rather than accepted:**

* The `"Confirmed — <completion>"` family is really shut. On my own 34-case corpus at
  `model='gpt'`, uncorrected completion-shaped summaries drop from **26/34 on `ace9b6a` to
  14/34 on `f1722f2`, with zero NEW false negatives**. The residual 14 are the long-disclosed
  `LEGACY_PAST_COMPLETION` lexical gaps (`"The migration finished."`, `"ACME was wiped from
  the system."`, `"Task deleted."`, `"ACME Holdings: archived."`), unchanged from `ace9b6a`.
* The `D100` corroboration is properly **id-bound**: a fabricated label matching a canonical
  name belonging to a DIFFERENT id is replaced by the right one; an id absent from the
  canonical read, an empty canonical read, an `entityType` mismatch and a quote-wrapped
  fabrication all correctly fall back. Seven of twelve corroboration attacks were repelled.
* `D101` is genuinely closed, and its source-level reachability assertion is real.
* `D103a`'s index-keyed numbering is genuinely idempotent against a replayed
  already-numbered label.
* The three edits this commit made to `run10`/`run11`/`run12`'s committed contracts are
  **honest**: each renames the case to state exactly which contract changed and why, and
  `run12` ADDS a new `D100.uncorroborated` CONTRACT pinning the new behaviour rather than
  merely deleting the old assertion. No test-weakening found.

**Mutation battery: 34 mutants, 18 killed, 16 SURVIVED.** Eleven of the sixteen survivors
were LIMIT mutants — over-broadenings that no committed case observes — and two were
COVERAGE mutants, meaning the guard itself can be removed with the battery still green.
This is the **eleventh** vacuous-guard recurrence, and it lands on the two claims the commit
message leads with.

### D106 (P1, REGRESSION vs `ace9b6a`) — a founder's disambiguation reply can now bind to the WRONG entity, and arm a destructive field with it

Every previous defect in the D72→D102 label sequence could only produce a DEAD END: no
option selected, flow stuck, nothing mutated. `D102`'s raw fallback is the first change that
can select a **different** option, and it does.

```js
if (matches.length > 1) {
  const exact = options.filter((o) => usable(o) && o.label.trim().length > 0
    && command.trim().toLowerCase().includes(o.label.trim().toLowerCase()));
  if (exact.length === 1) return exact[0];
}
```

Two faults compound. The filter runs over `options`, not over `matches` — so the fallback
can reach an option the normalised pass never matched. And it tests **containment**, not
equality — so a SHORT option that happens to be a raw substring of the founder's reply is
the sole raw match and wins over the longer option they actually named.

Live, `matchDisambiguationOption` in isolation:

| founder's reply | options | `fdb4564` | `ace9b6a` | `f1722f2` |
|---|---|---|---|---|
| `smiths bakery` | `Smith`, `Smith's Bakery` | MIS-BIND → `Smith` | `null` | **MIS-BIND → `Smith`** |
| `founders fund` | `Fund`, `Founders' Fund` | MIS-BIND → `Fund` | `null` | **MIS-BIND → `Fund`** |
| `obrien logistics` | `OBrien`, `O'Brien Logistics`, `Zeta` | MIS-BIND → `OBrien` | `null` | **MIS-BIND → `OBrien`** |

`D93`'s normalisation had closed this class as a side effect; `D102` reopens it. The bound
option's own `actionType` then goes through `resolveClarificationField` into
`archiveCompanyIds: [wrongId]` with **no LLM in the loop**, and
`commandContradictsActionType` cannot help — the reply carries no opposite-family verb.
Both ids are real canonical rows, so both pass the `contextPack` execution filter: the
archive really happens, to the wrong company. The founder is asked "which one?", names
Smith's Bakery, and Brain OS archives Smith.

Worse, the fix does not achieve its own stated goal. Typing the **exact** name
`"smith's bakery"` still dead-ends (both options raw-match, `exact.length === 2` → `null`),
which is the very dead end `D102` was raised to close.

Regression cases: `D106.substringApostrophe`, `D106.shortNameWins`, `D106.threeWay`,
`D106.statedCaseStillDeadEnds`, plus CONTRACT `D106.hold.ambiguousStaysNull` (which nothing
observed — mutant `G4.lim.firstNotUnique` survived the committed battery).

*A fix for this appeared mid-campaign and was verified rather than accepted.* The
implementing session wrote `qa/verification/proposed/v14_d105_matcher_fix.patch.md` into the
working tree while this campaign was running. Applied to the real source and measured, its
"most specific match wins" rule closes all three mis-bindings and resolves four cases both
`ace9b6a` and an equality-only repair dead-end — genuinely good. **But on its own it guesses
whenever a reply mentions more than one option label, and picks the longest even when the
reply explicitly excludes it** (`"archive acme, leave acme holdings alone"` → `Acme
Holdings`; `f1722f2` correctly returns null today). That is the run9/D32 "the reply's own
words say otherwise" class arriving through a new door, and its 12-case probe contains no
multi-mention case, which is why its self-validation reads clean. Adding a residual-mention
guard (after removing the winning label, no OTHER option label may remain in the reply)
gives 13/13 adversarial cases correct with all 25 suites green. Three forward-looking
CONTRACTs — `D106.hold.mentionsBothEntities`, `D106.hold.replyExcludesTheLongest`,
`D106.hold.mentionsTwoDistinctOptions` — pin those dead ends. Its `D105` number also
collides with the existing D105 (P3, bookkeeping) in entry #73.

### D107 (P2, ELEVENTH VACUOUS-GUARD RECURRENCE) — "one predicate, both arms" is only half-observed

The commit's structural headline is that `legacyProseFallback` and
`unaccountedCompletionProse` now share one `readsAsCompletion()` predicate "so a new
completion shape cannot be half-covered again". Reverting **arm 2**
(`unaccountedCompletionProse`) to its own private pattern copy — precisely the regression the
change exists to prevent, and the one the commit says its first attempt actually made —
leaves the **entire 25-suite battery green**. The claim is unobserved on the arm it was
written for. The ledger's own lesson in the same postscript ("a guard that cannot be
over-broadened without a test failing is only half-proven") is not applied to the fix that
states it. Regression cases: `D107.bothArmsShareThePredicate`,
`D107.predicateCoversAllFour`.

### D108 (P2) — the disambiguation replay site has ZERO executable coverage, and it is the only real protection on the path that produces the string

Guard 7 — the rewrite of the replay summary into a quoted CHOICE or a neutral
acknowledgement — is observed by nothing. Reverting it to the pre-fix
`` summary: `Confirmed — ${matchedOption.label}.` `` leaves the battery green, as do all
three of its LIMIT mutations.

This is not merely a missing test. That summary is emitted with
`model === 'deterministic-disambiguation'`, and **arm 1 of the drift gate explicitly
excludes every `deterministic-*` model**; a deterministic turn's `resultText` carries no
`claims` key either, so arm 2's structure precondition (`rawClaims !== null ||
deterministicPrefix || evidence`) is not met. Measured directly:

```
"Confirmed — Restored Bob Smith."   model=gpt                          corrected=true
"Confirmed — Restored Bob Smith."   model=deterministic-disambiguation corrected=false
```

The committed `D100.replay` and `D103.falseConfirmation` cases both assert `corrected` at
`model='gpt'` — a path that in production never emits that string. The belt they exercise is
described in the source as "defense-in-depth for any path that still could", but it does not
cover the deterministic path at all. So the guard the tests observe is the backup, and the
guard that actually carries the load is untested. Regression cases: `D108.replay.*` (four,
executing the source's own `summary:` expression rather than restating it — restating it was
my own first-pass error and produced a harness that passed identically with the guard
removed, the exact class being reported here).

### D109 (P3) — D78 / D86 / D91 are now carried by D100 and observed by nothing

`safeOptionLabel` has exactly one call site, and after `D100` a completion-word label is
shown verbatim only when it equals the canonical name. That makes the whole
`if (COMPLETION_WORD.test(t)) { … }` block's fabrication-suppression role redundant: the
run10/D78 Title-Case discriminator, the run11/D86 position rule and the run12/D91
determiner test can each be deleted with the battery still green. They are not dead — they
now decide whether a genuinely-named entity renders QUOTED or plain — but three
previously-closed defects were silently being carried by a fourth guard, with no test saying
so. Pinned by `D109.positionRuleStillQuotes`,
`D109.leadingParticipleWithObjectStillQuotes`, `D109.determinerSecondWordStillQuotes`,
`D109.titleCaseDiscriminatorStillApplies`, `D109.adjectivalAllowlistStaysNarrow`.

### D110 (P3) — the corroboration's equality and the collision key's precision are unobserved

Three surviving LIMIT mutants: loosening `bare(safeLabel) === bare(derivedLabel)` to
containment; corroborating against ANY option's canonical name instead of this id's; and
collapsing `labelKey` so distinct real names collide and get numbered as twins. The current
code is correct on all three — nothing watches that it stays correct. Pinned by
`D110.punctuationIsNotCollapsedByTheKey`, `D113.hold.equalityNotContainment`,
`D113.hold.idBound`.

### D111 (P3) — belt anchors and boundaries are unobserved

`CONFIRMED_COMPLETION`'s `^` anchor, `REFERENCELESS_CONFIRMATION`'s `^` anchor and
`INTERROGATIVE_LEAD`'s trailing `\b` can each be removed with no committed case failing.
run13 found the `$` anchor of the same class and called it the tenth recurrence; the other
three anchors of the same three regexes went unchecked in the same pass. Pinned by
`D111.*` (four cases).

### D112 (P2, NEW on `f1722f2`) — CONFIRMED_COMPLETION destroys truthful answers, and replaces them with a false one

```js
const CONFIRMED_COMPLETION = /^\s*confirmed\s*[—–-]\s*.*\b(archived|deleted|…)\b/i;
```

The `.*` carries no negation handling and no part-of-speech constraint, so the belt fires on
a completion word used in a **negation**, as a **noun**, or in an explicit **not-done**
statement. Measured on a 16-case corpus of truthful status answers: **9 NEW false positives
on `f1722f2`, 0 of them present on `ace9b6a`**, every one attributable to
`CONFIRMED_COMPLETION` alone.

| truthful summary | founder actually sees |
|---|---|
| `Confirmed — the company is not archived.` | `I can't actually do that from chat — nothing was changed. Please use the relevant page in the app…` |
| `Confirmed — you have 3 archived companies.` | (same refusal) |
| `Confirmed — the archived list is empty.` | (same refusal) |
| `Confirmed — I have not deleted anything.` | (same refusal) |
| `Confirmed — the approval is still pending, not approved.` | (same refusal) |

Per `CLAUDE.md` §26 this is itself a production defect: incorrect information shown to the
founder. The replacement text is not merely unhelpful, it is false — the assistant could
answer the question, and nothing was being attempted. This is the same false-positive-for-
false-negative trade the previous two campaigns each made; it is invisible on a general
corpus (1 new FP of 30) and obvious on a corpus that probes negation. Regression cases:
`D112.*` (nine DEFECT, three CONTRACT holds).

The source comment at `index.ts:5178` also claims "Genuine deterministic-* turns are
excluded below, so a legitimate imperative confirmation summary … is unaffected." Only
**arm 1** excludes deterministic models; arm 2 has no model exclusion. The comment is wrong
as written, though the specific deterministic-turn exposure is narrower than the error
implies (a deterministic `resultText` carries no `claims` key).

### D113 (P2) — the D100 corroboration is GATED ON the lexical test it was written to replace

`D100`'s comment is unambiguous: "The axis was always wrong… What actually distinguishes
them is not how they read but whether the DATABASE agrees the entity is called that." But
the database check only runs inside `!COMPLETION_WORD.test(safeLabel) || …` — the discarded
grammar test is now the **gate** on the new test. A label using completion vocabulary
outside that 24-word English list, or spelled with a confusable, is never corroborated:

| model-authored label | canonical name for that id | rendered to the founder |
|---|---|---|
| `Terminated Bob Smith` | `ACME Holdings` | `Terminated Bob Smith` |
| `Wiped All Data` | `Beta Co` | `Wiped All Data` |
| `Revoked Access` | `Gamma Co` | `Revoked Access` |
| `Сlosed Loop Systems` (Cyrillic `С`) | `ACME Holdings` | `Сlosed Loop Systems` |

These are selectable options whose ids are in `contextPack` and therefore execute. The
founder picks "Terminated Bob Smith" and archives ACME Holdings. The four-narrowing sequence
D78 → D86 → D91 → D100 is described as ended; on this evidence it is narrowed a fifth time,
not ended. Regression cases: `D113.outOfVocab*`, `D113.cyrillicConfusable`, with
`D113.hold.*` controls.

*Checked and NOT counted as a defect:* the corroboration can also be satisfied by
`runtimeLabels`, a model/request-authored map that `displayName` consults after the
canonical read — reachable, but only for a row created THIS turn from the request's own
name, and such an id is absent from `contextPack` so the mutation-field filter rejects it
anyway. A second probe that appeared to corroborate via `companyNameById` is **harness-only**:
`index.ts:3019` builds that map from `contextPack.companies`, the same array
`canonicalById` uses, so production cannot produce the divergence my harness injected.

### D114 (P2, REGRESSION vs `ace9b6a`) — FIX-3b reopened the class it replaced; "strictly better on BOTH axes" is measurably false

`FIX-3b` **replaced** run12's `FIRST_PERSON_COMPLETION` belt rather than adding to it. On a
curated 20-case corpus of natural English sentences that open with an `INTERROGATIVE_LEAD`
alternative while asserting a first-person completion:

```
fdb4564  20/20 leak to the founder
ace9b6a   0/20 leak
f1722f2  13/20 leak     — 13 REOPENED, 0 newly closed
```

Examples that `ace9b6a` caught and `f1722f2` ships verbatim: `"Did I mention I archived ACME
already?"`, `"Have I told you I restored the backup?"`, `"May I add that I renamed the
business unit?"`, `"If it helps, I already deleted the duplicates ok?"`, `"What is more, I
archived ACME this morning ok?"`.

On a mixed corpus `f1722f2` is genuinely better in aggregate (assertion leaks 22 → 17 → 3 of
25; clarification drops 3 → 6 → 5 of 27 with **zero new drops** — all five residual drops
are pre-existing at `ace9b6a`). But the commit message and `index.ts:4805` both state
"Measured 0/20 leaks and 0/27 drops — strictly better on BOTH axes than any previous build,
which neither run11 nor run12 achieved." That is a measurement on the implementing session's
own corpus presented as a general property, and it is false on the sub-class run12's belt
existed to cover. **Third consecutive campaign in which one direction of this belt was
closed by reopening the other**, which is exactly what the commit's own header warns against.

Root cause, and it is a clean one: the separating axis is neither SUBJECT (run12) nor LEAD
(run13) but **CLAUSE POSITION**. In every legitimate D98 clarification the first-person
completion sits inside a noun phrase — a reduced relative clause: "the tasks **we
completed**", "the ones **I removed**", "the company **I archived**". In every assertion it
is the main predicate. A belt built on that distinction was measured at **1/20 leaks with
all 25 committed suites green** — see the prepared fix. The naive alternative (re-adding a
blanket first-person belt) breaks 8 committed D98 cases, which is presumably why the axis
was swapped instead of combined; the D114 CONTRACT holds in the regression file exist to
stop that swap happening a fourth time.

### D115 (P3, bookkeeping) — D104's ledger corruption is recorded but still un-remediated, and two ledger claims do not match the code

`qa/KNOWN_FAILURE_MODES.md:6931` still reads ``## #72 …` section below**,`` followed by four
lines of #12's promotion note and a stray `---`, creating a duplicate `## #72` heading before
the real entry at 6939. #13 recorded this as `D104` and adopted the correct structural remedy
(promotion notes in a separate file) but **did not remove the existing corruption**, and the
`f1722f2` closure did not either. A `grep '^## #72'` still finds the garbage heading first.
That is a bookkeeping error that hides work from a reviewer, which this project treats as a
real defect, not a nit.

Two ledger/comment claims also do not describe what the code does: the "0/20 leaks and 0/27
drops / strictly better on BOTH axes" claim (see D114) and the "Genuine deterministic-* turns
are excluded below" comment (see D112).

*Verified accurate:* `qa/verification/CURRENT_CAMPAIGN.json` names the base commit
(`f1722f2…`), the required `index.ts` sha256 (`10db5838…a70d2a`), the branch, the project ref
(`pvphxgrtdfrudejjhzjk`, cross-checked against `web/CLAUDE.md:29`) and the prior campaign
archive's sha256 (`c5443920…89057f`) correctly — all four independently recomputed. The
`ace9b6a` sha256 quoted in `run13_defect_closure_contract.mjs`'s header (`021c8989…8a4b786`)
is also correct. The commit's "24 suites" count is right (25 `.mjs` files minus the shared
library).

### Not defects — checked and cleared

* **The three prior-suite contract edits are honest**, disclosed in-place, and `run12` gained
  a new CONTRACT pinning the replacement behaviour. No test was weakened to pass.
* **`D103a` numbering is genuinely idempotent** against replayed already-numbered labels, and
  distinct real names are genuinely untouched.
* **`D101` is genuinely closed** and its reachability assertion genuinely kills the mutant
  that restores the dead alternatives.
* **The three pre-existing false positives** I measured (`"Two tasks are assigned to Bob;
  both are still open."`, `"Access was requested but not granted…"`, `"The task titled
  'Verify the contract was approved by legal' is still open."`) fire identically on
  `ace9b6a` via `LEGACY_PAST_COMPLETION` / `EXECUTION_IN_PROGRESS`. Real, ugly, and **not**
  attributable to this commit. Logged here so the next campaign does not re-discover them as
  new.
* **A deterministic turn carrying real execution evidence** corrects identically on `ace9b6a`
  and `f1722f2`; the difference I first suspected was an artifact of my synthetic evidence
  shape, and is reported as such rather than as a finding.

### Verdict

**DO NOT DEPLOY `f1722f2`.** One P1 (`D106`: a disambiguation reply binding to the wrong
entity and arming a destructive field with it — a strictly new capability for harm, since
every prior defect in this sequence could only dead-end), four P2s (`D107`, `D108`, `D112`,
`D113`, `D114`), and the eleventh vacuous-guard recurrence landing on the two claims the
commit leads with. The run13 closure is real and measurable progress on the shapes it
targeted — it is not safe to ship as written.
