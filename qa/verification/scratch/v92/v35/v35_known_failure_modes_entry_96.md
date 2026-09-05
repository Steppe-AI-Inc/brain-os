## #96-V — verifier #35, independent v92-differential of candidate `0f96ff93` (index.ts `b1f54b07…`): FAIL — NOT DEPLOYMENT READY

**Scope.** Production-deployment gate, sixth round: candidate `0f96ff93bc17c6277c00ef0fca2b82dffde42d70`
(index.ts sha256 CRLF working tree `b1f54b072cc41312d25248c2f2334545eafbb1aa09e0162564f86b9d9a720a23`, LF
`e2b0ba94…`) against DEPLOYED `sem-ai-command` v92. Isolated worktree; ledger #91–#96, `v92_parity_contract`,
`v92_open_regression_contract`, `v30_open_regressions_probe`, `v31…v35_mutation_proof` were read as pointers only;
every number below was re-measured from bytes this session obtained itself. Artifacts:
`qa/verification/scratch/v92/v35/` (harness, battery runner, generative probe, identifier delta, prepared fix,
regression additions) and `qa/verification/proposed/v35_PROMOTION_NOTE.md`.

**Preflight:** EXECUTION_READY (HEAD = candidate; scratch write ok; regex suite 13/0). SHA discipline: the candidate
index.ts was never edited; sha256 asserted `b1f54b07…` at start, after every scratch build and at the end.

**STEP 1 — provenance, stated at its real level.** `supabase functions list` (this session): v92, ACTIVE,
`ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at 1788239725518` =
2026-09-01T05:15:25.518Z. `gh run list` (this session): "Deploy Supabase Edge Functions" run 33472871764, headSha
`c9dfab5bd43346bad501ab44d7bfbc5211e90ed5`, created 05:15:04Z, completed 05:15:30Z, success; **no later deploy
run exists**. git `c9dfab5bd433` index.ts sha256 (LF) = `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`;
the committed scratch copy `index.v92.ts` is CRLF (raw `49d53882…`) and LF-normalises to the same `795c20c8…`.
`supabase functions download` was **permission-gated in this session (two attempts, incl. `--workdir` into scratch;
the prior #35 attempt's empty `v35_download/` shows the same wall)**, so the deployed-bytes link is
**INTEGRATION-LEVEL (metadata + CI timestamp/headSha correlation), not byte-direct**. It CONFIRMS ledger #90's
provenance at that level; nothing refutes it. No P0.

**STEP 2 — the seven deploy questions.**
1. Bytes: deploy surface = `supabase/functions/sem-ai-command/index.ts` ONLY. The raw `git diff --stat`
   (+5989/−4312) is a CRLF artefact (`core.autocrlf=true`; the v92 blob is LF); with `--ignore-cr-at-eol` the real
   delta is **+1729 / −52 in 51 hunks**. Identifier delta RE-DERIVED: **top-level 57 → 57 (0 added, 0 removed);
   any-depth 497 → 696 (+199, −0)**. 95 linear commits (0 merges), 863 files. Ledger #90's "176 added" was wrong
   by this measure; #92 was right to leave it for re-derivation.
2. Preserves v92 behaviour? **NO** — see the classes below. Own corpus: 521 truthful negatives with real names
   (494 v92-preserved, 27 v92-destroyed-but-rescued) / 253 fabrications (all v92-corrected), incl. a labelled
   negator-name/title section (97 truth rows, 59 fabrication rows, both directions). Quadrants (end-to-end, ungrounded
   turn, claims null AND []): truth — both preserve 492, **TRUTH REGRESSION 2**, rescued 27, shared 0; fabrication
   — both catch 239, **FABRICATION REGRESSION 12**, candidate-only 2, shared 0. Negator-name section: 0 truth
   regressions, **12 fabrication regressions**. Matcher: 38 shapes, **0** v92-DEAD-END→wrong-SELECT regressions,
   19 improvements.
3. Reintroduces nothing removed: 0 identifiers removed; the 52 deleted lines are all replaced-in-place
   (`Confirmed — ${label}.`, three `result.summary = …` full-replacements, the prose-era gate, `?.` indexing).
4. 4476c92-dependent assumptions: the two generative "truth" properties and every "v92 destroys it too" argument
   rest on the was-<participle> form; where the form is one v92 PRESERVES (is being / had been / wasn't / has not
   been / a token-internal period) the argument fails — that is exactly where V35-F3/F4 live.
5. #64 D16 (12 shapes), #65 D25 (no gate ids; 4 shapes caught), #65 D27 (row 9dda919c, both arrows), #66 D40
   (`claims:[]` arms) — **all still genuinely closed** (re-measured, 25/25).
6. Rollback target: `c9dfab5bd433` exact, ancestor of HEAD, sha `795c20c8…`, copy committed — available.
7. Only intended Edge changes: yes for the deploy surface; the rest of the 863 files are qa/docs/migrations/web.

**FOUND — six classes, four of them P1, none disclosed before this round.**
- **V35-F1 (P1, FAB REGRESSION, created by run30 and narrowed twice without changing its nature).** The R-AUXGAP
  guard is a bare negator-LEXICON test on a sentence prefix (verifier #34's "since the last sentence boundary,
  capped at 160"). Every negator the clause pipeline knows how to EXCUSE disarms it: a PP ("The company with no
  open tasks was, as requested, archived."), a relative clause, a quoted title, a reassurance idiom ("No problem —
  CLIX GPS was, as requested, archived."), a negator-initial name ("No Limits Inc was, as requested, archived."), a
  Pending title, the adjective "pending". 21 of 23 family rows ship; v92 catches all. Root cause: D177 and D189
  each moved the WINDOW (whole summary → 28 chars → sentence) but never made the test scope-aware.
- **V35-F2 (P1, FAB REGRESSION, R1 class, claimed closed since run30).** `nameInternal` requires an AUXILIARY to
  govern the capitalised run, so BUG-002's own second form is unguarded: "No Limits Inc archived successfully." —
  11/11 negator-initial names ship; v92 catches all via `\b(archived|…)\s+successfully\b`.
- **V35-F3 (P1, TRUTH REGRESSION).** A period INSIDE a token is a sentence boundary for the clause splitter
  (`[.!?,\x3b\n]+`) and for the AUXGAP window, so the negator is cut off: "No Work Order for **Trade-book.ai** is
  being updated." and "None of the records indicate Trade-book.ai had been, at any point, approved." are destroyed;
  v92 preserves both. Trade-book.ai is a real name in this workspace (it appears in the campaign's own corpora).
- **V35-F4 (P2, TRUTH REGRESSION, created by run34/D189).** The 160-character cap: a same-sentence negator further
  back is invisible on the one auxiliary v92 never covers ("had been"): 2/2 long-sentence rows destroyed.
- **V35-F5 (P2, FAB REGRESSION, run32/D176 guard).** The Confirmed-status guard accepts a PRONOUN-subject state
  verb and crosses ";"/", and": "Confirmed — Archived ACME; it is no longer active, and no other company was
  deleted." ships (4/4); v92 catches.
- **V35-F7 (P1, FAB REGRESSION, pre-existing, never flagged by #75–#96).** A negator inside a RELATIVE CLAUSE of
  the subject: "The company that had no open tasks was archived.", "The task that nobody claimed was deleted."
  6/6 ship, no interposition needed; v92 catches. `ppInternal` covers "with no", nothing covers "that had no".
- **V35-F6 (P3, SUITE INTEGRITY).** `belt_generative_adversarial_contract`'s truth-direction frames (P1/P2/P3/
  P2b-modifier) use the was-<participle> form deployed v92 DESTROYS: 549/640, 86/100, 180/210, 258/300 rows are
  excluded as SHARED, so those properties cannot fail on them. Under 17 single-edit reverts it stays green for 14
  — including ALL SIX of verifier #34's adopted edits and all five run30/31 fixes; it catches only the two session
  edits and newSubject (via P4b). Verifier #34's judgment ("non-vacuous on five historical builds, 8/0 under its
  reverts") is confirmed in both halves and the missing property is now named: truth frames must use forms v92
  PRESERVES, and fabrication frames must cross the interposed-adverbial shape with every scope-excused negator.
- Also: the run30 R-IDIOM lexicon widening is now **dead code** (removing BOTH idiom replaces re-opens 0/3
  idiom fabrications — the dash-before-lowercase split and newSubject catch every shape). Not a gate item;
  reported for the campaign's own "only load-bearing fixes ship" rule.

**STEP 3/3b/3d judgments.** The five run30/31 fixes and the eight adopted edits are 15/16 mutation-proven on my
shapes in the direction each carries (the 16th, F2 idiom, is the dead rule above). Refused/disclosed shapes:
"No North Depot was archived." is a SHARED loss (v92 destroys it) — the "indistinguishable from No Limits Inc"
argument is correct and costs nothing at the gate. The three run31 refused shapes are caught and their paired names
survive. D188 ("No errors occurred the department was removed.") still ships and is the one disclosed v92-corrected
fabrication; its paired truths are ALL v92-destroyed (the candidate rescues them), so closing it trades an absolute
truth loss for a v92-relative fabrication — the refusal is judged reasonable, with one zero-cost option left for the
implementer: a tiny INTRANSITIVE-verb list (occurred/happened/arose/surfaced) before a determiner-led NP. The
dash-before-capital refusal is confirmed (both real names survive, both fabrications caught lexically). The
"had been" evidential shapes verifier #34 disclosed as shared losses are NOT shared where the auxiliary is "had
been" ("No company our records show had been archived." is v92-PRESERVED) — measured: the candidate preserves them,
because no clause arm covers "had been"; this is the invariant any future AUXGAP rebuild must keep.

**STEP 3c / STEP 4.** Battery measured by direct child-process exit status from a NON-root cwd: **34 suites
executed / 0 failures (29 substantive, 5 SUPERSEDED, 1 helper excluded)** — ledger #96's count is correct and the
generative suite runs from any cwd with the vendored extractor. Prior gates on this candidate: #34 58/0, #33 92/1
(D188), #32 101/0, #30 probe PASS. CONTRACT 5's narrowing judged independently against the REAL suites: a referenced
top-level const makes run15 exit 1, `v92_open_regression_contract` FAIL and the generative suite throw
`ReferenceError`; a referenced local inside `completionIsNegated` leaves all three green — the narrowed contract
still fails for the reason it exists and hides nothing. The four re-pins (run18 D131 "but" member and
disclosedResidual, run19 D131, run28 D116) are honest: each fabrication is caught and each paired real name survives
(re-measured). run14's window now spans 3378 chars at 4000 (ledger #94 widened it past 2600 after #32 measured
2735; the 2600 figure in the launch prompt is stale). run15 57/0; the D117 property holds semantically (no
`NEGATED_CLAUSE.test(String(s))`, no whole-span lookaround). The "battery 33/0 through a pipeline" retraction is
confirmed by method: my runner reads `spawnSync().status` per suite.

**PREPARED FIX (scratch only, NOT applied): `qa/verification/scratch/v92/v35/build_fix39.mjs` → `fix39/index.ts`.**
A. the separate R-AUXGAP arm is REMOVED; the interposed adverbial is COLLAPSED on the whole summary before the clause
split, so the ordinary pipeline (idiom strip, split, hedge blanking, `completionIsNegated` with every scope rule)
decides it; a contraction immediately governing the auxiliary is never collapsed (v92's own immediate-government
semantics); "had been" is deliberately not collapsed. B. `subjectRun` also accepts "<participle> successfully".
C. "." is a boundary only before whitespace/end (splitter, CONFIRMED-arm split, status-guard span). D. the status
guard's state verb may not have a pronoun subject and its span may not cross ";" or ", and/but". E. `relInternal`:
a negator within four tokens after a relativizer that follows a noun, unless the negator directly governs an
auxiliary. Measured: own harness truth regression 0/521, fabrication regression 1/253 (the ambiguous unquoted title
"No smoking signs for the depot was approved.", reported not asserted), attack residual = D188 only; **full battery
34/0 in an isolated fixture tree**; #34 58/0; #32 101/0; #30 PASS; generative 9/0; v92_open 28/0; parity 46/0; #33
90/2 (D188 + its D187 splitter-anchor pin, which must be re-derived if C ships); own regression additions 55/1
(F6 is a suite defect, not index.ts). Each of A–E is load-bearing (skipping A: +1 truth, +9 fab shapes; B: +12; C:
+1 truth; D: +2; E: +5). `deno check` could not be run in this session (deno unavailable) — the prepared fix is
UNIT VERIFIED by node extraction only; a deno check is required before adoption.

**Coverage gaps, stated plainly:** byte-direct provenance BLOCKED (permission-gated download); `deno` BLOCKED
(unavailable) so "deno 23 == baseline" is not re-measured; no live UI/AI-chat probes were in scope for this belt
differential.

**VERDICT: FAIL — NOT DEPLOYMENT READY.** Two truthful classes v92 preserves are destroyed (F3, F4) and four
fabrication classes v92 corrects are shipped (F1, F2, F5, F7), on a corpus that shares no row with any committed
one. Production remains v92; rollback `c9dfab5b`. Regression file: `qa/verification/scratch/v92/v35/
v35_regression_additions.mjs` (RED on this candidate: 49 passed / 7 failed; on fix39: 55/1, F6 only).
