## #111-V — Verifier #45, campaign #105: the v92 deployment gate, re-derived independently. FAIL on one class, and it is a product question the founder has to answer

**Candidate** `b386767a3549ace22421c372dc5623e30e30b419`, `supabase/functions/sem-ai-command/index.ts`
sha256 `6c5e52b52f1a836670ce043f3a76612a21d27cfc741bff9e6a4bc1e2d410e59d` (asserted at start, after
every temporary edit, and at end — byte-identical throughout).
**Deployed reference** `sem-ai-command` v92. I ran `supabase functions list` myself: `ACTIVE`,
`version 92`, `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at 1788239725518`. `git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts`
hashes to `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`, 321,370 bytes —
the required value, confirmed not restated. The live download committed at `24bfccf` is the
**same git blob** as `c9dfab5bd433`'s (`795c20c8…`); the on-disk copy hashes `49d53882…` only
because checkout applied CRLF. `functions download` is refused by this session's classifier, so
the strongest thing I personally executed is the version/ezbr observation; the byte link is
verified at the git-object level on the committed artifact. Provenance is closed and I am not
re-opening it.

### VERDICT: FAIL. One class, 117 rows, and it is the class #44 declined to close.

`EXECUTION_IN_PROGRESS` — an arm deployed v92 does not have — fires on an offer that is
**explicitly conditioned on the founder's confirmation**. Deployed v92 preserves every one of
these. The candidate replaces them with
`I can't actually do that from chat — nothing was changed. Please use the relevant page in the app…`
and, because `claimsPastCompletionWithNoGrounding` is in the persist condition, writes that
replacement to `work_orders.output`.

I generated the class myself — 14 openers × 14 user-conditioned tails:

| | |
|---|---|
| generated rows | 196 |
| deployed v92 preserves | 196 |
| candidate destroys | 117 |
| **v92-preserves-and-candidate-destroys** | **117** |
| of those, `LEGACY_PAST_COMPLETION` also fires | **0** — it is purely the imminent arm |
| unconditioned forms still caught by the candidate | 9/14 (v92: 0/14 — the arm does earn its keep) |

The campaign record sizes this at *"39 generated rows, 3 pinned."* On my own generation it is
**117**, and it reaches shapes the record does not list: `I'm about to…`, `I am going to…`,
`Let me go ahead and…`, and the tails *as soon as you say go*, *when you confirm*,
*after you approve*, *subject to your confirmation*, *provided you confirm*, *assuming you approve*.
The class is roughly three times larger than recorded. That correction matters more than the
verdict does.

**I did not close it with a regex, as instructed.** My product answer, offered as an opinion and
not as a fix: the arm exists so that *"I'm archiving ACME"* cannot read as done. An offer whose
own clause conditions it on the founder (*"once **you** confirm"*, *"if **you** approve"*) is by
construction not a claim that anything happened — it is the confirm-before-mutate interaction the
product is built around. Firing on it does three bad things at once: it destroys a true sentence,
it substitutes a **false** one (archive/restore *are* chat capabilities — `archiveCompanyIds` is
real), and it strands the conversation with no way to answer. If the arm is to stand down anywhere,
the conditional-on-the-user reading is the safest possible place, because the condition has to
name the user to exist. But that is a decision about what the product should do, and it is yours.

### What is genuinely clean — measured, not accepted

I built my own corpus (594 rows: 298 truthful negatives with real names, 296 fabrications; no rows
shared with any prior verifier's corpus) with a labelled section for entity names and titles that
CONTAIN a negator token — *No Limits Inc, Nothing Bundt Cakes, Never Summer Industries,
None The Wiser LLC, Nothing But Nets Foundation, "Pending review of the Q3 budget",
"Awaiting approval of the depot lease"* — in **both** directions.

| quadrant (differential vs deployed v92) | count |
|---|---|
| **truth regression** (v92 preserves, candidate destroys) | **0** |
| **fabrication regression** (v92 catches, candidate ships) | **0** |
| truth improved (v92 destroys, candidate preserves) | 195 |
| fabrication improved (v92 misses, candidate catches) | 41 |

Absolute: the candidate destroys 11 of 298 truths and misses 1 of 296 fabrications — **and v92
destroys/misses every one of those same rows**. They are shared holes, not regressions.

A separate 409-row adversarial battery aimed at the specific shipped fixes returned **18 P1s, all
18 in the conditioned-offer class above, and 0 fabrication regressions**. Every other attack the
brief named came back clean:

* a genuine Title-Case negator followed by a Title-Case token — clean vs v92;
* `Pending`/`Awaiting` opening a real negation — 8/8 preserved;
* the only negator sitting after *with/since/despite/after/before/given/amid* — 26/26 preserved;
* a reassurance idiom followed by a denial — 65/65 preserved, and the paired fabrications caught;
* the R-AUXGAP shape that really is negated — 8/8 preserved;
* dash-before-a-CAPITAL: `No company named Ulaanbaatar — North Depot was archived.` and
  `No unit at Erdenet — Copper Works was archived.` both survive, and the corresponding
  fabrications are caught **lexically**, not by casing. The refusal to close that by casing is
  correct and I confirm it.

**The three shapes the session recorded as refused are no longer refused.** `No errors ACME was
archived.`, `No problem the log shows ACME was archived.` and `Not a single task moved - Bob Smith
was removed.` are all **caught** on these bytes, with their paired real names still surviving. That
disclosure is stale and should be retired.

**`No North Depot was archived.` — the disclosed determiner-reading loss — is real and I confirm
the refusal.** The candidate destroys it; so does deployed v92. It is not a regression, and no
lexical rule separates it from `No Limits Inc was archived.` The one thing that *could* is the
signal already in scope: `knownEntityNames` at `index.ts:3409`. If `North Depot` is a known entity
and `No North Depot` is not, the determiner reading is decidable at zero truth cost. The signal is
currently consulted only by the `Confirmed —` arm.

**Ledger closures re-derived, not restated:** #64 D16/D17 14/14 caught, #65 D25 7/7 caught, #65 D27
(production row `9dda919c`, both arrow forms) 3/3 caught, #66 D40 closed by gate composition
(`unaccountedCompletionProse` keys on `!hasSupportedMutationClaim`; `structuredProseDrift` on
`rawClaims !== null`), and #65 D26's **truthful** direction 5/5 preserved. The run8/D59
`&& !result.pendingAction` short-circuit that deployed v92 still carries is **not** reintroduced.

**Identifier delta, re-derived (ledger #90 got this wrong once):** 482 → 687 declared identifiers.
**205 added, 0 removed**, 12 changed declaration count. Nothing v92 has was dropped.

**Deploy surface:** `supabase/functions/sem-ai-command/index.ts` and nothing else. The tracked
`supabase/` file set is identical between `c9dfab5bd433` and `b386767`. LF-normalised the delta is
4,312 → 5,998 lines, 52 hunks, +1,738 / −52.

**Matcher, 42 disambiguation shapes** including the negator-token names in both directions: 2
divergences from v92, **both candidate improvements**. `un-archive ACME Holdings` against a pending
*archive* option: deployed v92 arms `archiveCompanyIds` — a wrong-direction destructive bind that is
live in production right now. The candidate dead-ends to the LLM. `the second one, Blue Sky
Logistics` also dead-ends, which is run16/D123's allowlist working as designed. Nine negator-token
names still resolve; thirteen real negations dead-end.

### Suite integrity, measured from the filesystem

**Battery: 36 suites, 0 non-zero exits, 1,060 `ok` lines, 0 `FAIL` lines** — 31 asserting plus 5
`SUPERSEDED (prose-era)` stubs. Exit status read per child process via `spawnSync`, never from a
pipeline; the retraction of the earlier "33/0" is warranted and my number is 36/0. Every prior gate
matched its predicted state exactly: v30 25/1, v31 33/1, v32 101/0, v33 93/0, v34 57/0, v35 55/0,
v36 61/0, v37 21/0, v38 29/0, v39 21/0, v40 77/0, v41 22/0, v42 12/1, v43 40/0, v44 115/3,
**run15 57/0**.

Vacuity, proven by mutation rather than asserted:

| mutation applied to the shipped source | red suites |
|---|---|
| replace `index.ts` with the deployed v92 bytes | **20 of 36** |
| add an UNREFERENCED top-level const to the belt block | 2 (CONTRACT 5 pin + run28) |
| add a **REFERENCED** top-level const to the belt block | **8**, incl. 3 real `ReferenceError`s |
| add a LOCAL inside `completionIsNegated` | **0** |
| inject a whole-span lookahead into the belt | 2 (run15 + CONTRACT 6 / D117) |

`sha256` re-asserted `6c5e52b5…` after every single variant.

**The CONTRACT 5 narrowing is honest.** Its premise — that locals inside `completionIsNegated`
travel with the brace-balanced extraction and are therefore not the hazard — is **empirically true**
(0 red). Its detector still catches the thing it exists for (top-level declaration, referenced or
not). It hides nothing.

**The eighth vacuity was real, and the fix is real.** With the `globalThis.knownEntityNames` seed
removed so the belt *can* throw: the **new** fuzz alphabet plus the seeded `Confirmed —` prefixes
finds **211 throws in 2,000 cases and fails loudly**; the **old** 32-character alphabet with no
seeds finds **0** and passes silently. That is the coverage hole, reproduced and closed. One
correction: of the three suites that gained the seed, only `run28` actually needed it — `run18` and
`v92_open_regression_contract` stay green without it, because neither corpus reaches the throwing
family. The seed is right; the framing "three suites" overstates how many could have thrown.

**All ten shipped fixes are load-bearing on my own corpus** (`nameInternal`, `titleHead`,
`titleHeadAfterPrep`, `ppInternal`, the reassurance-idiom strip, the R-AUXGAP pre-pass, the
gerund-arm adverbial guard, the stated-agent lookahead, the `Confirmed —` negator lookahead, the
entity signal). Two of them — the idiom strip and R-AUXGAP — were **no-ops on my first probe set**,
and the honest finding is that my probes were deficient, not the fixes: both are shadowed on
ordinary rows by the run22 `newSubject` rule and by the sentence-level first arm, and only bite when
the completion is `<participle> successfully` (idiom strip) or when the interposed adverbial itself
carries a negator (R-AUXGAP). With rows engineered for exactly that, reverting them re-opens 6/10
and 6/6. A mutation proof that finds a no-op has usually found a bad probe.

**Entity signal:** reachable (populating the pack changes 5 of 6 verdicts on the participle-initial
`Confirmed —` family), leaks nothing (0 fabrications released), and **absence is never used as
evidence** — 0 of 1,600 rows where a populated pack that does not contain the name is more lenient
than an empty one. It is inert on all 594 corpus rows, which is expected for a positive-only signal.

**All 36 suites are cwd-independent** — I ran the whole battery from four different working
directories; 0 suites are green from the repo root and red elsewhere.

### Three more things nobody had looked at

**V45-D2 (P2, not a blocker).** The entity-signal rescue is the only one of the four `Confirmed —`
branches without the `(?:[^,]{0,60},\s*)?` interposed-prefix tolerance its three siblings all carry.
So `Confirmed — as requested, Archived Media Group.` is destroyed **even when the name is in the
pack**, while the bare, copula, next-sentence, and-tail, question, `exists` and `appears` frames are
all rescued. 18 rows on an 8-name × 3-prefix generation; deployed v92 preserves all of them. I am
**not** calling this a deploy blocker: `as requested,` genuinely tilts the sentence toward an action
report, and the campaign's own run19/D134 comment pins the identical shape (`Confirmed — as
requested, Restored Bob Smith.`) as a fabrication to catch. It is an asymmetry — one arm extended,
its sibling left behind, which is precisely run13/D100's class — and it should be closed by adding
the same optional prefix to the entity branch.

**V45-D6 (P3, open, NOT a v92 regression).** `EXECUTION_IN_PROGRESS` lists the **gerund** imminent
idioms (`going ahead and`, `kicking off`, `starting the`) but not their **base** forms, and the
clause splitter's own stand-down lookbehind is likewise anchored to `going ahead`. So `Let me go
ahead and archive the company.` escapes the imminent arm **and** `FUTURE_PROMISE_PATTERN`: 60 of 192
generated rows escape both gates. Deployed v92 misses all 60 too, so it is not a deploy blocker —
but the arm was written to cover this idiom and covers only half of it.

**V45-N2 — runtime, which nobody in 45 verifications had measured.** v92's entire belt is one regex,
linear. The candidate's is a multi-arm predicate that runs a per-negator scan loop, constructs
several `RegExp`s per iteration, and is called **twice** per turn. Growth is **quadratic**:

| summary length | v92 | candidate |
|---|---|---|
| 1,089 chars | 0.003 ms | 0.95 ms |
| 4,239 chars | 0.010 ms | 11.5 ms |
| 8,439 chars | 0.025 ms | 42.9 ms |
| 16,839 chars | 0.038 ms | 167 ms |
| 33,639 chars | 0.085 ms | **657 ms** |

Even a 157-character refusal is 148× slower. At realistic LLM summary lengths this is tens of
milliseconds and fine; I am recording it as a production characteristic and a bound to watch, not as
a defect. The cheapest guard is to short-circuit `completionIsNegated` when `COMPLETION_VERB` does
not match the clause at all.

**V45-N3 (latent).** `detName`'s determiner test carries `/i` over an explicit `[a-z]` slot, which
under `/i` folds to any letter — the V41-C6 class in the lowercase direction. **Measured inert:** 0
verdict differences across 6,600 engineered rows when that one regex is made case-sensitive. Worth
fixing for consistency; not worth blocking on.

**V45-N4 (QA artifacts, not the deploy surface).** `qa/verification/scratch/v92/v44/v44_mutation_proof.mjs`
**cannot run from any working directory** — `v44_harness.mjs` resolves `ROOT` one level short, so
`V92_PATH` becomes `<repo>/qa/qa/verification/...`. The mutation proof for the fix adopted in *this*
candidate is dead where it sits; the duplicate at `qa/verification/scratch/v44/` works.
`qa/verification/scratch/v92/v31_mutation_proof.mjs` hard-codes
`SRC = 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts'` — a path into a
**different worktree**. It is byte-identical today, so it is not currently lying, but it measures
another checkout by construction and dies on any machine without that path. Both are the same shape
as the eighth vacuity: a contract that cannot reach the input it exists for.

### Shared holes with v92 — not regressions, but nobody should think they are closed

* `No Business Unit was archived.` / `No Company was archived.` / `No Task was completed.` /
  `No Approval has been granted.` — an ordinary negation whose entity-type noun is Title-Cased is
  read as a name by `nameInternal` and destroyed. 10 of 12 in my set. v92 destroys them too. Given
  that this product's own UI says "Business Units", this is the shared hole most likely to be hit.
* `<Name> couldn't have been deleted — the record is still there.` — destroyed by both.
* `The company was archived by the previous administrator in March.` — destroyed by both. The new
  stated-agent guard is on the **progressive** arm (`is/are being|getting … by the …`) only; the
  past passive has no equivalent.

### Rollback

Exact and available. `c9dfab5bd433` is present; its `index.ts` blob is `795c20c8…`, the same blob as
the committed live download. `scripts/factory-runner/verify-deployed-bytes.sh <ref>` is the
post-deploy check and must be run against the deployed commit before any deploy is called done. One
thing to know: `.github/workflows/supabase-functions.yml` runs a bare `supabase functions deploy`,
which deploys **all six** functions in the repo, so both the deploy and the rollback bump the
version of five functions whose bytes did not change.

### Coverage gaps in this run, stated rather than skipped

* `supabase functions download` — refused by this session's classifier. Expected; provenance is
  closed at ledger #108 and I did not record it as an open gap.
* `deno check` — **BLOCKED**, no `deno` on this machine and `npx deno` is refused. The candidate's
  "type check at baseline / deno 23" claim is **unverified by me**. What I could substitute: all 226
  regex literals in `index.ts` construct, there are no inline `(?i:)`/`(?-i:)` modifier groups
  (unverified in the Deno Edge runtime), and the belt is `new Function`-constructed successfully by
  eight independent suites — which covers the specific "a bad regex fails at module load and takes
  the whole function down" hazard, but is not a type check.
* CRLF re-measured myself: 5,998 CRLF lines, **0 bare LF**.
* No browser and no live AI-chat turn was exercised; this is a source-differential gate, and every
  verdict here is `UNIT VERIFIED` / `CODE INSPECTED` against the real deployed bytes, not
  `E2E VERIFIED`.

### EDGE STATUS

**NOT DEPLOYMENT READY.** One blocker, `V45-D1`, and it needs a founder decision rather than another
regex. Everything else in the differential is clean or better than production. Production stays v92.
