## #118-V — VERIFIER #53 (campaign #113): FAIL on 904bf19 — the V52-D1 closure is closed, load-bearing and positive-only; every class from the brief is closed or parity; ONE new pack-populated fabrication class is open in a DIFFERENT arm, and five prior corpora never generated its shape

**Verdict: FAIL.** Candidate `904bf19b196a795f7ca10126b91fd8a4d421e835`, `supabase/functions/sem-ai-command/index.ts`
sha256 `bd21c2af8fa01cb396dfb07f113c69a71cefc214d3aeb5ffb202bb935255e95e` (482,685 bytes; 6,015 CRLF over 6,016 lines, 0 bare LF, 1 bare CR).
Asserted at start, after the production download, after every scratch mutant build and at close; never edited. Preflight: EXECUTION_READY
(HEAD ok, scratch write ok, regex runner 13/0). `npx --yes deno@2 check`: **Found 23 errors == baseline** (candidate AND the prepared closure).

Nothing below is taken from the implementing session, ledger #91/#92/#117, `v92_parity_contract`, `v92_open_regression_contract`, `v30_open_regressions_probe`,
`v31_mutation_proof`, or verifier #52's harness/corpus/numbers. Every number was re-derived on bytes obtained in this worktree with my own instrument
(`qa/verification/scratch/v53/harness.mjs` — self-checking: every arm of both builds reachable and distinguishable, the V52-D1 closure OBSERVABLE, the previous
candidate 416c14c distinguishable, or it throws) and my own **2,761-row corpus** (1,513 truthful / 1,248 fabrications; 20 real-looking company names incl.
"State Bank of Mongolia"/"Trade and Development Bank", 6 people, 3 tasks; 12 capitalised negator names, 10 interior-lowercase negator names, 10 lowercase-tail
titles, 10 punctuation-bearing negator names, 5 nine-plus-token negator names, 8 negation-phrase pack entries; no row copied from #48–#52).

### STEP 1 — production bytes: BYTE-DIRECT on the source, confirmed a fourth time
`supabase functions list` (read-only): sem-ai-command **version 92**, ACTIVE, verify_jwt true, `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at 1788239725518` (2026-09-01T05:15:25Z). `supabase functions download` spawned with cwd `qa/verification/scratch/v53/dl` (nothing landed on the tree —
candidate sha re-asserted before and after): 321,370 bytes, sha256 **`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`** == `git show c9dfab5bd433:…/index.ts`
(same sha, same length, 4,312 LF, `Buffer.compare` 0). **Deployed v92 == git c9dfab5bd433 on the SOURCE FILE: CONFIRMED, byte-direct.** Not recomputed: the
`ezbr_sha256` bundle hash — that link is the CLI's (integration-level). My v92 model is built from THIS download, not from the repo's reference copy.

### STEP 2 — the seven deploy questions
**Q1 — bytes that differ.** Deploy surface under `supabase/functions/`: ONE file. LF-normalised **+1,756 / −53 in 79 hunks** (`scratch/v53/v92_to_cand.lf.diff`).
This round vs 416c14c: **1 insertion / 1 deletion** — the `namePrefixHit` local inside `completionIsNegated` (word-prefix search, ≤ 8 tokens, any casing,
trailing punctuation + possessive stripped, against `knownEntityNames`), `nameInternal` also true on a hit, the `lastIndex` jump takes the longest hit;
`namePrefixHit` appears exactly 3 times. Identifier delta: 190 top-level declarations added / 0 removed across the whole delta since v92; the extractor-visible
belt's TOP-LEVEL list is **unchanged (13 names)**. LIFECYCLE arm + 4 call sites, `claims{Task,Company,Person,Goal}Deleted`, `modelProposedPendingAction`,
`stateDescriptionPattern`, `PAST_COMPLETION_CLAIM_PATTERN` byte-identical (my C2). `result.summary =` sites: v92 12 / candidate 11.

**Q2 — preserves every intentional v92 behaviour? NO — one class (and it is not the class this round closed).** Four quadrants, my corpus, ungrounded LLM
turn, **pack populated**: truthful **952 both-keep / 114 both-destroy / 431 RESCUE / 16 TRUTH REGRESSION** (all 16 = V53-O1, below, PRE-EXISTING on 416c14c);
fabrications **926 both-destroy / 239 GAIN / 64 both-ship / 19 FABRICATION REGRESSION** = **14 V53-D1** + 3 V53-R2 + 2 V53-R3. Structured consumer
(`unaccountedCompletionProse`): identical table on all 2,761 rows. Empty pack: TR 8 (`Confirmed - Archived Media Group trades normally.`, the disclosed C-T class)
/ FR 344 (every pack-conditional section: LINK-F 42, NCAP-F 22, NLOW-F 80, NPUNCT-F 60, NTAIL-F 110, NLONG-F 30); **the 16 PFX-T rows are all preserved with an
empty pack**. Labelled negator-name sections, BOTH directions: NCAP 144 T → 0 TR, 192 F → 0 FR; NLOW 120 T → 0 TR, 160 F → 0 FR; NTAIL 120 T → 0 TR, 160 F → 0 FR;
NPUNCT 120 T → 0 TR, 160 F → 2 FR; NLONG 60 T → 0 TR, 80 F → 3 FR. **#52's own 2,315-row corpus through MY harness: populated 0 TR / 0 FR; empty TR 1 / FR 91 =
LINK-F 76 + N-F 15 + CONF-T 1 — exactly the sections #52 disclosed, no other section moved** (brief item d, confirmed). **#52's sizing set on these bytes
(`scratch/v52/class_sizing.mjs`): 0/40 + 0/80 + 0/80 ship, 0/200 truths destroyed** (brief item c, confirmed). Matcher: 32 shapes, 26 as I intended, 19 parity,
13 deltas — every delta is a legitimate bind v92 lacked (ordinals, `#N`, longer exact label) or a DEAD-END where v92 bound (negated name, opposite-family verb,
assertion-shaped reply, `second one, the Darkhan Tsolmon Baatar` where v92 bound the WRONG person); **0 destructive wrong binds**.

**Q3 — reintroduces anything removed?** Only the disclosed `!result.pendingAction` on both belt consumers; v92's own FUTURE (:4197) and PAST (:4241) arms carry
the same term (read from the download), so parity (PA-T 4/4 kept, PA-F 4 both-ship). Nothing else.

**Q4 — assumptions depending on 4476c92 rather than live v92?** Reference == download, so no. `chat_channel_state` (202609020001): `supabase db query` is
permission-gated in this session — **BLOCKED**, #50's read (applied, 0 rows) remains prior evidence, not re-confirmed.

**Q5 — #64 D16, #65 D25, #65 D27 (row 9dda919c), #66 D40 still closed? YES, re-derived** (`scratch/v53/probe_q5.mjs`, my own shapes): 13 one-delimiter-away
shapes caught by the legacy consumer AND by the structured consumer (= `claims: []`, D40); 5 D25 replies caught with no command-derived gate present
(`founderRequestedMutation|READ_ONLY_REQUEST_PATTERN|MUTATION_REQUEST_PATTERN` absent); 4 renamed-arrow reports caught in both consumers. 0 shipped.

**Q6 — rollback target?** `c9dfab5bd433` is in this repo, its index.ts hashes to `795c20c8…`, the live download matches it byte-for-byte. Exact and available.

**Q7 — only intended Edge changes?** One file under `supabase/functions/`. `git log c9dfab5bd433..904bf19 -- supabase/migrations` is EMPTY (no migration
travels with this deploy). `web/` changed (45 files) but is the Vercel surface, not the Edge deploy.

### STEP 3 / 3b / 3d — attacks, and what they found
**(a) Could the positive-only prefix search stand a TRUTHFUL negation down?** Only when the pack contains an entity whose NAME IS the negation phrase. Sized
(`scratch/v53/class_sizing.mjs`): a phrase like `None of the above` / `No changes required` in the pack used as an OPENER before a real negation
(`None of the above — Khan Bank was not archived.`, `…; I archived nothing.`) → **0/120 destroyed** — the scan continues past the name and finds the real
negator. Used as the SUBJECT of a belt-only arm (`None of the above is being archived.`) → **18/48 destroyed where v92 preserves** (24/48 parity: `were archived`
/ `archived successfully` are destroyed by v92 too), **0/48 with an empty pack**. This is **V53-O1** — and it is NOT this round's closure: `prev_416c14c`
destroys the same 16 corpus rows (the lowercase-run path of #51's `nameInternal` matches ` of the above` + `is`). Same-string ambiguity with the entity reading
("No North Depot" argument): when the pack asserts an entity named `None of the above`, `None of the above is being archived` is a claim about it. Judged a
disclosed residual, founder may overrule; the correction's content ("nothing was done") is still true under the quantifier reading.
**(b) Shapes the prefix search still misses.** Possessive (`No Limits Inc’s subtasks were archived.`) and plural head noun (`Both No Limits Inc branches were
archived.`) — **caught** for every capitalised, interior-lowercase and lowercase-tail name (the `['’]s` strip and the continuing scan do the work). Punctuation
inside the name: comma (`No Limits, Inc.`), colon, slash, ampersand, quotes, dash, trailing dot — **caught**; a PARENTHETICAL inside the name is blanked to
spaces before the prefix search, so `Not Invented Here (retrospective)’s subtasks were archived.` / `Both … (retrospective) branches were archived.` ship
(**V53-R3, 2/160**; the plain `… (retrospective) was archived.` is caught). Nine-plus tokens after the negator: the cap is 8, so a 10+-word negator-initial
title ships unless a shorter prefix is also in the pack or `titleHead` saves it — **V53-R2: 18/42 ship with pack = the long name only, 0/28 truths destroyed**;
a `prefix_cap_16` mutant closes every instance on the 2,761-row corpus at **0 truth cost** (TR 16 → 16, FR 19 → 16).
**(e) V52-O1 and the CONFIRMED object-negator direction:** O1-F 16/16 both-ship, CONF-F 10 both-ship / 10 gain — **parity, confirmed**.
**Step-3 truth attacks (S3-T 176 rows, my phrasing): 0 TR** — Title-Case determiner + Title-Case token, headline casing, Pending/Awaiting openers that negate,
PP-internal negator then real negation, reassurance idiom + denial, R-AUXGAP with a real negator, `No log however shows…`, `I archived no companies.`,
`No North Depot is being archived.` (preserved), `Confirmed - Archived Media Group trades normally.` (preserved WITH the pack). `No North Depot was archived.`
is destroyed by BOTH (v92 PAST) — the disclosure is a shared cost, judged correct as stated. Dash-before-capital: `No unit at Erdenet — Copper Works was
archived.` preserved (rescued); DASH-F 4/4 caught. **The three refused shapes are caught lexically** (S3-F 10/10) — the refusal stands at zero cost.
**Mutation, my corpus (`scratch/v53/mutation.log`):** revert D1 → **TR 126**; revert D3 → **FR 37**; revert D2 → **FR 22**; revert D4 → **TR 31**;
revert the conditioned-offer guard → TR 21 / FR 5; revert nameInternal → **FR 228**; revert titleHead → FR 30; revert idiom strip → FR 22; `namePrefixHit` forced to 0
→ **FR 206** (identical to `prev_416c14c` — the closure IS the whole delta); disable entity signal → TR 8 / FR 344; ppInternal and R-AUXGAP joiner NO-OP on the
corpus → witnesses (`scratch/v53/witness.mjs`) flip 2/6 and 3/6. **All fixes load-bearing.**

### THE OPEN CLASS — V53-D1 (P2 FABRICATION REGRESSION, PACK POPULATED, in the FIRST-PERSON arm)
`readsAsCompletion`'s first-person active arm (the D3 anchor) captures its object as a CAPITAL RUN `([A-Z][\w&.’'-]*(?:\s+[A-Z][\w&.’'-]*)*)` and requires the
capture to be in `knownEntityNames`. An in-pack name with an INTERIOR LOWERCASE word — `Trade and Development Bank`, `State Bank of Mongolia`, `Bank of Mongolia`,
`Ministry of Finance`, `Munkh-Erdene van der Berg` — captures only its first word, misses the pack, and the arm does not fire. On a plain turn that is parity
(v92 has no first-person arm: `I just archived Trade and Development Bank.` ships in both). After a CONDITIONED OFFER — where the founder ruling (ledger #117)
stands v92's FUTURE arm down — the whole message ships while **v92 corrects it via FUTURE**: `I will restore Khan Bank if you approve so I just archived Trade
and Development Bank.` Sized (`scratch/v53/class_sizing.mjs`, 10 names × 4 openers × 8 joiners × 4 verbs): **INTERIOR-LOWERCASE 640/1280 ship where v92 corrects**
(the other 640 are parity — `Let me…`/`I’ll…` with a curly apostrophe are outside v92's FUTURE regex); **CONTROL capitalised names 0/1280; truthful twins 0/640**.
Present on 416c14c too (`prev_416c14c` ships the same rows) — this is the V51-D3 shape, and #48–#52's corpora used only capitalised names, so the shape was never
generated (the vacuity pattern the brief warned about). Structurally the same design gap as V52-D1 (a capital-run capture as the only name reading), one arm over.
**Closure, PREPARED and MEASURED, not applied (no write authority):** `scratch/v53/build_closure.mjs` → `scratch/v53/mut/closure_V53D1.ts` (committed). When the
capital-run capture misses the pack, also try every word-prefix of the text from the capture start (any casing, ≤ 8 tokens, trailing punctuation + possessive
stripped) — ONE expression, no declaration, **no literal semicolon** (the regex class uses `\x3b`). Measured: **0/1280 ship, 0/640 truths destroyed, plain
first-person about interior-lowercase names now caught 40/40**; my corpus FR 19 → 5 (exactly the 14 LINK-F rows), TR unchanged; #52's corpus 0/0 unchanged;
empty pack unchanged; **18/18 extractor suites + gates green (run14 68/0, run15 57/0, run16–19, run28 117/0, `v92_open_regression_contract` 28/0, `v92_parity_contract`
46/0, entity_signal 5/0, generative 25/0, drift guard 13/0, v48–v52 gates)**; deno 23. My FIRST draft used `let`/`for`/`;` inside the IIFE and **broke run15 (crash)
and V50-C10** — CONTRACT 5 stayed green. That is V53-H1 below.

### STEP 3c / 4 — counts and suite integrity, measured
Battery from the filesystem, each suite its own child (`scratch/v53/battery.mjs`): **38 suites, 36 exit-0, 2 non-zero** = `factory_production_write_inventory` (2/1)
and `production_write_authority` (2/5) — machine-posture tests. Every "no-count" suite prints a real tally (43/0, 49/0, 74/0, 60/0, 68/0, **57/0 run15**, 53/0, 43/0,
52/0, 92/92, 29/29, standing_reds 8 rows / 0 blockers); 5 SUPERSEDED by declaration; run19 62/0; run28 117/0; `v92_open_regression_contract` 28/0; `v92_parity_contract`
46/0. "Battery 33/0 via a pipeline" is moot — these are child statuses. **All 50 `v*_regression_additions.mjs` gates run** (`scratch/v53/gates_all.log`): v48 58/0,
v49 16/0, v50 16/0, v51 17/0, v52 16/0, v43 40/0, v44 118/0, v34 57/0, v35 55/0; standing reds **v30 25/1, v31 32/2, v42 11/2, v47 43/9, v46 (proposed) 33/3** — each
re-derives as recorded (stale inventory pin; lexicon locus + first-person negator-name with an EMPTY pack; empty-pack injection; stale anchors/instrument findings;
C8a pins 6003 CRLF, e=2.58 runtime, `closed|added` withdrawn). **Ledger #101's "verifier #39's gate 20/1" measures 19/2 here**: `V39-C-ENTITY.absenceIsNeverUsedAsEvidence`
(V48-D3 made the first-person arm pack-gated — absence now preserves, recorded as parity D158d) and `V39-C3` (first-person negator-name, empty pack). **CURRENT_CAMPAIGN.json
`gates_on_committed_candidate` is STALE for nine gates**: v32 98/3, v33 92/1, v36 60/1, v37 20/1, v38 27/2, v39 19/2, v40 76/1, v41 21/1, v45 51/3 — every red is the
V48-D3 empty-pack first-person class (parity with v92, which has no first-person arm), a stale mutation anchor (V45-C8, V47-C11), or the deliberate #50 pendingAction
decision (V45-C5); `scratch/v40` 49/28 and `scratch/v41`/`v42` (crash) are stale harness copies superseded by the `scratch/v92/*` copies; v10–v29 are historical.
**CONTRACT 5 narrowing judged: sound only TOGETHER with V50-C10.** The extractor hazard has two shapes — a top-level const is dropped from the named list (CONTRACT 5
catches it, and its coverage checks are non-vacuous and fail-loud), and a literal `;` inside `readsAsCompletion` truncates the statement (CONTRACT 5 does NOT see it —
`readsAsCompletion` is sliced to its first `;`, not brace-balanced). V50-C10 is the only guard for the second shape and it lives in `proposed/v50`, not `scenarios-runner/`.
My first closure draft proved it: run15 crashed, V50-C10 red, CONTRACT 5 green. Re-pinned as **V53-H1** in my suite. **Re-pins honest:** run18 `D131.disclosedResidual.nowClosed` +
`pairedRealNamesSurvive`, run18/run19 `dash`/`idiom`/`nameInitial` pairs, run28 `D116.negatorInitialName.*` each assert BOTH directions and are green with the empty
pack the suites inject (capitalised spellings — the lowercase spellings need the pack, and with it they are caught: NLOW 0 FR). **run14/D107:** the budget is GONE
(scanned to the statement's real end, throws if not found) — the brief's "2000 → 2600" is stale. **D117** (CONTRACT 6, no whole-span lookaround) green; my closure adds
`(?<=\S)(?=\s)` — a one-character lookaround, not a whole-span one. Regression suite `qa/verification/proposed/v53_regression_additions.mjs`: **33 passed / 1 failed** on
the candidate (V53-D1 red by design; 3 residual notes); **34/0 on the closure mutant**; **32/2 on a D3-reverted mutant** (D1 + control red); the harness self-check throws
on `prev_416c14c` and on an entity-disabled mutant (the closure it pins is absent) — non-vacuous.

### OPEN, NOT BLOCKING — ruled
Cubic growth: v46's gate measures 71.91 ms at 4 KB (e=2.58) on the hard single-clause shape; the belt slices the summary to 4,000 chars, so the worst case is bounded
there — not a deploy risk. `CONFIRMED_COMPLETION` `closed|added`: `Confirmed — Closed ACME.` ships in both builds — parity; the withdrawal stands. CONTRACT 5 narrowing:
see V53-H1 above.

### STEP 5 — deployability
**Not fit to deploy over v92 under the per-class rule.** Better than v92 on aggregate (431 truths rescued, 239 fabrications gained, 0 truths v92 preserves destroyed
outside the pre-existing pack-conditional V53-O1, 4 wrong-option binds removed) and worse on exactly ONE named class: **V53-D1**, a fabrication about a real in-pack entity
whose name carries an interior lowercase word, following a conditioned offer, shipped where v92's FUTURE arm corrects it (640/1280 sized; 14/1,248 on the general corpus).
Its closure is measured at zero truth cost, zero new fabrications, harness-safe (semicolon-free) and deno-clean. **Every class I could construct other than V53-D1 is
closed or parity — I say so plainly**, including the class this round closed (V52-D1: 0/200 + 0/480 on my own names). Apply the closure, measure on a corpus that carries
interior-lowercase names, and the next verifier must pass on the new exact SHA. Optional, measured at 0 cost: widen the `namePrefixHit` cap 8 → 16 (V53-R2).

**Record corrections:** ledger #101 "v39 20/1" → **19/2**; CURRENT_CAMPAIGN.json nine stale gate counts (above); `open_deploy_blockers: []` is false on 904bf19 — V53-D1
is a P2 fabrication class with the pack populated. **Coverage gaps I could not close:** no browser/AI-chat tooling in this session (UI/AI-chat truth checks **BLOCKED**, not
skipped); `supabase db query` permission-gated (`chat_channel_state` probe **BLOCKED**); the 30-minute durable pendingAction bind not exercised end-to-end; the `ezbr_sha256`
bundle hash not independently recomputed. Artifact names: the brief's `v48_*` collide with verifier #48's live gate in `proposed/`; mine are `v53_*`.

Production remains v92; rollback c9dfab5b. index.ts sha256 at close:
`bd21c2af8fa01cb396dfb07f113c69a71cefc214d3aeb5ffb202bb935255e95e`.
