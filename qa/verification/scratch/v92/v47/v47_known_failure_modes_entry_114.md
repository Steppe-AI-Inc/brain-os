## #114-V — verifier #47, campaign #107: candidate `bbc37ba0` vs DEPLOYED v92 — **FAIL**, on two defects nobody had looked for and one measurement error in the instrument that was itself the last round's correction

**Verdict: FAIL.** Candidate `bbc37ba0eaff9f15d2fffe09513ce7b8482261f9`, index.ts sha256
`db0aa63588d8b3f67d5c4bbba0b4bd9d6df97c03ef03685bbe564afc8fd78e63`, is **not fit to deploy over
v92**. Two blockers are new this round and neither is the disclosed product question:

1. **V47-D2** — a fabrication class deployed v92 corrects that the candidate **ships**: 320 of 320
   generated rows.
2. **V47-D3** — a **wrong destructive bind** where deployed v92 safely dead-ends: a disambiguation
   reply naming two options arms `archiveCompanyIds` for the wrong company with no LLM in the loop.

Both have a **PREPARED FIX**, mutation-proven, zero measured truth cost, full battery 36/0. Neither
is applied — this worktree is read-only on `supabase/functions/` and index.ts is byte-identical at
start and end.

---

### Provenance (STEP 1), stated at its real strength and no higher

`qa/verification/scratch/v92/deployed/supabase/functions/sem-ai-command/index.ts` (325 682 B, CRLF,
committed) LF-normalises to **321 370 B / sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`**, byte-identical to
`git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts`, and to
`qa/verification/scratch/v92/index.v92.ts`. Re-derived here, not restated.

**My provenance link this run is REPOSITORY-ARTIFACT-LEVEL, not byte-direct.** `supabase functions
list` / `download` were refused by this session's command classifier, so the step from "a live
download" to "these committed bytes" is **inherited** from ledger #108 and verifiers #45/#46, not
re-measured by me. Ledger #108 says provenance is closed and I was told not to re-open it; I am
saying plainly what I did and did not personally observe.

Rollback target (Q6): **`c9dfab5bd43346bad501ab44d7bfbc5211e90ed5`** exists in this repo, its
index.ts hashes to `795c20c8…`, and `scripts/factory-runner/verify-deployed-bytes.sh <ref>` is a
correct, repeatable post-deploy byte check. **EXACT and AVAILABLE.**

---

### V47-D1 (P1, INSTRUMENT) — the two-arm correction is itself incomplete. Deployed v92 has THREE prose-overwrite arms

`qa/verification/lib/v92_reference.mjs` — the campaign-wide instrument #46 introduced to fix a
one-arm model — models `FUTURE_PROMISE_PATTERN` and `PAST_COMPLETION_CLAIM_PATTERN`. Deployed v92
overwrites `result.summary` from **prose alone** on the same ungrounded turn through a **third**
path that nothing in this campaign has modelled:

```
claimsLifecycleClaim()                       index.v92.ts:441-448   (a pure prose test)
  -> claimsTaskDeleted     :2667   ids empty + !modelProposedPendingAction
  -> claimsCompanyDeleted  :2973   ids empty + !modelProposedPendingAction
  -> claimsPersonDeleted   :3060
  -> claimsGoalDeleted     :3135
  -> lifecycleMismatchCorrections   :4095-4099
  -> result.summary = ...           :4174     ← BEFORE the future/past arms even run
```

Nothing on that path requires a resolved entity, a factLine or a pendingAction — it is live in
*exactly* the turn configuration every differential in this campaign holds fixed.

**Witness that separates it from both modelled arms:** `"Deleting the task now."` —
`v92Destroys()` says PRESERVE; deployed v92 destroys it.

**Measured on my own 707-row corpus:** the third arm destroys **10 rows** the two-arm model says v92
preserves, and therefore **mis-counts 6 truthful rows as candidate truth regressions when they are
v92 parity** — including three ordinary product-help sentences ("Archiving a company does not delete
its tasks.", "Restoring a company brings back its people as well.", "Ending employment historicises
the person's assignments."). **Truth regression 55 (two-arm) → 49 (three-arm).**

**Direction, proved rather than assumed:** `claimsLifecycleClaim`'s body and all four
`claims*Deleted` declarations are **byte-identical between v92 and the candidate**, and over a
generated 420-row lifecycle space there are **0** rows arm 3 kills that the candidate preserves. So
the omission can only ever have *overstated* truth regressions, never hidden a fabrication
regression — the one-directionality survives, the magnitudes in the record do not.

*Answering the question I was asked directly:* the deliberate non-modelling of the turn-context
conditions (`deterministic-*`, `pendingAction`, `groundedOutcomeThisTurn`) **is right** — those are
properties of the turn, not the prose, and holding them fixed is what makes a prose differential
meaningful. Omitting `claimsLifecycleClaim` is **not** the same thing: it is prose-driven, and it
belongs in the model.

---

### V47-D2 (P1, DEPLOY BLOCKER) — a fabrication v92 corrects and the candidate ships

`nameInternal` (index.ts:5615) establishes a NAME reading only when an auxiliary **directly** governs
the capitalised run ("Nothing Bundt Cakes **has been** archived"). **One intervening lowercase head
noun** drops it back to a determiner reading, the negator disarms the belt, and the fabrication
ships:

```
"No Limits Inc unit was archived."              v92: CORRECTS   candidate: SHIPS
"No Limits Inc's depot was archived."           v92: CORRECTS   candidate: SHIPS
"Erdenet's No Limits Inc account was archived." v92: CORRECTS   candidate: SHIPS
"Nothing Bundt Cakes team has been deleted."    v92: CORRECTS   candidate: SHIPS
```

Sized on generated rows: **320 of 320** in the pinned suite; **264 of 384** across a wider frame set
including the shapes the current guards already cover. This is the labelled negator-token-name
section I was asked to build, in the direction that had not been tested — the simple form
(`"No Limits Inc was archived."`) *is* closed, so the class looked shut.

**The evidence to close it is already computed and already in scope and is not consulted.**
`knownEntityNames` (index.ts ~5150, from `canonicalById`) is threaded into the belt and read only by
the CONFIRMED arm. `nameInternal` never looks at it. A capitalised run that **equals a known entity
name** is a NAME whatever follows it; absence still proves nothing, so it stays truncation-safe.

**FIX PREPARED (not applied):** `qa/verification/scratch/v47/v47_build_namefix.mjs` →
`index.namefix.ts`. One expression. Measured:

| | fabrications shipped | truthful destroyed | corpus T-reg | corpus F-reg |
|---|---|---|---|---|
| stock, empty pack | 264/384 | 0/448 | 49 | 1 |
| stock, populated pack | 264/384 | 0/448 | 49 | 1 |
| **fixed, populated pack** | **40/384** | **0/448** | **49** | **0** |

224 of 264 closed at **zero** measured truth cost; full battery **36 suites / 0 failures** on the
patched build. The residual 40 are all one name — "Neither Nor Studios" — held out by the deliberate
`!/\bnor\b/` exclusion, which I did not touch. With an empty pack the fix is a no-op by design.

---

### V47-D3 (P1, DEPLOY BLOCKER) — the ordinal path binds the WRONG company when a reply names two options

`matchDisambiguationOption` (index.ts:436-458) reads the **first** ordinal, then computes `rest` by
stripping **every** ordinal token globally. A reply naming two options therefore reads as
"ordinal-**only**" and binds the first:

```
reply                    deployed v92   candidate      safe
"option 1, option 2"     DEAD-END       SELECT A       DEAD-END
"option 2, option 1"     DEAD-END       SELECT B       DEAD-END
"number 1 number 2"      DEAD-END       SELECT A       DEAD-END
"#1 #2"                  DEAD-END       SELECT A       DEAD-END
"option 1 option 3"      DEAD-END       SELECT A       DEAD-END
```

The bind is not cosmetic: `fields: { [field]: [matchedOption.id] }` at index.ts:2770 arms
`archiveCompanyIds` for that option, with **no LLM in the loop**. This is run14/D106's own severity
sentence ("Every earlier defect in this family could only DEAD-END; this one archives the wrong
company"), reintroduced through the ordinal path added in run18/D133. The code comment anticipated
a reply that "also carries a name" and dead-ends it correctly; it did not anticipate a reply that
carries a second **ordinal**.

Verifier #46 named the first shape and described a fix. It was **not implemented**. I implemented it.

**FIX PREPARED (not applied):** `qa/verification/scratch/v47/v47_build_ordinal_fix.mjs` →
`index.ordfix.ts`. Collect every ordinal reference; more than one distinct ordinal dead-ends to the
LLM, exactly as D136's `ambiguousWithAName` already does. **5 defect rows closed, 0 of 36 other
matcher shapes changed, full battery 36/0.**

One implementation note that is itself a finding: my first version wrote `new Set<number>()` and
took **nine** suites to `SyntaxError` — the harnesses' regex TypeScript strippers do not understand
generic type arguments. The shipped form uses an inferred `new Set()`. Measured, not assumed.

---

### Where the candidate is genuinely better than v92, stated so the FAIL is not read as "it is worse"

On my 707-row corpus with the three-arm model: **66 truthful answers deployed v92 destroys, the
candidate preserves**; matcher deviations from the safe answer go **16 (v92) → 3 (candidate)** across
41 shapes; the 26 pinned ledger production shapes (#64 D16 ×11, #65 D25 ×7, #65 D27 ×3 incl.
production row 9dda919c, #66 D40 ×1, BUG-002 ×3, v92diff-fix ×1) are **all still corrected** — Q5 is
genuinely closed, re-derived, not restated. All 12 belt guards are **load-bearing** on witnesses I
generated myself, and **no guard revert destroys a single truthful answer**. The candidate is a large
net improvement carrying two specific, fixable regressions.

---

### V47-D4 (P2) — 16 % of the belt's truth wins never reach the founder

The belt is not the last word on `result.summary`. `lifecycleMismatchCorrections` (identical in both
builds) overwrites it **earlier in the same else-if chain**. Of the 369 truthful rows the belt
preserves on my corpus, **60 (16.3 %) are overwritten anyway** — including the campaign's own
headline row, `"No company named Ulaanbaatar — North Depot was archived."`, which every suite pins as
"the paired real name survives". It survives `readsAsCompletion`. The founder still gets
"Couldn't confirm that. No company was actually archived or restored this turn."

This is **v92 parity**, not a regression. But every gate in this campaign measures the belt and reads
it as the product. Of the four re-pinned "CLOSED" residuals I audited (run18/D131 dash, name-initial,
and both idiom members), **three are honest at both levels and one is belt-only**.

### V47-D5 (P3) — the product's own string is belt-destroyed

`"Confirmed — you selected “Archived Media Group”."` — the exact text index.ts:2769 writes — fires
the belt in **both** pack states, while v92 preserves it. The entity-signal whitelist cannot rescue
it because that arm requires the participle **immediately** after `Confirmed —`; here it is inside a
quoted name. On the turn that emits it, `model === 'deterministic-disambiguation'` excludes
`legacyProseFallback`, and the only other path (`rewriteFromStructure`) fires from real evidence
where re-rendering is intended — so reachability is narrow (`CODE INSPECTED`, I could not execute
`serve()`). It is still a v92 differential and it is now pinned.

### V47-D6 — the CONTRACT 5 narrowing hides a real hazard (V46-D4 reproduced)

I injected `const nyLocal = 1;` into `readsAsCompletion`'s `.map()` callback and ran both suites:
**run15 BROKE; CONTRACT 5 stayed GREEN.** The narrowing to top-level declarations is *defensible*
(`completionIsNegated` is extracted brace-balanced, so its locals genuinely travel) and its two
coverage checks are non-vacuous — I verified both directions independently. But `readsAsCompletion`
is sliced by run15 **to its first `;`**, and CONTRACT 5 does not model that at all. The narrowing is
right about the case it argued and blind to the case that actually breaks a suite.

### V47-D7 — the QA estate writes into a DIFFERENT checkout, including this round's own probes

**44 executable `.mjs` artifacts** hard-code `C:/Users/Dell/dev/brain-os` — a different worktree from
this one. Several **write** there (`DIR = .../mut31` … `mut40`). Running
`qa/verification/scratch/v92/v31_mutation_proof.mjs` from this isolated worktree **wrote temp mutants
into the other checkout**; I did that, and I could not clean them up because the path is outside my
sandbox — flagging it for manual removal.

Worse, `v47_guard_repro.mjs` — the probe written **this round** to replace a retracted vacuous probe,
described as taking "its baseline from GIT" so it "cannot degenerate the same way" — reads its
`ROOT`, its git ref, its "CANDIDATE" and the v92 reference **all from the other checkout**, and its
`GUARD` anchor string is **absent from the committed candidate**, so against these bytes it prints
`STALE` and exits 2 after writing `pre_guard.ts` into that other repo. It is **inert on the build it
exists to measure** — the same class it was written to close, wearing a different coat.

I also correct #46's own diagnosis of `v31_mutation_proof.mjs`: its **read** path was already fixed
and resolves correctly here. Its three `NOT PROVEN` results are false for a *different* reason —
stale mutation strings (`F3.auxGap`: "mutation did not change the source") and under-sized shape sets
(`F1.ppInternal` 2/4, `F2.idiomLexicon` 0/5). My own mutation proof finds all three **load-bearing**.

### V47-D8 — the sixth "green because the corpus never generated the shape"

`qa/scenarios-runner/v92_parity_contract.mjs` is the permanent, named gate for
`truthRegression == 0` and `fabRegression == 0` versus deployed v92. It reads **46/0**. Its corpus
(`v92_parity_corpus.json`, 272 truthful / 182 fabrications) contains **zero** conditioned-offer rows
(`Let me …`) and **zero** fabrications about a negator-token name. **Both classes actually open on
this candidate are invisible to the gate that exists to catch them.** It also uses the one-arm v92
model and so inherits V47-D1.

---

### Rulings I was asked to make

* **Conditioned offer (V47-D9 / V46-D1 / V45-D1).** Re-derived on my own generation with all three
  v92 arms: **7 parity, 49 destroyed of 56**. Real, and it remains a **founder product decision** —
  I did not close it with a regex. **My product opinion, offered as an opinion:** the class is
  `"Let me <verb> <thing> <condition>."` — an offer that has *not* happened and says so. Overwriting
  it with "I can't actually do that from chat" is a **false** statement about the system's own
  ability, which is a worse error than the one the arm prevents. I would ship the prepared option.
* **"No North Depot was archived." destroyed, argued indistinguishable from "No Limits Inc was
  archived."** The argument is **sound as far as lexical rules go — and it is now moot**, because the
  discriminator exists: `knownEntityNames`. Same lever as V47-D2's fix. It is a determiner reading
  when no such entity exists and a name reading when one does. Also: v92 destroys the row too, so it
  is **parity**, not a regression.
* **The three "refused" shapes are NOT open.** `"No errors ACME was archived."`, `"No problem the log
  shows ACME was archived."` and `"Not a single task moved - Bob Smith was removed."` are **all
  caught** by the committed candidate (`newSubject` and `idiomStrip`, both mutation-proven here).
  The disclosure is stale; pinned as CONTRACTs so it cannot silently re-open.
* **Cubic growth (V46-D1 runtime): NOT deploy-blocking, and I could not reproduce the figure.** Across
  four unsplittable-clause shapes I measure **e ≈ 1.83 (quadratic)**, worst case **62 ms at 16 KB** —
  not e = 2.97 / 3.9 s. `max_tokens` is 8192 and there is no summary length cap, so ~32 KB is
  reachable at a few hundred ms of CPU, against a v92 cost of ~0.07 ms. It is a **characteristic v92
  does not have**, not a blocker. Cheap insurance if wanted: cap the belt input length.
* **`CONFIRMED_COMPLETION` missing `closed|added` (V46-D5): NOT deploy-blocking — it is v92 PARITY.**
  Deployed v92 misses all six of those fabrications too, so shipping them is not a regression, and the
  naive fix converts a parity gap into a **new** truth regression (2 rows v92 preserves). #46 was
  right to withdraw it. The precise interaction, which was not diagnosed: the entity-signal whitelist
  rescues only 1 of the 3 destroyed rows, because it requires `!COMPLETION_PARTICIPLE.test(tail)` and
  `"Confirmed — Added Value Ltd was not archived."` has `archived` in its tail. A correct version
  would test the tail for a **negated** participle, not any participle.
* **Battery, measured by me with `spawnSync` and no pipeline: 36 suites, 0 failures, 1052 assertions
  passed** — 31 asserting, 5 declared `SUPERSEDED` stubs, **0 genuinely vacuous**
  (`issue5_confirmation_action_type_binding.mjs` prints no `OK` lines but executes the real extracted
  `resolveClarificationField` 10/10 and exits 1 on failure). Ledger #101's "34 suites" is stale by
  two files. run15 is **57/0**; the D117 no-whole-span-lookaround invariant (CONTRACT 6) is green;
  run14/D107's slicing window is **no longer 2000 or 2600** — run39 removed the character budget
  entirely and replaced it with a statement-end scan that throws if the end is not found, which is
  the right fix.
* **Verifier gates:** v34 57/0, v35 55/0, v36 61/0, v37 21/0, v38 29/0, v39 21/0, v40 77/0, v41 22/0,
  v43 40/0; **v42 12/1**, **v44 115/3**, **v45 53/1**, **v46 30/6** — every red re-derives as a real
  finding. **v28 and v29 no longer run at all** (`ReferenceError: knownEntityNames is not defined`):
  the entity-signal threading broke two historical gates and nobody noticed.

---

### Identifier and deploy-surface delta (Q1), re-derived

Deploy surface between `c9dfab5bd433` and `bbc37ba0`: **one file**,
`supabase/functions/sem-ai-command/index.ts`. Everything else in the range is QA artifacts, docs,
`web/`, `scripts/` and `.gitattributes` — **Q7: yes, the Edge change is only the intended file.**
LF-normalised: **+1743 / −52 lines**, 78 hunks, largest a 1093-line insert at 4776. Identifiers:
**v92 499 declared, candidate 708 — 209 added, 0 removed**; **top-level 46 → 46, none added, none
removed**. **Q3: no reintroduction** — the D3 `&& !result.pendingAction` short-circuit, the #66/D40
`!rawClaims` gate and Deno-unsupported inline modifier groups are all absent. **Q4: yes, campaign
assumptions did depend on v92 behaviour that differs — see V47-D1.**

---

### Prepared, not applied

| what | file | status |
|---|---|---|
| V47-D2 `nameInternal` consults the positive entity signal | `qa/verification/scratch/v47/v47_build_namefix.mjs` | mutation-proven, battery 36/0, **FIX PREPARED** |
| V47-D3 two-ordinal replies fail closed | `qa/verification/scratch/v47/v47_build_ordinal_fix.mjs` | mutation-proven, battery 36/0, **FIX PREPARED** |
| conditioned offer | `qa/verification/scratch/v92/v45_build_letme_option.mjs` (prior round) | **FOUNDER PRODUCT DECISION** |

`index.ts` sha256 at start and at end of this run: `db0aa63588d8b3f67d5c4bbba0b4bd9d6df97c03ef03685bbe564afc8fd78e63` — unchanged, byte-for-byte.

**EDGE STATUS = NOT DEPLOYMENT READY. Production stays v92.**
