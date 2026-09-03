# PROMOTION NOTE — verifier #14, campaign #74 (base `f1722f2`)

**This file is not ledger content. Do not paste any part of it into
`qa/KNOWN_FAILURE_MODES.md`.** It exists because the opposite has now happened twice (D97,
D104) and D104's corruption is *still live in the ledger* — see below.

## What to promote, and where

| artifact | destination | note |
|---|---|---|
| `v14_known_failure_modes_entry_74.md` | append **verbatim** after entry #73 in `qa/KNOWN_FAILURE_MODES.md` | the file contains exactly one `## #74 — …` section and no preamble; it can be `cat >>`'d without editing |
| `v14_regression_additions.mjs` | promote to `qa/scenarios-runner/run14_defect_closure_contract.mjs` **only after the D106/D112/D114 fixes land**, flipping nothing — the DEFECT cases already expect the FIXED behaviour | keep the exit guard; no kind-based carve-out |
| `v14_fixes.patch.md` | the three prepared fixes, each independently validated | see acceptance evidence below |

Until promotion, `v14_regression_additions.mjs` exits **1** on `f1722f2` with `34 pass, 29
fail (29 open #74 defects reproduce; 0 CONTRACT failures)`. That is the file working as
designed, not a broken suite.

## FIRST, before anything else: finish closing D104

`qa/KNOWN_FAILURE_MODES.md` lines **6931–6936** still contain:

```
## #72 …` section below**,
> verbatim, after entry #71 — the #71 promotion accidentally pasted its own
> `# PROPOSED entry …` preamble into `qa/KNOWN_FAILURE_MODES.md` (now line 6710), so the
> canonical ledger currently contains an instruction-to-self claiming the entry is
> "PROPOSED" and lives elsewhere. Worth cleaning up in the same pass.

---
```

Delete those six lines. #13 correctly diagnosed this as D104 and adopted the right
*structural* remedy (this separate file), but never removed the corruption itself, and the
`f1722f2` closure did not either. A `grep '^## #72'` still hits the garbage heading before
the real entry at 6939. Two campaigns of "recorded, not fixed" is how a ledger stops being
usable. I deliberately did not edit the permanent ledger myself — a verifier silently
rewriting historical entries mid-campaign is worse than the corruption — but this is a
one-line-range deletion with no judgement in it.

## The three prepared fixes — all validated, none applied

Rule 1 of this campaign requires `index.ts` sha256 `10db5838…a70d2a` at the end, so **no
source change was made**. Each fix below was applied to the real source, measured, and
restored with a sha assertion.

**FIX-C2 — D106 (P1), the one that matters most, and the recommended form.** A concurrent
session dropped its own D106 fix into `qa/verification/proposed/` during this campaign
(`v14_d105_matcher_fix.patch.md`). I verified it against the real source rather than taking
its word: its "most specific match wins" rule is genuinely better than my equality-only
FIX-C — it closes all three mis-bindings **and** resolves four cases both `ace9b6a` and
FIX-C dead-end. But it guesses whenever a reply mentions several option labels, including
one the reply explicitly excludes (`"archive acme, leave acme holdings alone"` →
`Acme Holdings`), which `f1722f2` correctly dead-ends today. **FIX-C2** = its specificity
rule plus a residual-mention guard: 13/13 adversarial cases correct, all 25 suites green.
Full diff and evidence in `v14_fixes.patch.md`. Two bookkeeping notes on that file: its
`D105` number collides with the existing D105 in entry #73, and its 12-case probe contains
no multi-mention case, which is why its self-validation reads clean.

**FIX-C (superseded, recorded for the record).** One line:

```js
// was: filters `options`, tests containment  -> can pick an option the founder never named
const exact = matches.filter((o) => o.label.trim().toLowerCase() === command.trim().toLowerCase());
```

Restricting the fallback to the already-matching set and requiring whole-label equality is
**strictly better than both prior SHAs on every probe**: all three mis-bindings become safe
dead ends, and cases the candidate *and* `ace9b6a` both dead-ended (`"smith's bakery"`,
`"acme holdings"`, `"founders' fund"`) now resolve correctly. Genuinely ambiguous replies
still resolve to nothing. All 25 committed suites green.

**FIX-B — D112 (P2).** Adds a negator lookahead and determiner/cardinal lookbehinds to
`CONFIRMED_COMPLETION` so it fires only on an affirmative predicate use. New
negation/status false positives **9/16 → 0/16**; the belt still catches every shape it was
built for; all 25 committed suites green.

**FIX-A2 — D114 (P2).** Adds `FIRST_PERSON_MAIN_CLAUSE_COMPLETION` *ahead of* the
`INTERROGATIVE_LEAD` belt (both axes, not one), using a variable-length lookbehind so a
first-person completion inside a noun phrase stays legitimate. Reopened class **13/20 →
1/20**; my assertion corpus **3/25 → 1/25**; clarification drops unchanged at 5/27 with zero
new; all 25 committed suites green.

**Do not apply the naive version of FIX-A** (a blanket `FIRST_PERSON_COMPLETION` test). It
was tried and measured: it breaks 8 committed D98 cases. That is the trap that has now
caught three consecutive campaigns.

**Acceptance, A2 + B + C applied together:** `v14_regression_additions.mjs` goes from
`34 pass / 29 fail` to **`59 pass / 4 fail`**, the four remaining failures being D113 only,
and **all 25 committed suites stay green**. Evidence:
`qa/verification/scratch/v14_fix_acceptance.mjs`.

**D113 is deliberately left without a prepared fix.** Closing it means corroborating *every*
option label against the canonical read rather than only completion-shaped ones — a real
product-behaviour decision with wide blast radius (any legitimate model paraphrase of a name
would be replaced by the canonical spelling), not a regex repair. It needs a decision, not a
patch, and it should be made explicitly rather than by whichever narrowing comes next. This
is the fifth narrowing of the D78 → D86 → D91 → D100 class; the class does not end until the
gate stops being lexical.

## For whoever writes the mutation battery next

My battery is `qa/verification/scratch/v14_mutations.mjs` (34 mutants) run by
`v14_mutate_run.mjs`. Two things worth keeping:

1. **Mutate the REAL source, not a copy behind `SEM_INDEX_SRC`.** Not every suite honours
   that env var, so a copy-based battery silently under-reports which suites observe a
   mutant. The runner restores from a pristine byte copy in a `finally` and aborts the whole
   campaign on a sha mismatch.
2. **Every LIMIT mutant needs a matching CONTRACT case, and the CONTRACT case must be proven
   to kill it.** `v14_mutate_verify_additions.mjs` re-runs all 16 survivors against the new
   file: **16/16 now killed, 0 still unobserved.** My first pass at the D108 replay cases
   *restated* the `summary:` ternary instead of evaluating the source's own expression, and
   passed identically with the guard deleted — a vacuous test written *inside the report
   about vacuous tests*. The suite now lifts the expression out of `index.ts` between
   `summary:` and `fields:`. If a future refactor breaks that anchor the harness throws
   rather than passing.
