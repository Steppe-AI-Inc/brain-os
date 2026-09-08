## #118-V — VERIFIER #51 (campaign #111): FAIL on c2a57ac5 — the pendingAction class is closed by construction, and the three vocabulary/anchor classes #50 named are still open as classes; one is a P1 truth regression on the most natural offer phrasings

**Verdict: FAIL.** Candidate `c2a57ac5886be115f7eb0ad5c2c0e497567f3344`, `supabase/functions/sem-ai-command/index.ts`
sha256 `4c52fc3e19baec60bf8ae7f68f3440e1f18ba00ed17792ea6fe2c99b1cd8fdd8` (481,633 bytes; 6,015 CRLF lines, 0 bare LF, 1 bare CR).
Asserted at start, after the production download, after every scratch mutation and at close; never edited. Preflight: EXECUTION_READY
(HEAD ok, scratch write ok, regex runner 13/0). `npx --yes deno@2 check`: Found 23 errors == baseline.

Nothing below is taken from the implementing session, its commit message, ledger #91/#92, `v92_parity_contract`,
`v92_open_regression_contract`, `v30_open_regressions_probe` or `v31_mutation_proof`. Every number was re-derived on bytes obtained in
this worktree with my own harness (`qa/verification/scratch/v51/harness.mjs`, self-checking) and my own 1,846-row corpus (899 truthful /
947 fabrications; 18 ordinary names, 20 negator-bearing names, 7 titles; no row copied from #48/#49/#50). #50's tooling was re-run only to
check the session's claims about it (item f).

### STEP 1 — production bytes: BYTE-DIRECT on the source, confirmed
`supabase functions list` (read-only): sem-ai-command **version 92**, ACTIVE, verify_jwt true, `ezbr_sha256
33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at 1788239725518`. `supabase functions download` run with
cwd = `qa/verification/scratch/v51/dl` (isolated; nothing landed on the tree — candidate sha re-asserted afterwards): `index.ts` 321,370
bytes, sha256 **`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`**, `Buffer.compare` against
`git show c9dfab5bd433:…/index.ts` → identical. **Deployed v92 == git c9dfab5bd433 on the SOURCE FILE: CONFIRMED.** Not recomputed:
the `ezbr_sha256` bundle hash (that link is the CLI's). Not a P0; nothing refutes it.

### STEP 2 — the seven deploy questions
**Q1 — bytes that differ.** Deploy surface under `supabase/functions/`: ONE file. Raw `git diff --stat` 6,015+/4,312− is the CRLF/LF
whole-file rewrite; LF-normalised: **+1,756 / −53 in 52 hunks** (`scratch/v51/v92_to_cand.lf.diff`). This round vs 2f11ee1: 5+/5−
(FUTURE guard +`is that ok|okay` / bare `ok?|okay?`; CONFIRMED arm first-person entity gate; belt guard same vocabulary; anchor
`[—–;\x2d]\s+|\s(?:and|but)\s+`; floor `slice(4000 - 64)`; both consumers `!result.pendingAction && readsAsCompletion(...)` with
the marker-list strip deleted). Every v92-inherited prose arm is byte-identical (`scratch/v51/inherited_arms.mjs`): `claimsLifecycleClaim`
+ 4 call sites, `findEntityStateClaimContradiction`, `claims{Task,Company,Person,Goal}Deleted`, `modelProposedPendingAction`,
`hasResolvedEntities`, `stateDescriptionPattern`, state/lifecycle corrections, `PAST_COMPLETION_CLAIM_PATTERN`, `proposedPlan`, the
deterministic-confirmation safety net; `LEGACY_PAST_COMPLETION == v92 PAST` byte-for-byte. Differ: `FUTURE_PROMISE_PATTERN` (`['’]?`),
`claimsFutureActionWithNoPlan` (guard), `claimsPastCompletionWithNoGrounding` (= `rewriteFromStructure || legacyProseFallback`),
`groundedOutcomeThisTurn` (+`hasConfirmedMutationEvidence`). `result.summary` overwrite sites: v92 12 / candidate 11 — the three
deletion-failure appends moved into `executionFailureNotes` → `factLines`; the candidate-only sites are the `rewriteFromStructure`
re-render and its empty-reply floor. Identifier delta of the extractor-visible belt: 13 top-level names (CONTRACT 5 list; unchanged).

**Q2 — preserves every intentional v92 behaviour? NO.** Four quadrants, my corpus, ungrounded turn, pack populated: truthful
662 both-keep / 51 both-destroy / **164 RESCUE** / **22 TRUTH REGRESSION**; fabrications 805 both-destroy / **96 GAIN** / 26 both-ship /
**20 FABRICATION REGRESSION**. Empty pack: TR 23 / FR 79 (the deltas are the disclosed pack-conditional classes: 35 negator-name +
head-noun rows, 24 more in-pack first-person rows, `Confirmed - Archived Media Group trades normally.`). Structured consumer
(`unaccountedCompletionProse`) agrees with the legacy consumer on all 1,846 rows. Labelled negator-name section (20 names × 9 T × 9 F +
7 titles × 3 × 3): **N-T 0 TR / N-F 0 FR** with the pack — both directions clean, including the brief's seven. Matcher: 60 shapes,
57 as intended (the 3 were my own wrong expectations; all three are parity with v92); the candidate differs from v92 on 22, all
legitimate (ordinals/quoted/numbered labels bind; exclusions, negations, opposite-family verbs and other targets DEAD-END where v92 binds
destructively; `smiths bakery` → Smith's Bakery where v92 binds Smith = D106).

**Q3 — reintroduces anything removed?** YES, deliberately and disclosed: the blanket `!result.pendingAction` on both belt consumers is
the D3 short-circuit ledger #62/#63 removed, restored for the belt only (#50 option 1); run8 D59 rewritten to pin it (run8 40/40). The
deletion-failure appends remain moved. Nothing else reintroduced.

**Q4 — assumptions depending on 4476c92 rather than live v92?** Reference == download, so harness lineage is fine. The environment-
dependent item — `chat_channel_state` (202609020001) — could NOT be re-probed: `supabase db query` is permission-gated in this session
(three forms tried). #50's read (applied; table exists; 0 rows) is PRIOR evidence, not re-confirmed. On deploy the candidate starts
writing that table; the durable row feeds only the INCOMING pendingAction (deterministic paths, where both builds skip every prose arm)
and `result.pendingAction` at the belt is the raw model value (V51-C5: never assigned/deleted before the consumers).

**Q5 — #64 D16, #65 D25, #65 D27 (row 9dda919c), #66 D40 still closed?** Yes, from the filesystem: `v92_parity_contract` 46/0,
`lifecycle_evidence_and_output_persistence_contract` 92/92 "0 open #67 defects", `structured_claim_laundering_contract` 29/29,
`structured_claim_verification` 42/42; `renamed: A -> B` under the cap caught (L-F 10/10).

**Q6 — rollback target?** `c9dfab5bd433` is in this repo, its index.ts hashes to the pinned `795c20c8…`, and the live download matches
it byte-for-byte. Exact and available.

**Q7 — only intended Edge changes?** One file; it is the whole 1,756-line delta since v92 plus the now-live `chat_channel_state` write.

### STEP 3 / 3b / 3d — attacks, and what they found
**(a) The reversal is SOUND under the per-class rule, and its cost is parity only.** PA-T section: 161 truthful history recounts +
question on a pendingAction turn (46 markers incl. *none*, "already", "previously", lowercase agents, `(see the audit log)`, 20 free
forms): **0 destroyed** on both consumers, both packs. Cost: 14 PA-F fabrication rows (with and without a question) now both-ship —
v92 skips FUTURE, PAST and LIFECYCLE there (LIFECYCLE via `!modelProposedPendingAction` at all four byte-identical call sites); the one
v92 arm not gated on pendingAction (`stateClaimCorrections`) is byte-identical in both builds. No class v92 corrects on such a turn is
shipped by the candidate. Mutation: reverting the term at either consumer re-destroys **155** truths (M1/M2 load-bearing). The
rewritten v49 C3 / v50 C4/C5/C11 contracts go RED on a term-dropped scratch copy (they observe the fix). `legacyPrompt` in the legacy
consumer's replacement branch is now dead code (harmless).

**(b) V50-D3 straddle — CLOSED for LEGACY shapes, OPEN for v92's unbounded arm (V51-D2, P3 FR).** 7 claim shapes × every offset
= 408 rows; every aux+participle shape is caught at every offset (M3: reverting the overlap re-ships 169). The 12 rows that ship are
`renamed: "<58+-char name>" -> …` with `renamed:` at 4000−65…−76: v92's `.+` is unbounded, the head slice lacks the arrow and the
4000−64 floor lacks `renamed:`. Closure measured: test the renamed arm on the whole summary when `length > 4000` → 0/408 ship, 0 truth
cost. Negated-tail truths past the cap are shared cost (v92 PAST destroys them too).

**(c) V50-D2 — witness rows closed, CLASS open (V51-D3, P2 FR).** ` - ` / ` and ` / ` but ` caught (C8; M4 12). ` so ` / ` then ` /
` & ` / `. Meanwhile ` / `. Also ` / clause linkers (`although|whereas|while|because|since|after`) + in-pack first-person completion
**ship: 36 of 44**; v92's FUTURE destroys the whole reply (ASCII `I will`). With a curly `I’ll` v92 also ships (parity). Truthful
out-of-pack `— and I just renamed Column B …` rows: 18/36 preserved, 12 rescued, 6 LIFECYCLE parity, **0 TR**. Closure measured:
case-tolerant lead list on the anchor → 44/44 caught, 0 truth cost, conditionals (`If/Unless/Had I archived X…`) preserved; a generic
`(?:\S+\s+){0,3}` lead is NOT safe.

**(d) V50-D4 — witness rows closed, CLASS open (V51-D1, P1 TRUTH).** "is that ok?" / bare "ok?" preserved at both sites (C9;
M5a 4, M5b witness 3/3). Sized: 6 imminent/FUTURE openers × 32 trailing questions = 192 rows → **108 truths destroyed, v92 preserves
all 108** (81 via the belt imminent arm, 27 via the curly-apostrophe FUTURE arm; 27 more are parity because v92's bare `going to`
alternative fires). Includes the most natural offer phrasings there are: `— do you want me to proceed?`, `— shall I go ahead?`,
`— shall I?`, `— should I?`, `— would you like me to?`, `— sound good?`, `— confirm?`. The founder's ruling (a conditioned offer is
not a claim) is applied by a word list, and a list is a list. Closure measured: guard stands down on `\?\s*$` / `reply yes` /
`please confirm` at BOTH sites → 192/192 preserved, **0 truths newly destroyed, 0 v92-corrected fabrications newly shipped** on 1,846
rows. This is safe by construction: v92 has no imminent arm and its FUTURE arm needs an ASCII apostrophe, so every catch on those
paths is a GAIN and every truth they destroy is a REGRESSION — standing down on a trailing question trades gains for parity, never
parity for regression. **V50-D5:** closed (C10; M6 5). New sibling **V51-D4 (P3 TRUTH):** `Confirmed — I archived nothing / none of
them / no companies / nobody` — 8/10 destroyed, v92 preserves; the CONFIRMED arm's negation slice ends at the participle so a trailing
object negator is invisible.

**(e) Instrument changes judged.** v30 gate: the injection is exactly an empty `Set` at its two builder sites (the battery's structural
default); unpatched it would `ReferenceError` (instrument fact, not a candidate fact); reads 25/1. #49/#50 harness self-checks pin
"belt does NOT run on a pendingAction turn" — honest. v49 C3 / v50 C4/C5 rewrites: RED on the term-dropped mutant, GREEN on the
candidate — non-vacuous.

**(f) Empty-pack claims CONFIRMED** on #50's own instrument re-run on these bytes: populated CLEAN (0/0); empty **B-F 39 / C-T 1 /
E-F 10** (#50 had E-F 7; the 3 extra are the first-person rows the D7 anchor now reaches — pack-conditional like the rest).

**Step 3 truth attacks (C-T, 51 rows): 0 TR with the pack** (Title-Case negator + Title-Case token, Pending/Awaiting openers that
negate, PP-internal negators, reassurance idiom + denial, R-AUXGAP with a real negator, the run31 shapes, `Confirmed - Archived Media
Group trades normally.`); 17 are shared cost (v92 PAST/LIFECYCLE destroys them too), 22 rescued. Dash-before-capital: `No unit at
Erdenet — Copper Works was archived.` preserved by both; `No company named Ulaanbaatar — North Depot was archived.` destroyed by BOTH
via LIFECYCLE (parity); the four DASH-F fabrications caught by both. The three refused shapes are CAUGHT (C-F 16/16). Mutation of the
five earlier fixes on the current bytes: nameInternal 136 changed (127 fabrications re-shipped), titleHead 2, ppInternal witness 2/4,
R-AUXGAP joiner witness 6/6, reassurance-idiom dash strip witness 1/11 (`Not to worry — I archived X.`); the idiom strip's determiner
form is a NO-OP on 11 witnesses (superseded by `newSubject`) — redundant, not harmful; recorded as coverage, not as a defect.

**Structured mode without pendingAction (the brief's "hunt where nobody has").** `structuredProseDrift` carries no
`!groundedOutcomeThisTurn` and no model gate. On ungrounded turns it is verdict-identical to the legacy consumer (1,846/1,846). On
GROUNDED turns it re-renders 52 truthful rows v92 would keep — but `hasResolvedEntities` derives from this turn's ACTUAL mutation ids
(archive/restore/create/end-employment), not from a name being mentioned, so a read-only history turn is never grounded; on genuinely
grounded turns v92 itself replaces the summary (lifecycleReports / plan / orgGraph / stateClaim) and the candidate re-renders from
evidence regardless of prose (run8/D58). Not a belt defect; sized and explained, not hidden.

### STEP 3c / 4 — counts and suite integrity, measured
Battery from the filesystem, each suite its own child (`scratch/v51/battery.mjs`): **38 suites, 36 exit-0, 2 non-zero** = the two DB
control-plane machine tests (by design). Every "no-count" suite prints a real tally (8/8, 17/17, 10/10, 92/92, 5/5, 43/0, 49/0, 74/0,
60/0, 68/0, **57/0 (run15, D117 intact)**, 53/0, 43/0, 52/0, 40/40, 29/29, 42/42, standing_reds 8 rows / 0 blockers); 5 SUPERSEDED by
declaration; run19 62/0; run28 117/0; `v92_open_regression_contract` 28/0; `v92_parity_contract` 46/0. Standing gates: **v30 25/1,
v31 32/2, v42 11/2, v47 43/9, v46 (proposed) 33/3** (growth e=2.56, bounded by the 4,000-char cap; `closed|added` withdrawn by design),
v48 58/0, v49 16/0, v50 16/0 — each re-derives as a non-blocker for the recorded reason. "Battery 33/0 via a pipeline" is moot: my
statuses are child statuses. CONTRACT 5 narrowing: it still fails for the reason it exists (a new TOP-LEVEL const → RED); a local const
inside the `.map()` callback is not flagged by CONTRACT 5 but run15 CRASHES (exit 1) on it — loud, as #47/#50 recorded. Fine.

### STEP 5 — deployability
**Not fit to deploy over v92.** The candidate is better than v92 on aggregate (164 truths rescued, 96 fabrications gained, 4 wrong-
option destructive binds removed) and worse on four named classes, and the deploy rule is per-class: one P1 truth class (V51-D1,
108/192 — the most natural offer phrasings, e.g. "shall I go ahead?"), one P2 fabrication class (V51-D3, 36/44), one deterministic P3
fabrication hole (V51-D2, 12 offsets) and one P3 truth class (V51-D4, 8/10). Each has a closure measured at **zero truth cost and zero
v92-corrected fabrications shipped** on my corpus (`scratch/v51/class_sizing*.log`) — none applied (no write authority).

**What to fix next, in order:** (1) V51-D1 — `|\?\s*$|\breply (?:yes|y|ok|okay|go)\b|\bplease confirm\b` in the guard at BOTH sites;
(2) V51-D3 — case-tolerant lead list on the first-person anchor (never a generic lead); (3) V51-D2 — whole-summary renamed-arrow test
when `length > 4000`; (4) V51-D4 — exempt the CONFIRMED first-person arm on an object negator. Then measure each on a corpus that was
NOT green before. Regression suite: `qa/verification/proposed/v51_regression_additions.mjs` — **13 passed / 4 failed** on the
candidate (D1–D4 red by design); **7/10 on 2f11ee1** (C3/C4/C7/C8/C9/C10 fail there — the suite observes this round's fixes).

**Record corrections:** v31 reads 32/2 and v42 11/2 here (the campaign file says 33/1 and 12/1); `crlf 6017/6017` → 6,015 CRLF / 0
bare LF / 1 bare CR; `open_deploy_blockers: []` is false — V51-D1 is a P1 truth class under the per-class rule.

**Coverage gaps I could not close:** no browser/AI-chat tooling in this session (UI/AI-chat truth checks BLOCKED, not skipped);
`supabase db query` permission-gated (chat_channel_state probe BLOCKED; #50's read is prior evidence); the live 30-minute durable
pendingAction bind not exercised end-to-end; the `ezbr_sha256` bundle hash not independently recomputed.

Production remains v92; rollback c9dfab5b. index.ts sha256 at close:
`4c52fc3e19baec60bf8ae7f68f3440e1f18ba00ed17792ea6fe2c99b1cd8fdd8`.
