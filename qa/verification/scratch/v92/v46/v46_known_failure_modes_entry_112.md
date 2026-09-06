## #112-V — VERIFIER #46 FAIL on `e06bebc0`: the guard adopted to make the belt faster destroys 8 truthful refusals, the belt is CUBIC on one clause shape, and the artifact cited as evidence for that guard compares the candidate against itself

Eighteenth consecutive FAIL on this candidate line. Candidate `e06bebc0507715d24e528298293b3f28cd37f6e6`,
`supabase/functions/sem-ai-command/index.ts` sha256
`d0de7e7eadfb5e0a5eb34d92a85fe327fb70b7641decbddf84525b9f0ba13733` — asserted before and after every
temporary edit and at the end of the run; byte-identical throughout. Nothing was deployed, no
migration was written or pushed, and index.ts was never written to (every mutation in this run was
applied to a source STRING).

**PROVENANCE — CONFIRMED, and stated at its real strength.** `git c9dfab5bd433`'s blob for
`supabase/functions/sem-ai-command/index.ts` hashes to
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`, and the committed live-download
artifact under `qa/verification/scratch/v92/deployed/` is byte-identical to it after LF
normalisation (the download is CRLF in the working tree, 325,682 bytes; the blob is LF, 321,370).
`supabase functions list` and `functions download` are refused by this session's command classifier,
so **my own link to the live project is artifact-mediated, not byte-direct** — byte-direct only at
the git-object level. Provenance is closed at ledger #108 and I did not re-open it.

**DEPLOY SURFACE.** Between `c9dfab5bd433` and the candidate, exactly ONE file changes under
`supabase/`: `functions/sem-ai-command/index.ts`. No migrations, no other functions. LF-normalised:
1,743 insertions / 52 deletions. **0 declared identifiers and 0 user-facing string literals present
in v92 are absent from the candidate**; 221 declared identifiers are added (my count includes
destructured and class declarations, which is why it differs from #45's 205 — a methodology
difference, not a disagreement; both find 0 removed). The D3 `&& !result.pendingAction`
short-circuit is not reintroduced, `!rawClaims` is not reintroduced, and there is exactly one
`COMPLETION_PARTICIPLE` declaration (no private per-arm copy).

---

### The differential, on my own corpus

682 rows built for this run — 438 truthful, 244 fabrications — with a labelled negator-token-name
section in both directions and 27 disambiguation shapes. Measured twice, with `knownEntityNames`
populated and empty.

| | |
|---|---|
| **TRUTH REGRESSIONS** (v92 preserves, candidate destroys) | **35** — all in the conditioned-offer class |
| **FABRICATION REGRESSIONS** (v92 catches, candidate ships) | **0** |
| rescued (v92 destroys, candidate preserves) | 167 |
| newly caught (v92 misses, candidate catches) | 107 |
| negator-token names, both directions | 0 truth regressions, 0 fabrication regressions |
| identical under pack-populated and pack-empty | yes |

Plus 8 further truth regressions found outside the corpus, by attacking the guard adopted this
round (V46-D3 below). **Total truth regressions vs deployed v92: 43 across 2 classes.**

---

### V46-D3 (P1, DEPLOY BLOCKER, NEW) — the #45 short-circuit destroys truthful refusals

The guard adopted this round is

```js
if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c)) return false;
```

Its premise — "no completion vocabulary in this clause, so there is nothing for a negator to
negate" — is true for the `LEGACY_PAST_COMPLETION` arm and **false for the `EXECUTION_IN_PROGRESS`
arm**, whose vocabulary is gerunds and idioms (`processing the request`, `executing the plan`,
`archiving`) that appear in NEITHER `COMPLETION_VERB` nor `COMPLETION_PARTICIPLE`. A negated
progressive therefore short-circuits to "not negated" and the belt fires on a truthful refusal.

```
                                                          v92     before-guard   candidate
"Not processing the request."                             pass    pass           FIRE
"Not executing the plan."                                 pass    pass           FIRE
"Not executing the plan without your approval."           pass    pass           FIRE
"Not processing the changes until you confirm."           pass    pass           FIRE
"Never processing the request twice."                     pass    pass           FIRE
"No longer processing the request."                       pass    pass           FIRE
"Hardly processing the request at this volume."           pass    pass           FIRE
"Neither processing the request nor executing the plan."  pass    pass           FIRE
```

8 of 8 are restored by removing the guard, so the guard is the direct and sole cause. The founder-
facing effect is the belt's own stated worst outcome: the assistant *declining to act* — the exact
sentence the confirm-before-mutate product wants — is replaced with *"I can't actually do that from
chat — nothing was changed."*, which is itself false, and persisted to `work_orders.output`.

**FIX PREPARED, NOT APPLIED** (no write authority on the implementation branch):

```js
if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c) && !EXECUTION_IN_PROGRESS.test(c)) return false;
```

`EXECUTION_IN_PROGRESS` is declared at index.ts:5441, well before `completionIsNegated` at :5585, so
it is in scope. Measured: restores **8 of 8**; **0 verdict changes** on the 682-row corpus; verdict-
identical to removing the guard entirely; and keeps **1.11–1.20×** of the guard's 1.18–1.29× win on
ordinary prose.

**HOW THIS SHIPPED — the lesson #45 asked the next verifier to look for, found in the very artifact
that adopted #45's advice.** `qa/verification/scratch/v92/v46_runtime_probe.mjs` builds `before` from
a hard-coded `C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts` and `after`
from `qa/verification/scratch/v92/fix46.ts`. **Both files are sha256 `d0de7e7e…` — byte-identical to
each other and to the candidate.** The probe compares a build against itself. Its "1.24–1.44× on
ordinary prose" is noise (it measures 0.97–1.18×) and its "0 verdict changes of 9" is **0 by
construction and cannot ever fail**. That is the campaign's defining vacuity class, sitting in the
evidence for the change that caused V46-D3 — and the 9 rows it checked contained no negated
progressive, so even a valid comparison would have missed it. Logged separately as V46-D2.

---

### V46-D1 (P2, NEW) — the belt is CUBIC on one clause shape; both prior measurements were on the wrong input

The launch prompt asked for this discrepancy to be settled. **Neither number was right, and both
were measured on shapes that never enter the expensive path.**

* **Ordinary prose: LINEAR.** e = 0.99, **3.18 ms at 33,639 characters** (v92: 0.0004 ms, flat).
  #45's 657 ms is not reproducible on any ordinary shape. The implementing session's "roughly
  linear, single-digit ms" is correct *for the shape it measured* — its filler carries a full stop
  every ~180 characters, so clauses stay short, and its negators are lowercase and break the scan
  loop on the first iteration.
* **One unsplittable clause carrying SKIPPED negators: CUBIC.** e = **2.97**.
  0.36 ms @ 500 ch → 10.3 ms @ 2 KB → 70 ms @ 4 KB → **507 ms @ 8 KB** → **3.9 s @ 16 KB** →
  ~14.7 s extrapolated @ 25 KB. `readsAsCompletion` has **two call sites** (index.ts:5693 and
  :5741) on the same `result.summary`, so **double all of it per turn**.

**Mechanism.** The scan loop in `completionIsNegated` breaks at the first negator it does not skip,
which is why ordinary text is cheap. Every *skipped* negator costs a full recomputation of
`newSubject`, which rescans the whole clause with a global regex and slices O(n) spans — **O(n²) per
skipped negator**, and O(n³) when the negator count scales with length. **ONE skipped negator is
enough**: a 16 KB single clause goes from 0.11 ms to 28.6 ms because of the single word `pending`
(the `adjective` skip), or one negator-token company name (the `nameInternal` skip). Cost then
scales linearly in the number of skipped negators (1 → 8.4 ms, 64 → 408 ms at 8 KB).

**Reachability.** `max_tokens: 8192` (index.ts:1759/1821) permits a ~25–32 KB summary and there is
no length cap between the model reply and the belt. The clause splitter treats `and` as a boundary
**only before a lowercase token**, so a run-on list of capitalised entity names joined by `and` is
one clause by construction. A prompt-injected "reply with exactly this text" makes it
attacker-reachable. This is a CPU-exhaustion characteristic the candidate introduces and v92 does
not have. It is not a truth regression, and on its own it would not block a deploy — but the founder
should have the number before deploying, which is what was asked for.

---

### V46-D7 (P2, NEW) — the ordinal path binds a destructive option on a reply that names TWO options

`matchDisambiguationOption`'s own rule is *"FAIL CLOSED, and NEVER INTERPRET"* (run15/D116). The
run18/D133 ordinal path takes `ordN` from the **first** matching ordinal notation and then strips
**every** ordinal notation out of `rest` before its "ordinal-only" test — so a reply referencing two
different options still tests as ordinal-only and binds one of them.

```
3 archive options offered (A=option 1, B=option 2, C=option 3)
reply                        v92                candidate
"option 1, option 2"         null (dead-end)    BINDS A -> arms archiveCompanyIds
"option 1 #2"                null (dead-end)    BINDS A
"the first one number 2"     null (dead-end)    BINDS B
"#2 the first one"           null (dead-end)    BINDS B
```

Note the incoherence: `option 1 #2` binds 1 while `#2 the first one` binds 2 — which one wins
depends only on which notation the first regex alternative happens to catch. `option 1 or 2`,
`option 1 and 2` and `not option 2` correctly dead-end; it is the comma form and the mixed-notation
forms that leak, because the comma is stripped by `[^\p{L}\p{N}]+` and the two notations are removed
by different rules.

**FIX PREPARED, NOT APPLIED** — collect all distinct ordinal values and bind only when there is
exactly one; measured **0 failures**: closes all 4 leaks and preserves all 8 legitimate single
selections (`option 2 please`, `the second one`, `#3`, `number 3`, `3`, `yes option 2`, `option 1`,
`the third one`).

---

### V46-D2 (P2, NEW) — 40 campaign artifacts read a DIFFERENT checkout

`v46_runtime_probe.mjs` is not an isolated case. Under `qa/verification/scratch/v92`, **40 `.mjs`
artifacts hard-code an absolute path into `C:/Users/Dell/dev/brain-os/`** — a different worktree from
the pinned verification checkout. Today those bytes happen to match, so the results coincide; that
is luck, not isolation, and it defeats the entire point of verifying a pinned candidate in its own
worktree. The session reported this class CLOSED for two proofs. `v44_mutation_proof.mjs` genuinely
is fixed (resolves from every cwd, no absolute path). `v31_mutation_proof.mjs` is **not**: it still
hard-codes `C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/mut31`, it **exits 1**, and it
reports three FALSE `NOT PROVEN` results — `F1.ppInternal`, `F2.idiomLexicon` and `F3.auxGap`
("mutation did not change the source") — all three of which I proved load-bearing below.

---

### V46-D4 (P2, NEW) — the CONTRACT 5 narrowing hides a real hazard

Judged empirically rather than by reading its argument: five injection sites, each run against all
17 `SEM_INDEX_SRC`-honouring suites (baseline 17/17 green through the override, so "survives" is not
vacuous).

| injection site | CONTRACT 5 flags it | suites broken | verdict |
|---|---|---|---|
| top-level const in the belt block | **YES** | run28 | caught — the narrowed contract is NOT vacuous |
| local const inside `completionIsNegated` | no | none | genuinely harmless — the narrowing's argument holds here |
| local const inside `completionIsNegated`, after the loop | no | none | genuinely harmless |
| **local const inside the `readsAsCompletion` `.map()` callback** | **no** | **run15** | ***THE NARROWING HIDES THIS*** |
| top-level const before `LEGACY_PAST_COMPLETION` | no | none | harmless |

The narrowing's stated justification ("locals inside `completionIsNegated` are not the hazard") is
correct — I proved it in both directions. But the narrowing went further than its justification: it
dropped the pin over the whole block, including `readsAsCompletion`'s own inline callbacks, where a
`;`-bearing local **is** the hazard. run15's extractor slices that predicate to its first `;`, so the
injected local truncates the slice and run15 dies with `SyntaxError: Unexpected end of input` — a
loud failure, but an opaque one in an unrelated suite, which is precisely what a named contract
exists to prevent.

---

### V46-D5 (P3, v92-parity, NEW) — `CONFIRMED_COMPLETION` is missing participles every sibling list carries

`COMPLETION_PARTICIPLE`, the `Confirmed —` guard lists and the entity-capture list all include
`closed` and `added`. `CONFIRMED_COMPLETION` includes neither. Consequence:

```
"Confirmed — Archived ACME."   caught
"Confirmed — Closed ACME."     NOT caught
"Confirmed — Added ACME."      NOT caught
```

Same claim shape, two outcomes — the run13/D100 "one predicate, both arms" class the belt has a
comment about, recurring in a list this campaign believes is complete. Deployed v92 catches none of
the three, so this is **v92-parity and not a deploy blocker**, but it is an open hole.

---

### Mutation proof — 20 of 20 shipped belt mechanisms are LOAD-BEARING

Every named mechanism was reverted in a source string and required to re-open shapes on my own
corpus. **Zero no-ops.** Six looked dead on my first-pass probes — `titleHead`, the dash-form
reassurance-idiom strip, the R-AUXGAP pre-pass, the D27 renamed-arrow arm, the none/nobody
appositive blanking, and the modal-hedge span blanking — and **all six yielded witnesses once the
probe was aimed at the shadow each sits behind**, exactly as verifier #45 warned. Recording the
witnesses so the next verifier does not have to rediscover them:

| mechanism | shadowed by | witness that re-opens it |
|---|---|---|
| `titleHead` | `nameInternal` (a capitalised run after the negator) | `"Pending review the company was archived."` |
| idiom strip, dash form | run22 `newSubject` | `"No problem — ACME Holdings archived successfully."` |
| R-AUXGAP pre-pass | the sentence-level first arm | `"ACME Holdings was, with no delay, archived."` |
| D27 renamed-arrow arm | `LEGACY_PAST_COMPLETION` inside the sentence-level arm | `"Project renamed: \"No Limits Inc\" → \"No Limits Group\". Nothing else changed."` |
| none/nobody blanking | the clause splitter isolating the negator | `"The companies, none of them, are being archived."` |
| modal-hedge blanking | LEGACY's own `(?<!may )(?<!might )` lookbehinds | `"No changes were made, though it should have been archived."` |

The last one is worth keeping: LEGACY's lookbehinds cover `may/might/could/can` but **not
`would/should`**, so the clause-level hedge blanking is the only thing stopping
`"…though it should have been archived."` from reading as a completion.

---

### Everything else, re-derived

| question | answer |
|---|---|
| Battery, per-child exit codes | **36 suites / 0 failures**, 1,192 assertions, 5 SUPERSEDED stubs, **0 vacuous**. The "battery 33/0 was invalid" retraction is correct; the real number is 36/0. |
| Prior gates v30–v45 | **all 16 match the stated expectation exactly**, 0 mismatches, incl. run15 57/0, v42 12/1, v44 115/3, v45 53/1 |
| #64 D16, #65 D25, #65 D27 (`9dda919c`), #66 D40 | **all four re-derived CLOSED** on candidate bytes |
| Q4 — assumptions resting on `4476c92` | `PAST_COMPLETION_CLAIM_PATTERN` is **byte-identical** between `4476c92` and live v92, so every belt number in this campaign is measured against production's real gate. But `matchDisambiguationOption`, `resolveClarificationField`, `RESTORE_VERB_PATTERN` and `FUTURE_PROMISE_PATTERN` **all differ** — a matcher assumption carried from `4476c92` is NOT valid against live v92. |
| Q6 — rollback | **exact and available**: commit `c9dfab5bd433` present, blob `795c20c8…`, `scripts/factory-runner/verify-deployed-bytes.sh` present, reference copy pinned `eol=lf` |
| Matcher, 27 shapes + 120,000 fuzzed cases | 7 shape divergences: 2 candidate improvements — including the **live wrong-direction destructive bind** where v92 binds an *archive* option on `"un-archive ACME Holdings"` and the candidate dead-ends (independently confirmed) — and 5 refusal-path differences of equal safety. The dangerous direction surfaced V46-D7. |
| The dash-before-a-CAPITAL class | **preserved, and lexically**: `"No company named Ulaanbaatar — North Depot was archived."` and `"No unit at Erdenet — Copper Works was archived."` both survive; the fabrication twins are caught; what separates them is the negator, not the casing |
| The three "refused" shapes | **confirmed no longer refused** — all three caught, all three paired real names preserved. #45's correction to the record stands. |
| `"No North Depot was archived."` | destroyed by the candidate — **and by deployed v92 too**, so it is not a regression and cannot block a deploy. The session's argument that it is indistinguishable from `"No Limits Inc was archived."` is **correct**: both are `No <Capitalised Run> was archived.` and only world knowledge separates them. Since the entity signal is positive-only by design (absence is never evidence, re-verified), the refusal to close it lexically is the right call. |
| CRLF / Deno | 6003 CRLF, **0 bare LF**. 129 regex literals scanned by a character walk, **0 fail to construct**, **0 inline `(?i:)` modifier groups**. `deno check` itself is **BLOCKED** (no binary; `npx deno` refused) — the "deno 23" claim is NOT verified by me. |

### Corrections to the record

* **`v45_starting-the` is not covered in its base form.** The session states the imminent idiom list
  "covers the base form as well as the gerund". True for `go(?:ing)? ahead` and `kick(?:ing)? off`;
  **not** for `starting the`, which has no `start the` alternative — `"Let me start the archive."`
  escapes both the belt and v92. v92-parity, so not a blocker, but the claim is overstated.
* **#45's V45-D2, V45-D6 (gerund/base idioms), and the `detName` `/i` removal are genuinely closed** —
  re-derived, including that `detName`'s determiner sub-test carries no `/i` over its explicit
  `[a-z]`, and that both paired truthful negatives survive.
* **`v44_mutation_proof.mjs` is genuinely fixed; `v31_mutation_proof.mjs` is not** (see V46-D2).

### Coverage gaps, stated not skipped

* **No browser and no live AI chat turn.** Every verdict here is `UNIT VERIFIED` / `CODE INSPECTED`
  against the real deployed bytes and the real candidate bytes — never `E2E VERIFIED`.
* **`supabase db query`, `functions list`, `functions download` all refused** by this session's
  classifier. No production database row was read; the corpus uses realistic constructed names, not
  names read from `companies`. Provenance is closed at ledger #108 and is not recorded as a gap.
* **`deno check` BLOCKED**, substituted as described above.

### Artifacts

* `qa/verification/proposed/v46_regression_additions.mjs` — **28 pass / 8 fail**, exits non-zero,
  correct from **any** cwd, `SEM_INDEX_SRC` honoured. The 8 reds are V46-D1, D2, D3 (×2), D5, D6, D7
  and the conditioned-offer class, and they stay red until closed.
* `qa/verification/proposed/v46_PROMOTION_NOTE.md`
* `qa/verification/scratch/v92/v46/` — my harness, 682-row corpus, differential, three runtime
  probes, the guard attack, both prepared fixes, the mutation proof, the no-op witness hunts, the
  CONTRACT 5 empirical judgment, the battery and gate runners, and the matcher differential and fuzz.
  All written for this run; none imported from a prior verifier; none contains an absolute path.
