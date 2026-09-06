# v46 PROMOTION NOTE — campaign #106, verifier #46

**Verdict: FAIL. EDGE STATUS = NOT DEPLOYMENT READY. Production stays v92.**

Candidate `e06bebc0507715d24e528298293b3f28cd37f6e6`,
`supabase/functions/sem-ai-command/index.ts` sha256
`d0de7e7eadfb5e0a5eb34d92a85fe327fb70b7641decbddf84525b9f0ba13733` — asserted before and after every
temporary edit and at the end of the run, byte-identical throughout. index.ts was never written to:
every mutation in this run was applied to a source string.

---

## What blocks the deploy

**One new P1, and it is in the change this round adopted to make the belt faster.**

`V46-D3`. The short-circuit added to `completionIsNegated` this round —

```js
if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c)) return false;
```

— reasons that a clause with no completion vocabulary has nothing for a negator to negate. That is
true for the `LEGACY_PAST_COMPLETION` arm and **false for the `EXECUTION_IN_PROGRESS` arm**, whose
vocabulary is gerunds and idioms that appear in neither list. So a negated progressive
short-circuits to "not negated" and the belt destroys a truthful refusal:

```
                                                     v92    candidate
"Not processing the request."                        keeps  DESTROYS
"Not executing the plan without your approval."      keeps  DESTROYS
"Not processing the changes until you confirm."      keeps  DESTROYS
"Never processing the request twice."                keeps  DESTROYS
"No longer processing the request."                  keeps  DESTROYS
"Neither processing the request nor executing the plan."  keeps  DESTROYS
                                                     (8 shapes; all 8 restored by removing the guard)
```

The replacement text is *"I can't actually do that from chat — nothing was changed."* — false, and
persisted to `work_orders.output`. The sentence being destroyed is the assistant **declining to
act**, which is the confirm-before-mutate behaviour the product is built on.

**Fix prepared, not applied** (I have no write authority on the implementation branch):

```js
if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c) && !EXECUTION_IN_PROGRESS.test(c)) return false;
```

`EXECUTION_IN_PROGRESS` is already in scope (declared 144 lines earlier). Measured: restores 8/8,
**0 verdict changes** on my 682-row corpus, verdict-identical to removing the guard, and keeps
1.11–1.20× of the guard's 1.18–1.29× win.

**Plus the class #45 routed to you, unchanged and still open by instruction.** The conditioned offer
(`"Let me archive the company once you confirm."`) — 35 rows destroyed on my generation, v92 keeps
all of them, 0 fabrication cost. I did not close it with a regex and did not apply the prepared
option, per instruction. My product opinion is at the bottom.

---

## The thing you asked me to settle: the runtime number

**Both prior figures were measured on inputs that never enter the expensive path. The belt is
linear on ordinary prose and cubic on one specific shape.**

| shape | growth | worst case measured |
|---|---|---|
| ordinary prose (normal punctuation) | **linear**, e = 0.99 | **3.18 ms** at 33,639 ch (v92: 0.0004 ms) |
| one unsplittable clause with **skipped** negators | **cubic**, e = **2.97** | 70 ms @ 4 KB, **507 ms @ 8 KB**, **3.9 s @ 16 KB**, ~14.7 s @ 25 KB |

`readsAsCompletion` has **two call sites** on the same summary (index.ts:5693, :5741) — double all of
it per turn.

The scan loop breaks at the first negator it does not skip, which is why ordinary text is cheap.
Every *skipped* negator costs a full `newSubject` recomputation, which rescans the whole clause —
O(n²) each, O(n³) when their count scales with length. **One skipped negator is enough**: a 16 KB
single clause goes 0.11 ms → 28.6 ms from the single word `pending`. `max_tokens: 8192` allows a
~25–32 KB summary and there is no length cap before the belt; `and` is a clause boundary only before
a *lowercase* token, so a run-on list of capitalised names is one clause by construction.

Not a truth regression, and not on its own a reason to hold the deploy — but it is a production
characteristic v92 does not have, and it is what you asked for.

---

## And the reason it shipped, which matters more than the number

`qa/verification/scratch/v92/v46_runtime_probe.mjs` — the artifact the record cites as evidence that
the adopted guard is safe and fast — builds `before` from a hard-coded absolute path into
`C:/Users/Dell/dev/brain-os/` and `after` from `qa/verification/scratch/v92/fix46.ts`. **Both files
are sha256 `d0de7e7e…`, byte-identical to each other and to the candidate.** It compares a build
against itself. Its "1.24–1.44×" is noise and its **"0 verdict changes of 9" is 0 by construction and
cannot ever fail**.

That is the campaign's defining vacuity class, sitting inside the evidence for the change that
caused the P1 above. And it is not isolated: **40 `.mjs` artifacts under `qa/verification/scratch/v92`
hard-code an absolute path into that other worktree**, so they silently read a different checkout than
the pinned candidate. Today the bytes coincide, which is luck, not isolation.

Your own note carried the lesson forward — *"a fix measured against the corpus that was already green
is measured against the wrong thing."* This is the next instance, and it is worse: the fix was
measured against **itself**.

---

## Everything else in the differential

| question | answer |
|---|---|
| Deploy surface delta | `sem-ai-command/index.ts` only; no migrations, no other functions |
| Truth regressions vs v92 (682-row own corpus) | **35**, all the conditioned-offer class |
| …plus, found by attacking this round's guard | **8** more (V46-D3) — **43 total, 2 classes** |
| Fabrication regressions vs v92 | **0** |
| Rescued / newly caught | 167 truthful answers rescued, 107 fabrications newly caught |
| Negator-token names, both directions | 0 truth regressions, 0 fabrication regressions |
| Identifiers / user-facing strings removed from v92 | **0 / 0** (221 identifiers added) |
| Battery, per-child exit codes | **36 / 0**, 1,192 assertions, 0 vacuous |
| Prior gates v30–v45 | **all 16 match exactly**, 0 mismatches |
| Ledger #64 D16, #65 D25, #65 D27 (`9dda919c`), #66 D40 | **all four re-derived CLOSED** |
| Shipped belt mechanisms load-bearing | **20 of 20**, zero no-ops (6 needed a better probe first) |
| Rollback | **exact and available** — `c9dfab5bd433`, blob `795c20c8…`, byte-check script present |
| Matcher, 27 shapes + 120k fuzz | 2 candidate improvements, 5 equal-safety differences, **1 new defect (V46-D7)** |

**Q4 deserves a line of its own.** `PAST_COMPLETION_CLAIM_PATTERN` is byte-identical between the
campaign baseline `4476c92` and live v92, so every belt number this campaign produced is measured
against production's real gate. But `matchDisambiguationOption`, `resolveClarificationField`,
`RESTORE_VERB_PATTERN` and `FUTURE_PROMISE_PATTERN` **all differ** between them — any *matcher*
assumption inherited from `4476c92` is not valid against live v92.

---

## Three more findings, none blocking

**V46-D7 (P2).** The ordinal path binds a destructive option on a reply that names TWO options:
`"option 1, option 2"` → binds 1; `"#2 the first one"` → binds 2; `"option 1 #2"` → binds 1. Which
one wins depends only on which notation the first regex alternative catches. v92 dead-ends on all
four. This violates the function's own rule (run15/D116, *"FAIL CLOSED, and NEVER INTERPRET"*), in the
same function as D106 and D116. **Fix prepared: 0 failures** — closes all four, preserves all eight
legitimate single selections.

**V46-D4 (P2).** The CONTRACT 5 narrowing is *not* vacuous — it still catches a new top-level
declaration, and I confirmed locals inside `completionIsNegated` are genuinely harmless in both
directions, so half the argument holds. But it over-narrowed: a local const inside
`readsAsCompletion`'s own `.map()` callback is **not** flagged and **breaks run15** with
`SyntaxError: Unexpected end of input` (its extractor slices to the first `;`). The narrowing hides a
real hazard and converts a named contract failure into an opaque one in an unrelated suite.

**V46-D5 (P3, v92-parity).** `CONFIRMED_COMPLETION` omits `closed` and `added`, which every sibling
list carries — so `"Confirmed — Closed ACME."` and `"Confirmed — Added ACME."` escape while
`"Confirmed — Archived ACME."` is caught. The run13/D100 "one predicate, both arms" class again.
v92 catches none of the three, so it is parity, not a regression.

---

## Corrections to the record

* **`v31_mutation_proof.mjs` is NOT fixed.** It still hard-codes a path into the other worktree, it
  **exits 1**, and it reports three FALSE `NOT PROVEN` results — `ppInternal`, `idiomLexicon` and
  `auxGap` ("mutation did not change the source"). I proved all three load-bearing.
  `v44_mutation_proof.mjs` genuinely is fixed.
* **"the imminent idiom list covers the base form as well as the gerund" is overstated.** True for
  `go(?:ing)? ahead` and `kick(?:ing)? off`; `starting the` has no `start the` alternative, so
  `"Let me start the archive."` escapes. v92-parity, so not a blocker.
* **#45's V45-D2, V45-D6 and the `detName` `/i` removal are genuinely closed** — re-derived.
* **`"No North Depot was archived."` is destroyed by deployed v92 too**, so it is not a regression and
  cannot block anything. The session's argument that it is indistinguishable from
  `"No Limits Inc was archived."` is **correct**, and since the entity signal is positive-only by
  design (absence is never evidence — re-verified), refusing to close it lexically is the right call.

---

## The conditioned-offer class — a product opinion, offered as one

I agree with #45 and I will not close it with a regex. My reasoning, stated separately from the
verification:

The arm exists to stop the assistant claiming an action is under way when nothing is happening. A
sentence whose own clause conditions the action on **you** — "once **you** confirm", "if **you**
approve" — is not that claim. It is a request for permission, and it is the confirm-before-mutate
pattern the whole product runs on. Replacing it with *"I can't actually do that from chat"* destroys a
true sentence, substitutes a false one (archiving **is** a chat capability), and strands the
conversation at the exact moment the user was about to say yes.

But there is a cleaner answer than either option on the table, and V46-D7 is why I think so. A
conditioned offer that lives only in prose is unverifiable by construction — the belt cannot tell
`"Let me archive it once you confirm"` from `"Let me archive it"` without parsing intent, which is
what this whole campaign exists to avoid. The offer should be produced **structurally**, as a
`pendingAction`, and the prompt should stop the model from phrasing offers in prose at all. Then the
arm can keep firing on unconditioned prose with no exception carved into it, and the confirmation
round-trip goes through the machinery that already has tests. Option 1 (stand the arm down on an
explicit user-conditional) is a safe stopgap and I would take it over the status quo — but it is a
stopgap, and each exception carved into this belt has cost a later verifier a truth regression.

---

## Coverage gaps, stated not skipped

* **No browser, no live AI chat turn.** Every verdict is `UNIT VERIFIED` / `CODE INSPECTED` against
  real deployed bytes and real candidate bytes — never `E2E VERIFIED`.
* **`supabase db query`, `functions list`, `functions download` all refused** by this session's
  classifier. No production row was read; my corpus uses realistic constructed names rather than names
  read from `companies`. Provenance is closed at ledger #108 and I did not record it as a gap. My own
  link to the live project is **artifact-mediated** (byte-direct only at the git-object level) and I
  am not overstating it.
* **`deno check` BLOCKED** (no binary, `npx deno` refused). Substituted: a character-walk scan of all
  129 regex literals — 0 fail to construct, 0 inline `(?i:)` modifier groups — and the belt is
  `new Function`-built successfully by every suite in the battery. The "deno 23" claim is not verified
  by me.

## Synthetic data

None created. This is a source differential against deployed bytes; nothing was written to the
database, nothing was deployed, and no migration was written, prepared or pushed. There is no
`QA-VERIFY-*` data from this run to clean up.

## Artifacts

* `qa/verification/proposed/v46_regression_additions.mjs` — 28 pass / 8 fail, exits non-zero, correct
  from any cwd, honours `SEM_INDEX_SRC`. The 8 reds are the findings above and stay red until closed.
* `qa/verification/proposed/v46_known_failure_modes_entry_112.md` — the full ledger entry.
* `qa/verification/scratch/v92/v46/` — harness, 682-row corpus, differential, three runtime probes,
  the guard attack, both prepared fixes, the 20-mechanism mutation proof, the no-op witness hunts, the
  CONTRACT 5 empirical judgment, battery and gate runners, matcher differential and fuzz. All written
  for this run; none imported from a prior verifier; none contains an absolute path.
