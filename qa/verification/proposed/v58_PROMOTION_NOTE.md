# Verifier #58 — promotion note (campaign #118, candidate 5ebc6953ca6665ccc22c54bee6c8573d8ee2ed62)

**Verdict: FAIL** under the contract bar. index.ts sha256 `0fd05a92b3a088bca59b22ce41b74dcd826c7b1b46c3f9e229255aa390fe317b`
preserved byte-for-byte (asserted before/after every scratch mutant; every mutant and the prepared fix live in
`qa/verification/scratch/v58/`, never in `supabase/functions/`).

## What to promote into `qa/scenarios-runner/`

`qa/verification/proposed/v58_regression_additions.mjs` → suggested name `v58_lifecycle_window_and_imperative_contract.mjs`.
29 CONTRACT rows are green on the candidate; 19 DEFECT rows are red on the candidate **by design** and green on the
prepared fix (`SEM_INDEX_SRC=qa/verification/scratch/v58/index.fixed.ts`). Promote only together with the fix (or after
an explicit founder waiver of V58-D2, in which case the D2 rows stay red and the suite documents the waiver).

## Ledger

`qa/verification/proposed/v58_known_failure_modes_entry_130.md` — append as `## 130.` to `qa/KNOWN_FAILURE_MODES.md`.
Ledger #129's sentence "non-imperative leads never execute" should be corrected there (27/56 execute with the model
emitting nothing); ledger #121 (BUG-014) should be annotated: closed for companies only — the same class stood for tasks
(restore impossible) and goals (window-gated) until V58-D2.

## Prepared fix (not applied — no write authority on index.ts)

`qa/verification/scratch/v58/v58_fix.mjs` writes `index.fixed.ts` from the candidate with three narrow changes:

* **F1** — command-name lifecycle fallback requires the verb in imperative position (allow-list) in addition to the
  existing deny-list. 27/56 → 1/56 non-imperative executions; controls unchanged; #56 lifecycle_harness 56/1 (= candidate).
* **F2** — `archivedTasks` placed in the pack (it was queried, enveloped and referenced by the prompt since v92, never
  placed); task and goal lifecycle ids re-read from `tasks`/`goals` under the caller's RLS across every status instead
  of filtered by the window; unresolved ids leave a truthful line. Module-top `type LifecycleLookupRow`.
* **F3** — never-silent receipt names the entity the request was about (task/goal/person/…), keeping the company wording
  for company requests.

Measured on the fixed bytes: all 27 SEM_INDEX_SRC battery suites green (collection_envelope 57/0), company_lifecycle_matrix
31/0, v56 129/0, v57 306/0, own lifecycle attack 161/0, task-restore trace green, TDZ 0 SYNC, 0 bare LF,
v58_regression_additions 48/0. The lexicon-tier residuals (model omits requestIntent) are untouched by design.

## What the implementing session should do next

1. Apply F1/F2/F3 (or an equivalent) to `index.ts`; run the whole battery + `v58_regression_additions` (must be 48/0).
2. `deno check` by CLASS (TS2448/TS2454/TS2304/TS2552/TS2551 must be zero) — blocked in this verifier session.
3. Re-dispatch an independent verifier on the exact new SHA.
4. Work PC, post-deploy: measure live `requestIntent` emission compliance — every P2 residual leans on it.

## Not measured in this session (state plainly)

`deno check`; live v92 download (integration-level provenance only); any browser / AI-chat turn; the live compliance rate
of the model's `requestIntent` field.
