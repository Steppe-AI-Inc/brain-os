# v60 promotion note — campaign #120, candidate `9e39a47`

## Verdict

**FAIL.** Candidate `9e39a47d0b347c09d4b3b127f40f2200cef8fec0`
(`supabase/functions/sem-ai-command/index.ts` sha256
`5d4e853c6a7e9a9ed4dd2c9bda2e662590b736d2c6655a268dfafc96766e788b`) is **not fit to deploy over v92**
under the contract bar. Production stays on v92 source (function v94).

## What to promote

| Artifact | Where it should live | Why |
|---|---|---|
| `v60_regression_additions.mjs` | `qa/scenarios-runner/v60_context_budget_and_intent_gate_contract.mjs` once V60-D1/D2 are closed | It is the only suite that measures the pack against the gate that refuses the request, and the only one that varies `result.requestIntent`. Promote it red-by-design or after the fix; do not promote a green-by-omission version. |
| `qa/verification/scratch/v60/apply_fix.mjs` | apply to `index.ts` and delete | Closes V60-D1, V60-D2, V60-D5. Measured on the fixed bytes. |
| `qa/verification/scratch/v60/mutation_proof.mjs` | `qa/scenarios-runner/` as a periodic vacuity gate | 14 mutants, whole battery per mutant, byte-restore verified. It found the two create-family survivors. |
| `qa/verification/scratch/v60/belt_vs_v92.mjs` | keep as the standing v92 differential | Measures the SHIPPED SUMMARY, not the belt matcher. The matcher-level differential used since campaign #90 is what let V60-D4 sit at 31.5% while every report said "0 fabrication regressions". |

## Required suite edits that come with the fix

`qa/scenarios-runner/architecture_context_budget_contract.mjs` pins its extraction END anchor to a
byte-exact copy of the `packRecord.contextBudget = { … }` line. The prepared fix changes that line, so
the suite fails to find its own block (`0 passed, 1 failed`). Update the anchor to a prefix match
(`'  packRecord.contextBudget = '`) when applying. While there:

* line 95's "the block uses the same estimator as the serve() preflight" is a regex over two different
  string literals — replace it with a measurement (`preflight - loop < reserve`);
* the "an oversized pack is brought under budget" fixture has every collection at 40 rows and no
  untrimmable content. Add the floor-shaped fixture (arrays at their floors, bulky `approvals.reason`)
  — that is the shape the fix did not cover.

`qa/scenarios-runner/structured_claim_laundering_contract.mjs` hardcodes one command and never sets
`result.requestIntent`. Its own stated invariant ("a model must not be able to switch off its own
truth gate") is not tested against the field that now decides the gate. Add the `kind: "read"` and
`kind: "other"` arms.

`qa/scenarios-runner/architecture_collection_envelope_contract.mjs` derives its key list from a
value-shape regex. Any pack array written as an expression (`.slice()`, `.map()`, a differently-named
variable) is invisible to it. Derive from the pack literal's `key:` positions and require an envelope
for anything that is an array at runtime.

## Open, sized, not fixed here

| ID | Sev | Size measured | Fixed by |
|---|---|---|---|
| V60-D3 model-declared `kind:"read"`/`"other"` disables the receipt | P1 | 37/37 imperative mutation requests ship the fabrication | architecture decision: a request-side gate must not be vetoable by the component it polices. Minimum: keep the lexicon hit when the model says read AND the reply reads as a completion (defence-in-depth, which #56-D2 removed for good reasons — so pair it with the entity-signal rescue rather than reinstating it blind). |
| V60-D4 lexicon coverage in the model-emits-nothing tier | P1 | 33/66 verbs; 290/920 pairs vs v92 (31.5%) | extend the lexicon (send/schedule/publish/share/upload/notify/email/message/grant/flag/tag/reset/clear/pay/issue/refund/charge/import/export/order/reserve/link/unlink/attach/detach/stop/pause/resume/duplicate/copy/cancel/post/empty) OR make `requestIntent` schema-enforced so the tier is unreachable. Either closes it; measure which. |
| V60-D7 plan path records verified evidence from `changed` alone | P2 | 1 site (`index.ts:3138`), reachable on every "yes" to a multi-action plan | read `postconditionPassed` in `executeOneAction` and pass it through to `recordExecution`. |
| V60-D8 envelope backstop misses value shapes | P2 | 1 mutant survived the whole battery | see above. |
| V60-D9 create-family postcondition unpinned | P2 | 2 of 14 mutants survived | the two CONTRACT rows in `v60_regression_additions.mjs` cover it; promote them. |
| V60-D6 negated compound read loses its answer | P3 | 1/66 | answer the read clause and append the receipt, rather than replacing. |
| `_shared/*` ↔ `web/lib/contracts` drift | P3 | 2 of 4 files differ in signature/content | not on the deploy surface; still a stated mirror that is not a mirror. |
| task/goal lifecycle use `postconditionPassed !== false` where companies use `=== true` | P3 | 4 sites | equivalent given the RPCs always return the field; tighten for symmetry. |

## Coverage this campaign could NOT provide

* **Live database** — `npx supabase db query` / `functions list` / `functions download` are network-gated
  in this session; no credentials in the worktree. Every DB-shaped claim here is read from migrations
  and source, never from production. **BLOCKED.**
* **Browser UI and live AI chat** — no browser tooling in this session type. The UI↔DB and AI↔DB rows of
  the truth graph are **BLOCKED**, not passed.
* **`deno check`** — no network for `npx deno@2`, no local `node_modules`, no `tsc`. Static type/syntax
  checking is **BLOCKED**; the only executable evidence is that large real slices of the source run
  under `new Function` after the repo's own detyper, plus a 0-finding independent TDZ scan.
* **The live pack size on the founder's own workspace** — the single measurement whose absence caused
  incident #133. Modelled here with production's own estimator and realistic row shapes; **not
  measured against the real workspace**. Any future deploy authorisation should carry that number,
  taken from production, before it is granted.
