## #73 — ace9b6a (run12 D90–D97 closure) verified by #13 (fully executed): DO NOT DEPLOY — the P1 gate-blocker is narrowed, not closed, and the closure traded it for 18 assertion leaks

Verifier #13, campaign #73, base `ace9b6a`, `index.ts` sha256
`021c8989…8a4b786` (asserted before the run, re-asserted after every one of the 16
temporary source edits, and after the final battery; the working tree is byte-identical to
the commit and no product file was left modified). Independently executed: the full
23-suite battery (561 checks, all exit 0), 16 source mutations across three files, a
three-way A/B differential against `f4763ef` and `fdb4564`, an executable attack harness
over the real gate slice and the real `matchDisambiguationOption`, four candidate-fix
validations, and a production read-only check (`sem-ai-command` v92 ACTIVE, `ezbr_sha256`
`33255b31…fe475`, `updated_at` 1788239725518 — byte-identical to the fingerprint #10, #11
and #12 each recorded; zero writes).

**What `ace9b6a` genuinely closed** — verified by mutation, not by reading the commit
message. All five run12 guards are real and load-bearing: killing the D91 adjectival
allowlist, the D91 determiner/ALL-CAPS rule, the D90 Title-Case name-shape gate, the D93
matcher stripping, the D95 collision numbering, or any of the three new D94 progressive
arms turns the battery red. The D90 claim specifically is CORRECT and was worth checking:
neutralising the Title-Case gate is caught by `run12_defect_closure_contract` only, and it
is genuinely the sole rule refusing an all-lowercase adjectival-leading assertion — it is
not dead code. #12's ONE disclosed equivalent mutant is CONFIRMED with its corrected
rationale independently reproduced: with the `buildContext` anchor renamed,
`current_turn_and_continuity_contract` exits 1 WITH the `iCtx >= 0 && iPending >= 0`
conjunct and exits 0 (fail-OPEN) without it, while `run11_defect_closure_contract` catches
it either way — so the guard is load-bearing and the single mutation is equivalent only
because a second suite duplicates the check. D96 is genuinely closed: master is at
`ead2226`, the `C:/Users/Dell/dev/brain-os-bug006` worktree is checked out there, and all
four prepared migrations (`202609020001/2/3`, `202609030001`) exist both in the tree and in
`git ls-tree master` — verified on disk, not assumed. The promoted suite's exit guard is
intact with no carve-out. And the D94 disclosure's substantive claim is TRUE: on a turn
that HAS execution evidence the summary is re-rendered deterministically from that
evidence, so a residual progressive shape cannot ship there.

**But the closure repeated the pattern it was written to end.** For the third consecutive
campaign the fix introduced regressions, and the P1 that blocked the previous gate is
narrowed rather than closed. Measured on one corpus across three SHAs
(`qa/verification/scratch/v13_ab.mjs`, 20 assertion shapes / 27 clarifications):

| | assertion leaks | legit clarifications dropped | legit clarifications truncated |
|---|---|---|---|
| `fdb4564` (last certified, #11) | 20/20 | 1/27 | 0/27 |
| `f4763ef` (#12: DO NOT DEPLOY) | 0/20 | 21/27 | 4/27 |
| `ace9b6a` (this SHA) | **18/20** | **7/27** | 4/27 |
| `ace9b6a` + prepared FIX-3b | 0/20 | 0/27 | 4/27 |

`ace9b6a` is not strictly better than `fdb4564` on the shapes measured — the exact standard
#11 used to open the previous gate and #12 used to close it.

### D98 (P2, REGRESSION vs `fdb4564`) — D92 is narrowed, not closed

The replacement belt `\b(i|we)\s+(?:just|already)?\s*(archived|deleted|…)\b`
(index.ts:4776) still destroys any clarification carrying a first-person completion in a
SUBORDINATE clause — questions about work the assistant genuinely did, which is what a
clarification is for: `"Did you mean the company I archived last week?"`, `"Do you want the
report we created yesterday?"`, `"Which of the tasks we completed should be reopened?"`,
`"Is the invoice I sent the one you meant?"`. 7 of 27 dropped wholesale. Each also nulls
`pendingAction.question` while the destructive action payload stays armed — the run10/D84
shape the run12 commit message itself cites as *"worse than what it prevented"*. The
closure claims `12/22 -> 0/22`; measured against a corpus that merely EXTENDS #12's own
with relative clauses, it is 7/27.

### D99 (P2, REGRESSION vs `f4763ef`) — the same rule gave up 18 of 20 assertion shapes

Third person (`"ACME archived everything ok?"`), named subject (`"ACME Holdings deleted all
the tasks ok?"`), bare participle (`"Deleted all the tasks ok?"`), adverbial passive
(`"All tasks now deleted ok?"`), collective subject (`"The team archived ACME ok?"`) — all
reach founder-facing text. The belt does not even cover its own stated shape robustly:
`"I successfully archived ACME ok?"`, `"I have archived ACME ok?"` and `"We finally deleted
the project ok?"` all escape, because only `just` and `already` are permitted between the
pronoun and the participle. The two shapes it DOES catch are exactly the two its own
committed cases pin (`D92.hold.single-letter-shield`, `D92.hold.runon`). The source comment
asserts it "was load-bearing for exactly ONE shape … That shape — and only that shape — is
what this now matches"; that is measurably false in both directions.

D98 and D99 are opposite-direction failures of one rule and share ONE validated single-hunk
fix (`qa/verification/proposed/v13_fixes.patch.md`, FIX-3b): test whether the surviving
fragment is INTERROGATIVE-LED rather than who its subject is. Leaks 18/20 → 0/20, drops
7/27 → 0/27, battery unchanged at 561/561. No DB push.

### D100 (P2) — D91 is the THIRD narrowing of the same label-assertion class

run10/D78 chased the word, run11/D86 chased the position, run12/D91 chases the participle
and a determiner list on the second word. Nine assertions led by `closed|completed|restored`
still render verbatim under `Options:` (index.ts:5241) because the second-word test covers
determiners, pronouns and ALL-CAPS but not spelled-out cardinals, ordinary adjectives or
proper nouns: `"Restored Three Companies"`, `"Closed Five Deals"`, `"Restored Full Access"`,
`"Completed Final Migration"`, `"Restored Backup Yesterday"`, `"Completed Migration"`,
`"Closed Deals Today"`, `"Restored Bob Smith"`, `"Completed Bob Smith Onboarding"`. Each
replays next turn as `Confirmed — <assertion>.` (index.ts:2549) and the gate ships that
uncorrected — executed, not inferred: `corrected("Confirmed — Restored Bob Smith.")` is
`false`. The 13 REAL company names led by a completion word OUTSIDE the allowlist
(`"Approved Cash Advance"`, `"Cleared Capital"`, `"Assigned Risk Solutions"`, …) are all
refused, and for those the derived-canonical fallback IS adequate — each renders as the
quoted canonical name and stays selectable (verified). The acceptances are the problem; the
refusals are not.

### D101 (P2, vacuous guard — TENTH recurrence, in the commit that closed the ninth)

`ADJECTIVAL_COMPLETION = /^(closed|completed|restored|advanced|integrated)$/i`
(index.ts:4840). `advanced` and `integrated` are in NEITHER `COMPLETION_WORD` nor any
reachable path: the enclosing block only runs when `COMPLETION_WORD` matched, and the
allowlist is only consulted when `completionIdx === 0`, i.e. when `words[0]` is itself a
completion word. Proven, not argued: removing both alternatives leaves the entire battery
green at 561/561 — a surviving mutant. The right question is which list is wrong; possibly
the two words were meant for `COMPLETION_WORD`.

### D102 (P2, REGRESSION vs both prior SHAs) — the seam between the two run12 fixes

D93 made the MATCHER compare with presentation characters stripped; D95's collision
detection still keys on the RAW label. Two options identical only after stripping are
therefore neither numbered nor selectable — `matchDisambiguationOption` finds two matches
and returns null. Demonstrated: one option surviving verbatim as `Closed Loop Systems`
alongside a refused option whose same-named entity renders as `“Closed Loop Systems”` →
`match("closed loop systems")` is `null`; on `fdb4564` and `f4763ef` the plain-named option
was selectable. Same effect for genuinely distinct names differing only by an apostrophe
(`Founders Fund` / `Founders' Fund`). This is the run9/D72 dead-ended-disambiguation class
arriving through a new route, for the third time.

### D103 (P2) — D95's numbering does not guarantee what it claims

(a) It is not idempotent against an already-numbered label: three options
`["the company", "the company", "the company (option 1)"]` render as
`(option 1)/(option 2)/(option 1)` — the fix mints a collision.
(b) The number is the index in the model-emitted array, not a stable property of the
entity, so it carries no identifying information at all. The founder choosing between
`the company (option 1)` and `the company (option 2)` has literally nothing to choose on.
(c) Worse, the typed fallback fires exactly when the id is ABSENT from
`contextPack.companies` — `canonicalById` (4550-4552) and `companyNameById` (2996) are both
built from that array, and `archiveCompanyIds`/`restoreCompanyIds` filter on
`contextCompanyIds` built from the SAME array (2896, 2993-2995). A numbered fallback option
is therefore by construction an id that CANNOT execute, yet selecting it produces
`Confirmed — the company (option 1).` which the gate ships uncorrected. Numbering converted
a safe dead end (fall through to the LLM) into a founder-facing confirmation of a mutation
that cannot happen. Honest scoping: this false-confirmation path pre-exists for any
out-of-context option with a distinct label; D95 did not create it, but it is the change
that made it reachable in the one case where the founder cannot tell the options apart.

### D104 (P3, bookkeeping — the closed defect re-committed in its own closure)

`ace9b6a` removed #11's pasted preamble from entry #71 (that half is genuinely closed) and
then re-introduced the class appending #72: `qa/KNOWN_FAILURE_MODES.md:6931` reads
``## #72 …` section below**,`` followed by four lines of #12's promotion note and a stray
`---`, creating a duplicate `## #72` heading before the real one at 6939. The commit message
states "#72 was appended preamble-stripped for that reason." Second consecutive campaign in
which the ledger promotion corrupted the canonical ledger. Structural remedy adopted for
this campaign: the promotion note lives in a SEPARATE file
(`qa/verification/proposed/v13_PROMOTION_NOTE.md`) and the entry file contains ledger
content only, so there is nothing to mis-cut.

### D105 (P3, bookkeeping)

`SESSION_CHECKPOINT.md`'s stale master SHA pin IS fixed and its four-migration location
claim is live-verified true. The rest of the file is three campaigns stale: the "Updated:"
date, the #10/`65ade7c` certification pin (lines 18-19), the line describing
`CURRENT_CAMPAIGN.json` as "Verifier #10 campaign record" (35-38), and the NEXT-ACTIONS
block still dispatching verifier #11 against `66fa821d…` (59-61). #12 flagged the staleness;
only the migration lines were corrected.

### Not defects — checked and cleared

* **D90 is genuinely closed** and the Title-Case gate is genuinely non-redundant (mutation
  M3 is killed by `run12_defect_closure_contract` alone).
* **D94's residual is genuinely disclosed and the disclosure is accurate.** 14 of 27
  progressive shapes still escape (`"is underway"`, `"queued"`, `"I have begun archiving"`,
  `"handling"`, non-English), but the code's own claim — that a shape outside the list
  cannot ship a fabricated completion on a turn that HAS execution evidence — is TRUE:
  executed with evidence, all four residual shapes are re-rendered as
  `the company: archived — confirmed.` It is defense-in-depth, correctly labelled as such.
* **D93's stripping does not select the WRONG option** on any probe; its failure mode is
  dead-ending (D102), not mis-binding. The strip set covers exactly the four quote
  characters the product itself emits; other quote styles are unnormalized, unchanged from
  before.
* **D95's numbering is stable across the confirmation turn**: the matcher reads the
  PERSISTED options (`contextPack.pendingAction`, index.ts:2495/2532) and the numbering is
  written into that persisted object with `pendingActionGatingChanged` forcing the
  re-persist, so the label the founder sees is the label matched. The reorder sensitivity in
  D103b is a cross-turn hazard, not an intra-turn one.

**Coverage this campaign did NOT have** (stated, not silently skipped): no browser/UI
tooling in this session type, so no UI truth was verified; no live AI chat turn against the
deployed function, so every AI-behaviour finding is the REAL gate slice executed out of
`index.ts`, not a model round-trip; no database access, so the `*.sql` suites in
`qa/scenarios-runner/` were not run and RLS/lifecycle/relationship truth is out of scope.
Production remains v92, which is older than all three SHAs compared here.
