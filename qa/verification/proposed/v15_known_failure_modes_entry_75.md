## #75 — d724d8c (run14 D106–D115 closure) verified by #15 (fully executed): DO NOT DEPLOY — a second wrong-entity destructive bind in the same function, and D112's negation fix both leaks and over-fires

Verifier #15, campaign #75, base `d724d8c`, `index.ts` sha256
`1b291f37…ef64` — asserted before the run, re-asserted after every one of 25 temporary
source mutations, and at the end. Working-tree HEAD was `32f1891`, two commits after the
stated base; `git diff d724d8c..HEAD` touches only `qa/verification/*` bookkeeping and
`git show d724d8c:supabase/functions/sem-ai-command/index.ts | sha256sum` returns the same
`1b291f37…ef64`, so the source under test is unambiguous.

Independently executed: the full 25-suite battery enumerated **from the filesystem**
(`readdirSync`, not a hardcoded list — 26 `.mjs` files, one of which is a shared module);
my own 25-mutant battery written from scratch; a 40-probe attack on
`matchDisambiguationOption`; 33 fabricated + 28 legitimate summaries through the real
`readsAsCompletion`; 18 execution assertions × 13 real names through the real D113 decision
in both canonical branches; and a three-SHA differential of the question belt against
`ace9b6a` and `f1722f2`. `qa/verification/proposed/v14_mutation_proof.mjs` was deliberately
**not** run — executing the implementing session's own harness and reporting its result is
self-certification by proxy, not verification.

### What is genuinely closed, measured rather than accepted

**D106 (P1) is closed, and closed well.** The specificity rule, the residual-mention guard
and the confinement of the raw tie-break to the normalisation-tied set all hold under
attack: `[Smith, Smith's Bakery]` + `"smiths bakery"` binds the bakery; nested and
overlapping labels bind the longest actually named; a reply naming two options dead-ends;
two distinct entities sharing a name dead-end rather than coin-flipping; Cyrillic
confusables dead-end rather than binding. 34 of my 40 probes pass, and all six failures are
a different defect (D116 below) in code D106 never touched.

**D113 is the strongest thing in this commit.** Where the canonical read knows the entity,
it is correct on every probe I could construct: **0 of 18** execution assertions survive as
a label and **0 of 13** real completion-shaped names are destroyed. A fabricated label
naming a *different* real entity renders the id's own canonical name; a Cyrillic homoglyph
of the canonical name renders the canonical spelling; a label *containing* the canonical
name plus a fabricated verb (`"Terminated Bob Smith"` over canonical `"Bob Smith"`) is
replaced, because agreement is equality and not containment. The decision to stop the gate
being lexical where the database already knows the answer is correct and it works.

**D114 ends the four-campaign oscillation, and this is the first build that dominates.**
Measured on my own corpora (20 assertions × 27 clarifications) at three revisions:

| revision | build | assertion leaks | clarifications lost |
|---|---|---|---|
| `ace9b6a` | campaign #72 | 0/20 | 5/27 |
| `f1722f2` | campaign #73 | **7/20** | 1/27 |
| `d724d8c` | **candidate** | **0/20** | **1/27** |

A leak here means the surviving fragment *still carries completion vocabulary* — cutting
`"I archived ACME, ok?"` down to `"ok?"` is the belt working, not failing. (My first draft
counted any non-null return and scored the candidate 11/20; I corrected the metric before
reporting it.) The candidate is strictly better than both predecessors on both axes, which
neither #72 nor #73 achieved.

**The seven new guards are observed in both directions.** My 25-mutant battery killed 20.
Every new guard has both a coverage mutant and a limit mutant killed by a committed case:
D106-specificity (M01/M02), D106-residual (M04/M05), D106-rawTieBreak (M07/M08),
D112-negation (M09), D112-lookbehinds (M11/M12/M13), D114-firstPerson (M14/M15, including
the clause-position lookbehind specifically), D114-interrogative (M16/M17), D113-rule1
(M18), D113-rule2 (M19/M20). After eleven vacuous guards this is a real change in kind, and
it should be said plainly.

Mutants were written to the **real** `index.ts`, not a temp copy: only 5 of 25 suites honour
`SEM_INDEX_SRC`, so a copy-only battery would be scored against a fifth of the coverage and
would over-report survival. The file was restored from a pristine byte buffer in a `finally`
block and the sha re-asserted after every single mutant.

### D116 — P1. A NEGATED reply binds the option the founder EXCLUDED, and archives it.

`matchDisambiguationOption` returns immediately on `matches.length === 1` (index.ts:423),
**before** the specificity rule, the residual-mention guard and the raw tie-break run. So
when a reply mentions exactly one option label, none of D106's machinery is consulted — and
nothing anywhere in the function models negation. A reply that *excludes* an option
therefore selects it:

| reply | options | binds |
|---|---|---|
| `don't archive acme` | Acme, Beta | **Acme** |
| `not acme, the other one` | Acme, Acme Holdings, Beta | **Acme** |
| `anything except acme holdings` | Acme Holdings, Beta | **Acme Holdings** |
| `no, not beta` | Acme, Beta | **Beta** |
| `everything but acme` | Acme, Beta | **Acme** |
| `not bob's co` | Bob's Co, Bobs Co | **Bob's Co** |

Traced end to end through the shipped source, not assumed: index.ts:2572 the disambiguation
branch requires no affirmative, because naming an option *is* the answer → :2583
`commandContradictsActionType` is false, since `"don't archive acme"` contains an archive
verb and no restore verb, which is not a contradiction for an actionType of `archive` →
:2587 `resolveClarificationField('company','archive')` → `archiveCompanyIds` → :2604
`fields = { archiveCompanyIds: [matchedOption.id] }` → :3047 the `contextCompanyIds`
provenance filter **passes**, because an option that was offered to the founder is by
construction a company in `contextPack` → :3076 `supabase.rpc('archive_company')` runs for
real. No LLM in the loop, no confirmation step.

This is the same severity and the same function as D106 — a wrong-entity *destructive*
bind, not a dead end — and D106's fix does not reach it. The founder types the most natural
possible refusal and the system archives the company they just refused.

### D117 — the D112 negation lookahead is whole-summary, and that class was already struck down once

`CONFIRMED_COMPLETION` disarms on `(?![^]*\b(?:not|never|no|nothing|none|…)\b)`. `[^]*`
scans the **entire remainder of the summary**, so one negation word anywhere disarms the
belt — and with it all four arms, because the other three never see a bare-participle
`Confirmed — <Verb> <Object>`:

* `Confirmed — Archived ACME.` → caught.
* `Confirmed — Archived ACME. No further action needed.` → **escapes all four arms.**
* `Confirmed — Deleted ACME, nothing else was changed.` → escapes.
* `Confirmed — Restored Bob Smith. No changes to his tasks.` → escapes.
* `Confirmed — Assigned the task to Bob. Nothing is pending.` → escapes.
* `Confirmed — Removed Bob Smith. There is no undo.` → escapes.

6 of 33 fabricated summaries escape, and the suffix that does it is ordinary assistant
boilerplate. Reachable on an LLM turn carrying a claims array of only state/existence
claims: `rawClaims !== null` arms `structuredProseDrift`, but
`unaccountedCompletionProse` is false because `readsAsCompletion` is false — the run8/D58b3
laundering shape, reopened by one appended sentence.

**This is a recurrence, not a new invention.** `qa/KNOWN_FAILURE_MODES.md:5277` already
recorded and removed exactly this mechanism: *"`PAST_CLAIM_NEGATED` and
`PAST_CLAIM_ATTRIBUTED_ELSEWHERE` are **whole-summary** tests. One truthful negation …
*anywhere* in the reply, exempts the **entire** summary including a fabrication sitting next
to it."* D112 re-introduced a whole-summary negation exemption in a new arm.

### D118 — D112 was applied to one arm; the sibling arms still destroy truthful negatives

`readsAsCompletion` ORs four arms. D112 gave `CONFIRMED_COMPLETION` a negation lookahead
and determiner/cardinal lookbehinds. `LEGACY_PAST_COMPLETION` and `EXECUTION_IN_PROGRESS`
got nothing, and both fire on `(is|are|was|were) … archived`. So the D112 class is closed
only for the bare-participle phrasing. **7 of 7** same-class truthful negatives are still
destroyed:

* `Confirmed — no company was archived.` → destroyed (`CONFIRMED_COMPLETION` correctly
  declined; `LEGACY` fired anyway).
* `Confirmed — the company was not archived.` → destroyed. **This is the postscript's own
  D112 example with `is` changed to `was`.**
* `Nothing was archived — the id did not resolve.` → destroyed.
* `No company was deleted.`, `None of the tasks were completed.`,
  `Confirmed — nothing was assigned.`, `Confirmed — nothing was archived.` → destroyed.

Also already recorded as a class at `:4905` — *"The regex has no negation handling at all,
so `was not created` matches exactly like `was created`"* — and left standing in the sibling
arms despite run13/D100's own headline being *"one predicate, both arms"*. Destroying a
true answer and substituting `"I can't actually do that from chat"` is, in this project's
own words, worse than the fabrication the belt exists to catch.

3 of 28 legitimate summaries are destroyed. The third, `"ACME was created on 2026-03-01 and
is still active."`, is the **disclosed** run10/D81 shape and is mitigated by the arm's outer
conditions, not by the belt; I count it but do not charge it to this campaign.

### D119 — the remaining lexical branch is not a tuned trade-off; it has no discriminating power

The founder-directed question, answered with two numbers per branch rather than an opinion:

| | real names destroyed | execution assertions surviving |
|---|---|---|
| **canonical row EXISTS** | **0 / 13** | **0 / 18** |
| **no canonical row** | **10 / 13** | **6 / 18** (8 counting trailing-punctuation-only strips) |

`Terminated Bob Smith`, `Wiped All Data`, `Revoked Access`, `Suspended Bob Smith`,
`Disabled the account` and `Purged the records` all ship verbatim as selectable option
labels. `Closed Loop Systems`, `Completed Works Ltd`, `Approved Vendors Inc` and seven other
real names collapse to a bare `"the company"`, losing identity entirely. `Terminated Cable
Co` (a real name) survives by precisely the same accident that lets `Terminated Bob Smith`
(a fabrication) survive: `terminated` is not on the 24-word `COMPLETION_WORD` list. The
branch does not separate names from assertions. It separates *words on an English list*
from *words not on it*, and both categories contain both kinds.

Measured against the two degenerate alternatives using mutants M19/M20: always-keep = 0
destroyed / 18 surviving; always-replace = 13 destroyed / 0 surviving; current = 10
destroyed / 6 surviving. The current point buys three surviving real names at the price of
six surviving fabricated completions.

### D120 — the label channel never consults the progressive vocabulary

`safeOptionLabel` tests `PAST_COMPLETION_CLAIM_PATTERN` and `COMPLETION_WORD` and never
`EXECUTION_IN_PROGRESS`, so progressive execution assertions are entirely unguarded there:
`"Now removing ACME."`, `"I'm now removing ACME."`, `"Archiving ACME as we speak."` and
`"Executing the plan."` all ship as option labels in the absent branch. run11/D87 unified
the progressive vocabulary across the *drift* arms; the label channel was not included in
that unification.

### D121 — three guard limits remain unobserved, and one guard is an equivalent mutant

Surviving mutants, each now pinned by a CONTRACT case in
`qa/verification/proposed/v15_regression_additions.mjs`:

* **M03** — specificity ranked on the raw rather than normalised label length. Quoting could
  inflate rank. Low severity, contrived, unobserved.
* **M06** — the residual is space-joined; blanking instead fuses neighbouring words. Fails
  *safe* (more dead ends), unobserved.
* **M21** — D113 agreement widened from equality to containment. Real: `"Terminated Bob
  Smith"` over canonical `"Bob Smith"` would survive verbatim. Unobserved.
* **M25 — equivalent mutant, recorded as such rather than papered over.** Flipping
  `commandContradictsActionType`'s `actionType || 'archive'` default to `'restore'` changes
  no outcome, because `resolveClarificationField` already refuses an absent actionType and
  the branch produces no deterministic result either way. The `|| 'archive'` fallback is
  effectively dead.

### D122 — a source comment cites a suite that cannot prove what it is cited for

`index.ts:2563` says the issue #5 class-B fail-closed fix is *"proven by
qa/scenarios-runner/issue5_confirmation_action_type_binding.mjs"*. That suite declares its
own private copy of `CLARIFICATION_ENTITY_ACTION_FIELD` and its own `resolveFieldFixed`, and
never reads `index.ts`. It cannot observe the product. The invariant itself **is** observed —
`sem_ai_command_source_invariants_drift_guard.mjs` killed both of my reversion mutants
(M23/M24) by source-text match — so this is an inaccurate citation, not a twelfth vacuous
guard. Worth correcting because a reader chasing that citation would conclude the P1 has
behavioural coverage that it does not have.

### Battery hygiene

25 suites, all exit 0, zero textual failures, 690-odd checks. Five of the 25 are inert
self-declared placeholders (`claim_segmentation_and_present_tense_fp`,
`past_completion_gate_behavior`, `mixed_claim_grounding`, `per_resource_grounding_contract`,
`d3_past_completion_gate_not_shortcircuited_by_pending_action`) printing *"SUPERSEDED
(prose-era)"* and pointing at `structured_claim_verification.mjs`. That is honest and
acceptable, but it means a fifth of the filenames assert nothing and a reader counting
suites over-counts coverage.

### Production gap

`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` (read-only):
`sem-ai-command` is **version 92**, ACTIVE, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, updated
`1788239725518` (~2026-08-30). Production predates the entire run9→run14 sequence, so
**none** of D58–D122 is live. Every finding above concerns a candidate branch, not what the
founder is running today. `ezbr_sha256` is a deployed-bundle hash and is not comparable to
the `index.ts` source sha; the version number and date are the usable evidence.

### Scope not covered

The 60 `.sql` suites were **not** run and I did not query the database, so DB/RLS/lifecycle
truth is **out of scope for this campaign** and is neither verified nor implied by anything
above. No UI or live AI-chat verification was performed either; this campaign is a source-
and-harness campaign against a candidate branch.

### Regression cases

`qa/verification/proposed/v15_regression_additions.mjs` — 46 cases, 17 pass / 29 fail on
`d724d8c`. All 29 failures are DEFECT cases reproducing D116–D120; **0 CONTRACT failures**,
so every property the commit actually claims still holds. Same exit guard as run14: any
failure exits nonzero, no kind-based carve-out.
