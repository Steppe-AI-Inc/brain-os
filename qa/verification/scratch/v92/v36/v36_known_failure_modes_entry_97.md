## #97-V — verifier #36, campaign #96: candidate f64b280 vs DEPLOYED v92 — FAIL, seven classes, two created by the adopted #35 fix, four never looked for

**Verdict: FAIL. EDGE STATUS = NOT DEPLOYMENT READY.** Candidate `f64b280778d573d5bc3f3b4421fffaa49bb62b99`,
index.ts sha256 `a01c8e1a41c8f06dac84c8acf178832d922a2704e911a64056a56e5e600ede0b` (preserved byte-for-byte
throughout; asserted before and after every scratch build). Production stays v92; rollback `c9dfab5bd433`.

**Provenance (integration-level, stated plainly).** `functions list` (read-only): `sem-ai-command` v92,
ezbr_sha256 `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, updated_at 1788239725518
(2026-09-01T05:15:25.518Z), ACTIVE, verify_jwt true. GitHub Actions "Deploy Supabase Edge Functions" run
33472871764, headSha `c9dfab5bd43346bad501ab44d7bfbc5211e90ed5`, completed 2026-09-01T05:15:30Z; no later run
exists. `git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts` → sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` (LF, 321370 bytes) — the required value.
The read-only `functions download` was permission-gated in this session, so the link is NOT byte-direct: it is
the deploy run's headSha plus the five-second timestamp match, the same link #33–#35 had. ezbr_sha256 is a bundle
hash, not a source hash, so even a download would not close that gap byte-for-byte. Not overstated.

**Seven deploy questions, re-derived.**
1. Deploy surface = only `supabase/functions/sem-ai-command/index.ts` (the other five functions are unchanged
   since c9dfab5b; the workflow redeploys all six on a push to master touching `supabase/functions/**`).
   LF-normalised: 51 hunks, +1729/−52 lines; 99 linear commits; identifier delta 190 added / 0 removed
   (top-level 57 == 57). **Byte-wise every line differs**: the blob became CRLF at `4de63e4` (run10,
   2026-09-02) and every candidate since has been CRLF; one lone CR sits inside a comment at line 5719. Deno
   tolerates both; the only content effect is `\r\n` inside the SYSTEM_PROMPT template literal. Disclosed (P3),
   not a blocker — but it is an unintended byte delta in the deploy surface that ledger #90's "~1,730 semantic
   lines" never mentioned.
2. Own corpus (893 truthful / 680 fabrications, 14 labelled sections incl. 20 negator-token names and 7
   negator-led titles in BOTH directions): truth 689 preserved / 204 rescued / **0 regressions**; fab 581
   both-catch / 72 improvements / 24 shared misses / **3 regressions** (2 = the unquoted-title ambiguous pair
   #35 disclosed; 1 = V36-F5 below). The generic corpus is clean; the seven classes below came from targeted
   attacks on the specific fixes, exactly as the launch brief predicted. Matcher: 40 shapes, 0 regressions, 20
   improvements.
3. Nothing removed from production is reintroduced (0 identifiers removed; PCCP literal byte-identical, sha
   `54b678ad…`, cross-checked against git c9dfab5bd433).
4. The 4476c92-dependent assumptions that mattered were already closed (#30); one new one found: the
   "known truth costs" the session discloses ("No North Depot was archived.", "Never ACME Holdings, and never
   Beta Corp, was archived.") are **v92-shared losses** (v92 fires on both) — overstated as costs, neutral at
   the gate.
5. Ledger #64 D16 / #65 D25 / #65 D27 (row 9dda919c) / #66 D40: all still closed (own pins + v92_open_regression
   28/0 + #33/#34/#35 suites).
6. Rollback exact and available: `c9dfab5bd433` is on origin/master; NOTE the scratch copy
   `qa/verification/scratch/v92/index.v92.ts` is CRLF (sha `49d53882…`, LF-normalised = `795c20c8…`) — roll back
   from git, not from that copy.
7. Only intended Edge changes — with the CRLF caveat above.

**THE SEVEN CLASSES (own shapes; attribution by running the same shapes on 4476c92 / 9b73e68 / 0f96ff9).**
- **V36-F1 (P1, truth regression, CREATED by run36 = #35's A2 collapse).** The collapse bounds the adverbial's
  CONTENT at 30 chars; v92's window bounds the whole span (content + ", " + ", " = content + 4) at 30. An
  adverbial of 27–30 chars that carries the negation is therefore discarded where v92 preserves the answer:
  "ACME Holdings was, as far as anyone can tell not, archived." / "The goal was, according to no record we
  hold, archived." / "CLIX GPS was, per no evidence I could find, archived." — 5/5 destroyed. Verifier #31's own
  V31-F3 family measures it too: 33/1 on 0f96ff9 → 32/2 on f64b280 (12 destroyed). Ledger #97 stopped reporting
  #31's suite. Verifier #31 had warned about exactly this ("its window is wider than v92's 30, so it reaches
  shapes v92 never touched"); the rebuilt arm counted content, not span, and the collapse inherited it.
- **V36-F2 (P1, truth regression, CREATED by run36 = #35's D splice).** The pronoun-subject and ";" exclusions
  destroy true status reports: "Confirmed — Archived Media Group; it is still a customer." / ", it has 3 open
  tasks." / ": it is active." / "Confirmed — Restored Furniture Co; they are still active." — 4/5 destroyed;
  all preserved on 0f96ff9. The fabrication #35 closed with that splice is v92-corrected ONLY via its negated
  tail ("…, and no other company was deleted"); without the tail v92 ships it too.
- **V36-F3 (P1, truth regression, pre-existing since run30, missed by #31–#35).** ppInternal excuses a negator
  after since/given/after regardless of which arm the clause reaches; the candidate-only progressive arm then
  fires: "Since no company is being archived, the list is unchanged." / "Since nobody is being removed, the
  roster is unchanged." / "Given no approval is being granted, the request stays pending." — 4/4 destroyed,
  preserved on 9b73e68 and 4476c92.
- **V36-F4 (P1, truth regression, pre-existing since run32/D181, missed by #33–#35).** The determiner-led
  idiom strip eats a real noun phrase with a reduced relative clause: "No issues the team reported are being
  archived." / "No problem the customer raised is being deleted." — 3/3 destroyed, preserved on 9b73e68.
  Root cause shared with F3: every scope-excuse rule was justified by "v92 destroys the same shapes", which is
  only true for v92's own aux+participle forms; #34's D192 fixed one instance (the participle list) and #33's
  D184 another (nameInternal's aux set), but ppInternal and the D181 strip were never re-examined.
- **V36-F5 (P2, fab regression, CREATED by run36 = #35's C1 splice).** A token-internal period stopped being a
  clause boundary, but newSubject's capitalised run `[A-Z][\w&’'-]*` cannot contain one (subjectRun's can),
  so "No errors Trade-book.ai was restored." now ships — it was caught on every earlier build BY the boundary.
- **V36-F6 (P2, fab regression, pre-existing since run30, missed by every verifier).** COMPLETION_PARTICIPLE
  lacks v92's "confirmed", so "The approval was, as requested, confirmed." is never collapsed and ships while
  v92 corrects it (plain "was confirmed" is caught by LEGACY).
- **V36-F7 (P2, fab regression, pre-existing since run32/D176, missed by #33–#35).** The status guard excuses a
  NAME subject beside a v92-caught tail: "Confirmed — Restored Bob Smith is back, and no other person was
  restored." ships; caught on 9b73e68.

**Judgments the brief asked for.**
- "No North Depot was archived." vs "No Limits Inc was archived." — indistinguishable on the surface, agreed;
  and moot at the gate because v92 destroys the former too (shared loss, not a truth cost).
- The three formerly refused shapes are caught; the paired dash-in-name truths survive; a dash before a capital
  is still not a boundary (confirmed: lexical closure, not casing).
- Dead code: the run30 R-IDIOM lexicon widening re-opens 0/3 on revert — confirmed — and so does removing the
  ENTIRE dash-form idiom strip (0 re-open, 0 truths destroyed). Only the run32 D181 determiner-led strip is
  load-bearing (1 re-open). Two dead replaces ship in this candidate against the campaign's own rule.
- CONTRACT 5 narrowing: sound. A referenced top-level const in the belt block fails 7/10 extractor suites; a
  referenced local inside completionIsNegated leaves 10/10 green. Hides nothing.
- Re-pins (run18 D131 "but"/disclosedResidual, run19 D131, run28 D116): honest — each asserts the fabrication
  caught AND the paired real name surviving, both directions; run18's D131_IRREDUCIBLE loop is now empty and
  vacuous but harmless. run14/D107 window is 4000 (not 2600 — widened again in run32); the statement is 3253
  chars, so it spans. run15 57/0 with the D117 syntactic pin intact; the D177 property holds semantically.
- Battery, measured per-process with real exit codes: 35 files / 0 nonzero exits = 34 suites + `_gate_extract`
  helper; 5 SUPERSEDED stubs; 29 substantive. Ledger #97's count is correct. #35's builder mutation proof
  re-run here: full build byte-identical to the candidate, 7/7. Generative suite: P13 fails on 7914f2b and
  6774b52, P14 fails on 567cbd2 and 0f96ff9, 17/0 on the candidate — non-vacuous as claimed; but it generates
  none of F1–F7 (its truth frames are negator-led without a preposition/idiom, and its status frames have no
  pronoun), so it remains a net, not a verifier.
- Verifier #31's scratch suite is stale in one pin (F3b demands the lexicon #33 measured and reverted) and
  `v35_mutation_proof.mjs` / `v36_mutation_proof.mjs` hardcode `C:/Users/Dell/dev/brain-os` (the D198 class);
  P3, suite hygiene.

**Prepared fix (scratch only; candidate untouched): `qa/verification/scratch/v36/build_fix40.mjs`**, seven
splices A/B1/B2/C1/C2/D/E, each proven load-bearing through its own skip switch (7/7, full build byte-identical
to `fix40/index.ts`): A bounds the collapse to v92's reach with a lookahead on the auxiliary; B gates the
status excuse on "no LEGACY completion anywhere in the summary" (arming direction only — not the D117 hazard)
and removes the pronoun/";" restrictions; C1/C2 make ppInternal and the D181 strip conditional on a v92-reachable
completion; D admits "." in newSubject's name run; E adds "confirmed" to COMPLETION_PARTICIPLE. On fix40: own
corpus 0 truth / 2 fab regressions (the disclosed ambiguous title pair only); every one of F1–F7 closed; #30
probe PASS, #31 33/1 (the stale pin), #32 101/0, #33 92/1 (D188), #34 58/0, #35 56/0; full battery 35/0;
generative 17/0; matcher 40/0. Cost: shapes that only the wider-than-v92 collapse caught ("was, as you explicitly
requested, archived", 27 chars) become v92-shared misses. `deno check` could not be run in this session
(command gated) — the JS-level belt builds and executes; TypeScript diagnostics for fix40 are UNVERIFIED.

**Permanent regression:** `qa/verification/proposed/v36_regression_additions.mjs` — 55 passed / 7 failed on the
candidate (the seven classes), 62 passed / 0 failed on fix40; ANY CONTRACT/DEFECT failure exits nonzero;
index.ts via SEM_INDEX_SRC or found by walking up from the file.

**Class lesson, one sentence:** a scope-excuse rule is only differential-safe on the forms deployed v92 also
reaches; every arm the candidate has that v92 lacks (progressive, first-person, CONFIRMED, the collapse's extra
four characters) must be measured separately against v92-preserved truths before an excuse is allowed near it.
