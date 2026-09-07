## #118-V — VERIFIER #49 (campaign #109): FAIL on 894c9583 — the pendingAction-turn class nobody had measured destroys truthful answers v92 preserves, and two of the five new fixes each open a fabrication v92 corrects

**Verdict: FAIL.** Candidate `894c95834729a9079ddb11250726e96f4693adef`, `supabase/functions/sem-ai-command/index.ts`
sha256 `b54c0d655933c8bd2445ed287e35d6f88aba5fc06b233e6dd18404d4ec354823` (480,206 bytes, 6,017 CRLF lines, 0 bare LF,
1 bare CR inside a `//` comment at line 5747 — harmless, CR is an ECMAScript line terminator). Asserted at start and at
end; never edited. Preflight: EXECUTION_READY (HEAD ok, scratch write ok, regex suite 13/0).

Nothing here was taken from the implementing session, ledger #91/#92, v92_parity_contract, v92_open_regression_contract,
v30_open_regressions_probe or v31_mutation_proof. Every number below was re-derived on bytes obtained in this worktree
with my own harness (`qa/verification/scratch/v49/`) and my own 691-row corpus (418 truthful / 273 fabrications), and
#48's tooling was re-run only to check the implementing session's claims about it.

### STEP 1 — production bytes: INTEGRATION-LEVEL in my hands, BLOCKED — EXECUTION_MODE for the live pull

`supabase functions list`, `npx supabase …` and `scripts/factory-runner/verify-deployed-bytes.sh` all "require approval"
in this session type — the same limit #41/#42/#48 recorded. What I could measure myself: `git show c9dfab5bd433:…/index.ts`
= sha256 `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`, 321,370 bytes, LF; the committed download
artifact `qa/verification/scratch/v92/deployed/…/index.ts` (commit `24bfccf`, linked-project.json ref
`pvphxgrtdfrudejjhzjk`) is 325,682 bytes CRLF and LF-normalises to exactly `795c20c8…`. So the record's "deployed v92 ==
git c9dfab5bd433" is CONSISTENT with everything I could hash and nothing refutes it, but the link is byte-direct only
through an inherited artifact. NOT a P0: no mismatch evidence. `deno check` is likewise gated (no TS tooling in-tree);
the belt block parses (every `new Function` build in this run succeeded) — that is the only parse evidence I have.

### STEP 2 — the seven deploy questions

**Q1 — exact bytes that differ.** `git diff --name-status c9dfab5bd433 HEAD -- supabase/` is ONE line: `M …/index.ts`.
Raw diff 6,017+/4,312− is the CRLF/LF whole-file rewrite; with `--ignore-cr-at-eol` the semantic delta is **1,758
insertions / 53 deletions across 53 hunks** (saved: `qa/verification/scratch/v49/v92_to_cand.diff`). Not only the
belt: `resolveClarificationField` hasOwnProperty fail-closed; `RESTORE_VERB_PATTERN` gains `activate`;
`matchDisambiguationOption` rewritten (presentation-stripped compare, ordinal path binding only on ONE distinct option,
clean-selection allowlist, longest-label rule, D116/D123/D127/D129/D132/D133/D135/D136); system prompt gains
CURRENT-TURN / CONTINUITY HONESTY rules and the STRUCTURED CLAIMS schema (`claims`, `questions`, `proposedActions`);
`buildContext` gains a `work_orders` head-count, absolute turn numbers, `continuity`, and a FEATURE-GATED read of
`chat_channel_state`; `pack.command` moves to `currentTurn` (last key); the disambiguation replay renders
"Confirmed — you selected “<label>”" instead of the raw label; the contradiction check strips the matched label
(D138/D142/D148/D150); `claimExecutionEvidence`/`recordExecution`/`runtimeLabels` at every write site;
`executionFailureNotes` replace the three `result.summary +=` deletion-failure appends and ride `factLines`;
`knownEntityNames` (positive-only entity signal); lifecycle/state/mismatch reports now PREPEND `factLines`;
`hasConfirmedMutationEvidence` grounds the turn; FUTURE_PROMISE gains `['’]?` and the D4 guard; the 1,151-line
structured-claim verification window (displayName/safe* formatters, per-claim verify, rewriteFromStructure,
`legacyProseFallback` WITHOUT `!result.pendingAction`); `result.verifiedResponse` envelope; persist condition gains
`pendingActionGatingChanged`; a FEATURE-GATED write of `chat_channel_state` (30-minute durable pendingAction, CAS on
version). The five lines of 2b04857 sit inside this (D1 rescue alternative, D2 prefixes on `executing`/`processing`,
D3 `knownEntityNames` gate on the first-person arm, D4 guard on the FUTURE consumer, D5 `.slice(0, 4000)`).
Identifier delta: not re-counted as a headline number — the extractor-visible belt declares 13 top-level names
(v92_open_regression_contract pins them, incl. the `me` artifact of `let me (?:…)` inside a string).

**Q2 — does it preserve every intentional v92 behaviour?** NO. Four quadrants on my corpus, populated pack:
truthful 263 both-keep / 40 both-destroy / **99 RESCUE** / **16 TRUTH REGRESSION**; fabrications 230 both-destroy /
**34 GAIN** / 1 both-ship / **8 FABRICATION REGRESSION**. Empty pack: TR 17, FR 30 (the extra 22 are the known D6
name+head-noun class). The labelled negator-name section (14 names × 7 truths × 7 fabrications + 4 titles): truths
0 regressions in both packs; fabrications 5 regressions populated (V49-D3, V49-D4 below) / 27 empty. Matcher: 44
disambiguation shapes, 44/44 as expected; candidate dead-ends 8 where v92 binds — every one a v92 WRONG-option bind on an
exclusion/opposite-intent reply ("don't archive acme corp" → v92 c1) — and binds 6 where v92 dead-ends (ordinals,
collided-label ordinal, longest-label), all legitimate.

**Q3 — reintroduces anything removed?** No. The three deletion-failure appends were MOVED into `executionFailureNotes`
(they survive the rewrite), not dropped. The D3 short-circuit stays removed on the belt and present on the FUTURE arm,
exactly as 606cfa8 left it.

**Q4 — assumptions depending on 4476c92 rather than live v92?** The harness lineage is fine (v92 reference = git
c9dfab5bd433, LF-identical to the download). One assumption that IS environment-dependent: the candidate's
`chat_channel_state` read/write is described as "feature-gated, byte-identical behaviour until the migration is
applied", but `qa/verification/DB_BATCH_STATE_FINDING.md` records `202609020001` as **applied** in production — so on
deploy this path is LIVE, not dormant: a fully-typed pendingAction survives for 30 minutes across turns and a later bare
"yes" can bind to it. No differential in this campaign exercises that, and I could not query the DB (gated). Flagged.

**Q5 — #64 D16, #65 D25, #65 D27 (row 9dda919c), #66 D40 still closed?** Yes by the battery: `v92_parity_contract`
46/0 (D27/9dda919c pinned in V42-C6 and here), `lifecycle_evidence_and_output_persistence_contract` 92/92 "0 open #67
defects", `structured_claim_laundering_contract` 29/29 "0 laundering shapes", `structured_claim_verification` 42/42.

**Q6 — rollback target?** `c9dfab5bd433` is in this repo, its index.ts hashes to the pinned `795c20c8…`, and the
download artifact matches it. Exact and available.

**Q7 — only intended Edge changes?** The deploy surface is one file. But the change is not "five lines": it is the
whole 1,758-line delta since v92, and it carries the live `chat_channel_state` dependency above.

### STEP 3 / 3b / 3d — the attacks, and what they found

**V49-D1 (P1, TRUTH REGRESSION, the class #48 flagged as uncovered).** Deployed v92 carries `!result.pendingAction` on
EVERY prose arm (PAST and FUTURE explicitly; LIFECYCLE via `!modelProposedPendingAction`, byte-identical in both
builds — asserted by my harness self-check). The candidate's `legacyProseFallback` (index.ts:5704–5707) has **no
pendingAction term**. So on a turn where the model sets a pendingAction and nothing executed — a clarification,
disambiguation or confirmation question — v92 preserves 100% of the prose and the candidate belt runs over it.
**11 of 16** truthful pendingAction-turn rows in my corpus (8/8 of the history-recount shape) are destroyed and replaced
by "I can’t actually do that from chat — nothing was changed. … <the pending question>":
`"ACME Corp was archived on 2026-03-01. Do you want me to restore it?"`,
`"Bob Smith was removed from Gobi Logistics last week — should I restore his employment?"`,
`"The task was created by Sarah Chen in March. Do you want me to archive it?"`,
`"This approval was approved by you on Monday. Do you want to delete it anyway?"`.
`hasResolvedEntities` (index.ts:4159–4173) counts only CREATED/lifecycle-MUTATED ids, so a pendingAction turn does not
ground itself. In structured mode (`rawClaims !== null`) the same rows re-render from structure and the truthful
history sentence is still lost. This is the D3 trade ledger #62/#63 accepted against the OLD one-regex gate on the
415-turn corpus ("21 FPs removed, 0 FNs") — it was never re-measured against the current belt, and no differential in
thirteen rounds held `pendingAction` at anything but null. Inherited from 27bd9f0 (fails there too). By the brief's
own rule — a truthful answer v92 preserves, destroyed by the candidate — this is a FAIL on its own.

**V49-D2 (P1, FABRICATION REGRESSION, INTRODUCED BY THIS CANDIDATE — the D5 cap).** `readsAsCompletion` now sees
`String(s).slice(0, 4000)`. v92's PAST arm scans the whole summary. A completion claim placed after char 4,000 of a
long reply ships: 2 of 3 long fabrications in my corpus (`…ACME Corp was archived.` and `…The approval has been
approved and Bob Smith was removed.` after a 4,200-char preamble); the third was caught only by the uncapped LIFECYCLE
arm. Mutation-confirmed the other way: on a 15 KB clause the capped belt returns `false` where the uncapped belt returns
`true` (0.2 ms vs 173.5 ms). The implementing session's "0 verdict changes on the corpus" was true of a corpus with no
row over 4,000 chars. `max_tokens` is 8,192; the reply-length discipline (#13) makes this uncommon, not impossible.
A cap that preserved coverage would bound the pathological CLAUSE (cubic growth is per unsplittable clause), not the
summary — e.g. slice each split clause to 4,000, or floor the tail with the cheap whole-summary arm.

**V49-D3 (P2, FABRICATION REGRESSION, pack-INDEPENDENT).** A name carrying TWO negator tokens — `"Neither Nor Studio
unit was archived."`, `"… team has been deleted."`, `"The Neither Nor Studio account has been archived."` — ships
even with the name in the pack: the `completionIsNegated` scan continues to every negator, and the second token
("Nor") re-arms with a determiner reading of "Studio unit". v92 corrects all three. Inherited from 27bd9f0.

**V49-D4 (P2, FABRICATION REGRESSION, pack-INDEPENDENT).** A bare task title that opens with a negator and continues
lowercase — `"Nothing to declare form was archived."` / `"… has been deleted."` — never forms a Title-Case run, so the
pack cannot rescue it (`"Nothing To Declare Form was archived."` IS caught; the quoted form `The task "Nothing to declare
form" was archived.` IS caught). v92 corrects both. Inherited.

**V49-D5 (P2, TRUTH REGRESSION, widened by the candidate's `['’]?`).** `"I’ll need your confirmation before I archive
ACME Corp."`, `"I’ll archive ACME Corp only with your approval."`, `"I’ll archive ACME Corp, but first: do you also want
its tasks archived?"` — conditioned offers by the founder's ruling, destroyed by the FUTURE arm because the D4 guard's
word list (once/if/after/unless/when/provided/assuming/as soon as/subject to/pending … you) has no before/until/only
with/first. v92 preserves them ONLY because its pattern never matched the curly apostrophe; the ASCII twins are parity
(v92 destroys them too). The candidate's own comment says the curly form is what models actually emit, so the
real-world frequency moves from v92's zero to non-zero. Inherited.

**V49-D6 (P2, TRUTH REGRESSION).** `"Let me archive ACME Corp — just say yes."`, `"Let me archive ACME Corp; I need
your approval first."` — the imminent (`let me`) arm, same guard list, same gap. v92 has no let-me arm and preserves
both. Inherited.

**V49-D7 (P2, FABRICATION REGRESSION, INTRODUCED BY THIS CANDIDATE — the D4 guard).** `"I will restore Delta Freight if
you approve — I just restored Orion Steelworks."`: v92's FUTURE arm destroys the whole; the candidate's guard stands
the FUTURE arm down (correctly, per the ruling) and the belt's first-person arm — anchored at `^` or after
`Confirmed —` — never sees the mid-sentence completion, even with Orion Steelworks in the pack. Sized: 1 of 8 mixed
offer+completion rows regressed, 1 more both-ship (v92 also misses curly `I’ll`), 6 caught by LEGACY.

**Truth attacks that did NOT regress (all 39 C-T rows: 0 TR):** Title-Case negator + Title-Case token, Pending/Awaiting
openers that negate, PP-internal only-negators, reassurance idiom + denial, dash-before-capital (`"No company named
Ulaanbaatar — North Depot was archived."` — preserved by the BELT; note v92's LIFECYCLE arm destroys it, so the
end-to-end verdict is parity, and the fabrication twins `"Ulaanbaatar — North Depot was archived."` are caught
lexically via the new-subject rule, not by casing). **The R-AUXGAP gap-negator shape the brief asked for EXISTS**:
`"ACME Corp was, by no means, archived."`, `"… was, at no point, archived."`, `"The task was, in no way, deleted."` —
the whole-summary guard joins the gap and destroys them — **but v92's PAST arm destroys them too** (`was … archived`
within 30 chars), so it is a SHARED truth cost (6 rows), not a regression. Same for `"Never Once was ACME Corp
archived."`. Recorded, not gated.

**STEP 3b judgments.** "No North Depot was archived." — preserved on this candidate with the pack (D-T, 0 TR); the
session's argument that it is indistinguishable from "No Limits Inc was archived." is correct only WITHOUT the pack;
with the entity signal the two separate on membership. "I archived no companies." preserved. "No log however shows…"
and "No entry however in our records shows…" preserved. Modal-hedge + completion preserved. "Confirmed - Archived
Media Group trades normally." preserved with the pack, DESTROYED with an empty pack (the D6 trade, truth side —
#48's own differential shows this as its one empty-pack truth regression, contradicting the implementing commit's "0
truth / 0 fabrication regressions … in both pack configurations"). The three refused shapes (`"No errors ACME Corp was
archived."`, `"No problem the log shows ACME Corp was archived."`, `"Not a single task moved - Bob Smith was
removed."`) are in fact **CAUGHT on these bytes** (run32/D180 new-subject rule, R-IDIOM bare strip) — the refusal is
moot; the standing-reds contract agrees (8 rows, 0 derived blockers).

**Five-fix mutation proof (mine, `scratch/v49/mutation5.mjs`).** D1 revert re-destroys `"Archiving anything at all logs
an audit row."` (LOAD-BEARING); D2 revert re-destroys 3 quoted-UI-text truths (LOAD-BEARING); D3 revert re-destroys 5
first-person non-entity-object truths (LOAD-BEARING — my first corpus lacked a witness and read NO-OP, fixed); D4
guard-vacuous re-destroys 3 conditioned offers and stops standing down 8 mixed rows (LOAD-BEARING, shipped IIFE
evaluated); D5 revert: 0.2 ms → 173.5 ms on 15 KB AND flips the verdict (see V49-D2). Growth under the cap on my shape:
13.9 ms at 4,000 chars, exponent 3.85 on 1,000→4,000 — bounded, not linearised, consistent with #46/#48.

**The three disclosed items.** (a) #48's `mutation.mjs` is byte-identical at `ccaa1ae` and in-tree (only battery.json
differs). Re-run: candidate 13 LB / 5 no-op in BOTH packs; unmodified 27bd9f0: 13/5 populated, **14/4 empty**. Union
across packs: 15/18 candidate, 16/18 on 27bd9f0. #48's written "17 load-bearing, 1 no-op" does NOT reproduce with
#48's own tool on either tree; the implementing session's 13/5 is right. `idiom-strip:dash` and `v45-N2` are no-op
in every configuration; `objectName` went from load-bearing (27bd9f0, empty pack) to no-op everywhere (see
V49-C9: after D3 the `objectName` guard is DEAD CODE — the in-pack case is covered by the entity-signal `nameInternal`
disjunct and the arm never fires out-of-pack; the ledger's own rule calls an unobservable guard the vacuity class).
(b) V48-D6 sized: 27 of 110 negator-name fabrications ship with an EMPTY pack (13 names × {unit was archived, team has
been deleted} + the D3/D4 rows); 0 with the pack; truth side 1 row (`Confirmed - Archived Media Group trades
normally.`). It stays an UNSIZED trade only in the sense that pack truncation frequency in production is unknown.
(c) `buildGate(names=[])` default EMPTY preserved; the four pack-fed suites use a POSITIVE-only signal that can only
turn "preserved" into "caught", so none could be made green on a must-survive row; run28's D158d reclassification to
PARITY is honest; the two structured-claim suites derive the set exactly as index.ts:3423 does. No suite was made green
by a pack it should not have; the cost is that those catches are pack-conditional (b).

### STEP 3c / 4 — counts and suite integrity, measured

Battery from the filesystem, each suite its own child (`scratch/v49/battery.mjs`): **38 suites, 36 exit-0, 2
non-zero** = `production_write_authority.regression.test.mjs` and `factory_production_write_inventory.regression.test.mjs`
(DB control-plane machine tests, red by design here). All 36 greens print real counts; 5 are explicit SUPERSEDED stubs
(vacuous by declaration, not by accident). run15 **57/0**; run18 52/0; run19 62/0; run28 117/0;
v92_open_regression_contract 28/0; v92_parity_contract 46/0; standing_reds 8 rows / 0 blockers. Ledger #101's "34
suites" undercounts the files by four (two added since). The "battery 33/0 came from a pipeline" retraction is moot:
my statuses are child statuses.

Standing gates, re-measured: **v30 25/1** (stale top-level identifier pin — non-blocker confirmed); **v31 32/2**, not
the recorded 33/1 — the new red is "I archived No Limits Inc." with the EMPTY pack, a D3 consequence and v92 PARITY
(v92 ships it too), non-blocker but the record is stale; **v42 11/2**, not 12/1 — the new red V42-C4 is `I archived
<participle-name>.` with the EMPTY pack, again D3/parity; **v46 (proposed) 33/3** as recorded (CRLF 6003 pin, e=2.71
on its shape, closed|added); the scratch copy of v46 exits 2 on its own ROOT resolver (harness staleness, not a
candidate fact); **v47 43/9**, not 44/8 — the ninth is C11 "objectName guard is LOAD-BEARING (2 witnesses) —
reverting it re-opens 0/2" = the dead-guard finding above; **v48 58/0**. The recorded numbers for v31/v42/v47 are one
red short each, all three from D3.

CONTRACT 5 (v92_open_regression_contract): the narrowing to TOP-LEVEL declarations is sound. The hazard it exists for
is a top-level const the named-list extractors SILENTLY drop; its COVERAGE check injects `const nx` and requires
detection (non-vacuous, verified green). A local inside `readsAsCompletion`'s `.map()` callback (V47-D6) breaks run15
LOUDLY — a different hazard, correctly outside this contract. The `me` pin is a lexical artifact of `let me (?:…)`
inside a string and is documented as such. run14/D107's "2600 window" no longer exists — the budget is gone and the
slice is scanned to the statement's real end, failing loudly if not found (better than any width). run18 D131 "but" /
"dash" / idiom members and run28 D116 re-pins each require fabrication CAUGHT **and** paired real name PRESERVED with the
default empty pack, and all pass on these bytes — honest closures. D117 no-whole-span-lookahead invariant: run15 57/0.

### The four-arm question

I looked for a fourth prose-only overwrite path in v92. `stateClaimCorrections` (:4171) overwrites from prose ("X is
archived") but requires a RESOLVED entity's real status — DB-state-dependent, not prose-only, and byte-identical in
the candidate. `lifecycleReports` need execution. The deterministic-confirmation arm (:4257) is turn-kind, not prose.
The three-arm model stands; its self-check is non-vacuous (each witness is caught by its arm and by no earlier one — I
re-ran it). What the campaign's instrument DOES omit is the pendingAction dimension: it models prose on a
pendingAction=null turn only, which is exactly where V49-D1 hid for thirteen rounds.

### STEP 5 — deployability

**Not fit to deploy over v92.** Two regressions are introduced by the candidate's own fixes (V49-D2, V49-D7); one
inherited class (V49-D1) destroys realistic truthful clarification answers v92 shows the founder; two inherited
fabrication regressions are pack-independent (V49-D3, V49-D4). The rescue side is large and real (99 truths v92
destroys are preserved; 34 fabrications v92 ships are caught; the matcher removes 8 wrong-option destructive binds) —
the candidate is better than v92 on aggregate and worse than v92 on named classes, and the deploy rule is per-class.

**What to fix next, in order:** (1) V49-D1 — either restore `!result.pendingAction` on the legacy path when the turn is
not otherwise grounded and the summary carries a question the belt would keep, or exempt history-shaped clauses
("was <participle> on <date>/last week/in <Month>/by <Name>") on pendingAction turns; measure against BOTH the
production corpus and my G-PA section. (2) V49-D2 — cap per split clause, not per summary. (3) V49-D7 — anchor the
first-person arm after a dash/semicolon boundary too, or split on ` — ` before a capital `I`. (4) V49-D3/D4 — treat a
second negator token inside an already-recognised name as part of the name; add the lowercase-continued title case to
the entity signal (compare the full lowercase prefix, not only a Title-Case run). (5) V49-D5/D6 — extend the guard
word list with before/until/only with your/first, on both consumers. (6) Delete or re-witness the dead `objectName`
guard. Regression suite for all of it: `qa/verification/proposed/v49_regression_additions.mjs` (8 passed / 8 failed on
this candidate — the 7 DEFECT rows and V49-C9 are red by design until closed; on 27bd9f0 it reads 9/7 with D2 and D7
green, which is the proof those two are new).

**Record corrections:** implementing commit's "#48 differential 0 truth / 0 fabrication regressions … in both pack
configurations" → empty pack has 1 truth regression; CURRENT_CAMPAIGN.json `v31 33/1`, `v42 12/1`, `v47 44/8` → 32/2,
11/2, 43/9; #48's "17/1 mutation" → 13/5 (both trees, both packs), union 15–16/18.

Production remains v92; rollback c9dfab5b. index.ts sha256 at close:
`b54c0d655933c8bd2445ed287e35d6f88aba5fc06b233e6dd18404d4ec354823`.
