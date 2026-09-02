# PROPOSED qa/KNOWN_FAILURE_MODES.md entry — #70 (verifier #10, campaign #70, base 65ade7c)

> Not applied: this campaign's write authority is `qa/verification/**`. Paste as-is (or
> edited) into `qa/KNOWN_FAILURE_MODES.md` after #69 in the commit that acts on it.

## #70 — 65ade7c (run9 closure) verified by #10 (EXECUTED): DO NOT DEPLOY — two run9 fixes regressed the guards they were repairing

Verifier #10, 2026-09-02, campaign #70 on 65ade7c (HEAD e8a0139, function bytes
identical). First campaign since #67 with real execution: the full battery (12 suites)
ran green exactly as the implementing session reported (40/40, 92/92 + 11/11, 29/29,
42/42, 13/13, 13/13, 10/10); 46 mutants executed TWICE (attempts 1 and 2, identical:
24 killed / 22 survived / 0 invalid) against copies, `index.ts` sha256 `0272f245…`
asserted before/after every run; 100+ seam probes executed on 65ade7c AND on a
`git show 6ed3834` copy so every finding is classified as regression vs pre-existing.
Production `sem-ai-command` v92 ACTIVE, ezbr `33255b31…`, untouched; zero writes.
Evidence: `qa/verification/scratch/v10_*`, `qa/verification/proposed/v10_regression_additions.mjs`
(18 pass / 15 fail on 65ade7c by design: 12 DEFECT reproductions + 3 CONTRACT misses).

**D77 (P1, REGRESSION of run8/D61 by the D70 fix):** the abbreviation/decimal guard
skips a `.` whenever the next character is a lowercase letter or digit, so
`"I archived ACME. ok?"`, `"ACME deleted. 3 tasks remain?"`,
`"ACME deleted (3 tasks). anything else?"` ride whole into the corrected summary
(`"I can’t confirm … was archived. I archived ACME. ok?"`), into `envelope.questions`,
and — via `pendingAction.question` — into the persisted, replayed
`"Confirmed — …"`. 6ed3834 cut all of them to the trailing question.
**D78 (P1, REGRESSION, undisclosed):** 65ade7c's `safeOptionLabel` dropped the
`COMPLETION_WORD` check 6ed3834 applied; `"ACME deleted"`, `"I archived ACME"`,
`"Done: ACME deleted"`, `"ACME is now archived"` now render as
`Options: ACME deleted | ACME Services.` on the correction turn itself and persist as
labels. The #69 postscript says "COMPLETION_WORD extended … for labels/summaries" —
labels no longer use it at all; the code comment above it still claims they do.
**D79 (P2, NEW):** `safeDisplayLabel` applies the assertion regex to CANONICAL names:
a task titled "Verify the contract was approved by legal" renders as "the task"; two
disambiguation options with such names collapse to identical "the company" labels and
`matchDisambiguationOption` can never select either — the D72 dead-end reintroduced for
real names. **D81 (P2, REGRESSION):** the D68 grounded-drift arm floors a TRUTHFUL
historical read-only answer ("ACME was created on 2026-03-01 …") on any grounded
claims:null turn; 6ed3834 shipped it. **D84 (P2, REGRESSION):** D71's word list
(`done`, `closed`, …) refuses legitimate imperative bulk summaries ("Mark 3 tasks as
done", "Archive ACME (currently closed)"): the prompt vanishes from the rewrite-path
reply while `action.archiveCompanyIds` stays armed for the next short affirmative.
**D83 (P2, pre-existing since run8):** an ASCII `?` inside the head is not a cut point,
so a tag question ("I archived ACME, right? Continue?") shields the assertion.
**D80 (P3):** `pendingActionGatingChanged` is true for any pendingAction whose
summary/question key is merely absent (undefined→null), so most clarification turns
re-persist; no truth impact.

**Bookkeeping (scenario 5):** "42/42 unchanged proves it never counted" — VERIFIED by
running the 6ed3834 suite unmodified against 65ade7c: the tally printed before the
duplicate Section G, which then ran with 6 uncounted OKs that could not fail the exit.
"All six new guards mutation-proven" — OVERSTATED: D71 has no killing mutant (M28:
delete the whole COMPLETION_WORD check, battery stays green); D69 6/9 terminators,
D69c belt (dead code — `safeProseFragment` refuses the whole text first), D72
derived-fallback, D73 flag computation (0/3 sites), D74 length/canonical arm, D68 floor
all survive. run8 guards D58–D65/D67/Section S: every mutant died — genuinely load-bearing.

**DO NOT DEPLOY** — D77/D78 (P1) open; the run9 closure fixed D69/D70/D71/D72/D74 by
trading each seam for a wider or inverted one. Fix direction (not applied): make the
abbreviation guard require an abbreviation-shaped token (single letter / known
abbreviation / digit-after-digit), not merely lowercase; add ASCII `?` to the cut set;
for labels, fall back to the derived canonical reference when a completion word is
present rather than accepting any non-aux sentence; scope `safeDisplayLabel`'s assertion
collapse to runtime (model-authored) labels and keep canonical names intact or at least
unique; exempt imperative bulk summaries or match `COMPLETION_WORD` only in past-tense
contexts; give truthful historical statements a structured channel before widening the
drift arm. Promote `proposed/v10_regression_additions.mjs` DEFECT cases into
`run8_defect_closure_contract.mjs` (run10 section) in the same commit as the fixes.
