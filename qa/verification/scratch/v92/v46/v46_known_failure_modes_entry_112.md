## #112-V — Verifier #46 (campaign #106): the production-deploy gate on candidate `e06bebc0` FAILS against deployed v92 on four truth-destruction classes and one fail-open destructive bind; the differential itself had been sized against the wrong model of v92

**Verdict: FAIL. EDGE STATUS = NOT DEPLOYMENT READY.**
Candidate `e06bebc0507715d24e528298293b3f28cd37f6e6`, `supabase/functions/sem-ai-command/index.ts`
sha256 `d0de7e7eadfb5e0a5eb34d92a85fe327fb70b7641decbddf84525b9f0ba13733` (byte-identical at
start and end of this run; every mutation in this campaign was applied to an in-memory STRING,
never to the working tree). Independent verifier, isolated worktree, no write authority on the
implementation branch. Artifact branch `verify-e06bebc-campaign106`.

This entry supersedes nothing; it records an eighteenth consecutive failure of this candidate line
and, more importantly, records that **the measurement instrument the campaign has been steering by
was itself wrong in two separate ways**, both found this run.

---

### 0. What deployed v92 actually is (Step 1) — and the exact strength of that link

Obtained by me, this session:

| fact | value | how I got it |
|---|---|---|
| deployed function | `sem-ai-command`, status `ACTIVE`, `version 92`, `verify_jwt true` | my own `npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` |
| deployed bundle hash | `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475` | same call |
| deployed `updated_at` | `1788239725518` | same call |
| claimed source commit | `c9dfab5bd433`, blob sha256 `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` | `git cat-file -p`, hashed by me |
| committed download artifact | `qa/verification/scratch/v92/deployed/.../index.ts`, LF-sha256 `795c20c8…`, tracked at HEAD in commit `24bfccf` | hashed by me |

**CONFIRMED, with its provenance strength stated honestly and not overstated.** The
*version number and bundle hash* of the live function are **LIVE VERIFIED** by my own call. The
link from that live bundle to a *source text* is **INTEGRATION-LEVEL / artifact-mediated**, not
byte-direct: `functions download` is refused by this session's safety classifier (expected, ledger
#108), and `ezbr_sha256` is a bundle hash I cannot recompute from source. What I proved
byte-directly is that the committed download artifact and git `c9dfab5bd433` are the same content
(LF-normalised). That is the correct claim; "I byte-verified the deployed source" would not be.

---

### 1. THE INSTRUMENT WAS WRONG — twice. Read this before any of the findings.

The launch brief asked me to look for the next instance of *"a fix measured against the corpus that
was already green is measured against the wrong thing."* I found two, and one of them is mine.

**(a) V46-D2 — the runtime probe the record cites is vacuous. CONFIRMED.**
`qa/verification/scratch/v92/v46_runtime_probe.mjs`, the artifact the implementing session offered
as its evidence for the adopted #45 short-circuit ("1.24–1.44× on ordinary prose, neutral where the
vocabulary is present, 0 verdict changes of 9"), reads:

```
const ROOT = 'C:/Users/Dell/dev/brain-os/';
const before = buildGate(ROOT + 'supabase/functions/sem-ai-command/index.ts');
const after  = buildGate(ROOT + 'qa/verification/scratch/v92/fix46.ts');
```

In this worktree those two files are **byte-identical** (`len 477823`, raw sha256 both
`d0de7e7eadfb5e0a…`). The probe measures the candidate against itself. Its speed-up figure and its
"0 verdict changes" are therefore **not evidence of anything** — a guard that changes nothing cannot
be shown safe by a comparison in which nothing changes. It additionally hard-codes an absolute path
into a *different checkout*, so wherever it is run it may not even be reading the file under test.

**(b) V46-D8 — my own first-pass harness overstated the headline regression count. CORRECTED.**
Every differential in this campaign has modelled deployed v92 as ONE regex,
`PAST_COMPLETION_CLAIM_PATTERN`. v92 has **two** prose-overwrite arms, and the past-completion arm
is explicitly gated on `!claimsFutureActionWithNoPlan` (v92 `index.ts:4240-4242`). The candidate
carries the identical precedence on `legacyProseFallback` (`index.ts:5690-5693`). A summary that
v92's `FUTURE_PROMISE_PATTERN` destroys is therefore **v92 parity**, not a candidate regression.

Re-measured with both arms modelled, on my own 682-row corpus:

| | naive (one v92 arm) | corrected (both v92 arms) |
|---|---|---|
| conditioned-offer truth regressions | 35 | **28** |
| fabrication regressions | 0 | **0** |

The seven `"I am going to archive the company …"` rows are v92 parity. This does not change the
verdict — 28 is still 28 — but it is the same failure mode the campaign is named after, and it means
**every count in this campaign's record that was produced by a one-arm v92 model is suspect and
should be re-derived, not restated.** The regression suite I ship models both arms
(`v92Destroys()`), and asserts the 28/7 split explicitly so the correction cannot silently revert.

---

### 2. DEPLOY BLOCKERS

#### V46-D3 (P1) — the adopted verifier-#45 short-circuit destroys truthful refusals that deployed v92 preserves

The candidate's `completionIsNegated` opens with

```js
if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c)) return false;
```

adopted as a speed guard on the file's hottest predicate, with the premise *"skip the per-negator
scan when the clause carries no completion vocabulary at all."*

**The premise is false.** `readsAsCompletion` has TWO catching arms. The guard tests the vocabulary
of the first (`LEGACY_PAST_COMPLETION` / participles). The second arm, `EXECUTION_IN_PROGRESS`, is
built from `PROGRESS_VERBS` — `processing`, `executing`, `archiving`, `deleting`, … — and **not one
of those gerunds appears in `COMPLETION_VERB` or `COMPLETION_PARTICIPLE`** (`index.ts:5566-5567`).
So for every progressive-only clause the guard returns `false` ("not negated") unconditionally, and
negation is never detected for that arm at all.

Measured against BOTH v92 prose arms — 9 truthful refusals v92 preserves and the candidate destroys:

```
row                                                     v92 destroys   candidate
Not processing the request.                                 false         FIRE
Not executing the plan.                                     false         FIRE
Not executing the plan without your approval.               false         FIRE
Not processing the changes until you confirm.               false         FIRE
Never processing the request twice.                         false         FIRE
No longer processing the request.                           false         FIRE
No longer executing the plan.                               false         FIRE     <- not previously reported
Hardly processing the request at this volume.               false         FIRE
Neither processing the request nor executing the plan.      false         FIRE
```

User impact: the founder asks for something the assistant correctly declines to do, the assistant
correctly says *"Not executing the plan without your approval."*, and the belt replaces that true
sentence with *"I can't actually do that from chat — nothing was changed."* — and persists the
replacement to `work_orders.output`, so it survives reload. **A true refusal is replaced by a false
one.** This is the same shape as verifier #39's finding (an arm reading ordinary language as an
execution claim), re-entering through a performance optimisation rather than through a new arm.

**Root-cause class:** *a short-circuit whose vocabulary test does not cover every arm the predicate
feeds.* This is the eighth recurrence in this file's history of the "one predicate, two arms"
family (run13/D100, run14/D107, V46-D5 below).

**FIX PREPARED (not applied — no write authority).** Three variants built by string surgery on a
copy and measured against each other; all three close 9/9, keep 11/11 progressive fabrications
caught, and change **zero** verdicts on the 682-row corpus:

| variant | D3 closed | corpus TR | corpus FR | prog. fabs | ms (prose w/ vocab) | ms (prose w/o vocab) |
|---|---|---|---|---|---|---|
| candidate (as shipped) | 0/9 | 28 | 0 | 11/11 | 0.203 | 0.173 |
| A — revert the guard | 9/9 | 28 | 0 | 11/11 | 0.257 | 0.226 |
| B — `&& !EXECUTION_IN_PROGRESS.test(c)` | 9/9 | 28 | 0 | 11/11 | 0.274 | 0.184 |
| **C — add the gerund alternation** | **9/9** | 28 | 0 | 11/11 | 0.274 | **0.173** |

**Recommend C.** It is the only variant that closes the defect at *zero* measured cost on the
input shape the guard exists for. Prepared source for B is at
`qa/verification/scratch/v92/v46/v46r_d3_fixed_index.ts`; pointing the shipped regression suite at it
with `SEM_INDEX_SRC` flips exactly the two V46-D3 assertions green (35/10 → 37/8) and nothing else.
Note also that the guard's own measured benefit is ~1.16×, not the 1.24–1.44× on record — that
number came from the vacuous probe in §1(a).

#### V46-D7 (P1) — the ordinal disambiguation path FAILS OPEN and binds a destructive action on a reply that names two different options

`matchDisambiguationOption` (`index.ts:435-458`, run18/D133) takes `ordN` from the **first** matching
ordinal notation, then strips **every** ordinal notation out of `rest` before the "is this reply
ordinal-only?" test. A reply naming two *different* options therefore still tests as ordinal-only,
and binds whichever notation the first regex alternative happened to catch. Which one that is
depends on the notation, not on the reply.

With three archive options offered and plain labels (re-run with no `"(option N)"` text in any
label, to rule out a substring artifact in my first probe):

```
reply                        deployed v92                candidate
"option 1, option 2"         null (dead-ends — SAFE)     BINDS option 1  -> arms archiveCompanyIds
"option 1 #2"                null (dead-ends — SAFE)     BINDS option 1  -> arms archiveCompanyIds
"the first one number 2"     null (dead-ends — SAFE)     BINDS option 2  -> arms archiveCompanyIds
"#2 the first one"           null (dead-ends — SAFE)     BINDS option 2  -> arms archiveCompanyIds
```

A 120,000-case matcher fuzz surfaced the same class independently (`"yes number 2"` variants,
`"2 the second one"`, `"option 2 the second one"`), plus 13,347 cases in the safe direction where the
candidate refuses and v92 bound.

This violates the function's **own** stated rule, written in its own comments at `index.ts:470`:
*"FAIL CLOSED, and NEVER INTERPRET the negation… a guess here is an archive of the wrong company"*
(run15/D116). The negation cases obey it. The multi-ordinal cases do not. Deployed v92 dead-ends on
all four, so this is a **destructive-safety regression against production**, not merely an
unimproved edge.

It is not a fabrication and not a destroyed sentence, so it does not fall under the brief's literal
FAIL criteria — I am calling it a deploy blocker on independent grounds and saying so plainly: a
company being archived because the founder typed two option numbers is worse than a wrong sentence.

**FIX PREPARED:** collect all distinct ordinal referents; bind only when there is exactly one.
Closes all 4, preserves all 8 legitimate single selections (`"option 2 please"`, `"the second one"`,
`"#3"`, `"number 3"`, `"3"`, `"yes option 2"`, …) and still permits a consistent repetition
(`"option 2 the second one"`). `qa/verification/scratch/v92/v46/v46_ordinal_fix.mjs`, 0 failures.

#### V45-D1 / the conditioned-offer class (28 rows) — OPEN BY PRODUCT DECISION, still a regression against v92

```
"Let me archive the company once you confirm."      v92 preserves   candidate destroys
"Let me delete the project if you approve."         v92 preserves   candidate destroys
"I'm about to archive it as soon as you say go."    v92 preserves   candidate destroys
"Let me go ahead and archive the company unless you object."   (and 24 more)
```

Correctly sized at **28**, not 35 (see §1(b)) and not 117 or 39. As instructed, I did **not** apply
`v45_build_letme_option.mjs` and did **not** close it with a regex. The unconditioned claim the arm
exists for (`"Let me archive the company."`) stays caught in every variant.

**Product opinion, offered because it was invited.** Close it. *"Let me X once you confirm"* is not a
completion claim, not a promise with nothing behind it, and not something a truthfulness belt should
have an opinion about — it is the assistant asking permission, which is the behaviour the product
wants more of. The arm exists to catch *"Let me archive the company."* said with nothing queued; a
trailing condition clause is the one lexical signal that reliably distinguishes the two, and it does
not depend on entity knowledge, casing, or the pack. The real risk is the opposite of the one being
guarded: an assistant that gets punished for asking permission will stop asking. If the founder
wants a belt-and-braces version, condition the exemption on the turn also carrying a real
`pendingAction` — but do not ship a build that replaces *"Let me archive the company once you
confirm"* with *"I can't actually do that from chat."*

#### V46-D9 (P2, NEW this run) — the curly-apostrophe widening of `FUTURE_PROMISE_PATTERN` destroys truthful clarifying replies v92 preserves

The candidate widened v92's `\b(i'?ll|…)` to `\b(i['']?ll|…)`. Directionally right — the same
sentence should not behave differently because of typography. But `FUTURE_PROMISE_PATTERN` has no
exclusion for a *conditional* promise, and the apostrophe an LLM actually emits by default is the
curly one. So the widening takes an over-firing v92 already has on the straight-quote form and
applies it to the form that dominates real traffic:

```
"I'll assign this once you tell me who."             v92 preserves   candidate destroys
"I'll need the company name before I can create it." v92 preserves   candidate destroys
```

(Their straight-quote twins are destroyed by v92 too — so v92 has the same defect, narrower.)
Not on its own a reason to fail the deploy, but it is a truth regression against production by the
gate's own definition and it must be counted as one.

---

### 3. NON-BLOCKING FINDINGS, all re-derived by me

**V46-D1 (P2, availability) — the belt is SUPER-QUADRATIC on one unsplittable clause. The runtime
discrepancy the brief asked me to settle is settled: both prior numbers were right about different
inputs, and neither is the whole answer.**

Entry point timed: `readsAsCompletion(summary)` — the real one, with **two** call sites
(`index.ts:5693` `legacyProseFallback`, `5741` `unaccountedCompletionProse`), so every figure below
doubles per turn.

| input shape | growth | at 33,639 chars | deployed v92 |
|---|---|---|---|
| ordinary punctuated prose (a normal reply) | **LINEAR**, fitted e = 0.97 | 3.20 ms | 0.0004 ms |
| unpunctuated run of ordinary names | LINEAR, e = 1.00 | 0.50 ms | 0.0003 ms |
| **ONE unsplittable clause carrying skipped negators** | **e = 2.97 (cubic)** | **34.9 s** | 0.22 ms |

So: the implementing session's *"6.46 ms, roughly linear"* is correct **for ordinary prose only**.
Verifier #45's *"657 ms"* is the right order of magnitude **for the adversarial shape** (I measure
509 ms at 8 KB). One of us was not measuring the wrong thing — we were measuring different things,
and the record collapsed them into a single number. The real characteristic is: **flat on normal
input, cubic on one specific shape.**

Mechanism, isolated: the per-negator scan loop recomputes `newSubject` for every *skipped* negator,
and `newSubject` re-scans the whole clause with a global regex and slices O(n) spans — O(n²) per
skipped negator, O(n³) when the negator count scales with length. **One** skipped negator is enough
and already costs O(n²): a 16 KB single clause goes 0.11 ms → 28.6 ms from the single word
`pending`. Cost then scales linearly in the number of skipped negators (1 → 8.4 ms, 64 → 408 ms at
8 KB).

Reachability: `max_tokens: 8192` (`index.ts:1759`, `1821`) permits a ~25–32 KB summary, and there is
**no length cap anywhere between the model reply and the belt**. `and` is a splitter boundary only
before a *lowercase* token, so a run-on list of capitalised entity names is one clause by
construction. Per turn: 20.6 ms at 2 KB, 1.0 s at 8 KB, 7.7 s at 16 KB. Deployed v92 is flat. This
is a real production characteristic the founder should know about before a deploy; it is not why I
am failing the candidate.

**V46-D4 (P2) — the CONTRACT 5 narrowing is defensible, and it does hide one real hazard.**
Judged by mutating five distinct declaration sites and asking, for each, both *"does CONTRACT 5 flag
it?"* and *"does any suite actually break?"*:

| site | CONTRACT 5 flags | suites broken | verdict |
|---|---|---|---|
| new TOP-LEVEL const in the belt block | **yes** | 1 (run28) | caught — the contract still fails for the reason it exists |
| local inside `completionIsNegated` | no | 0 | genuinely harmless — narrowing is honest here |
| local inside `completionIsNegated`, after the loop | no | 0 | genuinely harmless |
| **local inside the `readsAsCompletion` `.map()` callback** | **no** | **1 (run15)** | *** THE NARROWING HIDES THIS *** |
| new top-level const before `LEGACY_PAST_COMPLETION` | no | 0 | harmless |

So: **the narrowed contract is still able to fail for the reason it exists** (proved by its own
non-vacuity assertion and by my independent mutation), and its stated premise is true for
`completionIsNegated`. But the premise generalises "locals are safe" one site too far —
`readsAsCompletion`'s callback body is sliced to the first semicolon by run15's extractor, so a
local there breaks that suite with an opaque `SyntaxError` and nothing flags it. The pre-narrowing
flat sequence over the whole block would have caught it. One uncovered site, named.

**V46-D5 (P3, v92-parity) — `CONFIRMED_COMPLETION` omits `closed` and `added` while every sibling
participle list carries them.** `"Confirmed — Archived ACME."` is caught; `"Confirmed — Closed
ACME."` and `"Confirmed — Added ACME."` escape. Deployed v92 catches none of the three, so this is
not a deploy blocker — but it is the run13/D100 "one predicate, both arms" family recurring inside
the fix that was written to end that family.

**V46-D6 (P2, QA integrity) — 40 campaign artifacts under `qa/verification/scratch/v92` hard-code
`C:/Users/Dell/dev/brain-os/` and silently read a DIFFERENT checkout.** Including
`v31_mutation_proof.mjs`, which the brief named. Consequence: any evidence those 40 files produced in
this worktree is about another tree, not about the candidate. **The committed suites under
`qa/scenarios-runner/` are clean** — every one resolves `index.ts` from its own location or
`SEM_INDEX_SRC`, verified by grep and by running the whole battery from five different cwds — so the
battery itself is sound. The rot is confined to scratch.

**#45-D6's closure is PARTIAL.** The imminent-idiom list now covers the base form for `go ahead` and
`kick off` (`"Let me go ahead and archive the company."`, `"I will go ahead and archive the
company."`, `"Let me kick off the archive."` all caught). It does **not** cover `"Let me start the
archive."`, which still escapes. v92-parity, so not a blocker — but "the base form is covered" is
true of two idioms out of three, and was recorded without that qualifier.

---

### 4. WHAT IS GENUINELY CLEAN — the seven deploy questions

**Q1 — exact delta.** Deploy surface under `supabase/` is **exactly one file**:
`functions/sem-ai-command/index.ts`. No migrations, no other function. LF-normalised diff:
1743 insertions / 52 deletions. Identifier delta re-derived from scratch (ledger #90 got this wrong
once, so I did not restate it): v92 declares 513, candidate 734, **0 removed**, 221 added. My count
includes destructured and class members; #45 said 205 — a methodology difference, not a
disagreement. **0 user-facing string literals removed** (v92 323, candidate 491).

**Q2 — production behaviour preserved.** My own 682-row corpus (438 truthful / 244 fabrications),
no rows imported from any prior verifier, with the mandated labelled negator-name section
(`No Limits Inc`, `Nothing Bundt Cakes`, `Never Summer Industries`, `None The Wiser LLC`,
`Nothing But Nets Foundation`, `Pending Review Board`, `Awaiting Approval Group`) in **both**
directions. All four quadrants, measured with the pack POPULATED and EMPTY (identical results):

```
                                  truthReg  fabReg  rescued  newlyCaught
negator-token names, truthful (76)       0       0       28            0
negator-token names, fabrication (62)    0       0        0           24
participle-lead names, both (20)         0       0        8            4
dash-before-capital names, both (10)     0       0        6            2
ordinary truthful negatives (200)        0       0       90            0
truthful about people (24)               0       0        8            0
ordinary product-help prose (29)         0       0        0            0
plain fabrications (150)                 0       0        0           68
--------------------------------------------------------------------------
TOTAL 682                               28*      0      167          107
                                     (*all one class, §2)
```

**Fabrication regression = 0 in every section.** Truth regression = 0 in every section except the
conditioned offer. Matcher: 27 disambiguation shapes + 120,000 fuzzed cases.

Specifically confirmed as the brief required: `"No company named Ulaanbaatar — North Depot was
archived."` and `"No unit at Erdenet — Copper Works was archived."` both **survive**, their
fabrication twins (`"Ulaanbaatar — North Depot was archived."`) are both **caught**, and a mutation
proof shows it is the **negator** that separates them, not the casing — the session's refusal to
close that class by casing is correct and I confirm it.

**Q3 — nothing previously removed is reintroduced.** The D3 `&& !result.pendingAction`
short-circuit is absent; the `!rawClaims` drift gate is absent. (The one construct present in the
candidate and absent in v92 that resembles a removed shape is the per-arm participle divergence —
that is V46-D5, and it is new, not reintroduced.)

**Q4 — campaign assumptions built on 4476c92 do NOT all hold against live v92.** The two files
differ, and four of the constructs this campaign reasons about differ between them:
`matchDisambiguationOption`, `resolveClarificationField`, `RESTORE_VERB_PATTERN`,
`FUTURE_PROMISE_PATTERN`. `PAST_COMPLETION_CLAIM_PATTERN` and `ARCHIVE_VERB_PATTERN` are identical.
Verifier #29's certification against 4476c92 is **historical only** and must not be cited for
matcher or future-promise behaviour.

**Q5 — the four named ledger closures are genuinely closed**, each re-derived on candidate bytes:
#64/D16 (9 delimiter-escape shapes, all caught), #65/D25 (no command-derived read-only amnesty gate
exists; 7 shapes caught), #65/D27 (production row `9dda919c`, the `renamed: "X" → "Y"` arm, tested on
the whole summary, 4 shapes caught), #66/D40 (the drift check is not gated on `!rawClaims`; both
arms require `!hasSupportedMutationClaim`). 4/4 CLOSED.

**Q6 — rollback target is exact and available.** Commit `c9dfab5bd43346bad501ab44d7bfbc5211e90ed5`
present as a git object; blob sha256 `795c20c8…` verified by me; the reference copy is pinned
`eol=lf` in `.gitattributes`; a post-deploy byte-check script is present. Candidate line endings:
6003 CRLF, **0 bare LF** — matches the expected gate.

**Q7 — the change contains only intended Edge changes.** One file, no migrations, no schema, no RLS,
no other function.

**Suite integrity.** Full battery run from the filesystem (`readdirSync`, not a hard-coded list),
reading **each child process's own exit status** — the campaign record's earlier "battery 33/0" was
both under-enumerated and taken from a pipeline's status, and I confirm the retraction: the honest
number is **36 suites executed, 36 exit-0, 0 non-zero, 1192 assertions, 5 SUPERSEDED stubs.** A
second pass scanned every suite's **output text** for failure lines and zero-corpus lines
independently of exit codes: **0 of 36 need inspection.** One suite
(`issue5_confirmation_action_type_binding.mjs`) trips a naive 0-assertion vacuity heuristic but
genuinely asserts 10/10 in a format the counter does not match — not vacuous. `run15` reads 57/0 and
CONTRACT 6 (D117, no whole-span lookaround in the belt) is present and green. The four re-pinned
residuals (run18/D131 `but` member, run18/D131 `disclosedResidual`, run19/D131, run28/D116) are
**honest re-pins**: each assertion requires the fabrication to be caught **and** the paired real name
to survive, in the same predicate, so a re-pin cannot go green by destroying the truthful twin. The
brief's description of run14/D107 is stale in the candidate's favour — the slicing window was not
merely widened 2000 → 2600; it was widened again to 4000 and has since been **removed entirely** in
favour of scanning to the statement's real end with a loud throw if that end is not found. That is
the right fix and it closes the "eleventh vacuous-guard recurrence" properly.

**Gate states, measured by me, all 16 matching the stated expectation exactly (0 mismatches):**
battery 36/0 · v45 53/1 · v44 115/3 · v43 40/0 · v42 12/1 · v41 22/0 · v40 77/0 · v39 21/0 ·
v38 29/0 · v37 21/0 · v36 61/0 · v35 55/0 · v34 57/0 · v33 93/0 · v32 101/0 · v31 33/1 · v30 25/1.

**Mutation proof: 20 belt mechanisms mutated, 20/20 LOAD-BEARING.** Six looked like no-ops on
first-pass probes and all six yielded witnesses under targeted probing — #45's warning about
first-pass no-op verdicts reproduces exactly, and the correct conclusion is that a no-op verdict from
a corpus probe is not evidence of a dead fix.

**Attacks that found nothing (reported so the coverage is on record):** the belt does not throw or
hang on degenerate input (empty, 5 KB whitespace, 2000 unbalanced parens, a 50 KB single token,
20 KB of delimiters, a lone surrogate); **none of the function's own four canned corrective
`result.summary` strings trips its own belt or its own future-promise arm** (a cascade class nobody
had checked); and 21 fresh truthful shapes nobody in this campaign had tried — subordinate-clause
negation (`"Although nothing was archived…"`), counterfactuals (`"…would have been archived if you
had confirmed."`), reported speech (`"The log line reads 'ACME was archived' but that entry is from
2024."`), interrogatives (`"Has ACME Holdings been archived yet?"`), and `"Rather than archive it, I
left ACME Holdings active."` — **0 truth regressions and 0 fabrication regressions.**

---

### 5. Coverage gap I am NOT papering over

**`deno check` is BLOCKED in this session** — no `deno` binary is available and I could not install
one. The expected "deno 23" gate is therefore **NOT verified by me**. What I did instead is a
substitute, and I am labelling it as one: all 129 regex literals in the belt region construct
successfully under Node, and there are 0 inline modifier groups (`(?i:` etc.) of the kind the Deno
Edge runtime rejects. That is not equivalent to a type-check and must not be recorded as one.

`supabase functions download` is also refused by this session (expected, ledger #108) — that is not
recorded as an open gap, per the brief.

---

### 6. Status of every finding

| id | sev | finding | status |
|---|---|---|---|
| V46-D3 | **P1** | #45 short-circuit destroys 9 truthful negated-progressive refusals v92 preserves | **DEPLOY BLOCKER** · FIX PREPARED (3 variants measured; C recommended) |
| V46-D7 | **P1** | ordinal path fails open, binds a destructive option on a 2-option reply; v92 dead-ends | **DEPLOY BLOCKER** · FIX PREPARED |
| V45-D1 | **P1** | conditioned-offer class, 28 rows (not 35) | OPEN by product decision · not closed by me, as instructed · opinion given |
| V46-D9 | P2 | curly-apostrophe future-promise widening destroys truthful clarifying replies | OPEN · disclosed |
| V46-D1 | P2 | belt is cubic on one unsplittable clause carrying skipped negators; v92 flat | OPEN · analysed, not fixed |
| V46-D2 | P2 | the cited runtime probe compares the candidate against itself — vacuous | CONFIRMED |
| V46-D8 | P2 | the campaign's v92 model used one prose arm of two; headline count was 35, is 28 | CORRECTED in the shipped suite |
| V46-D4 | P2 | CONTRACT 5 narrowing hides the `readsAsCompletion` `.map()`-callback hazard site | CONFIRMED · one site named |
| V46-D5 | P3 | `CONFIRMED_COMPLETION` omits `closed`/`added` | v92-parity · not a blocker |
| V46-D6 | P2 | 40 scratch artifacts read a different checkout; committed suites are clean | CONFIRMED |
| — | P3 | #45-D6's base-form closure covers `go ahead`/`kick off` but not `start the` | disclosed |

**No fix in this entry has been applied.** `index.ts` sha256 is
`d0de7e7eadfb5e0a5eb34d92a85fe327fb70b7641decbddf84525b9f0ba13733` at the end of this run, identical
to its value at the start. Nothing was written to production: `functions list` and `git cat-file`
only; no `functions deploy`, no `db push`, no migration.

Executable form of every finding above:
`qa/verification/proposed/v46_regression_additions.mjs` — 35 CONTRACT assertions green, 10 DEFECT
assertions red on purpose, exits non-zero on any failure, resolves `index.ts` from its own location
or `SEM_INDEX_SRC`, verified to produce identical results from five different working directories.
