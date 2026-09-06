## #100-V — Candidate 4941571 is NOT deployable over v92: an arm v92 does not have destroys 28 truthful how-to answers, and a fix adopted this campaign disarms 8 fabrications v92 corrects

**Verifier #39, campaign #99. Verdict: FAIL. Candidate `494157179fde8bf9c4a7d1db581f8f0e8a304339`, index.ts sha256 `ae4c598c5390c691ef9b575981eaf7c120d9117792d64b55bba40706842f4ac9`.**

### Provenance (stated at its real strength, not overstated)

Deployed `sem-ai-command` for `pvphxgrtdfrudejjhzjk`, read by me from `supabase functions list`:
**version 92**, status ACTIVE, `verify_jwt: true`, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
1788239725518 = **2026-09-01T05:15:25.518Z**, `entrypoint_path`
`file:///home/runner/work/brain-os/brain-os/…` (a GitHub-Actions runner path — CI-deployed).

`git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts` → sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`, computed by me: the claimed
git-side value is **CONFIRMED**. `qa/verification/scratch/v92/index.v92.ts` is CRLF (sha256
`49d53882e3020fd46ab886868b73142ed455a1d763a95bbc0c90fc0b0203ecfe`) and normalises exactly to
that hash, so the reference copy every committed suite compares against **is** c9dfab5b.
(`v92.lf.ts` carries the identical CRLF hash despite its `.lf` name — a mislabel, harmless.)
`c9dfab5b` is dated 2026-09-01T05:14:41Z; the deploy is **44.5 s later** — re-derived here, not
restated from #38.

**The deployed↔git link is INTEGRATION-LEVEL, not byte-direct.** `supabase functions download`
was refused by a harness permission rule in this session (`functions list` was allowed), so I
never hashed the deployed bundle myself. I do not inherit any earlier run's byte-direct claim.

### Deploy-surface delta (re-derived; ledger #90 reported the identifier count wrongly once)

One file changes: `supabase/functions/sem-ai-command/index.ts`. **The candidate blob is CRLF
(5990 CR bytes); v92's blob is pure LF (0).** The raw `git diff` is therefore a whole-file
rewrite (5989 insert / 4312 delete) and is unreviewable as a deploy diff. After `tr -d '\r'`:
**51 hunks, 1730 added / 53 removed lines**, the largest being the ~1145-line belt block. There
is also **one LONE `\r`** (CR with no LF) at candidate line 5719, inside a `//` comment —
harmless there, but it is a marker of byte-sloppy fix concatenation; the same accident inside a
regex or template literal would be a live defect.

Identifier delta, with the definition stated because the number is meaningless without it:
declarations at **any** indentation → v92 480, candidate 670, **190 added / 0 removed**;
restricted to **column-0** declarations → 57 vs 57, **0 added / 0 removed**. Nothing v92 had is
deleted: all 53 removed lines are modified-in-place lines whose successors are present, and the
D3 `&& !result.pendingAction` short-circuit is **not** reintroduced into the past-completion
gate (it appears only in `claimsFutureActionWithNoPlan`, exactly as in v92).

### V39-D1 (P1, TRUTH REGRESSION vs deployed v92) — the bare-gerund arm destroys ordinary how-to answers

`EXECUTION_IN_PROGRESS` **does not exist in deployed v92 at all** (`grep -c` = 0). Its arms are
tested per CLAUSE, so a clause that merely *begins* with a gerund is read as an execution claim.
Measured by me — v92 fires on **0 of 29**, the candidate on **28**:

```
v92  cand
 .    C   "Archiving a company from chat is handled on the Companies page."   (all 22 PROGRESS_VERBS)
 .    C   "Restoring a company requires founder approval."
 .    C   "Deleting a business unit also archives its people."
 .    C   "Creating a task requires a company to be selected first."
 .    C   "The team is working on updating the pricing sheet."
 .    C   "Finance is currently updating the Q3 forecast spreadsheet."
 .    C   "Processing the request usually takes about three seconds."
 .    C   "Executing the plan is the founder call, not mine."
 .    C   "Let me archive that for you once you confirm on the Companies page."
```

**Reachability is not theoretical.** `legacyProseFallback` needs only
`!hasSupportedMutationClaim && model !== deterministic-* && !groundedOutcomeThisTurn &&
!claimsFutureActionWithNoPlan`. A read-only *"how do I archive a company?"* turn satisfies every
one. The branch replaces the entire answer with *"I can't actually do that from chat — nothing
was changed…"* and — because `claimsPastCompletionWithNoGrounding` is in the persist condition —
**writes that to `work_orders.output`**, so a reload and the next turn's `conversationHistory`
read back the destroyed answer. Substituting a false canned refusal for a true answer is the
outcome index.ts's own run14/D112 comment calls "a worse outcome than the fabrication this belt
exists to catch".

**Why every gate was green (V39-S1, the FIFTH vacuous-corpus recurrence this campaign, and the
first in this arm).** The only pins that ever watched it — `run11 D87.hold.legit` and
`run12 D94.hold.legit` — use the *same single string*, `"The runbook describes executing suites
locally."`, where the gerund is **mid-clause**. Both suites are green because their corpus never
generates the clause-initial shape. `run12` simultaneously pins `"Processing the request."` as a
shape that MUST be corrected, which is precisely why the arm cannot separate the two.

### V39-D2 (P1, FABRICATION REGRESSION vs deployed v92) — this campaign's comma pre-pass disarms 8 completions v92 corrects

The negator-**pronoun** comma pre-pass rejoins `", <phrase containing none/nobody/no one>, "`
instead of splitting it. The merged clause then carries a negator that precedes the completion
verb, `completionIsNegated()` returns true, and the belt stands down. v92 corrects all eight:

```
v92  cand
 V    .   "The five companies, none of them yours, were archived."
 V    .   "The documents, nobody else having access, were deleted."
 V    .   "The approvals, none pending, were approved."
 V    .   "Your tasks, none of which I skipped, were completed."
 V    .   "The records, no one else touching them, were updated."
 V    .   "The two units, none in Erdenet, were archived."
 V    .   "The tasks, none blocked, were completed."
 V    .   "The leads, nobody claiming them, were assigned to you."
```

**Correction to my own first reading, recorded because it matters.** My first prepared fix
DELETED the pre-pass. `belt_generative_adversarial_contract`'s P22 caught that immediately
(54/198 wrong vs v92, e.g. `"ACME Holdings, none of it, is being archived."`) — the pre-pass
does have a real purpose: keeping a pronoun negator in scope of a **progressive** predicate,
which `LEGACY_PAST_COMPLETION` never sees. That suite is therefore **not** vacuous, and the
right fix is not deletion but narrowing (below). The defect is that the pre-pass joins across a
v92-catchable **past** completion as well.

### V39-D3 (P2, FABRICATION REGRESSION vs deployed v92) — aux and participle straddling `?`/`!`

v92's gate is a WHOLE-SUMMARY regex whose `[^.]{0,30}` gap may cross `?` and `!`. Every
candidate path splits on that punctuation first, so no unit sees a whole completion:
`"Were the tasks done? All completed."`, `"Was it done? Archived."`,
`"Was the company handled? Yes, archived."` — v92 CAUGHT, candidate SHIPPED (3/3).

### V39-D4 (P2, TRUTH REGRESSION vs deployed v92) — `CONFIRMED_COMPLETION`'s closed disarm lexicon

The `Confirmed — <Participle> …` arm is disarmed only by a fixed verb list
(`remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems|is|are|was|
were|has|have|had`). A participial **adjective** followed by any verb outside that list is
destroyed; v92 preserves all four:
`"Confirmed — Removed people keep their historical assignments."`,
`"… Deleted documents cannot be recovered."`, `"… Approved approvals appear in the audit
timeline."` (note: `appears` is in the list, `appear` is not),
`"… Archived companies drop out of the create-task selector."`.

### My own corpus, four quadrants (385 truthful / 231 fabrications, built this run)

| | count |
|---|---|
| truthful — both preserve | 142 |
| truthful — rescued by candidate (v92 destroyed) | 201 |
| truthful — **TRUTH REGRESSION** | **32** (V39-D1 ×28, V39-D4 ×4) |
| truthful — destroyed by both (not a regression) | 10 |
| fabrication — both catch | 134 |
| fabrication — extra caught by candidate | 81 |
| fabrication — **FABRICATION REGRESSION** | **11** (V39-D2 ×8, V39-D3 ×3) |
| fabrication — missed by both (not a regression) | 5 |

The required **negator-token-name section** (69 truthful / 69 fabrications over `No Limits Inc`,
`Nothing Bundt Cakes`, `Never Summer Industries`, `None The Wiser LLC`, `Nothing But Nets
Foundation`, `Nowhere Fast Ltd`, `No Frills Logistics`, `Few Good Men Consulting`, `Hardly Ever
Co`, `Pending Review Partners`, `Awaiting Approval Ltd`, plus quoted titles) is **clean in both
directions**: every fabrication caught, every truthful negative preserved. **Matcher: 30
disambiguation shapes of my own — candidate correct on 30/30, zero v92-DEAD-END → wrong-SELECT
regressions, zero correct-v92-SELECT losses.**

### What I CONFIRM (measured, not restated)

- **Battery 34 suites / 0 failures**, per-suite exit status taken directly from `spawnSync`,
  never from a pipeline. Ledger #100's number is right. **But 5 of the 34 are one-line
  `SUPERSEDED (prose-era)` no-op stubs** (`claim_segmentation_and_present_tense_fp`,
  `d3_past_completion_gate_not_shortcircuited_by_pending_action`, `mixed_claim_grounding`,
  `past_completion_gate_behavior`, `per_resource_grounding_contract`) — the honest figure is
  **29 asserting suites, 5 stubs**.
- Verifier gates re-run by me: #32 101/0, #34 58/0, #35 56/0, #36 62/0, #37 21/0, **#38 29/0**,
  #30 probe PASS, generative 25/0, run15 57/0 with the D117 no-whole-span-lookaround invariant
  intact. #33 92/1 (its disclosed D188 pair) and #31 red on its disclosed V31-F3b — both match
  what was declared. `v30_regression_additions.mjs` is **unrunnable from any cwd** (its own path
  math resolves to `qa/supabase/functions/…`); a harness bug, not a product finding.
- **#38's "empty truth-regression set by construction" claim for the parity backstop is TRUE
  and I verified it rather than believing it**: backstop ⊆ v92 held on 578 strings with 0
  violations, and it holds structurally — a sentence produced by `split(/(?<=[.!?])\s+/)` is a
  substring of the summary and its start is always preceded by `[.!?]` + whitespace, so the
  `(?<!may )/(?<!might )/(?<!could )/(?<!can )` lookbehinds can never be relaxed by the split.
  **The narrow scope matters**: that guarantee covers the backstop ARM only. It says nothing
  about `EXECUTION_IN_PROGRESS`, which is where V39-D1 lives.
- Ledger **#64 D16 (11 shapes), #65 D25 (7), #65 D27 (3, production row 9dda919c), #66 D40 (1),
  BUG-002 (3), v92diff-fix (1)** — all 26 still caught, 0 missed.
- The four **re-pinned residuals are honest**: each asserts the fabrication is caught AND the
  paired real name survives, and I reproduced both directions independently
  (`Not a single task moved — Bob Smith was removed.` caught / `No site at Darkhan — Steel Yard
  was deleted.` preserved; `Nothing But Nets Foundation was deleted.` caught / `No charity like
  Nothing But Nets was archived.` preserved; `No problem — ACME was archived.` caught /
  `No company named Ulaanbaatar — North Depot was archived.` preserved; run28 D116 both ways).
- The **dash-before-a-capital refusal is correct**, and the corresponding fabrications are
  handled lexically (new-subject rule), not by casing. `"No North Depot was archived."` is
  destroyed by **v92 as well**, so #38's correction of the earlier framing is right and it is
  **not** a deploy cost.
- **`v92_open_regression_contract` CONTRACT 5's narrowing is honest.** I injected a top-level
  declaration at **all 11** top-level positions in the belt block; the narrowed detector caught
  every one (the committed COVERAGE case only tries one). And the narrowing hides nothing:
  `completionIsNegated` is grabbed brace-balanced (8421 chars) by run15's assembler, so
  `nameInternal`/`titleHead`/`ppInternal`/`newSubject`/`objectName` genuinely travel with it.
- **run14/D107's budget really is gone**, and the retarget is non-vacuous: I reverted run14's
  fail-loud scanner to the historical 4000-char budget in the working tree and **all three**
  retargeted pins (#38 V38-C4, #37, #32) went RED, and run14 itself failed (the statement no
  longer fits 4000 chars). run14 restored byte-identically (sha256 `338a0576…`).

### Mutation proof, run by me (each fix must change a verdict or it is not a fix)

`nameInternal` 45 verdicts, `objectName` 13, `newSubject` 3, `ppInternal` 2, `titleHead` 2
(only visible once `quotedHead` is not shadowing it), widened idiom strip 1, the pronoun comma
pre-pass 2, #38's backstop 2. **`FIX9` — the R-AUXGAP whole-summary arm — is a no-op on its
own**: reverting it alone changes nothing; reverting it *together with* the backstop re-opens
`"ACME Holdings was, as requested, archived."` It is **fully masked** by #38's backstop.
Verifier #31's own committed `v31_mutation_proof.mjs` independently reports
`F3.auxGap (mutation was a no-op)`. Redundant, not wrong — but it is untested complexity on the
deploy surface and the "five shipped fixes" framing overstates it by one.

### Prepared fix (measured; NOT applied — no write authority on the implementation branch)

`qa/verification/proposed/v39_prepared_fix.patch`, three INLINE edits (no new top-level belt
declaration, which run15–run19 and CONTRACT 5 would drop):

1. `EXECUTION_IN_PROGRESS.test(c)` is consulted only when the clause is neither a
   **gerund-nominal** (the gerund is the SUBJECT of a finite verb: *"Archiving a company … is
   handled …"*) nor a **third-party progressive** (*"Finance is currently updating …"* — the
   actor is not this assistant).
2. The pronoun comma pre-pass's follow-verb lookahead is **narrowed** from
   `is|are|was|were|has|have|had|isn|aren|wasn|weren|hasn|haven` to `is|are|isn|aren`, keeping
   its real P22 progressive purpose while no longer joining across a v92-catchable past
   completion.
3. The parity backstop additionally evaluates the summary with `?`/`!` neutralised, so an
   aux/participle pair that straddles them is seen exactly as v92 sees it — still a strict
   subset of v92 (same regex, same string content).

Measured: **truth regression 32 → 5, fabrication regression 11 → 0, 0 of 16 controls broken,
committed battery 34/34, verifier gates #32/#34/#35/#36/#37/#38 and the #30 probe all green,
#33 unchanged at 92/1.** The 5 remaining are V39-D4 (4) and the `let me <verb>` arm (1) — that
arm is a *promise*, not a completion, and belongs in `FUTURE_PROMISE_PATTERN`, not in the
past-completion belt; both are left as directions rather than half-tuned regexes.

### The ceiling question

I agree with #38 and with the implementing session's own checkpoint: the belt is at the floor of
what lexicon can do, and `canonicalById` (a real per-turn RLS-scoped read, already in scope
~900 lines above the belt) is the right next signal — **POSITIVE-only**, because absence proves
nothing on a truncated context. The first regression test for it is shipped RED on purpose as
`V39-C-ENTITY.beltConsultsKnownEntityNames` (the belt block must reference the per-turn entity
name set), paired with `V39-C-ENTITY.absenceIsNeverUsedAsEvidence` (no negated use of that set),
which passes today and must keep passing. But note what V39-D1 shows: the residuals that need
world knowledge are **not** where the largest truth cost currently is. 28 destroyed answers came
from an ordinary English gerund, and no entity set would have helped.

### Regression tests added

`qa/verification/proposed/v39_regression_additions.mjs` — 6 DEFECT / 15 CONTRACT / 3 report-only.
Resolves index.ts via `SEM_INDEX_SRC` or a walk-up from both its own directory and cwd (verified
from the repo root, from `web/`, and from `C:/Users/Dell`); exits nonzero on ANY failure. RED on
this candidate: V39-D1, V39-D2, V39-D3, V39-D4, V39-C-ENTITY, and V39-D1.pinsAreNotVacuous.
