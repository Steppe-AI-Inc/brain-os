# v56 PROMOTION NOTE — verifier #56, campaign #116, candidate `e79eb658db6b5298f02977a8ce77719da16d4218`

**Verdict: FAIL** under the contract bar (four P1 classes, one P2; fix NOT prepared — design change, outside
my write authority). index.ts sha256 `4f5c85a920b77aa4d7ed9d04b19b16c00f0a78623eb937319f983e140994c01e` —
untouched (asserted before/after every in-place mutant; `git status` clean on `index.ts` and `people.ts`).

## What to carry into the implementation branch

1. **Intent must be structured, not a head-verb regex (V56-D1 / V56-D2).** The Operating Truth Model's first
   step is "structured intent (what mutation, if any, was asked for)". Make the model's JSON schema emit it
   explicitly every turn — e.g. `requestedIntent: { kind: 'mutation' | 'read' | 'confirmation' | 'clarification',
   action, entityType, entityName }` — and derive `requestedIntent` server-side from that field cross-checked
   against the action arrays; keep `MUTATION_INTENT_*` / `CONFIRMATION_COMMAND` only as defence-in-depth that can
   ADD intent (never remove it) for confirmations. Acceptance: `v56_regression_additions.mjs` D1 rows (22) and D2
   rows (10) green; `intent_corpus.mjs` FN-ship and FP-replace both at 0 on the generated corpora — do not tune
   the regex until the generator is green; that is how D1 was missed (the suite pinned the shapes the regex was
   written for).
2. **Gate or remove the command-name fallback (V56-D3 / D3b / D4).** `resolveCompanyLifecycleTargets(...,
   commandName)` must receive a command name ONLY when (a) `requestedIntent` is a resolved company archive/restore
   (from item 1), (b) the model emitted no action for any other entity type this turn, and (c) the command is an
   imperative with no interrogative/negation lead — or drop the raw-command fallback and rely on
   `archiveCompanyNames` / `restoreCompanyNames` (the model parses language; the server resolves names). Test the
   verb patterns on the command with the resolved name(s) removed (D4). Never fuzzy-match on a single token; if
   fuzzy is kept, require `commandMentionsCompany` or an exact/prefix hit. Acceptance: D3 (5), D3b (10), D4 (3)
   rows green; `question_probe.mjs` 0/19.
3. **Escape, do not blank, in the name lookup (V56-D5).** `ilike` needs `%` and `_` escaped (`\%`, `\_`), not
   replaced; keep punctuation literal in the exact stage; strip punctuation from BOTH sides in the fuzzy stage
   (or add a normalised name column / `find_company_by_name` RPC under RLS). Acceptance: D5 rows green.
4. **Promote `qa/verification/proposed/v56_regression_additions.mjs` into `qa/scenarios-runner/`** (73 CONTRACT
   green today, 56 DEFECT red by design → 129/0 after items 1–3). Its CONTRACT rows also close the three
   mutation-testing survivors (m10 receipt-on-attempted, m12 silent nonexistent id, m13 status preference).
5. **Harness (V56-H1):** the `'archive ACME Holdings'` default in run8/10–14 is faithful for what those suites
   test (belt behaviour GIVEN intent) but no battery member exercised intent derivation on real phrasing; item 4
   is that member. Keep the default; do not widen it.
6. **History marker (BUG-010 compounding):** a turn with `mutationIntent: null` but completion-shaped prose and an
   empty ledger is carried as `verified: true`. With item 1 this mostly closes itself; consider marking
   `verified: null` (unknown) rather than `true` when `mutationIntent` is null and the turn carried rejected or
   unaccounted prose.
7. **Mirrors:** either add `qa/scenarios-runner/architecture_shared_contracts_mirror_contract.mjs` (cited by both
   file headers and OTM §4, does not exist) or stop claiming the copies are drift-guarded. Not on the Edge deploy
   surface; not a deploy blocker.
8. **TTL residual (P3):** `lastTurnOutput.pendingAction` is not TTL-guarded, so an expired durable row's twin in
   the previous output still binds a bare "yes". Apply the same expiry to the fallback tier or drop the fallback
   once `chat_channel_state` is live.

## What NOT to change

* The envelope/receipt/persistence machinery: `recordExecution` + `recordCreate` fresh re-read, the receipt
  block, persist-every-turn, durable-first precedence, collection envelopes — all re-derived clean and
  mutation-covered (m1/m2b/m3/m4/m5/m8/m9/m11/m14/m15/m16 killed).
* The belt: with no intent it rewrites nothing; with intent it sits behind the receipt. Leave it.
* `company_lifecycle_matrix.mjs` — correct for what it pins; add, do not edit.

## Coverage gaps in this run (stated, not skipped)

* `deno check` could not run (`npx` gated; no TypeScript compiler on disk). TDZ classes covered by my own
  block-scope scanner only: 0 real synchronous use-before-declaration.
* No live `supabase functions list/download` (CLI gated); v92 provenance is git `c9dfab5bd433` == both in-tree
  copies (sha `795c20c8…`), integration-level.
* No browser / live chat turn: UI ↔ DB and AI ↔ DB were verified at the source-execution level only. BLOCKED, not
  skipped.
* The web-side P1 items (BUG-013/011) were checked only through their architecture contracts
  (`architecture_archived_parent_policy_contract` 15/0, `architecture_org_scope_helper_contract` 7/0, join
  guard) — no rendered surface was observed.

## Expected next round

Apply items 1–3, run `v56_regression_additions.mjs` (expect 129/0), `intent_corpus.mjs` (expect FN-ship 0,
FP-replace 0), `question_probe.mjs` (expect 0/19), the battery (expect 53/55 + 2 machine-posture reds),
`deno check` class decomposition (TS2448/TS2454/TS2304/TS2552/TS2551 = 0), then a fresh verifier on the new
exact SHA. Under the contract bar nothing else in this round's evidence stands between the candidate and
DEPLOYMENT READY.
