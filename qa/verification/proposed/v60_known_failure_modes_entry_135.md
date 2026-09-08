## 134. Verifier #60 (campaign #120) on candidate `9e39a47` under the contract bar — FAIL; the context-budget fix still lets an ordinary request 413 with no answer and discards the row the founder just named, and the never-silent receipt can be switched off by the model it polices (CONTEXT_BUDGET, EXECUTION_TRUTH, VACUOUS_GUARD)

**Verified from committed bytes only**, in an isolated worktree at `9e39a47d0b347c09d4b3b127f40f2200cef8fec0`,
`supabase/functions/sem-ai-command/index.ts` sha256 `5d4e853c…` (CRLF-pure, 6,513 CRLF, 0 bare LF),
preserved byte-identically across every in-place mutation run. Live DB, browser UI, live AI chat,
`supabase functions list/download` and `deno check` were all **BLOCKED** in this session (no
credentials, no network egress, no browser tooling) — every finding below is INTEGRATION VERIFIED or
UNIT VERIFIED against real slices of the shipped source, never LIVE VERIFIED.

**Provenance.** Deployed v92 = git `c9dfab5bd433`, blob sha256 `795c20c8…`, 321,370 bytes — matched
byte-for-byte against the committed reference `qa/verification/scratch/v92/index.v92.ts`. The link to
the *running* production function is **integration-level, not byte-direct**: the rollback record in
`qa/verification/incidents/INCIDENT_2026-09-08_TOKEN_PREFLIGHT_413.md` (function v94, ezbr
22486cd751cac403) is repository evidence, not something this verifier could re-observe. Delta v92 →
candidate: **0 identifiers removed**, 334 added (re-derived independently); the deploy surface is
exactly `index.ts` (its only imports are `deno.land/std/http/server.ts` and `esm.sh/@supabase/supabase-js@2`);
`supabase/functions/_shared/*` are not imported by it.

### V60-D1 (P1, CONTEXT_BUDGET) — the pack "degrades instead of 413ing" only when it has rows to spare

The trim loop skips any collection already at or below its floor (`if (!Array.isArray(arr) || arr.length <= keep) continue;`)
and there is **no pass after it**. A floor is a ROW count, not a BYTE count, so a workspace with few
rows but bulky free text — 20 pending approvals with long `reason` text, long `memories.fact`, long
stored replies, a long command — sits over budget with nothing the loop is willing to trim, and
`serve()` returns the incident's own
`{"error":"Token preflight hard stop"}` with no answer. `approvals` is not a `TRIM_ORDER` key at all;
neither are `counts`, `continuity`, `pendingAction`, `recentlyResolvedEntities`,
`recentlyDeletedEntities`, `collections`, `currentTurn` or the command itself.

Measured with the REAL trim block sliced from `index.ts` and production's own estimator
(`qa/verification/scratch/v60/budget_attack2.mjs`, `budget_attack3.mjs`): 20 approvals × 600-char
reason → 12,730 tokens post-trim (413); `memories.fact` 3,000 chars × 8 → 12,912 (413); a
20,000-char command → 14,963 (413). Worse, there is a **755-token band in which v92 ANSWERS and the
candidate 413s**: with every trimmable array at its floor the loop performs **0 trims** while the
candidate still pays its pack additions, so any workspace whose v92 estimate lands in
[11,245 … 12,000] loses the answer entirely. That is the exact failure that caused the 2026-09-08
production rollback, in a different workspace shape, and it is a regression against deployed v92, not
an intended departure.

### V60-D2 (P1, CONTEXT_BUDGET × CONTEXT_WINDOW_AS_UNIVERSE) — the trim discards the row the founder just named, first

The targeted named-entity lookups exist because a company outside the capped window produced a
fabricated status answer (2026-08-30, "test4"). They are merged as `[...(companies.data || []), ...extra]` —
**at the tail** — for companies, people, goals and tasks. The trim slices the **head**
(`arr.slice(0, keep)`). So the first casualty of the budget fix is precisely the row the founder named
this turn. Measured: with every collection at its own query `.limit()` and the shipped 12,000 cap, the
named TASK and named GOAL are already gone after 23 trims; in a floor-shaped workspace with bulky
approvals all four (company, person, task, goal) are gone. The name also disappears from
`knownEntityNames`, which removes the belt's entity-signal rescue, so a truthful answer that mentions
it becomes more likely to be destroyed as well. Mutations still execute (task/goal/company lifecycle
ids are re-read server-side, the #58 closure), but READ answers about the named entity lose their only
grounding — reopening the very class the lookups closed.

### V60-D3 (P1, EXECUTION_TRUTH) — the model can switch its own truth gate off with one field

`requestedIntent` is the gate for the never-silent receipt and for both belt consumers. Its primary
tier is `result.requestIntent`, a field **the model itself emits**, and `modelIntentKind === 'read'`
or `'other'` vetoes the request lexicon outright (`lexiconReadVetoed`, the #57-D1 closure). Measured
on the real structured-claim window: with `requestIntent.kind = "read"` (or `"other"`) supplied on 37
ordinary imperative mutation requests — *archive the company ACME*, *delete the task QA-1*, *assign
QA-1 to Bob* — **37/37 fabricated completions ship verbatim**, receipt not rendered, belt not
consulted. `requestIntent` is not schema-enforced anywhere (no `response_format: json_schema`); it is
a prompt instruction. `structured_claim_laundering_contract.mjs` — the suite whose stated invariant is
"A MODEL MUST NOT BE ABLE TO SWITCH OFF ITS OWN TRUTH GATE" — hardcodes
`globalThis.command = "archive ACME Holdings"` and never varies `result.requestIntent`, so this
channel is outside it.

### V60-D4 (P1, EXECUTION_TRUTH; carried, not introduced) — the model-emits-nothing tier misses half the verbs

When the model emits no `requestIntent` and no action array, only the request lexicon decides. On 66
ordinary imperative mutation requests, **33 (50%) ship a fabricated completion verbatim**: cancel,
schedule, send, publish, share, upload, duplicate, copy, stop, pause, resume, link, unlink, attach,
detach, flag, tag, reset, clear, empty, grant, post, notify, email, message, order, reserve, issue,
pay, refund, charge, import, export. End-to-end differential against deployed v92 measured on the
**shipped summary** (23 mutation commands × 40 fabrications = 920 pairs): **290 pairs (31.5%) where
v92 corrects the fabrication and the candidate ships it**; on the truth axis 0 regressions and 108
truthful answers the candidate preserves that v92 destroyed; with the model's own
`requestIntent.kind = "mutation"` present, 0 regressions. Prior campaigns reported "belt-vs-v92: 0
fabrication regressions" because they compared `readsAsCompletion()` with v92's
`PAST_COMPLETION_CLAIM_PATTERN` — **the matcher, not the gate that decides whether the matcher is
consulted**. This is the same measurement error as ledger #133. Byte-for-byte identical results on
`821f530`, so this is carried from the previously-authorised candidate, not introduced this round.

### V60-D7 (P2, EXECUTION_TRUTH) — the plan path records VERIFIED evidence without reading the postcondition

`executeOneAction()` sets `success` from `r.changed === true` and never reads the `postconditionPassed`
that `archive_company` / `restore_company` / `archive_task` / `restore_task` / `archive_goal` /
`restore_goal` all return; `executeActionPlan()` turns that into `status: 'completed'`; and
`index.ts:3138` then writes `recordExecution(mapping[0], mapping[1], …, true)` — a VERIFIED envelope —
for every completed action. The direct archive/restore path refuses exactly this case ("archive
attempted, but the persisted status did not confirm it afterward — treat as not archived"). So the
bulk-confirmation ("yes" to a multi-action plan) path can report "Archive company (X): done." with a
verified envelope while the row is not archived. OTM §4.1.

### V60-D8 (P2, VACUOUS_GUARD) — the envelope "backstop" does not see every pack array

`index.ts` says "every array in the pack literal below must have an envelope here
(architecture_collection_envelope_contract.mjs pins this statically)". That suite derives its key list
from the pack literal with a **value-shape** regex (`pack*`, `merged*`, `x.data || []`). Adding
`salaryBands: (approvals.data||[]).slice(0,20)` to the pack — no envelope, no `TRIM_ORDER` entry —
left the entire committed battery green (measured). An unenveloped, untrimmable array is exactly the
growth path of incident #133.

### V60-D9 (P2, VACUOUS_GUARD) — the create-family postcondition is pinned by nothing

Vacuity mutation run, 14 mutants, whole battery per mutant, `index.ts` restored and sha-verified after
each (`qa/verification/scratch/v60/mutation_proof.log`): **12 killed, 2 survived**, both in the create
family — `recordCreate` recording evidence without consulting the `verifyRowsExist` result, and
`verifyRowsExist` returning every requested id without querying at all. Either would let the entire
create family claim "created" with no row behind it, and no committed suite notices.

### V60-D5 (P3, SUITE_INTEGRITY) — the budget contract's estimator check is a regex, not a measurement

`architecture_context_budget_contract.mjs:95` asserts that two string literals both appear in the
source. The loop measures `{ command, pack }` while the preflight measures `{ command, contextPack }`,
and the loop's last measurement is taken *before* `contextBudget` is added to the pack. Measured gap:
19 tokens with no trims, 145 with 25 trims — inside the 600-token reserve today, but unmeasured by the
suite that claims to pin it. Its "an oversized pack is brought under budget" case uses a fixture with
every collection at 40 rows and no untrimmable content, i.e. only the shape the fix handles.

### V60-D6 (P3) — a negated compound read loses its truthful answer

"do not archive anything, just tell me the status" + a truthful status answer → the answer is replaced
by "No change was made — you asked me not to, so nothing was executed." Honest, but the read half of
the request goes unanswered. #57-D6b behaviour; 1/66 of a read corpus.

### What held

`architecture_final_claim_contract` 51/0 and my own independent matrix
(`qa/verification/scratch/v60/receipt_matrix.mjs`, 67 mutation commands × 4 claim variants = 268, 66
read requests, 28 verified and 28 unverified/denied envelopes, 377/390): with the model's own
classification present, 0 fabrications ship; every truthful read answer survived verbatim except the
one negated compound above; a verified envelope renders the claim and an unverified or denied one never
does. 60 committed `.mjs` suites run from the filesystem: 58 green, 2 self-declared standing reds
(`factory_production_write_inventory`, `production_write_authority` — factory-runner inventory, out of
the deploy surface). **5 of the 60 are SUPERSEDED stubs that assert nothing** (`claim_segmentation…`,
`d3_past_completion…`, `mixed_claim_grounding`, `past_completion_gate_behavior`,
`per_resource_grounding_contract`), so the effective count is 55. The `_gate_extract.mjs`
request-side defaults were tested for load-bearing-ness by flipping the default command to a mutation
intent and re-running the whole battery: **0 suites change verdict**, so the default hides nothing.
Independent block-scope scan: 944 `const`/`let` declarations, 4,957 references, **0 same-block forward
references**; the only two cross-declaration references are a type-literal property and `UUID_IN_TEXT`,
used inside `safeDisplayLabel` whose call sites are all below the declaration.

### Prepared fix (NOT applied to the candidate; `index.ts` bytes untouched)

`qa/verification/scratch/v60/apply_fix.mjs` builds `index_fixed.ts`: named-lookup rows merged at the
HEAD of all four collections (closes D2); `approvals` added to `TRIM_ORDER` plus a second and third
pass with harder floors so the pack always reaches the budget (closes D1); the loop measures the same
object shape the preflight measures and the reported trim list is capped (closes D5). Measured on the
fixed bytes: every previously-413ing free-text case fits, all four named rows survive to the deepest
trim, estimator gap 89, committed battery 57/58 (only `architecture_context_budget_contract` fails,
because its END anchor is a byte-exact copy of the line the fix changes — that suite needs its anchor
updated as part of applying the fix). D3, D4, D7, D8, D9 are **not** fixed here: D3/D4 are an
architecture decision (whether a request-side gate may be vetoed by the model), and D7/D8/D9 are
one-line source changes plus suite work that belong with the implementing session.

**Regression added:** `qa/verification/proposed/v60_regression_additions.mjs` — 22 rows, CONTRACT/DEFECT
tagged, runs from any cwd, honours `SEM_INDEX_SRC`. On the candidate: 10 pass / 12 fail (red by design).
On the prepared-fix bytes: 16 pass / 6 fail (the remaining six are D3, D4, D7, D8 and the plan-evidence
contract).

**Status.** Candidate `9e39a47` is **NOT fit to deploy over v92** under the contract bar. Production
stays on v92 source (function v94). No production write, migration or function deploy was performed or
prepared by this campaign.
