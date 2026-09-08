## #118-V — VERIFIER #50 (campaign #110): FAIL on 2f11ee1a — every V49 witness row is closed and every V49 CLASS is still open; one new hole was introduced by the tail floor

**Verdict: FAIL.** Candidate `2f11ee1ac479fae07549e391723fa2a79b081262`, `supabase/functions/sem-ai-command/index.ts`
sha256 `5394485e91a7c74f5189d77e3f4705608373f0e5facd68fc61ae9ea51356926a` (482,244 bytes, CRLF 6,015 / 6,016 lines,
0 bare LF, 1 bare CR inside a `//` comment at line 5745 — harmless). Asserted at start and at end; never edited.
Preflight: EXECUTION_READY (HEAD ok, scratch write ok, regex suite 13/0). `deno check`: Found 23 errors == baseline.

Nothing below is taken from the implementing session, its commit message, ledger #91/#92, `v92_parity_contract`,
`v92_open_regression_contract`, `v30_open_regressions_probe` or `v31_mutation_proof`. Every number was re-derived on
bytes obtained in this worktree with my own harness (`qa/verification/scratch/v50/`) and my own 1,103-row corpus
(703 truthful / 400 fabrications; 16 ordinary + 19 negator-bearing names + 7 titles; no row copied from #48/#49).
#49's tooling was re-run only to check the session's claims about it.

### STEP 1 — production bytes: BYTE-DIRECT, confirmed

`supabase functions list` (read-only): sem-ai-command **version 92**, `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at 1788239725518` = 2026-09-01T05:15:25Z, status ACTIVE, verify_jwt true. `supabase functions download`
run from an ISOLATED scratch cwd (`scratch/v50/download_v92.mjs`; nothing landed on the working tree — candidate sha
re-asserted afterwards): `index.ts` 321,370 bytes, LF, sha256 **`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`**.
`git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts` hashes to the same value; `cmp` is byte-identical;
c9dfab5bd433 is timestamped 2026-09-01 05:14:41Z, 44 s before the deployment. The in-repo reference copy
`qa/verification/scratch/v92/index.v92.ts` hashes identically. **Deployed v92 == git c9dfab5bd433: CONFIRMED,
byte-direct on the source file.** What I could NOT recompute: the `ezbr_sha256` bundle hash (an eszip of the bundle,
not the source) — the link from bundle to source is the CLI's, not mine. Not a P0; nothing refutes it.

### STEP 2 — the seven deploy questions

**Q1 — bytes that differ.** Deploy surface under `supabase/functions/`: ONE file. Raw diff 6,015+/4,312− is the
CRLF/LF whole-file rewrite (the candidate blob is stored CRLF, `git ls-files --eol` = `i/-text`; v92 is LF).
LF-normalised: **1,756 insertions / 53 deletions** (`scratch/v50/v92_to_cand.lf.diff`), differing from #49's recorded
diff only in this round's 7 hunks (20 lines). This round vs 894c958: FUTURE guard vocabulary; `objectName` deleted;
`nameInternal` = the 894c958 expression with `(capLead && subjectRun)` parenthesised **+ the D4 lowercase-run
disjunct, exactly** (attack (e): the "nor-bypass" revert is byte-faithful — verified by string equality, not by eye) +
the D3 cursor-advance block; `readsAsCompletion` gains the whole-input EXECUTION guard, the `[—–\u003b]\s+`
first-person anchor and the `|| (length > 4000 && LEGACY.test(slice(4000)))` floor; both belt consumers gain the
byte-identical pendingAction-turn history strip. Identifier delta of the extractor-visible belt: 13 top-level names
(unchanged this round; `objectName` was a local). Every prose arm inherited from v92 is byte-identical:
`claimsLifecycleClaim` + 4 call sites, `findEntityStateClaimContradiction` + both vocab literals + both call sites,
`claims{Task,Company,Person,Goal}Deleted`, `modelProposedPendingAction`, `hasResolvedEntities`,
`PAST_COMPLETION_CLAIM_PATTERN` (and `LEGACY_PAST_COMPLETION == v92 PAST` byte-for-byte, so the tail floor is
v92-level by construction). `FUTURE_PROMISE_PATTERN` differs only by `['’]?`.

**Q2 — preserves every intentional v92 behaviour? NO.** Four quadrants, my corpus, pack populated: truthful
479 both-keep / 38 both-destroy / **120 RESCUE** / **66 TRUTH REGRESSION**; fabrications 310 both-destroy /
**68 GAIN** / 8 both-ship / **14 FABRICATION REGRESSION**. Empty pack: TR 67 / FR 60 — the deltas are exactly the
disclosed pack-conditional classes (39 negator-name + head-noun B-F rows, 7 more E-F first-person rows, the
`Confirmed - Archived Media Group trades normally.` truth). Labelled negator-name section (19 names × 8 truths ×
8 fabrications + 7 titles × 3 × 3, populated): **B-T 0 TR, B-F 0 FR** — both directions clean, including
`Neither Here Nor There Travel branch was archived.` (D3) and `Nothing left behind checklist was archived.` (D4).
Matcher: 40 disambiguation shapes, 40 as intended; the candidate differs from v92 on 14, all legitimate (ordinals,
quoted/numbered labels bind; `don't archive khangai cement` / `not …` / `restore …` dead-end where v92 binds c1 —
v92's wrong-option destructive bind). The structured consumer (`unaccountedCompletionProse`) agreed with the legacy
consumer on all 1,103 rows.

**Q3 — reintroduces anything removed?** No. The three deletion-failure appends remain moved into
`executionFailureNotes`; the blanket `!result.pendingAction` stays removed from the belt and present on the FUTURE arm.

**Q4 — assumptions depending on 4476c92 rather than live v92?** Harness lineage is fine (reference == download).
The environment-dependent one is now MEASURED: read-only `supabase db query` shows `202609020001
chat_channel_state_durable_conversation` **applied** and `public.chat_channel_state` **exists with 0 rows / 0 pending**
(v92 never writes it). On deploy the candidate starts writing it: a fully-typed pendingAction becomes durable for 30
minutes and a later bare "yes" can bind to it. Source-level: the durable row only feeds the INCOMING pendingAction
(deterministic confirmation/clarification path — `model === 'deterministic-*'`, where both builds skip every prose
arm) and `result.pendingAction` at the belt is the raw model value in both builds (`V50-C11`: nothing assigns or
deletes it before the consumers). No differential in this campaign exercises the 30-minute bind itself; I could not
exercise it live in this session type. Still flagged, now with the table's real state.

**Q5 — #64 D16, #65 D25, #65 D27 (row 9dda919c), #66 D40 still closed?** Yes by the battery run from the filesystem:
`v92_parity_contract` 46/0, `lifecycle_evidence_and_output_persistence_contract` 92/92 "0 open #67 defects",
`structured_claim_laundering_contract` 29/29, `structured_claim_verification` 42/42.

**Q6 — rollback target?** `c9dfab5bd433` is in this repo, its index.ts hashes to the pinned `795c20c8…`, and the live
download matches it byte-for-byte. Exact and available.

**Q7 — only intended Edge changes?** One file; but it is the whole 1,756-line delta since v92 plus the now-LIVE
`chat_channel_state` write (Q4), not "six insertions".

### STEP 3 / 3b / 3d — the attacks, and what they found

**V50-D1 (P1, TRUTH REGRESSION — the V49-D1 class, only PARTIALLY closed).** The V49-D1 fix is a marker LIST
(`on \d`, weekday, `last week|month|year|night|time`, yesterday, earlier, `this morning…`, `in <Month>`, `in \d{4}`,
`since|from \d`, `\d+ <unit> ago`, `by you|another user|someone else|<Title Case>`). Deployed v92 preserves 100 % of
pendingAction-turn prose. On my G-PA-T section (105 truthful history recounts + question, pendingAction turn) the
candidate destroys **64** — v92 preserves all 64. What the list misses, each measured: **already** (`was already
archived`), **previously**, **recently**, **a month ago / an hour ago / some time ago / a while ago** (no digit),
**two days ago** (spelled number), **on Jan 3 / on March 3 / on the 3rd** (`on \d` only), **at 10:15**, **by admin /
by the previous manager** (lowercase agent), **(see the audit log) / per the audit log / according to the log**,
**in Q3 / last quarter / in early 2025 / in the spring / over the weekend**, **during the migration / before you
joined / before the audit / when the depot closed / at the time / back then / once before / at some point / in the
last sync**. The most natural restore-clarification phrasing of all — `"Khangai Cement was already archived. Do you
want me to restore it?"` — is destroyed and replaced by "I can’t actually do that from chat — nothing was changed. …".
Sized on the tree #49 failed: 98/105 destroyed on 894c958 → 64/105 here. The session's "8/8 truths preserved" was
measured on #49's eight witness rows, every one of which used a marker on the list — the campaign's own recorded
lesson ("a fix measured against the corpus that was already green is measured against the wrong thing") repeated.
By the brief's rule this is a FAIL on its own. **Note the asymmetry the deploy rule creates:** on a pendingAction
turn v92 never overwrites, so shipping an UNDATED fabrication + question there is v92 PARITY (both ship), while
destroying a truthful recount is a REGRESSION. The blanket `!result.pendingAction` on both belt consumers (the D3
short-circuit ledger #62/#63 removed) is therefore the strictly dominant choice under this gate: 0 truth regressions
on pendingAction turns by construction, at the cost of 7 gains (my G-PA-F rows become both-ship). A marker list can
only ever shrink the class.

**V50-D2 (P2, FABRICATION REGRESSION — V49-D7 only partially closed; INTRODUCED class, V48-D4 guard).** The D7
anchor accepts `[—–\u003b]\s+` — em dash, en dash, semicolon. `"I will restore Altai Motors if you approve - I just
restored Khangai Cement."` (ASCII hyphen), `"… if you approve and I just restored Khangai Cement."`, `"… if you
approve but I already archived Selenge Timber."` **ship** with the pack populated; v92's FUTURE arm destroys the whole
(ASCII `I will`). The splitter does not split at ` - ` / ` and ` / ` but ` before a capital `I`, and the anchor lists
`(?:and |but |so |then )?` only AFTER `^`/`Confirmed —`/dash. 3 of 16 E-F rows (6 on 894c958).

**V50-D3 (P2/P3, FABRICATION REGRESSION, INTRODUCED THIS ROUND by the V49-D2 tail floor).** The belt sees
`slice(0, 4000)`; the floor sees `slice(4000)`; they do not overlap. A claim STRADDLING char 4,000 — auxiliary in the
head, participle in the tail — ships: **11 of 29 offsets** (`Khangai Cement was archived.` starting at 4000−16 …
4000−26). v92 scans the whole summary. Frequency is low (one exact offset in a >4,000-char reply) but the hole is
deterministic and new. A ~64-char overlap on the floor (`slice(4000 - 64)`; LEGACY's own window is 30 chars +
participle) closes it at no measurable cost. Past-the-cap rows are otherwise closed: all three v92 PAST shapes
(`was archived`, `archived successfully`, `renamed: A -> B`) are caught in the tail; the 15 KB pathological clause
now evaluates in 2.4 ms **with the correct TRUE verdict** (it was `false` on 894c958 — V49-D2 closed).

**V50-D4 (P2, TRUTH — the V49-D5/D6 guard-vocabulary class).** `"Let me delete the task — is that ok?"` is destroyed
by the imminent arm; v92 preserves it. The guard requires `you` BEFORE `ok|okay`. A vocabulary list is a list.

**V50-D5 (P3, TRUTH, inherited, low realism).** `"Confirmed — I renamed Row 4 in the draft table shown here."` —
destroyed by CONFIRMED_COMPLETION, preserved by v92. Recorded, not weighed.

**Attack (a) judged.** "Can only move toward v92 parity on such turns, never past it" is TRUE and EMPTY: v92 is at
"never destroy" on those turns, so any strip moves toward it; the question is the distance left, and it is 64/105.
**(b) judged.** Both directions past the cap are v92-level (LEGACY == v92 PAST byte-for-byte; the negated-tail truth
is a shared cost: v92 PAST destroys `…was not archived; nothing was changed.` too). The straddle is the exception.
**(c) judged, CONFIRMED parity.** Mutating the whole-input guard back to per-clause changes 11 verdicts: 4
conditioned-offer truths re-destroyed and 7 progress fabrications re-caught — of those 7, v92 ships 5 (no progress
arm) and destroys 2 via the byte-identical LIFECYCLE arm, which the candidate also runs first. No row exists where
v92 catches a progress claim via PAST that the guard stands down: PAST needs an auxiliary + participle, which the
guard never touches. **(d) judged:** truthful `"— I just renamed Column B …"`-shaped rows out of pack: 4/5 preserved,
the 5th is V50-D5; in-pack fabrications after em/en dash and semicolon: caught; ASCII hyphen / and / but: V50-D2.
**(e) CONFIRMED** byte-faithful (see Q1). **(f) CONFIRMED:** #49's differential re-run on these bytes: populated
CLEAN (0/0, 101 rescue / 35 gain); empty = B-F 27, D-T 1, E-F 1, no other section moved.

**Truth attacks that did NOT regress (C-T, 53 rows, 0 TR both packs):** Title-Case negator + Title-Case token,
Pending/Awaiting openers that negate, PP-internal negators, reassurance idiom + denial, dash-before-capital (`No unit
at Darkhan — Steel Plant was archived.` preserved by both; `No company named Ulaanbaatar — Rail Depot was archived.`
destroyed by BOTH via LIFECYCLE — parity), the run31 shapes (`No North Depot was archived.` both destroy — v92 PAST;
`I archived no companies.`, `No log however shows …`, `No entry however in our records shows …`, modal hedge +
completion, `Confirmed - Archived Media Group trades normally.` with the pack: preserved). R-AUXGAP gap negators: 5
rows, shared cost (v92 PAST destroys them). The three "refused" shapes are CAUGHT (C-F 0 FR). The disclosed empty-pack
`No North Depot` / `No Limits Inc` indistinguishability argument is correct without the pack and moot with it.

**Seven-component mutation proof (mine, own anchors on the current bytes — #49's D5 anchor no longer applies):**
D1 strip 34 truths re-destroyed; D2 floor 21 fabrications re-shipped; D3 cursor advance 4; D4 lowercase run 4; D5/D6
vocabulary 4 truths; D6 whole-summary 4 truths (+7 parity fabrications, above); D7 anchor 4 fabrications.
**7/7 load-bearing.** The instrument change (#49's belt term evaluating the SHIPPED `legacyProseFallback` with
`result.pendingAction`) is HONEST: it evaluates what ships rather than a reconstruction, the two consumers carry a
byte-identical strip (V50-C4), and `result.pendingAction` is never assigned before the consumers (V50-C11). It is
also exactly why the fix looked complete: it was evaluated on the eight rows it was written against.

### STEP 3c / 4 — counts and suite integrity, measured

Battery from the filesystem, each suite its own child (`scratch/v50/battery.mjs`): **38 suites, 36 exit-0, 2
non-zero** = the two DB control-plane machine tests (by design). Vacuity screen: every "no-count" suite prints a real
tally in its own format (8/8, 17/17, 10/10, 92/92, 5/5, 43/0, 49/0, 74/0, 68/0, **57/0 (run15, D117 intact)**, 53/0,
43/0, 52/0, 40/40, 29/29, 42/42, standing_reds 8 rows / 0 blockers); five are SUPERSEDED stubs by declaration.
run19 62/0; run28 117/0; `v92_open_regression_contract` 28/0; `v92_parity_contract` 46/0. "Battery 33/0 via a
pipeline" is moot here: my statuses are child statuses. Standing gates: **v31 32/2, v42 11/2, v47 43/9** (the record
corrections hold), v46 (proposed) 33/3 as recorded, v48 58/0, v49 16/0. **v30 is NOT 25/1 unpatched any more — it
CRASHES** (`ReferenceError: knownEntityNames is not defined` inside its own `buildBelt`/`buildDecision`, which never
injected the entity signal; the D3 cursor-advance block evaluates it unconditionally whenever `nameInternal` is true,
where 894c958 hid the reference behind short-circuit evaluation). With the battery's structural default (an empty
Set) injected at its two body sites, v30 reads **25/1 on HEAD and 25/1 on 894c958** — the same stale-inventory red.
Instrument staleness, not a candidate fact; the record line "v30 25/1" needs the caveat. CONTRACT 5 narrowing: sound
for the reason #49 gave (its own coverage check injects a top-level const and requires detection; a local inside the
`.map()` callback breaks run15 LOUDLY — run15 57/0 confirms the invariant holds today). The run18/run19/run28
re-pins and run14/D107 need no new judgment this round: the belt block those suites scan changed only in the seven
hunks above, and every one of them is green from the filesystem.

### STEP 5 — deployability

**Not fit to deploy over v92.** One P1 truth class v92 preserves is still destroyed at 64/105 on my corpus after a
fix that closed 8/8 of the rows it was measured on (V50-D1); one fabrication class v92 corrects still ships in its
ASCII-hyphen/conjunction forms (V50-D2); and this round's own tail floor introduced a deterministic straddle hole
(V50-D3). The rescue side is real and large (120 truths v92 destroys are shown; 68 fabrications v92 ships are
caught; the matcher removes 4 wrong-option destructive binds in my set) — the candidate is better than v92 on
aggregate and worse on named classes, and the deploy rule is per-class.

**What to fix next, in order:** (1) V50-D1 — restore `!result.pendingAction` on BOTH belt consumers (dominant under
the per-class rule; cost = v92 parity on undated fabrication + question), or, if the session insists on keeping those
gains, exempt on a pendingAction turn every completion clause in a summary whose last sentence is a question — and
measure it on a corpus that was NOT green before; (2) V50-D3 — `slice(4000 - 64)` on the floor; (3) V50-D2 — add the
ASCII hyphen to the anchor class (`\x2d`, no literal `;`/`-` hazards) and accept `\s(?:and|but)\s+` as an anchor
boundary, or split before a capital `I` after ` - `/` and `/` but `; (4) V50-D4 — `is that ok|okay` and bare
`ok\?|okay\?` in the guard. Regression suite for all of it:
`qa/verification/proposed/v50_regression_additions.mjs` — **11 passed / 5 failed on this candidate** (the five
DEFECT rows are red by design until closed; **6/10 on 894c958**, where C4/C5/C6/C7/C8 fail — proof the suite
observes this round's fixes and is not vacuous; identical 11/5 from `qa/scenarios-runner` and from `C:\` with
`SEM_INDEX_SRC`).

**Record corrections:** CURRENT_CAMPAIGN.json `gates_on_committed_candidate.v30: "25/1 non-blocker"` → "crashes
unpatched (ReferenceError knownEntityNames); 25/1 with an empty Set injected"; `crlf: "6017/6017"` → 6,015 CRLF over
6,016 lines; `v49_differential_populated: "G-PA-T 0/16 regressions"` is true of #49's 16 rows and false of the class
(64/105 here). The session's statement "8/8 truths preserved, 4/4 undated fabrications still caught" is accurate and
was the wrong measurement.

**Coverage gaps I could not close:** no browser/AI-chat tooling in this session type (UI/AI-chat truth checks
BLOCKED, not skipped); the live 30-minute `chat_channel_state` bind was not exercised end-to-end; the `ezbr_sha256`
bundle hash was not independently recomputed.

Production remains v92; rollback c9dfab5b. index.ts sha256 at close:
`5394485e91a7c74f5189d77e3f4705608373f0e5facd68fc61ae9ea51356926a`.
