# v64 PROMOTION NOTE — verifier #64, campaign #124

**Candidate** `15480e3909fa9ecd7d2a61376baa0cc57f76110e`
**index.ts sha256** `885fd290be10dcc98226e2df390fa7de5f62f21637c329a2a013ac99f8e1966c` (unchanged before and
after every temporary edit; no temporary edit was ever written to the candidate file — every mutant is a
copy under `qa/verification/scratch/v64/mutants/` handed to the suites through `SEM_INDEX_SRC`).
**Verdict** FAIL — NOT DEPLOYABLE under the contract bar.

---

## 1. What should be promoted into `qa/scenarios-runner/` when these findings are closed

### 1.1 `v64_intent_frame_parity_contract.mjs` — the twin-parity rule, as a rule

The recurring defect (#138 V63-D3(a), and V64-D1b in these bytes) is not a missing string. It is that two
tiers encode the same concept — *"is this an imperative request frame?"* — in two separate regexes that
drift. Promote a suite that does not enumerate frames but **compares the tiers**:

```
for every frame F in a shared corpus:
    IMPERATIVE_HEAD_RE admits (F + ' archive ACME')  ==  requestedIntent(F + ' archive ACME') !== null
```

A row that is imperative for the executor and not a request for the receipt is a P1 by construction. The
executable form is in `qa/verification/proposed/v64_regression_additions.mjs` (`DEFECT V64-D1b`). The
durable fix is to derive both tiers from **one** frame list; the suite then becomes the guard that the
single list stays single.

### 1.2 `v64_dead_alternative_contract.mjs` — an alternative that can never match is a defect

`LEADING_ADVERB`'s `right away` is unreachable because `REQUEST_FRAME_PREFIX` runs first inside
`stripFrames` and consumes bare `right`. Promote the mechanical check: for every alternative in the second
stripper, assert that applying the first stripper does not destroy it. Executable form: `DEFECT V64-D1c`.
This is the same family as ledger #101/#105 (dead Cyrillic alternatives in `IMPERATIVE_HEAD_RE`) and
V62-D9; it recurs because nothing tests for it.

### 1.3 Extend the vacuity sweep to STRUCTURAL mutants and to the whole battery

`qa/verification/scratch/p1/vacuity_sweep.mjs` covers named regexes in one region against 13 suites. The
version used this round — `qa/verification/scratch/v64/vacuity_sweep_extended.mjs` — covers 73 named
regexes file-wide plus 39 structural mutants against all 63 runnable suites, and found 8 structural
survivors including reverts of V61-D10, V62-D1 and V63-D2. **Promote the extended sweep, not the narrow
one**, and add to it, permanently, one mutant per P1 fix at the moment the fix lands (that is what
#138b's rule actually requires).

Two fixes to the sweep itself before promotion:
* the region markers must fail CLOSED — `text.indexOf(...)` returning `-1` currently yields an empty guard
  list and a green "0 killed, 0 survived";
* the regex mutator must neutralise **every** literal in a multi-literal declaration. Thirteen of this
  round's 35 survivors are inconclusive purely because only the first literal was replaced, and an
  inconclusive result reported as a survivor is its own kind of dishonest evidence.

### 1.4 `sem_ai_command_confirmation_truth.mjs` must stop being a reimplementation

Its header states its function bodies are *"byte-for-byte copies of the shipped logic (kept in sync
manually)"*. Both directions of `isShortAffirmative` — the gate that turns a bare `"yes"` into real
mutations — survive the whole battery. Rewrite it to slice and execute the real
`bulk_confirmation` / `multi_action_plan` block, exactly as `architecture_final_claim_contract.mjs`
slices the receipt block.

### 1.5 `_gate_extract.mjs`: `s.replace(/\r\n?/g, '\n')`

One character. Today `stripTS('// c\rconst x = 1;\r\n')` returns `''`: a bare CR merges a comment with the
code after it and the whole line is dropped as a comment. index.ts already contains one bare CR. Add a
bare-**CR** count to the purity gate alongside the existing bare-LF count.

### 1.6 Budget-report honesty

`contextBudget.trimmedCount` must be assigned on every trimmed turn, not only above twelve trims, and
`request_gate_inventory_contract.mjs`'s workspace fixture must include `namedTargets` and a non-null
`pendingAction` — both are present in every production pack, both are protected from trimming, and their
absence makes the published headroom figures optimistic and the "kept its minimum safe context" assertion
nearly content-free.

## 2. What is already good and should be kept exactly as it is

* The context-budget block itself. Measured independently against fixtures built from the real `.limit()`
  caps: a fitting pack is byte-identical apart from the added `contextBudget`; optional trims precede core;
  history keeps the newest turns; exact totals never change; `truncated` is honest in both passes and on
  both known and unknown totals; the minimum safe context survives a 30,000-character command
  byte-identically; the loop terminates in <10 ms on every shape; the estimator under-reports by at most
  one token. **Independent headroom to the 12,000 hard cap on saturated workspaces: 729–992 tokens.**
* The refusal path. Below a ~3,700-token cap the irreducible ~3,141-token minimum cannot fit and the turn
  is refused **with the minimum intact and a stated, actionable reason** — the one refusal §4.4 allows. A
  40,000-character command is attributed to the command, not the workspace.
* `envPositiveInt`. Malformed and negative caps both behave exactly as unset, checked by running the block.
* The pinned production witness, on both halves: 25,595 pre-fix → 11,297 post-fix with 12 trims.
* The never-silent receipt itself, where intent is derived: 180/180 on an independently written matrix
  (60 fabrications × three claim shapes + 20 pendingAction variants → receipt; 60 truthful reads survive
  verbatim; 20 verified envelopes render; 20 unverified envelopes never support a claim).
* Server-side lifecycle resolution across every status, with the archived row preferred for `restore` and
  a fuzzy command hit that asks instead of executing.

## 3. Coverage this round could NOT obtain — read every conclusion below in this light

* **No live request was made.** No production Supabase credential is available in this worktree
  (`functions list` returns HTTP 403). Every conclusion here is **source-level / harness-level**. Under
  CLAUDE.md §6 ("static and source verification cannot substitute for live request-shape acceptance"),
  none of the budget, estimator or headroom results is production-accepted until a live post-deploy
  acceptance run reproduces them.
* **Provenance of deployed v92 is git-level, not byte-direct.** `git show c9dfab5bd433:…/index.ts` hashes
  to `795c20c8…` as recorded, but the deployed bytes could not be downloaded and compared.
* **`deno check` could not be run** (the `npx deno` invocation is gated in this environment). The
  runtime-fatal classes were instead checked by `tdz_forward_reference_contract.mjs` (9/0) and by an
  independent block-scope scan written for this round: zero real forward references, one latent one
  (`safeDisplayLabel` → `UUID_IN_TEXT`).
* **No browser / UI / AI-chat evidence.** The UI and fresh-context AI checks are BLOCKED, not skipped.
