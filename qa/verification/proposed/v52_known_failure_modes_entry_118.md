## #118-V — VERIFIER #52 (campaign #112): FAIL on 416c14c7 — the four #51 closures are closed and load-bearing, every other class is clean, and ONE new pack-populated fabrication class is open: a negator-initial known name whose pack entry extends past its capitalised run

**Verdict: FAIL.** Candidate `416c14c728293f6c64febda2725b6d330f31626e`, `supabase/functions/sem-ai-command/index.ts`
sha256 `4ee3a1f6fef2de87bb43e877d701e2245935711b0cb054683b2df89a44a21699` (482,253 bytes; 6,015 CRLF over 6,016 lines, 0 bare LF, 1 bare CR).
Asserted at start, after the production download, after every scratch mutant build and at close; never edited. Preflight: EXECUTION_READY
(HEAD ok, scratch write ok, regex runner 13/0). `npx --yes deno@2 check`: **Found 23 errors == baseline** (candidate AND the prepared closure).

Nothing below is taken from the implementing session, its commit message, ledger #91/#92/#117, `v92_parity_contract`, `v92_open_regression_contract`,
`v30_open_regressions_probe` or `v31_mutation_proof`. Every number was re-derived on bytes obtained in this worktree with my own harness
(`qa/verification/scratch/v52/harness.mjs`, self-checking: every arm of both builds must be reachable and distinguishable or it throws) and my own
**2,315-row corpus** (1,393 truthful / 922 fabrications; 20 real-looking company names incl. real Mongolian ones, 6 people, 3 task titles, 15
negator-bearing names, 6 negator-bearing titles; no row copied from #48–#51).

### STEP 1 — production bytes: BYTE-DIRECT on the source, confirmed
`supabase functions list` (read-only): sem-ai-command **version 92**, ACTIVE, verify_jwt true, `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at 1788239725518`. `supabase functions download` run with cwd = `qa/verification/scratch/v52/dl` (spawned from node; nothing landed on the
tree — candidate sha re-asserted afterwards): 321,370 bytes, sha256 **`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`** ==
`git show c9dfab5bd433:…/index.ts` (same sha, same length). **Deployed v92 == git c9dfab5bd433 on the SOURCE FILE: CONFIRMED.** Not recomputed: the
`ezbr_sha256` bundle hash (that link is the CLI's). The v92 model in my harness is built from the DOWNLOAD, not from the repo's reference copy; the
repo copy `scratch/v92/index.v92.ts` hashes identically.

### STEP 2 — the seven deploy questions
**Q1 — bytes that differ.** Deploy surface under `supabase/functions/`: ONE file. Raw `git diff --stat` 6,015+/4,312− is the CRLF/LF whole-file
rewrite; LF-normalised **+1,756 / −53 in 52 hunks** (`scratch/v52/v92_to_cand.lf.diff`). This round vs c2a57ac: **3 insertions / 3 deletions**, all
inside existing statements: (1) `|\?\s*$|\breply (?:yes|y|ok|okay|go)\b|\bplease confirm\b` appended to the conditioned-offer guard at BOTH consumers
(FUTURE arm :4697, belt imminent arm :5701); (2) the first-person anchor's boundary `\s(?:and|but)\s+` → `\s(?:and|but|so|then|&|because|although|whereas|while|since|after),?\s+`
and lead `(?:and |but |so |then )?` → `(?:and |but |so |then |[Mm]eanwhile,? |[Aa]lso,? )?`; (3) past the cap `|| /\brenamed:\s*.+(→|->)/i.test(String(s))` on the
WHOLE summary; (4) `&& !/^\s*[Cc]onfirmed\s*[—–-]\s*(?:I|We|i|we)\s+…\s+(?:nothing|none|no|nobody|no one|neither|not)\b/i.test(String(s))` on the CONFIRMED
first-person arm. Identifier delta of the extractor-visible belt: 13 top-level declarations (CONTRACT 5 list), **unchanged** — zero new declarations.
Every v92-inherited prose arm is byte-identical (my C1): `claimsLifecycleClaim` + 4 call sites, `findEntityStateClaimContradiction`,
`claims{Task,Company,Person,Goal}Deleted`, `modelProposedPendingAction`, `stateDescriptionPattern`, `PAST_COMPLETION_CLAIM_PATTERN`. `result.summary`
overwrite sites: v92 12 / candidate 11 (the three deletion-failure appends moved into `executionFailureNotes` → `factLines`; candidate-only sites are the
`rewriteFromStructure` re-render + its empty-reply floor). Prose-alone overwrite paths on an ungrounded turn: I enumerated all 12 v92 sites — the
three-arm instrument (LIFECYCLE → FUTURE → PAST) is complete EXCEPT `stateClaimCorrections` (prose + pack + canonical contradiction), which is
byte-identical in both builds and therefore parity by construction; recorded as the instrument's one known omission, not a fourth regression path.

**Q2 — preserves every intentional v92 behaviour? NO — one class.** Four quadrants, my corpus, ungrounded LLM turn, **pack populated**:
truthful **941 both-keep / 144 both-destroy / 308 RESCUE / 0 TRUTH REGRESSION**; fabrications **512 both-destroy / 348 GAIN / 60 both-ship /
2 FABRICATION REGRESSION** (`Not Invented Here retrospective was archived.`, `Never Again incident report was archived.` — both with the title in the
pack; v92 PAST corrects both). Structured consumer (`unaccountedCompletionProse`): identical table on all 2,315 rows. Empty pack: TR 1 (`Confirmed -
Archived Media Group trades normally.` — the disclosed C-T 1) / FR 91 (LINK-F 76 in-pack first-person; N-F 15 negator-name + head noun/titles) — the
disclosed pack-conditional classes; **no other section moved** (OFFER-T 444, COND-T 80, S3-T 152, T-PLAIN 464, CAP, DASH, PA identical in both packs).
Labelled negator-name section: 15 names × 10 T + 9 F, 6 titles × 3 T + 3 F → **N-T 0 TR; N-F 2 FR** (the two titles above). Matcher: 30 shapes, 25 as
I intended, 17 parity, 13 deltas — every delta is a legitimate bind v92 lacked (ordinals, `#N`, longer exact label) or a DEAD-END where v92 bound
(negated name, opposite-family verb, assertion-shaped reply, ordinal+name); **0 destructive wrong binds**.

**Q3 — reintroduces anything removed?** Only the disclosed one: `!result.pendingAction` on both belt consumers (D3 short-circuit, belt-only, #50 option 1) —
v92's own PAST arm carries the same term, so parity (PA-T 12/12 kept, PA-F 6 both-ship). Nothing else.

**Q4 — assumptions depending on 4476c92 rather than live v92?** Reference == download, so no. Environment item: `chat_channel_state` (202609020001) read
at :2280 and written at :5991/:5994, both inside try/catch (feature-gated). `supabase db query` is permission-gated in this session — **BLOCKED**;
#50's read (applied, 0 rows) is prior evidence, not re-confirmed.

**Q5 — #64 D16, #65 D25, #65 D27 (row 9dda919c), #66 D40 still closed? YES, re-derived** (`scratch/v52/probe_q5.mjs`): all 11 D16 one-delimiter-away shapes
caught by the legacy consumer AND by the structured consumer (= `claims: []`, D40); the 4 D25 replies caught with no command-derived gate present
(`founderRequestedMutation|READ_ONLY_REQUEST_PATTERN|MUTATION_REQUEST_PATTERN` absent from the candidate); 3 renamed-arrow reports caught (D27). 0 shipped.
Battery agrees: `v92_parity_contract` 46/0, `lifecycle_evidence_and_output_persistence_contract` 92/92, `structured_claim_laundering_contract` 29/29,
`structured_claim_verification` 42/42.

**Q6 — rollback target?** `c9dfab5bd433` is in this repo, its index.ts hashes to `795c20c8…`, and the live download matches it byte-for-byte. Exact and available.

**Q7 — only intended Edge changes?** One file. It is the whole 1,756-line delta since v92 (structured-claim architecture, evidence recording,
continuity/turn numbering, matcher rewrite, `chat_channel_state` read/write) plus this round's 3 lines. No other function, no migration, no web change.

### STEP 3 / 3b / 3d — attacks, and what they found
**(a) `?\s*$` stand-down.** Guarded arms only: `I archived X. Anything else?`, `X was archived. Anything else?`, `X has been archived. Shall I also archive
its tasks?`, `Confirmed — Archived X. Next?` all **caught** (Q-F 72/100 caught; my C3). Cost: **28 rows ship** — `I’m archiving X now. Anything else?`,
`Archiving X now — anything else?`, `I’ll archive X right away. Anything else?` — an UNCONDITIONED imminent/future claim followed by an unrelated closing
question. v92 ships all 28 too (no imminent arm; curly apostrophe), so **parity, not a regression** — but c2a57ac caught them, and structurally this is
the D117 class (a token in a LATER sentence disarms the belt for the claim beside it), confined to arms whose catches are pure gains. Recorded as
**V52-O1 (parity residual)**; a sentence-scoped variant destroys `Let me archive X. Sound good?` (v92 preserves), so the only zero-cost tightening is a
closer list — a list is a list; not pursued here.
**(b) Linker set.** LINK-F 152/152 caught with the pack (76 GAIN, 76 both-destroy); conditionals COND-T **0 TR** (45 both-keep, 29 rescued, 6 shared LIFECYCLE cost).
**(c) Arrow past the cap.** CAP-F 22/22 caught at offsets 60..80 and every straddle; CAP-T truthful `renamed: A -> B` prose past 4,000 is destroyed by
BOTH (v92's `.+` is unbounded) — shared cost, 0 TR.
**(d) CONFIRMED object negator.** CONF-T **0 TR** (38 both-keep incl. `Confirmed — No Business Unit Archived.`, `Confirmed - Archived Media Group trades
normally.` with the pack). The fabrication direction `Confirmed — I archived no companies except X` / `nothing but X` / `none of the others, only X` / `not one
but two: X and Y`: **20 both-ship — parity** (v92 has no CONFIRMED arm and no aux+participle here). Recorded, not a regression.
**(e) Empty pack.** Confirmed above: only the disclosed pack-conditional sections move.
**Step 3 truth attacks (S3-T 152 rows): 0 TR** — Title-Case negator + Title-Case token, headline casing, Pending/Awaiting openers that negate, PP-internal
negators followed by a real negation, reassurance idiom + denial, R-AUXGAP with a real negator, evidential after a linker, `I archived no companies.`:
23 both-keep, 23 shared cost, **106 rescued**. `No North Depot was archived.` is destroyed by BOTH (v92 PAST) — the session's disclosure is a shared cost,
not a regression; judged: correct as stated. **Dash-before-capital:** `No unit at Erdenet — Copper Works was archived.` preserved (rescued);
`No company named Ulaanbaatar — North Depot was archived.` destroyed by BOTH via LIFECYCLE (parity); DASH-F 4/4 caught. **The three refused shapes are
CAUGHT lexically** (S3-F 13/13; my C10) — the refusal to add a casing rule stands and costs nothing.
**Mutation, my corpus (`scratch/v52/mutation.log`):** revert D1 → **TR 264** (OFFER-T); revert D3 → **FR 46**; revert D2 → **FR 8**; revert D4 → **TR 22**;
disable entity signal → TR 1 / FR 91 (299 verdicts change); revert nameInternal → 8 S3-T rows flip (shared-cost rows become rescues); revert titleHead →
FR 3; revert idiom strip → FR 3; ppInternal and R-AUXGAP joiner were NO-OP on the 2,315-row corpus, so I added witnesses (`scratch/v52/witness.mjs`):
ppInternal flips 2/6 (`The record with no owner was deleted.`, `The task with nothing attached was completed.`), joiner flips 3/6 (`Khan Bank was, with no
errors, archived.` etc.). **All nine fixes load-bearing.**

### THE OPEN CLASS — V52-D1 (P2 FABRICATION REGRESSION, PACK POPULATED)
`completionIsNegated`'s positive entity signal recognises `negator + CAPITALISED run` (or `negator + lowercase run up to an auxiliary`) against
`knownEntityNames`. A known name with an interior lowercase word (`Not for Profit Alliance`, `Never at Rest Logistics`) or a lowercase tail — which is
what TASK TITLES look like (`Not Invented Here retrospective`, `Never Again incident report`, `No Limits Inc quarterly review`) — is never recognised, the
negator reads as a genuine negation, and the fabrication ships. Sized (`scratch/v52/class_sizing.mjs`, pack populated, 8 fabrication shapes × name):
**CONTROL capitalised-run names 0/40 ship; LOWER_INTERIOR company names 32/80 ship; LOWER_TAIL task titles 80/80 ship**; truthful twins destroyed
**0/200**. v92 corrects every shipped row (PAST). This is the pack-POPULATED sibling of V47-D2 (whose 320 rows are the EMPTY-pack configuration); the
"production configuration populates the pack" argument does not reach it. Also relevant to run18/run19's "but member CLOSED" re-pins: they pin
`Nothing But Nets Foundation` (capital B); `Nothing but Nets Foundation` (as the charity spells it) is in this class.
**Closure, PREPARED and MEASURED, not applied (no write authority):** `scratch/v52/build_closure.mjs` → `scratch/v52/mut/closure_V52D1.ts` — inside the
scan loop, a local `namePrefixHit` tries every word-prefix of `after` (any casing, ≤ 8 tokens, trailing punctuation stripped) against the pack;
`nameInternal` is also true on a hit and the `lastIndex` jump uses the longest hit. Positive-only: absence proves nothing, so no determiner reading is
lost. Measured: sizing set **0/200 ship, 0/200 truths destroyed**; full corpus **TR 0 / FR 0** (exactly the 2 rows change); all 16 extractor suites green on
the mutant (run14 68/0, run15 57/0, run16–19, run28 117/0, `v92_open_regression_contract` 28/0, `v92_parity_contract` 46/0, entity_signal 5/0,
generative 25/0, v48–v51 gates); deno 23. It is a LOCAL inside `completionIsNegated`, which the narrowed CONTRACT 5 explicitly permits.

### STEP 3c / 4 — counts and suite integrity, measured
Battery from the filesystem, each suite its own child (`scratch/v52/battery.mjs`): **38 suites, 36 exit-0, 2 non-zero** =
`factory_production_write_inventory` (2/1) and `production_write_authority` (2/5) — machine-posture tests, not Edge-byte tests. Every "no-count" suite prints
a real tally (92/92, 43/0, 49/0, 74/0, 60/0, 68/0, **57/0 run15**, 53/0, 43/0, 52/0, 29/29, standing_reds 8 rows / 0 blockers); 5 SUPERSEDED by declaration;
run19 62/0; run28 117/0; `v92_open_regression_contract` 28/0; `v92_parity_contract` 46/0. Standing gates: **v30 25/1, v31 32/2, v42 11/2, v47 43/9, v46
(proposed) 33/3**, v46 (scratch copy) exit 2 = stale hard-coded ROOT (harness, not candidate), v48 58/0, v49 16/0, v50 16/0, v51 17/0 — each red re-derives
as the recorded non-blocker (v31: lexicon locus + `I archived <negator-name>` first-person; v42: empty-pack injection; v47: empty-pack V47-D2, stale anchors,
D6/D8 instrument findings; v46: e=**2.39** growth measured here at 70.85 ms @ 4 KB — bounded by the 4,000-char slice; C8a pins 6003 CRLF vs actual 6015;
`closed|added` withdrawn by design, `Confirmed — Closed ACME.` ships in both builds = parity). **CONTRACT 5 narrowing judged sound:** its own COVERAGE checks
prove it still catches a new TOP-LEVEL belt const and ignores a local inside `completionIsNegated`; my closure mutant is exactly such a local and keeps
run15 at 57/0 — the hazard CONTRACT 5 exists for is the extractor drop, and a `.map()`-callback local is reported by run15 crashing (exit 1), loud.
**Re-pins honest:** run18 `D131.disclosedResidual.nowClosed` + `pairedRealNamesSurvive`, run18/run19 `dash`/`idiom`/`nameInitial` pairs and run28
`D116.negatorInitialName.*` each assert BOTH the fabrication caught AND the paired real name preserved — with the capitalised spelling only (see V52-D1).
**run14/D107:** the brief's "widened 2000 → 2600" is stale — the budget is GONE; the harness scans to the statement's real end and throws if not found. D117
no-whole-span-lookaround holds (CONTRACT 6 green) — with the caveat that V52-O1's `\?\s*$` is a whole-summary TEST (not a lookaround) on the guarded arms.
"Battery 33/0 via a pipeline" is moot: my statuses are child statuses (38 / 36 / 2). Regression suite `qa/verification/proposed/v52_regression_additions.mjs`:
**15 passed / 1 failed** on the candidate (V52-D1 red by design); **16/0 on the closure mutant**; **14/2 on a D1-reverted mutant** and **11/5 on an
entity-signal-disabled mutant** (the suite observes the fixes — non-vacuous).

### STEP 5 — deployability
**Not fit to deploy over v92 under the per-class rule.** The candidate is better than v92 on aggregate (308 truths rescued, 348 fabrications gained,
0 truthful answers v92 preserves destroyed on 1,393 rows, 4 wrong-option destructive binds removed) and worse on exactly ONE named class: V52-D1, a
fabrication about a real in-pack task/company whose negator-initial name carries a lowercase word, shipped where v92 corrects it (112/160 on the sizing
set; 2/922 on the general corpus). Its closure is measured at zero truth cost, zero new fabrications, harness-safe and deno-clean. **Every class I could
construct other than V52-D1 is closed or parity — I say so plainly.** Apply the closure, then measure on a corpus that was NOT green before; the next
verifier must pass on the new exact SHA.

**Record corrections:** CURRENT_CAMPAIGN.json "v47 44/0" → **43/9** (as #51); "battery 36 files, 0 failing" → **38 suites / 36 exit-0 / 2 non-zero
(machine tests)**; ledger #117 "CRLF 6,017 / bare LF 0" → 6,015 CRLF / 6,016 lines / 1 bare CR; the brief's "run14/D107 window 2000 → 2600" is stale
(no budget); `open_deploy_blockers: []` is false on 416c14c — V52-D1 is a P2 fabrication class with the pack populated.

**Coverage gaps I could not close:** no browser/AI-chat tooling in this session (UI/AI-chat truth checks **BLOCKED**, not skipped); `supabase db query`
permission-gated (`chat_channel_state` probe **BLOCKED**; #50's read is prior evidence); the 30-minute durable pendingAction bind not exercised end-to-end;
the `ezbr_sha256` bundle hash not independently recomputed. Artifact filenames: the brief's `v48_*` names collide with verifier #48's live gate in
`proposed/`; mine are `v52_*` so no standing artifact is overwritten.

Production remains v92; rollback c9dfab5b. index.ts sha256 at close:
`4ee3a1f6fef2de87bb43e877d701e2245935711b0cb054683b2df89a44a21699`.
