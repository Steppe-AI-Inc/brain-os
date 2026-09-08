# v61 PROMOTION NOTE — campaign #121, verifier #61

Candidate: `4f44544ede88aaeb974d92089a79c1793442d54a`
`supabase/functions/sem-ai-command/index.ts` sha256 `3d1baeaae994fdd767ada797a20476556458731047f6e5061bec057f72ca6d01`
(preserved byte-for-byte; asserted before and after every temporary edit and at the end).
Verdict: **FAIL — NOT DEPLOYMENT READY (contract bar).**

## What to promote

**`qa/verification/proposed/v61_regression_additions.mjs` → `qa/scenarios-runner/v61_budget_floor_and_imperative_head_contract.mjs`.**
It resolves `index.ts` from `SEM_INDEX_SRC` or from its own location, so it is correct from any cwd, and it
exits nonzero on any failure. On `4f44544` it is **14 CONTRACT green, 8 DEFECT red by design**. It goes green
only when V61-D1, D1b, D2, D3, D6, D7, D8 and D9 are actually closed. Promote it RED, exactly as #57's and
#58's suites were promoted red, so the closure has to earn the green.

Do **not** promote it as a replacement for `architecture_context_budget_contract.mjs` or
`request_gate_inventory_contract.mjs`; it is additive. Its C-rows deliberately re-derive the same properties
from a different fixture generator (built from the real `.limit()` caps, not from the candidate's fixtures)
so that a future fixture drift in one file cannot silently take both suites with it.

## What the closure must change (and what it must NOT)

1. **V61-D1.** Either let `conversationHistory` reach 0 like every other optional collection, or — better —
   truncate the surviving row's `command` and `summary` to a byte budget and mark the row as truncated. A
   floor of 1 on an unbounded row is not degradation. Whatever is chosen, the D1 and D1b rows in this suite
   must both go green; do not close D1 by raising `SEM_AI_MAX_TOKENS`, which only moves the threshold.
2. **V61-D2.** Add the this-turn targets to the protected set as a first-class pack member — e.g. a
   `namedTargets` key carrying the `namedCompanyLookup`/`namedPersonLookup`/`namedTaskLookup`/`namedGoalLookup`
   rows, listed in `MINIMUM_SAFE_CONTEXT` and therefore forbidden in `TRIM_ORDER`. Keeping them only inside
   `companies`/`people`/`tasks`/`goals` cannot work, because those keys must stay trimmable.
3. **V61-D6/D7.** The imperative tier needs a *shape* test, not a longer allow-list. Two cheap, testable
   rules: (a) an English head verb is only imperative if the sentence has no finite main verb of its own after
   the object (`Fire drill IS at 3pm`, `Merge conflicts ARE blocking`, `Set of KPIs … STILL APPLIES`);
   (b) Mongolian needs its own read/statement veto — question particles (`уу/үү/вэ/бэ/юу`), the negative
   (`-гүй`), and the nominal/participial suffixes that turn a stem into a noun (`-лт`, `-элт`, `-сан/-сэн`,
   `-гдсан`, `-ийг`, `-гоор`) — before group 4 may assert intent. A longer verb list will keep producing this
   class; the two defects caught before commit and this third one all have the same cause.
4. **V61-D8/D9.** Make `r.postconditionPassed === true` the only accepted form everywhere, and re-read the
   field that was supposed to change in the two plan branches that currently read the write's own return.
   Add the mutant: flipping `rpcPostcondition` to `!== false` survived the entire committed battery here.
5. **V61-D3.** Update `counts.<x>Shown` when a collection is trimmed, or delete those fields and leave
   `collections.<x>.shown` as the single source. Two authoritative "shown" numbers is the hazard.
6. **V61-D10.** Put the real request in the inventory: name the `SYSTEM_PROMPT` cost (76,152 chars ≈ 19,038
   tokens) as a permanent, measured component rather than "drift", account for
   `JSON.stringify(..., null, 2)`, and add `imageBase64` as a whole-request gate with an explicit size cap
   enforced before the provider call.
7. **V61-S1.** The V60-D8 probe must stop writing a tracked file. Write it under a temp dir (or add the path
   to `.gitignore`) and keep the property assertion exactly as it is — that part is a real strengthening and
   was independently confirmed here.

## Do not regress these while fixing the above

Re-run this suite's CONTRACT rows after every change. They pin, on these bytes:
0 fabrications shipping across 80 mutation-intent turns; 65 read requests surviving verbatim; the verified /
unverified envelope split; V60-D3 (the model may add intent, never remove it); estimator identity between the
trim loop and the serve() preflight; a fitting pack untouched; the minimum-safe set unchanged across a heavy
trim; exact totals and correct `truncated` flags after a trim; history trimming oldest-first; and
`TRIM_ORDER ∩ MINIMUM_SAFE_CONTEXT = ∅`.

## Coverage this campaign could NOT provide

- `deno check` — BLOCKED (no approval for the network install). Substituted by the committed
  `tdz_forward_reference_contract.mjs` (9/0), a targeted binding-order check over the fifteen new
  declarations (0 flagged), and successful live execution of three large real windows under `new Function`,
  which would throw `ReferenceError` on any same-scope TDZ violation in those regions.
- `supabase functions list` / `functions download` — BLOCKED (no credential approval). The v92 link is
  therefore **source-level via git** (`c9dfab5bd433`, LF sha256 `795c20c8…`, matched), not byte-direct against
  the deployed function.
- Any LIVE request, live database query, browser UI check or fresh-context AI check — BLOCKED. Under the two
  permanent rules added to `CLAUDE.md` this round, **every conclusion in this campaign is source-level and
  window-execution level and would still need live request-shape acceptance to be trusted.** In particular,
  whether the model actually answers "that does not exist" when a trim empties a collection is prompt-mediated
  and cannot be settled from source; and V61-D10's provider-side consequences cannot be settled at all
  without a real request.
