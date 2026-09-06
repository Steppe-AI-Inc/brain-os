# v45 PROMOTION NOTE — campaign #105, verifier #45

**Verdict: FAIL. EDGE STATUS = NOT DEPLOYMENT READY. Production stays v92.**

Candidate `b386767a3549ace22421c372dc5623e30e30b419`,
`supabase/functions/sem-ai-command/index.ts` sha256
`6c5e52b52f1a836670ce043f3a76612a21d27cfc741bff9e6a4bc1e2d410e59d` — asserted before and after
every temporary edit and at the end of the run, byte-identical throughout.

---

## The one thing blocking the deploy

`V45-D1` — the `EXECUTION_IN_PROGRESS` arm fires on an offer explicitly conditioned on your
confirmation. Deployed v92 preserves these; the candidate replaces them with a canned refusal that
is itself false and persists it to `work_orders.output`.

```
"Let me archive the company once you confirm."      v92: keeps   candidate: destroys
"Let me archive the company if you approve."        v92: keeps   candidate: destroys
"Let me delete the project only after your approval."  v92: keeps   candidate: destroys
"I'm about to archive the company when you confirm."   v92: keeps   candidate: destroys
```

**117 of 196 rows** on my own generation — about three times the 39 the campaign record carries.
Purely the imminent arm (`LEGACY_PAST_COMPLETION` fires on 0 of the 117). The arm still earns its
keep: unconditioned forms are caught 9/14 by the candidate and 0/14 by v92.

**This is a product decision, not a bug, and it is yours.** I did not close it with a regex, per
instruction. My opinion, offered as one: an offer whose own clause conditions it on *you*
("once **you** confirm", "if **you** approve") cannot be a claim that something already happened —
it is the confirm-before-mutate pattern the product is built on. Replacing it with
*"I can't actually do that from chat"* destroys a true sentence, substitutes a false one (archiving
**is** a chat capability), and strands the conversation. If the arm stands down anywhere, this is
the safest place, because the condition must name the user to exist at all.

Two options, both cheap:
1. **Stand the imminent arm down** when the same sentence carries an explicit user-conditional
   (`once/if/when/after/provided/assuming/unless you confirm|approve|say|sign off`). Low risk: the
   condition has to mention the user.
2. **Leave it firing** and accept that the assistant can never offer a conditioned action in prose —
   in which case the offer should be produced structurally as a `pendingAction`, and the prompt
   should stop the model from phrasing offers this way at all.

Say which and the next round closes it in one edit.

---

## Everything else in the differential

| question | answer |
|---|---|
| Deploy surface delta | `sem-ai-command/index.ts` only; `supabase/` file set identical |
| Truth regression vs v92 (594-row own corpus) | **0** |
| Fabrication regression vs v92 | **0** |
| Adversarial battery (409 rows) | 18 P1 — **all 18 in the V45-D1 class** — and 0 fabrication regressions |
| Negator-token names, both directions | clean; 20 truths preserved, 9 fabrications caught that v92 misses |
| Matcher, 42 shapes | 2 divergences, **both candidate improvements** |
| Ledger #64 D16/D17, #65 D25, #65 D27 (`9dda919c`), #66 D40 | all still closed, re-derived |
| Identifiers removed from v92 | **0** (205 added) |
| Battery | **36 suites / 0 failures**, 1,060 assertions, exit codes read per child process |
| Prior gates | all 15 match their predicted state exactly, incl. run15 57/0 |
| Shipped fixes load-bearing | **10 of 10** |
| Rollback | exact and available (`c9dfab5bd433`, blob `795c20c8…`) |

The candidate is a large net improvement over production: on my corpus it rescues **195** truthful
answers v92 destroys and catches **41** fabrications v92 misses, at zero cost in either direction.
It also fixes a live wrong-direction destructive bind — `un-archive ACME Holdings` against a pending
*archive* option arms `archiveCompanyIds` in production today and dead-ends in the candidate.

---

## Three findings that are not blockers but should not be lost

**V45-D2 (P2).** The entity-signal rescue is the only one of the four `Confirmed —` branches missing
the `(?:[^,]{0,60},\s*)?` interposed-prefix tolerance its three siblings carry, so
`Confirmed — as requested, <KnownName>.` is destroyed even when the name is in the pack (18 rows on
an 8×3 generation). One-token fix; the same "one arm extended, its sibling left behind" shape as
run13/D100. Not blocking because the shape is genuinely ambiguous English and the campaign itself
pins its twin as a fabrication to catch.

**V45-D6 (P3, not a v92 regression).** `EXECUTION_IN_PROGRESS` lists the gerund idioms
(`going ahead and`, `kicking off`, `starting the`) but not the base forms, so
`Let me go ahead and archive the company.` escapes the belt **and** the future-promise gate — 60 of
192 generated rows escape both. v92 misses them too.

**V45-N2 — runtime, unmeasured in 45 verifications.** The belt is **quadratic** where v92 is linear:
1 KB → 0.95 ms, 8 KB → 43 ms, 33 KB → 657 ms, versus 0.085 ms for v92 at 33 KB. It runs twice per
turn. Fine at realistic summary lengths; a bound worth knowing on an Edge Function. Cheapest guard:
short-circuit `completionIsNegated` when `COMPLETION_VERB` does not match the clause at all.

---

## Corrections to the record

* **The three "refused" shapes are no longer refused.** `No errors ACME was archived.`,
  `No problem the log shows ACME was archived.` and `Not a single task moved - Bob Smith was
  removed.` are all caught on these bytes with their paired real names surviving. Retire that
  disclosure.
* **The V44-D3 class is ~3× larger than recorded** (117, not 39) and covers `I'm about to` /
  `I am going to` / `let me go ahead and`, not just `let me`.
* **The eighth-vacuity fix is real but "three suites" overstates it.** With the seed removed so the
  belt can throw, the new fuzz finds 211 throws in 2,000 cases and the old alphabet finds 0 — the
  hole is reproduced and closed. But only `run28` could actually have thrown; `run18` and
  `v92_open_regression_contract` stay green without the seed because neither corpus reaches the
  family.
* **Two campaign mutation-proof artifacts cannot reach their input.**
  `qa/verification/scratch/v92/v44/v44_mutation_proof.mjs` cannot run from any cwd (`v44_harness.mjs`
  resolves `ROOT` one directory short); `qa/verification/scratch/v92/v31_mutation_proof.mjs`
  hard-codes an absolute path into a different worktree. Same shape as the vacuity this campaign is
  named after, this time in the proofs rather than the contracts.
* **A no-op mutation is usually a bad probe.** My first mutation pass called the reassurance-idiom
  strip and the R-AUXGAP pre-pass dead. They are not: both are shadowed on ordinary rows by the
  run22 `newSubject` rule and by the sentence-level first arm, and only bite on
  `<participle> successfully` and on an interposed adverbial that itself carries a negator. With
  rows engineered for that, reverting them re-opens 6/10 and 6/6. I am recording my own error
  because the next verifier will make it too.

---

## Coverage gaps, stated not skipped

* `deno check` — **BLOCKED** (no `deno`; `npx deno` refused). The "type check at baseline / deno 23"
  claim is unverified by me. Substituted: all 226 regex literals construct, no inline `(?i:)`
  modifier groups, and the belt is `new Function`-built successfully by eight suites.
* `supabase functions download` — refused by this session. Expected; provenance is closed at ledger
  #108 and I did not record it as a gap. The strongest link I executed myself is
  `supabase functions list` (version 92, `ezbr_sha256 33255b31…`) plus a git-object-level match of
  the committed live download to `c9dfab5bd433`.
* No browser and no live AI-chat turn. Every verdict here is `UNIT VERIFIED` / `CODE INSPECTED`
  against the real deployed bytes, never `E2E VERIFIED`.

---

## Artifacts

* `qa/verification/proposed/v45_regression_additions.mjs` — 51 pass / 3 fail, exits non-zero,
  correct from **any** cwd. `V45-D1`, `V45-D2` and `V45-D6` are the three reds and stay red until
  closed.
* `qa/verification/proposed/v45_known_failure_modes_entry_111.md` — the full ledger entry.
* `qa/verification/scratch/v92/v45/` — my harness, corpus, adversarial battery, mutation proofs,
  battery/gate runners, `CONTRACT 5` and eighth-vacuity empirical probes, runtime measurements.
  Every one of them was written for this run; none is imported from a prior verifier.

No synthetic `QA-VERIFY-*` data was created — this campaign is a source differential against
deployed bytes and never wrote to the database or to production. No migration was written, prepared,
or pushed. Nothing was deployed.
