# v62 promotion note — campaign #122, candidate c30a0cc

**Verdict: FAIL — NOT DEPLOYMENT READY** under the contract bar
(`governance/OPERATING_TRUTH_MODEL.md`, §4.4 as promoted this round).

| | |
|---|---|
| Candidate commit | `c30a0cc09d37d985fa50ff14fc0335a48e342f6f` |
| `index.ts` sha256 | `0af353b5267fafa6d4ed3b80c61d9a62838cbf3d43c0f3746eeed8d8b465648f` (unchanged at end of run) |
| Line endings | 6,810 CRLF, **0 bare LF** — CRLF-pure |
| Deploy surface | `supabase/functions/sem-ai-command/index.ts` only; `_shared/*` not imported (import scan: `deno.land/std@0.224.0/http/server.ts`, `esm.sh/@supabase/supabase-js@2`) |
| Reference build | v92 = git `c9dfab5bd433`, `index.ts` sha256 `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` (re-derived from the repo; link to the *running* function is integration-level, not byte-direct — `supabase functions list/download` is gated in this session) |
| Committed battery | 61/61 `.mjs` suites exit 0, run from the filesystem |

## To promote

### 1. `qa/verification/proposed/v62_regression_additions.mjs` → `qa/scenarios-runner/`

Runs from any cwd, honours `SEM_INDEX_SRC`, exits nonzero on ANY failure. Currently
**16 CONTRACT rows pass, 9 DEFECT rows reproduce**. Every DEFECT row is written as the assertion that
holds once the finding is fixed, so the file turns green exactly when the candidate is deployable.

The CONTRACT rows are the ones worth keeping permanently even after the defects close. Three of them
exist specifically because the committed suites do not have them:

* **`a history ROW is bounded … AND the cap is actually applied`** — asserts `t.length <= HISTORY_FIELD_CAP ? t`,
  not just the declaration. Two committed suites assert only the declaration and a marker string; the V61-D1
  P1 fix can be disconnected while both stay green (proved with a mutant).
* **`both whole-request refusals are reachable, not merely present in the text`** — asserts the two `if`
  statements exist as statements. `request_gate_inventory_contract` counts `, 413)` occurrences, which does
  not change when a gate is made unreachable.
* **`the Mongolian read veto exists AND is wired into the candidate selection`** — `MN_READ_SHAPE` is
  referenced by no suite in the battery; removing it turns 5/5 Mongolian wh-questions into commands.

### 2. `qa/verification/proposed/v62_known_failure_modes_entry_137.md` → append as `## 137.` in `qa/KNOWN_FAILURE_MODES.md`

Also corrects the record on two open items:
* **V61-D5** is registered as "latent; no production writer yet". True — no writer exists — but
  `set_chat_channel_compaction(uuid, text, jsonb, uuid, integer)` is `grant execute … to authenticated`
  and callable by the channel creator with an **unbounded** `p_summary`. Measured: ~40,000 characters guts
  every core collection to zero; ~80,000 characters puts the pack permanently over 12,000, so every
  subsequent turn in that channel 413s forever. It is reachable through a granted RPC, not only through a
  schema column.
* **V61-D4** is confirmed exactly as filed and should stay open as defence-in-depth, not be "fixed": the byte
  assertion is unreachable given the current `TRIM_ORDER`, but it is the only guard against a future trim that
  touches a protected key without going through `TRIM_ORDER`, and the mutant that removes it is killed.

### 3. Working laboratories — `qa/verification/scratch/v62/`

Independent of the candidate's fixtures. Kept because the next round will want them:

| file | what it does |
|---|---|
| `budget_lab.mjs` | slices the real trim block + the real `estimateRequestTokens`; builds packs from the `.limit()` caps read out of `buildContext()` |
| `measure_headroom.mjs` | the 16-scenario headroom table (empty / short / 50 / 100 / 200-turn channels, many companies, many archived companies, many archived tasks, 80–400-char names, long free text, long command, compaction summary) |
| `probe2.mjs`, `probe3.mjs` | estimator delta, the command-length sweep that empties the core collections, the compaction sweep, the plan-size sweep, envelope truthfulness after a gut, determinism, history order, the image gate, the wrong-413-reason band |
| `intent_lab.mjs`, `intent_corpus.mjs`, `mn_probe.mjs` | the real `requestedIntent` derivation with the model emitting nothing; 99 + 61 broad corpus and a 37 + 21 adversarial Mongolian corpus |
| `receipt_matrix.mjs`, `belt_corpus.mjs`, `fp_fn_impact.mjs` | 252 + 600 fabrications, 62 + 486 truthful reads, 20 verified / 20 unverified envelopes, and the FP/FN findings turned into product consequences through the real window |
| `mutation_proof.mjs`, `mutant_behaviour.mjs`, `m14_check.mjs` | 24 mutants against the 30 `SEM_INDEX_SRC`-honouring suites; SHA asserted before and after; the 5 survivors proved to be real behaviour changes |
| `tdz_scan3.mjs` | masked block-scope scan (SYSTEM_PROMPT range, block comments, string/template literals, type aliases, signature positions excluded) |

## Blocking before any re-deploy

1. **V62-D1 / D1b (P1).** Make the id-provenance gates read `namedTargets` as well as the trimmed arrays — or,
   better, resolve them the way company/task/goal lifecycle already does: server-side, under the caller's RLS,
   from the ids the model emitted. In particular `planCompanyIds`/`planPersonIds`/`planTaskIds`/`planGoalIds`
   must not be built from trimmable collections; a durable pending action that is minimum-safe by contract
   cannot have its execution gated by a display window, and it must never answer "no longer resolves to a real
   record" about a row that does.
2. **V62-D2 (P1).** Either count an attached image at its real token cost (a flat per-image figure, not
   `base64.length / 4`) and gate it against the provider's own image limit, or drop the image from the request
   and answer the text — degradation, not refusal. As shipped, the UI accepts 5 MB and the function refuses at
   ~430 KB, and v92 serves both.
3. **V62-D3 / D4 (P2).** Either give the remaining collections a targeted server-side lookup, or stop telling
   the model that they have one. Give `memories` and `factoryWorkOrders` a real `total` so a trim to zero
   cannot read as non-existence, and either raise or remove the 12-line cap on `contextBudget.trimmed`.
4. **V62-D9 (P2).** The three substring-only assertions above must become behavioural before the closures they
   guard can be trusted again.

## Not blocking, but sized and open

* **V62-D5** — the 413 reason misattributes the cause for commands of 22,000–23,999 characters.
* **V62-D6** — 6/37 short Mongolian verbal-noun phrases read as commands; the truthful answer is replaced by an
  English receipt. A truth regression vs v92 inside an intended departure.
* **V62-D7** — `өөрчил` and `нэм` (rename, add) are not matched by their own stems; a fabricated Mongolian
  completion ships. v92 parity.
* **V62-D8 (V61-D11)** — Cyrillic entity names produce zero command name tokens, so `namedTargets` is empty and
  the head-merge protection does not apply. v92 parity, and it compounds V62-D1 for the workspace's own language.
* The founder-facing receipt is English-only; a Mongolian turn is answered with an English receipt.

## Live acceptance this report does NOT provide

`CLAUDE.md` §6 now says static and source verification cannot substitute for live request-shape acceptance,
and that byte-identical deployment is not product-safe deployment. This run honoured the first rule by
executing the real source rather than reading it, but **it made no live request**: `deno check`, live
`supabase db query`, the deployed UI and the AI chat were all unavailable in this session type. Read every
conclusion here as source-level and harness-level. Whatever candidate follows this one still needs the
post-deploy live acceptance gate, and V62-D2 in particular should be confirmed live with a real 1 MB photo
before and after the fix.
