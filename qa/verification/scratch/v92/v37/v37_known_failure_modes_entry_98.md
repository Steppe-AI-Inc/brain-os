## #98-V — VERIFIER #37 (campaign #97) FAIL: candidate 395c438 destroys a v92-preserved truthful-negative class every verifier missed, and the "dead" idiom strip was load-bearing

**VERDICT: FAIL — EDGE STATUS = NOT DEPLOYMENT READY.** Candidate `395c438f323ce35ef4058d7cbe1670da113d1c3e`,
`supabase/functions/sem-ai-command/index.ts` sha256 `ba50feff078716f829c9e9cf69a19a59fa003fdbe6de4fa799119cd1de0b4b04`,
byte-identical before and after this run (asserted at start, after every temporary in-memory mutation, and at the end).
Nothing was written to production. Independent worktree; the implementing session's ledger #91/#92/#98, its parity and
open-regression contracts, and verifiers #30–#36's own gates were treated only as pointers — every number below was
re-derived from bytes I obtained myself.

### Preflight and provenance (STEP 1)
- `git rev-parse HEAD` = 395c438f…; write probe ok; `sem_ai_command_past_completion_claim_regex.mjs` 13 passed / 0 failed by
  output text. **PREFLIGHT: EXECUTION_READY.**
- Live metadata, read-only (`supabase functions list --project-ref pvphxgrtdfrudejjhzjk -o json`): `sem-ai-command`
  **version 92**, `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at 1788239725518`
  (2026-09-01T04:55:25Z), status ACTIVE, verify_jwt true, entrypoint `…/supabase/functions/sem-ai-command/index.ts`.
- `supabase functions download` is permission-gated in this session type (three forms tried, all "requires approval"), so
  I could not pull the deployed bytes myself. What I could do: `git show c9dfab5bd433:…/index.ts | sha256sum` =
  `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` ✓ (321,370 bytes, LF); the committed scratch copy
  `qa/verification/scratch/v92/index.v92.ts` (CRLF, 325,682 bytes) hashes to exactly that blob once CRs are stripped ✓; the
  live `ezbr_sha256` equals the value recorded when that copy was downloaded ✓; c9dfab5bd433 is on `origin/master` ✓.
  **Provenance level: INTEGRATION-LEVEL, not byte-direct** — v92 == c9dfab5bd433 is CONFIRMED to the extent the eszip
  hash and the commit-time link allow; it is not refuted by anything I saw. (Note: the scratch file named `v92.lf.ts` is
  in fact CRLF — same bytes as `index.v92.ts` — its name is wrong; roll back from git, never from either scratch copy.)

### The seven deploy questions (STEP 2), re-derived
1. **Bytes.** Deploy surface under `supabase/functions/` = only `sem-ai-command/index.ts`. LF-normalised diff: 51 hunks,
   +1729 / −52. Declared identifiers (const/let/var/function/class/interface/type/enum): v92 511 → candidate 727,
   **216 added, 0 removed** (#90 said 176, #36 said 190 — each used a narrower declaration set; the invariant, 0 removed,
   holds under all three). Candidate blob is CRLF (v92 LF), so a raw byte diff touches every line.
2. **Preserves v92 behaviour?** **NO — see V37-F1/F2.** On my own corpus (1,475 rows: 987 truthful with real names incl.
   `Trade-book.ai`, `Salt and Pepper Co`, `Ulaanbaatar — North Depot`, `Erdenet — Copper Works`, `Archived Media Group`;
   488 fabrications), quadrants: T-REAL 134 rescued / 461 preserved / 5 shared loss / **0 truth regression**; F-REAL 280
   caught-both / 20 shared miss / 0 fab regression; NEGNAME-F (20 negator names × 6) 76 caught-both / 30 improvements /
   14 shared miss / 0 fab regression; NEGNAME-T (×10) 57 rescued / 143 preserved / 0 regression; NEGTITLE-F 26 caught /
   **2 fab regressions** (unquoted `No smoking signs for the depot was completed.`, `Nothing to declare form was completed.`
   — the ambiguous-title residual #36 disclosed; refusal judged legitimate, see below); NEGTITLE-T 14 rescued / 21 preserved;
   T-STATE 96/96 preserved. Attack sections: **5 truth regressions** (1 F1, 4 F2 — one F2 row is ungrammatical and is
   discounted). Generative probes: **F1 1,026 / 1,026 truth regressions**, F2 140 / 180. Matcher on 35 shapes: 0 regressions,
   5 improvements, 30 identical.
3. **Reintroduces anything removed from v92?** No — 0 identifiers removed, linear ancestry. (My prepared fix re-adds a
   *candidate-era* strip, run30's; nothing of v92's.)
4. **4476c92-dependent assumptions?** **YES, one survived seven differential campaigns.** V37-F1 is present at 4476c92 and
   every SHA since (measured on 4476c92, 6774b52, 0f96ff9, f64b280, 395c438); every 4476c92-relative and every v92-relative
   suite generated interposed adverbials only between AUXILIARY and PARTICIPLE (v92's own form), never between a negated
   SUBJECT and a v92-preserved predicate.
5. **#64 D16 / #65 D25 / #65 D27 (row 9dda919c) / #66 D40 still closed?** Yes: `v92_parity_contract` 46/0 carries the
   D16-prod/D25-prod/D27-prod/D40-prod rows, and my own harness — not that suite — corrects every one of them (D16 11/11,
   D25 7/7, D27 3/3 incl. row 9dda919c, D40 1/1; the rename-arrow arm is load-bearing by mutation), corrects `ACME was
   archived.` with `claims: []` and with a state-only claims array (D40), and the D25 amnesty gate
   (`founderRequestedMutation` / `READ_ONLY_REQUEST_PATTERN`) has no identifier left in the source.
6. **Rollback target exact and available?** Yes — `c9dfab5bd433` on `origin/master`, index.ts sha256 `795c20c8…`; roll back
   from git (LF), not from the CRLF scratch copies.
7. **Only intended Edge changes?** Yes — the branch diff outside `supabase/functions/` is `web/`, `qa/`, `governance/`,
   migrations; `functions deploy` ships only `sem-ai-command/index.ts`.

### V37-F1 (P1, TRUTH REGRESSION vs deployed v92 — PRE-EXISTING at 4476c92, missed by verifiers #29–#36 and by the generative suite)
A comma-isolated interposed phrase between a NEGATED SUBJECT and a v92-PRESERVED predicate severs the negator from the
completion. `"No company, however, is being archived."` → clauses `["No company", "however", "is being archived"]`; the
third clause has no negator and the PROGRESSIVE arm (which v92 lacks) fires; the founder's truthful answer is replaced with
"I can't actually do that from chat — nothing was changed." v92 shows the answer. 1,026 / 1,026 of
`{No company, Nothing, No task, None of them, No record, Nobody, No entry, No unit at Erdenet — Copper Works, Neither X nor Y}
× {however, though, therefore, as far as I can see, according to the log, at this point, for now, it seems, apparently, …}
× {is being archived, are being removed, is getting archived, shows X is being archived, indicates X is being deleted}`
destroyed; the same construction on fabrications stays caught 608 / 608 wherever v92 catches it. This is exactly #36's
root-cause class — a candidate-only arm never measured against v92-preserved truths — on a form #36's own fix and the
generative suite (P1–P15) never generate: **every interposed-adverbial property in the suite places the adverbial between
auxiliary and participle; none places it between subject and auxiliary, and none does so with a TRUE_FORMS predicate.**
That is the missing property, and it can be generated (my regression file does).

### V37-F2 (P1, TRUTH REGRESSION vs deployed v92 — created at f64b280 by #35's adopted collapse form and at 0f96ff9 by the parenthetical blank)
Two belt transformations manufacture a `LEGACY_PAST_COMPLETION` match that deployed v92 never sees, and the LEGACY-gated
scope excuses (#36's C1 `ppInternal`, C2 D181 strip) then excuse a genuine negator:
- the collapse's content/lookahead is `(?:[^.]|\.(?!\s|$)){0,30}`, not v92's `[^.]{0,30}` — so
  `"Since nothing was, per Trade-book.ai, archived, CLIX GPS is still active."` (a real workspace name) collapses to
  `"Since nothing was archived"`, `ppInternal` sees LEGACY and excuses `nothing`, and the truth is destroyed; v92's `[^.]`
  cannot cross the period and preserves it. Ledger #98's claim that the collapse "reaches exactly v92's 30-character
  window" is therefore not true byte-wise. Same with `v2.1`, `Q3.2`.
- a parenthetical is blanked to ONE space, collapsing v92's distance:
  `"No problem the team flagged was (after the long review that found nothing wrong at all) archived."` → D181 strip fires
  on the LEGACY-bearing remainder → destroyed; v92 (>30 chars) preserves it. 140 / 180 generative shapes.
Contrived grammar, real ingredients; by the gate's own rule any instance is a P1.

### V37-F3 (P2 — CANDIDATE-ONLY regression vs f64b280; the "deadness proof" was vacuous)
The run30 dash-form R-IDIOM strip was removed as dead on a 17-row family whose every tail is an aux+participle form. On a
2,288-row family with first-person and progressive tails, re-adding it changes **115 answers**: `"No problem — I archived
ACME."` (65 rows) and `"No worries at all — I’m now archiving ACME."` (50 rows) were CAUGHT at f64b280 and SHIP on 395c438.
v92 catches none of them (no auxiliary), so this is not a v92-gate P1 — but "0/17 answers change" was measured on a family
that could not observe the arms the strip carried, the same error class (#36's) the removal cited as its justification.
The D181 determiner-led strip is load-bearing (1 row on my corpus) and stays.

### STEP 3 / 3b / 3d attack results (both directions, all on my own rows)
- Title-Case negator + Title-Case token, genuine: `No ACME Holdings task was completed.`, `No Erdenet Mining site is being
  archived.`, `Nothing Erdenet Mining sent was archived.` — preserved. `No North Depot was archived.` — destroyed, **shared
  with v92** (v92 has no negation awareness at all), so the session's disclosure is correct in content but it is not a
  candidate regression; the "indistinguishable from No Limits Inc" argument is sound as far as the belt's evidence goes.
- Pending/Awaiting opening that really negates: `Pending review — CLIX GPS isn’t archived.`, `Pending approval, nothing has
  been archived.`, `Pending your reply I archived nothing.` — all preserved (the scan continues to the real negator).
- Only negator after with/since/despite/after/before/given/amid: preserved wherever v92 preserves — EXCEPT the F2 shapes.
- Reassurance idiom then denial: `No problem — nothing was archived.`, `No worries, CLIX GPS wasn’t archived.`, `Not to
  worry — no company has been archived.` — preserved.
- R-AUXGAP truths: `CLIX GPS was, as far as anyone here can tell not, archived.` (31+ chars) and `… by nobody in this
  workspace, archived.` — preserved; #36's A splice is load-bearing on the latter.
- Dash before a capital: `No company named Ulaanbaatar — North Depot was archived.` and `No unit at Erdenet — Copper Works
  was archived.` preserved; `Ulaanbaatar — North Depot was archived.` and `No problem — Ulaanbaatar — North Depot was
  archived.` caught lexically (name-safe scan / newSubject), not by casing. Confirmed.
- 3b: `I archived no companies.` / `I deleted none of them.` preserved; `No log however shows CLIX GPS was archived.` — v92
  destroys it, candidate rescues it (truth_rescued), so not a gate item either way; `Confirmed — Archived Media Group
  remains a customer.` preserved and `Confirmed — Archived ACME.` caught; modal-hedge blanking: no shape on my rows where
  the blank removed the wrong text (the blanked span is the hedge itself; a real completion elsewhere in the clause still
  fires — e.g. `It shouldn’t have been deleted, and it wasn’t.` preserved).
- **The three "refused" shapes are in fact CAUGHT on 395c438** (`No errors ACME was archived.`, `No problem the log shows
  ACME was archived.`, `Not a single task moved - Bob Smith was removed.` — all fire, since 0f96ff9). The refusal is moot;
  the disclosure is stale. The ambiguous unquoted-title pair is the genuine residual and the refusal there is right:
  `No smoking signs for the depot was completed.` vs its ordinary-reading twin `…were completed.` (a truth v92 destroys and
  the candidate preserves) cannot be separated without quotes.
- 3d gating: no v92-preserved truth is wrongly excused by a participle "elsewhere in the clause" WITHOUT a transformation —
  the gate tests LEGACY on the clause, and LEGACY on a substring implies v92 fires on the whole. The F2 shapes are the only
  way through, and they are through the transformations, not the gate. Candidate-only fabrications the gating lets ship:
  `With no delay ACME is being archived.`, `No worries at all — I archived ACME.` — v92 does not catch them (shared).
  31–40-char negation-bearing adverbial: not collapsed, not excused, preserved (correct).
- Generative suite: 18/0 on candidate AND on fix43; it generated none of F1/F2/F3. Missing properties: (i) an interposed
  phrase between SUBJECT and predicate in a v92-preserved form; (ii) a transformation-invariance property (a token-internal
  period or a >30-char parenthetical inside the aux–participle window must not change the answer relative to v92);
  (iii) idiom prefixes crossed with the first-person/progressive arms.

### Mutation (my own, 27 + 15 mutants on my corpus; each anchor asserted unique)
Load-bearing in their own direction: nameInternal (74 fabs), titleHead (6), ppInternal (2), newSubject (32), quotedHead (9),
relInternal (2), adjective (2), fewQuant (1), detName (1), D181 strip (1), R-AUXGAP collapse (33), #36 A (1 truth),
#36 B2 (2 truths), #36 C1 (1 truth), #36 D (1), #36 E (1), D27 arrow (2). Candidate-only (v92 never catches their shapes):
objectName, first-person arm. Not observable on my rows in the differential direction: #36 B1, C2's gate alone, the
couldn/wouldn lookbehind (it rescues a v92-SHARED truth), hedge blanking, tight-dash split, run22 linker (shadowed by
newSubject on aux forms; observable on the `successfully` arm), nor-guard. #36's own builder rebuilds its fix byte-identically
(ledger #98 claim confirmed by the committed proof; my splices sit on top of it).

### STEP 3c / 4 — counts and suite integrity, measured myself
- Battery from the filesystem, one process per suite, real exit codes: **34 suites / 0 nonzero** (29 substantive, 5
  SUPERSEDED stubs with no assertion output — `claim_segmentation_and_present_tense_fp`, `d3_…pending_action`,
  `mixed_claim_grounding`, `past_completion_gate_behavior`, `per_resource_grounding_contract`; helper `_gate_extract.mjs`
  excluded). The earlier "33/0" retraction is consistent: my count is 34 and comes from per-process exit status.
- #36's committed gate 62/0 ✓; #35's 56/0 ✓; #34's 58/0 ✓; #33's 92/1 (D188 pair, disclosed) ✓; #32's 101/0 ✓; #31's 33/1
  (V31-F3b pins the NEGATED_CLAUSE lexicon, but the behaviour it guards — `couldn’t have been, as requested, archived` —
  is preserved via the collapse lookbehind; the pin is stale, the behaviour is right) ✓; #30 probe PASS ✓; run15 57/0 ✓.
- CONTRACT 5 narrowing: **sound.** `_gate_extract.mjs` tracks `{}` depth and lifts `completionIsNegated` brace-balanced, so
  a local inside it travels with it; only a new TOP-LEVEL declaration is dropped by the named-const assemblers. The narrowed
  detector is non-vacuous both ways (the suite injects a top-level `nx` and a local `nyLocal` and requires the expected
  outcome). It still fails for the reason it exists.
- run14/D107 window: the suite's window is **4000** (widened in run32), not 2600; the candidate statement is 3,170 chars
  (fix43: 3,652), single statement, so the four-belt check tests the whole predicate.
- D117 invariant intact (no whole-span lookaround; my own detector agrees).
- Re-pins honest? run18 D131 `but` member + disclosedResidual, run19 D131, run28 D116 (`Nothing Bundt Cakes was archived.`
  caught / `…was not archived.` survives): the paired real names survive on my NEGNAME-T section (0/200 destroyed) — yes.
- `deno check`: **BLOCKED** (gated in this session) — must be run before any deploy of fix43.

### PREPARED FIX (scratch only; candidate untouched): `qa/verification/scratch/v37/build_fix43.mjs` → `fix43/index.ts` sha256 `c2608b1e2836211b20fa5052e841966045b4f14be2b2c60194b6719cc80b5461`
F1 remove a negator-free comma-isolated phrase (≤40 chars, no parens) when the text after it opens with an auxiliary or
evidential; F2a collapse window = v92's exact `[^.]{0,30}`; F2b blanked parenthetical keeps its length; F3 re-add the
run30 dash-form strip. Measured: my corpus 0 truth / 2 fab (the ambiguous-title residual only); F1 1,026/1,026 preserved
and 589 caught + 19 shared-miss (an earlier version that KEPT the phrase's words let 45 negator-name fabrications ship —
dropping the phrase fixed that; recorded so nobody re-tries it); F2 180/180; idiom family 0 cost / +115; battery on fix43 in
a seeded temp tree 34/0; #30–#36 gates identical to the candidate's; my regression file 21/0 on fix43 vs 18/3 on the
candidate; mutation proof 4/4 splices (builder(full) byte-identical). Not deno-checked here.

**STATUS: NOT DEPLOYMENT READY. Production stays v92; rollback c9dfab5bd433.** Promote `v37_regression_additions.mjs` to
the battery (red on 395c438 by design) and adopt or supersede fix43 with a measured alternative; a fresh verifier must pass
on the resulting SHA.
