## #95-V — verifier #34: FAIL on candidate `567cbd2` / index.ts `85e59eac…` — nine v92-differential classes, seven of them never looked for

**Scope.** Independent, fresh-context differential of candidate `567cbd2c19a317d26f6eaa62681cc1400c314af4`
(index.ts sha256 `85e59eac0b34fd25aed5eb4e8f02a0265c458b4fcc232fd1b175bc7ae15a9847`, byte-identical
before/after) against DEPLOYED sem-ai-command v92. Nothing deployed, no migration, no write to the
implementation branch; artifacts on `verify-567cbd2-campaign94`.

**Production bytes (STEP 1).** `functions list` (read-only): v92, `ezbr_sha256 33255b31…`, updated_at
1788239725518 = 2026-09-01T05:15:25.518Z, ACTIVE. CI run 33472871764 ("Deploy Supabase Edge
Functions", headSha `c9dfab5bd433`, completed 05:15:30Z) is the only deploy at or after that instant.
git `c9dfab5b` index.ts sha256 (LF) `795c20c8…`; the committed copy `index.v92.ts` LF-normalises to
the same. `functions download` was BLOCKED in this session, so the link is INTEGRATION-LEVEL, not
byte-direct — stated plainly. The v92 gate literal is byte-identical in the candidate (pinned
`54b678ad…`), so every measurement is against the literal production gate regardless.

**The seven deploy questions.** (1) Deploy surface = ONLY `sem-ai-command/index.ts`; `git diff -w`
1727 insertions / 54 deletions; 37 index.ts commits, 91 total, 0 merges, 836 files; identifier delta
re-derived: **196 added, 0 removed** (ledger #90 said 176 — wrong, as #30 suspected). (2) NO — see
below. (3) Nothing removed (0 identifiers; the two revert commits reverted candidate-era additions).
(4) Yes: every "v92 destroys it too" argument in #91–#95 silently assumed v92's participle list; for
closed/cleared/sent/activated/deactivated it does not hold (D192). (5) #64 D16, #65 D25, #65 D27
(9dda919c), #66 D40: still closed (my own pins, 12/12). (6) Rollback `c9dfab5b` exact and available.
(7) Yes — only intended Edge changes.

**Battery, measured with real exit codes (STEP 3c/4).** 34 suites executed / 0 failures, 5 SUPERSEDED
stubs, 1 helper excluded, 29 substantive — ledger #95's count is correct. run15 57/0 with the D117
lines present. run14's window is now 4000 (widened by run32), the statement is 3337 chars, spans. All
four re-pins (run18 D131 "but" member and disclosedResidual, run19 D131 dash, run28 D116) honest —
each fabrication caught and each paired real name survives on my harness too. CONTRACT 5's narrowing
is sound and the hazard is real: injecting a top-level `const nx` is caught ONLY by
`v92_open_regression_contract`; run15/16/17/18 pass silently. Verifier #30's superseded flat pin
trips on the prepared fix's new LOCALS (25/1) — the exact false alarm the narrowing exists to avoid.
Matcher: 34 shapes, 0 regressions, 13 improvements, 0 wrong. Prior gates on this candidate: #33
92/1 (disclosed shape), #32 101/0, #31 33/1 (its F3b pin is now stale — it pins the widening #33
refuted), generative 8/0.

**The refused shapes and the disclosure (STEP 3b/3d).** All three run31 refusals ("No errors ACME…",
"No problem the log shows…", "Not a single task moved — Bob Smith…") are now CAUGHT and every paired
real name survives — the refusal was overtaken by run32/run33, correctly. The lexicon revert is present
and load-bearing on my own lowercase family (60/60 caught; mutation re-opens 3 gate shapes at 0 truth
cost). "No North Depot was archived." is a shared loss ONLY inside v92's participle list — see D192.
The disclosed minimal pair is CONFIRMED as a residual: dropping bare -ed links destroys "No task
assigned the wrong owner was deleted." and "No document titled the same way was archived." as well;
the discriminator is transitivity, which the surface form does not carry, and the natural product form
carries a boundary and is caught (B3 90/90).

**Mutation (all twelve run30–run33 fixes), on my corpus.** 11/12 load-bearing in the gate direction;
`objectName` re-opens only v92-shared shapes. **The committed generative suite stays 8/0 under EVERY
one of the twelve reverts** — it has zero sensitivity to any run30–run33 fix and could not have caught
D183–D188, nor anything below, before a verifier did. Its non-vacuity claim re-derived: it fails on
4476c92 (1), 9b73e68 (1), 6774b52 (3), f68f44a (2), 7914f2b (1, P1 linker list) — real, but confined to
its own five properties.

**NINE CLASSES, each measured on generated families, each a gate item (v92 corrects/preserves 100%):**
- **D189 (P1, fab, created by run31)** — the R-AUXGAP guard's fixed 28-char window crosses a SENTENCE
  boundary: "No errors. CLIX GPS was, as requested, archived." / "X was not deleted; it was, as
  requested, archived." ship. 324/384. This is D117 by a new mechanism on the very arm D117 struck once.
- **D190 (P1, fab, created by run33/D183)** — the bare modals joined that same window, so ANY modal
  within 28 chars shields a fabrication: "As you can see, X was, as requested, archived.", "I can
  confirm X has been, as requested, deleted." 324/384. v92 excludes a modal only when it IMMEDIATELY
  governs the auxiliary.
- **D191 (P1, truth, created by run30/31)** — the arm covers "had been", which v92's gate never had,
  and the window is blind to a negator further left in the same sentence: "None of the records from
  the last quarter indicate the company had been, at any point, archived." 240/240 destroyed.
- **D192 (P1, truth, run30/run32 × run12)** — `EXECUTION_IN_PROGRESS`'s `(was|were) <participle>` arm
  carries closed/cleared/sent/activated/deactivated; nameInternal and newSubject were only ever
  "safe" because v92 destroys the same shapes — for those participles it does not: "No Notification
  was sent.", "No Work Order was closed.", "No task the team owns was cleared." 55/96 destroyed.
- **D193 (P2, truth, created by run32/D176)** — the status guard's `(?:not\s+)?` makes "is not
  <participle>" a completion: "Confirmed — Archived Media Group is not archived." 18/24 destroyed.
- **D194 (P1, fab, long-standing; run33 fixed two tokens of an open class)** — any negator opening a
  QUOTED title: 'The task "No smoking signs for the depot" was completed.' 32/32 ship.
- **D195 (P1, fab, long-standing since D112)** — lowercase pending/awaiting as adjectives: "The
  pending approval was approved." 150/150 ship — one word away from BUG-002 itself.
- **D196 (P2, fab, run22 lexicon)** — "A few tasks were completed." 64/64 ship.
- **D197 (P2, fab)** — "The Never Ending Story project was archived." 18/18; "Nobody's Perfect Studio
  was archived." 9/12 ship.
- **D198 (P3, suite integrity)** — `belt_generative_adversarial_contract.mjs` imports its extractor from
  an ABSOLUTE path in a different worktree (`brain-os-verify-b32e0e4/…/v20/extract.mjs`, untracked
  here); the "permanent" suite runs only on this one machine while that worktree exists. The same
  import sits in `v34_mutation_proof.mjs`, which also hardcodes `C:/Users/Dell/dev/brain-os`.

**Truth cost of the run30/run33 fixes in the directions asked (STEP 3/3b/3d).** Title-Case negation
followed by past aux: shared with v92 inside its list (documented), a GATE loss outside it (D192).
Pending/Awaiting-initial real negations: 0/9 destroyed. PP-only negator: 0 gate. Idiom-then-denial:
0/30. AUXGAP-shaped truths: D191. "I archived no companies." family 5/5 preserved. Evidential-after-
linker 4/4 preserved. Hedge blanking 4/4. "Confirmed — <Participle> <Name> <verb>": preserved except
D193. Quoted Pending/Awaiting truths 30/30 preserved. Det-led ≤2-word subject: truth cost is D192's
"No task the team owns was sent."; three-word / evidential subjects let 4 synthetic shapes through (P3).
D184 is/are/being escape: shipped, but v92-shared — not a gate item.

**PREPARED FIX (scratch only, NOT applied): `qa/verification/scratch/v34/fix37/index.ts`** (six
anchored edits, see the promotion note). Measured: v34 corpus TRUTH 0 gate regressions / FAB 6 (the
disclosed pair, 4 synthetic, 1 mid-name); every family closed except F6 3/18; battery 34/1 — the one
failure is run28's `D165.control.was` ("Delta Ltd was activated." must fire), a candidate-era pin
tripped by aligning the EXEC arm to v92's list. Variant B (`fix37b`, keep the list, require two
Title-Case tokens for a name) was built and REJECTED by measurement: T3 stays 40/96 destroyed, and
it re-opens single-token negator names ("Nowhere Bakery was archived." — verifier #32's pin — and
run18's D131.disclosedResidual pin). Only variant A ships as the prepared fix. #33's gate 92/1, #32's 101/0, generative 8/0,
open-regression 28/0, parity 46/0. deno check BLOCKED this session.

**Permanent regression:** `qa/verification/proposed/v34_regression_additions.mjs` — 48/10 RED on the
candidate, 57/1 on the prepared fix (D198 remains), CONTRACT items proven non-vacuous on two mutants,
14 failures on 7914f2b and 9b73e68 (pre-existence shown).

**VERDICT: FAIL — NOT DEPLOYMENT READY.** Production remains v92; rollback `c9dfab5b`.
