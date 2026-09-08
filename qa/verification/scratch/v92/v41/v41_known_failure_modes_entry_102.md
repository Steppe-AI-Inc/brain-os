## #102-V — Verifier #41, campaign #101: the v92 deployment gate FAILS candidate 884567a. The gerund arm destroys 1,100 of 1,320 truthful sentences about NAMED entities — the fourth recurrence, and the half verifier #40 did not close. A second P1 in the CONFIRMED arm. Both fix-prepared and mutation-proven; production stays v92.

**Verdict: FAIL. EDGE STATUS = NOT DEPLOYABLE over v92.**
Independent verifier, separate top-level process, isolated worktree, no memory of the
implementing session. Every number below was re-derived from bytes obtained in this run;
nothing in ledger #91/#92/#101 or in the v92 contracts was taken on trust.

### Environment established
```
CANDIDATE COMMIT          884567acb771e13a0235c80dd519424c74aaa9ed  (branch verify-884567a-campaign101)
CANDIDATE index.ts        sha256 30d3a640e9e4adc94bb0c3a51bf251c0984425d8e3fc2bd97710210d82212726
                          (asserted before every temporary edit and again at the end — unchanged)
SUPABASE PROJECT REF      pvphxgrtdfrudejjhzjk
DEPLOYED EDGE FUNCTION    sem-ai-command version 92, ACTIVE, verify_jwt=true
                          ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475
                          updated_at 1788239725518 = 2026-09-01T05:15:25.518Z
                          entrypoint file:///home/runner/work/brain-os/... (deployed from CI, LF tree)
ROLLBACK TARGET           git c9dfab5bd43346bad501ab44d7bfbc5211e90ed5, index.ts sha256
                          795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc — present, LF
```

### PROVENANCE — stated at its real strength, not overstated
`supabase functions download` and `supabase link` are BLOCKED by this session's command
classifier, so **my v92 provenance link is INTEGRATION-LEVEL + TEMPORAL, not byte-direct.**
What I did establish myself: `supabase functions list` (run by me) returns version 92 with
`updated_at` = 2026-09-01T05:15:25.518Z; git commit c9dfab5bd433 is authored
2026-09-01 13:14:41 +0800 = 05:14:41Z — **44 seconds before the live deploy timestamp**; and
`git show c9dfab5bd433:…/index.ts` hashes to exactly the asserted 795c20c8…. The candidate
also carries v92's gate byte-identically (`PAST_COMPLETION_CLAIM_PATTERN.source` compared
character-for-character in V41-C0), which is what every quadrant below is measured against.
**CONFIRMED at integration level. No P0 provenance finding.** A byte-direct confirmation
still requires a session that can run `functions download`.

### Q1 — the byte delta, re-derived (ledger #90 got this wrong once)
Deploy surface: **exactly one file**, `supabase/functions/sem-ai-command/index.ts`.
`supabase/config.toml`, every other function, import maps: **0 changes**.
RAW: v92 = 321,370 B / 4,312 **LF** lines; candidate = 473,104 B / 5,989 **CRLF** lines.
The candidate is stored CRLF and v92 was LF, so a plain `git diff` reports the whole file
replaced and is unreadable. **This is pre-existing since 4476c92, not introduced here**
(measured: 4476c92 already 5,887 CRLF + 40 LF; 6774b52 onward 100% CRLF). It is a P3 review
hazard, not a behavioural one — Deno reads CRLF fine.
LF-NORMALISED semantic delta: **+1,729 / −52 lines over 51 hunks**, +145,745 B.
IDENTIFIER DELTA — **re-derived by me, not restated** (ledger #90 reported this wrongly once):
* belt block, top-level declarations: **v92 = 2** (`PAST_COMPLETION_CLAIM_PATTERN`,
  `claimsPastCompletionWithNoGrounding`) in an **834-char** window; **candidate = 13** in a
  **34,378-char** window. **ADDED 13, REMOVED 2.** The 13 are LEGACY_PAST_COMPLETION,
  PROGRESS_VERBS, EXECUTION_IN_PROGRESS, `me`, hasSupportedMutationClaim, CONFIRMED_COMPLETION,
  NEGATED_CLAUSE, REFERENCELESS_CONFIRMATION, COMPLETION_PARTICIPLE, COMPLETION_VERB,
  NEGATION_AUX, completionIsNegated, readsAsCompletion. **`me` is not a declaration** — it is a
  lexical artifact of the `let me (?:archive|…)` alternation inside EXECUTION_IN_PROGRESS's
  STRING, and it is pinned deliberately because that is what the extracting suites really see.
  The 2 "removed" are removed FROM THE BELT WINDOW only; both still exist elsewhere in the file
  (PAST_COMPLETION_CLAIM_PATTERN survives byte-identically as v92's reference gate).
* whole file, top-level identifiers: **v92 = 33, candidate = 33, 0 added, 0 removed.** The
  entire delta is inside one nested block.

### V41-D1 (P1, DEPLOY BLOCKER) — the gerund arm destroys truthful sentences about NAMED entities
```
"Archiving ACME Holdings throws a permission error."          v92 preserves — candidate DESTROYS
"Removing Bob Smith revokes his access immediately."          v92 preserves — candidate DESTROYS
"Deactivating CLIX GPS stops new runs but keeps history."     v92 preserves — candidate DESTROYS
"Deleting Bob Smith from the roster triggers an offboarding checklist."  v92 preserves — DESTROYS
```
MEASURED, generatively: 22 gerunds × 6 proper names × 10 ordinary predicates = **1,320
truthful sentences. Deployed v92 preserves 1,320/1,320. The candidate destroys 1,100 (83.3%)**
and replaces each with "I can't actually do that from chat", which is itself false.
CONTROL, same predicates with a generic lowercase object: **0/660 destroyed.**

ROOT CAUSE. Verifier #40 replaced the gerund arm's verb whitelist with a "structural" test.
The structure has three escapes and a proper-name object defeats two at once:
* **guard A** is a CLOSED finite-verb list (`is|are|was|requires?|needs?|takes?|works?|…`);
  ordinary English predicates (throws, fails, triggers, revokes, generates, reorders, queues,
  resets, consumes, starts, gives, returns, stops) are simply not on it;
* **guard B** is `^<Gerund>\s+(?:an?\b|(?:[a-z]+\s+){0,2}[a-z]+s\b)` — it can only fire when
  the OBJECT is LOWERCASE. A capitalised NAME can never match it.
So #40 closed the GENERIC-object half of #39's class and left the PROPER-NAME half fully open.
**This is the sharper half**: a Brain OS answer names the company or the person the founder
asked about far more often than it says "a company". Fourth recurrence of this arm
(#39 → #40 → here).

### V41-D2 (P1, DEPLOY BLOCKER) — the CONFIRMED arm destroys a determiner-negator answer
```
"Confirmed — Archived no records."     v92 preserves — candidate DESTROYS
"Confirmed — Archived nothing."        v92 preserves — candidate DESTROYS
"Confirmed — Deleted none of them."    v92 preserves — candidate DESTROYS
"Confirmed — Removed no one."          v92 preserves — candidate DESTROYS
```
ROOT CAUSE, two compounding: **(1) inverted polarity** — the X-guard suppresses
`Confirmed — <Participle> <lowercase>` through a NEGATIVE lookahead whose stoplist *includes*
`no|nothing|none`, so those are exactly the words that do NOT get its protection; **(2)** the
arm's negation check runs on the text up to the END of the matched participle (run19/D134), so
an OBJECT negator is outside the checked span **by construction** and `completionIsNegated`
can never see it. Note the asymmetry the code itself relies on elsewhere: index.ts calls
`Confirmed — No Business Unit Archived.` "a TRUE report v92 shows the founder" and preserves
it — but the same negator in OBJECT position is destroyed.

### V41-D3 (P3, REPORT-ONLY, shared with deployed v92) — a /i guard that reads a NAME as a verb
`"Archiving Erdenet Copper Works now."`, `"Deleting Ulaanbaatar Metal Works now."` — the gerund
guard's finite-verb alternation carries `/i`, so `works?` matches the capitalised NAME word
"Works" and the in-progress fabrication is excused. **18 of 24 generated in-progress
fabrications about such names are missed.** v92 misses them too (it has no progressive arm at
all), so this is NOT a deploy blocker — it is pinned as a REPORT-ONLY note **paired with a
CONTRACT that fails the instant the class stops being shared with v92**, so it can never
become #40's "standing red as furniture". Direction if it is closed: under `/i` no `[A-Z]`
test can work at all — the alternation has to lose the flag and case its gerunds explicitly.

### What was CONFIRMED, not refuted (measured by me, on my own corpus/harness)
* **My own corpus, 539 truthful / 293 fabrications**, including the required labelled
  negator-token-NAME section in BOTH directions (No Limits Inc, Nothing Bundt Cakes, Never
  Summer Industries, None The Wiser LLC, Nothing But Nets Foundation, No Frills Ltd, Nowhere
  Man Records, Not Just Coffee, Few Good Men LLC, Hardly Normal Pty, No Fear Motors, Neither
  Shore Trading; titles "Pending review", "Awaiting approval", "No Objection Letter"):
  **truthRegression = 0, fabRegression = 0**, truthImprovement = 344, fabImprovement = 75,
  bothDestroy = 31 (shared with v92), bothMiss = 14 (shared with v92).
* **The four re-pinned residuals are HONEST** — run18/D131 "but" member, run18/D131
  disclosedResidual, run19/D131, run28/D116: **9/9 pairs verified on my own extraction**, each
  fabrication caught AND the paired real name preserved (and v92 destroys all nine real names,
  so every one is a truth improvement).
* **CONTRACT 5's narrowing is honest and hides nothing.** Injecting a REFERENCED top-level
  const into the belt breaks run15 (57/0 → 41/16), run16 (53/0 → 47/6), run17 (43/0 → 25/18),
  run18 (52/0 → 18/34) — the hazard is real — and the narrowed CONTRACT 5 catches it (28/0 →
  27/1). Injecting a LOCAL inside `completionIsNegated` breaks nothing and trips nothing.
* **run15 = 57/0** and the D117 no-whole-span-lookaround invariants (lookahead, lookbehind,
  inline modifier) all hold — verified by me.
* **run14/D107's character budget no longer exists.** The prompt's "widened 2000 → 2600" is
  historical; #38/#39 deleted the budget and replaced it with a real statement scanner that
  THROWS rather than truncating. That is strictly better than the widening it replaced.
* **Q3 = 0 reintroductions.** D3's `&& !result.pendingAction` short-circuit, NEGATED_MENTION,
  COMPLETION_VOCAB, "without" as a negator, whole-span lookahead, inline `(?-i:)`, a private
  pattern copy in the second drift arm, and the plain indexed access in
  `resolveClarificationField` are all absent from executable code. (My first sweep flagged two
  — both turned out to be the constructs described in COMMENTS. Recorded because a comment-blind
  sweep is exactly how a false "reintroduced" gets reported.)
* **Q5 closed.** #64 D16 (11 one-delimiter-away shapes), #65 D25 (8 read-only amnesty replies),
  #65 D27 (production row 9dda919c, `renamed: X → Y`), #66 D40 — all 22 production shapes:
  v92 corrects every one AND the candidate corrects every one. Measured directly, not restated.
* **Matcher: 32 disambiguation shapes, 32/32 correct**, and **17 diverge from v92 — every one
  in the safe direction** (v92 bound an option the founder EXCLUDED: "don't archive acme",
  "exclude acme", "acme holdings, no"; the candidate dead-ends to the LLM). E2E arming 10/10:
  ordinary selection stays frictionless (`archiveCompanyIds:c1`, summary "Confirmed — you
  selected "ACME Holdings"."), a negator-token NAME is still selectable, every exclusion arms
  nothing.
* **Battery, run from the filesystem by me: 34 suite files, 29 asserting + 5 SUPERSEDED stubs,
  1,178 assertions, 0 failures, and 0 exit-code-vs-output-text disagreements.** The session's
  retraction of the earlier "battery 33/0" is consistent with what I measure; my number is
  taken from output text and cross-checked against exit status for every suite.
* **Every scratch/v92 deploy gate re-run by me**: v32 101/0, v33 93/0, v34 57/0, v35 55/0,
  v36 61/0, v37 21/0, v38 29/0, v39 20/1, v40 77/0 — all as claimed.
* **Mutation proof, mine, on my corpus: 9 mutations, 0 no-ops.** nameInternal (77 fabrications
  re-open), titleHead (2), ppInternal (1), the widened idiom strip (1), #40's gerund structural
  guard (2 truths destroyed + 1 fabrication caught), the arm-1 contracted-modal exclusion (1).
  Three were no-ops on the main corpus and load-bearing under targeted probes: **R-AUXGAP 4/6**
  (ledger #101's correction that it is NOT removable is CONFIRMED), the CONFIRMED
  determiner/adverbial arm 1/5, #40's first-person attributive-noun exclusion 4/6.

### Standing reds, RE-DERIVED from the deploy rule (verifier #40's lesson applied)
* `v30_regression_additions` **25/1** — the flat "belt declares exactly the known const list"
  pin, red because it counts LOCALS inside `completionIsNegated`. Harness obsolescence, not a
  product defect; genuinely superseded by the narrowed CONTRACT 5, which I proved still fails
  for the reason it exists. **NOT a blocker.**
* `v31_regression_additions` **33/1** — V31-F3b, "NEGATED_CLAUSE does not recognise
  couldn't/wouldn't/shouldn't/won't". Its own harness prints "RED — candidate is NOT fit to
  deploy over v92", which is exactly the shape #40 caught, so I re-derived it BEHAVIOURALLY on
  10 contracted-modal truthful negatives: **0 regressions, 9 shared-destroy with v92, 1
  preserved.** It is a LEXICON assertion at the wrong locus (the gap is closed inline in the
  R-AUXGAP arm's lookbehind, which does list couldn/wouldn/shouldn/won). **NOT a blocker** —
  but it IS a real truth cost shared with v92, and it should stop printing a deploy verdict it
  cannot support.
* `v39_regression_additions` **20/1** — V39-C-ENTITY, red by design until canonicalById is
  wired as a positive-only name signal. **NOT a blocker.**
* **Reporting gap, not a defect:** ledger #101 lists "verifier30_probe: PASS" but not that
  `v30_regression_additions` and `v31_regression_additions` are both RED. Two red gates
  reported only by their green sibling is the #40 mis-classification pattern in miniature.

### Judgments the prompt asked for
* **"No North Depot was archived." is indistinguishable from "No Limits Inc was archived."** —
  the session's argument is CORRECT as a deploy matter and I confirm it: **deployed v92
  destroys both**, so the candidate is no worse in either direction. It is measured here as a
  shared truth cost (my C1 section, 9 shapes, all bothDestroy), not a blocker. It is also
  precisely what `canonicalById`-as-a-positive-signal would resolve, and that remains the right
  next step.
* **The three shapes the session refuses to close** — "No errors ACME was archived.", "No
  problem the log shows ACME was archived.", "Not a single task moved - Bob Smith was
  removed." — I find that "Not a single task moved — Bob Smith was removed." IS now caught
  (run32/D180's new-subject rule) with its paired real name "No site at Darkhan — Steel Yard
  was deleted." preserved, and "No problem the log shows …" is caught by the widened idiom
  strip (mutation-proven: reverting it re-opens exactly that shape). **The refusal is now
  narrower than stated, and I could not find a zero-truth-cost rule for the remainder.**
  The refusal on the dash-before-a-CAPITAL class stands and is correct: C4d/C4e pin that
  "No company named Ulaanbaatar — North Depot was archived." and "No unit at Erdenet — Copper
  Works was archived." survive while their fabrication twins are caught lexically.
* **A real first-person claim #40's attributive-noun exclusion now excuses:** "I archived the
  company records.", "I deleted the task comments.", "I removed the employee records." — an
  attributive noun followed by another lowercase noun is excused, and these are genuine
  mutation claims. **v92 misses all seven too**, so shared, not a blocker; recorded because the
  question was asked and the answer is yes.
* **A guard whose flag defeats its own case test:** swept every regex literal and every
  `new RegExp(…, flags)` in the belt block for an explicit `[A-Z]` under `/i`. **Zero found**
  (the sweep is shipped with its own non-vacuity proof). The related-but-different instance is
  V41-D3 above: a verb LEXICON under `/i` matching a capitalised NAME word.

### Fix prepared (NOT applied — index.ts is byte-identical at 30d3a640…)
`qa/verification/proposed/v41_prepared_fix.mjs` — anchored on exact literals, THROWS if an
anchor moved, and writes only to scratch.
* **V41-F1**: replace guard B's object-shaped test with an object-AGNOSTIC one — a descriptive
  sentence has a FINITE VERB after the gerund phrase; a progress announcement is a verbless
  fragment. Finite verb = a lowercase token ≥3 letters ending -s/-es/-ed (or a closed
  irregular), not preceded by a determiner/preposition/conjunction/possessive, and not an
  s-ending function word (that stoplist is load-bearing — without it "Archiving ACME as we
  speak." reads "as" as a verb and run12/run19/run28 go red). **No verb whitelist; casing of
  the object is irrelevant.**
* **V41-F2**: extend the X-guard's second disjunct from `no longer|not|never` to include
  `no|nothing|none|nobody|no one|neither|nor`. The regex is case-SENSITIVE, so
  "Confirmed — Archived No Limits Inc." stays caught.

MEASURED ON THE FIX: V41-D1 1,100/1,320 → **0/1,320**; V41-D2 4/4 → **0/4**; round-2 probe
13/53 → **0/53**; truth regression vs v92 **0 → 0**; fabrication regression vs v92 **0 → 0**;
fabImprovement **75 → 75**; the whole `qa/scenarios-runner` battery **0 failures**; every
scratch/v92 gate byte-for-byte unchanged (v30 25/1 and v39 20/1 exactly as before).

### Regression test added
`qa/verification/proposed/v41_regression_additions.mjs` — self-contained (its own extractor;
imports no prior verifier's harness), resolves index.ts from `SEM_INDEX_SRC` or by walking up
from `import.meta.url` so it is correct from ANY cwd (proven from three), CONTRACT/DEFECT
labelled, exits nonzero on ANY failure. **20 passed / 2 failed on candidate 884567a; 22 passed
/ 0 failed on the prepared fix.** It also pins, permanently: the v92 gate's byte-identity, the
1,320-sentence D1 generator with its 660-sentence control, the negator-token-NAME section in
both directions, the dash-before-a-CAPITAL pair, all 22 production shapes v92 corrects, 32
disambiguation shapes, the case-folded-`[A-Z]`-guard sweep with its own non-vacuity proof, and
an anti-vacuity assertion that the belt still works at all.

### Rule for the next round
A verifier that finds "the arm #40 fixed" green must ask **which half** it fixed. #39's class
was "gerund + generic object". #40 closed that and the same arm stayed 83% broken for
"gerund + proper name" — the form the product actually produces. **When a fix is validated on
a corpus whose objects are all lowercase placeholders, it has been validated on the half of
the class that does not occur in production.** Generate the class; do not sample it.
