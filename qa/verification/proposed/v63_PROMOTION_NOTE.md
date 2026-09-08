# v63 PROMOTION NOTE — campaign #123, verifier #63

**Candidate:** `24e454f9018944e854cb2073ddf1ccd979a80aa7`
**`supabase/functions/sem-ai-command/index.ts` sha256:** `86620b369baa800178678af5d032c62fdce321eaa954d4ff957e3feec833769c`
(579,829 bytes; 6,906 CRLF; 0 bare LF; 1 bare CR inside a comment). Restored byte-identically after the
mutation proof; asserted before and after every temporary edit.

**Verdict: FAIL — NOT DEPLOYMENT READY under the contract bar.**
**EDGE STATUS = NOT DEPLOYABLE.** Do not deploy `24e454f9`.

---

## 1. What to promote into the battery

| Artifact | Promote to | Why |
|---|---|---|
| `qa/verification/proposed/v63_regression_additions.mjs` | `qa/scenarios-runner/v63_intent_backstop_and_budget_gate_contract.mjs` | 19 CONTRACT rows that hold on these bytes and must keep holding (estimator identity, key partition, fitting-pack invariance, minimum-safe survival, newest-history retention, provenance coverage, termination, honest refusal, receipt, read survival, belt guarding) + 8 DEFECT rows that go green only when V63-D1/D2/D3/D5/D6/D7/D8 are fixed. Rename to `v63_*` on promotion; do **not** reuse a `v56_*`–`v62_*` name. |
| `qa/verification/scratch/v63/v63_mutation_proof.mjs` | keep as the round's vacuity proof | 19 mutants against the whole 57-suite battery, with SHA discipline built in (refuses to start unless `index.ts` hashes to the certified value, restores and re-hashes after every mutant). |
| `qa/verification/scratch/v63/v63_budget_probe.mjs` | fold its fixture builder into the promoted suite | The candidate's own headroom fixture omits `namedTargets`, `pendingAction`, `recentlyResolvedEntities` and `recentlyDeletedEntities` — every one of them a MINIMUM_SAFE_CONTEXT member that the trim cannot reduce, i.e. exactly where a margin gets spent unnoticed. Mine includes them. |

## 2. Suites that must be repaired, not just added to

1. **`request_gate_inventory_contract.mjs`** — the image-gate row is a substring match
   (`/imageBytes\(attachedImage\.base64\) > IMAGE_BYTES_MAX/`). Mutant **M11** wraps the same call in
   `if (false && …)` and the row still passes. Make it behavioural, or at minimum assert that the condition is
   not dominated by a constant.
2. **`request_gate_inventory_contract.mjs`** — delete or honour the claim
   "Sized to reproduce the observed 12,340-token estimate on this workspace" (it measures 25,595). (V63-D8)
3. **`request_gate_inventory_contract.mjs`** — add the platform request-body limit to the inventory, classified
   or explicitly UNMEASURED, and add the attached image's *token* cost as a named UNMEASURED input. (V63-D7)
4. **`architecture_context_budget_contract.mjs`** — nothing anywhere pins the pre-trim **id provenance capture**
   (mutant **M8** survives the whole battery). Add a behavioural row: an id present before the trim and absent
   after it must still be executable.
5. **`architecture_org_scope_helper_contract.mjs`** — it does not reach `index.ts`. Mutant **M7** replaces
   `isCompanyEffectivelyActiveInMemory` with `c.status !== 'archived'`, so a company under an **archived parent**
   reports `effectivelyActive: true`, and nothing notices.
6. **`_gate_extract.mjs`** — `stripTS` cannot strip a generic arrow
   (`= <T extends {...}>(items: T[]): T[] =>`). That is the shape of `dropArchivedCompanyTarget`, which is why
   no suite can execute the archived-parent window. One line: `s.replace(/=\s*<[A-Za-z][\s\S]*?>\(/g, '= (')`.
7. **Harness reach** — only 35 of 64 suites honour `SEM_INDEX_SRC`. The other 29 (including
   `structured_claim_verification`, `lifecycle_evidence_and_output_persistence_contract`,
   `current_turn_and_continuity_contract`, `architecture_archived_parent_policy_contract`) can only be
   mutation-proved by editing the certified bytes in place. Add the env override to all of them.

## 3. The fixes, in the order I would make them

1. **V63-D3 (P1) — carry the V59-D2 correction into the request-intent tier.** Add the mirror of
   `lastClauseIsMutation`: an imperative in the FIRST clause is not vetoed by a read-shaped last clause.
   Then: an adverb slot in `REQUEST_FRAME_PREFIX`; an email address in `IMPERATIVE_OBJECT`; scope
   `STATEMENT_FINITE_VERB` so it cannot fire on the object noun of an imperative it already matched; `go` in
   `CONFIRMATION_COMMAND`'s follower set; and in `MN_READ_SHAPE`, exempt a finite non-past
   `-на/-нэ/-но/-нө` immediately before `уу/үү` (polite imperative) while keeping participles (`-сан/-сэн`)
   and infinitives (`-х`) as questions. **Ship none of these without rows `V63-C18` and `V63-C19` green** —
   they exist to stop a blanket "always mutation" fix.
2. **V63-D2 (P2)** — capture a company **status map** before the trim, beside the pack, exactly as
   `provenanceIds` already is, and build `archivedCompanyIds` from surviving rows ∪ that map ∪ `namedTargets`.
3. **V63-D1 (P2)** — set `truncated: true` whenever rows were removed, independently of whether `total` is
   exact. Do **not** fill `total` from `array.length`; that was the first V62-D4 attempt and reverting it was
   correct.
4. **V63-D6 (P2)** — `const n = Number(env); const cap = Number.isFinite(n) && n > 0 ? n : DEFAULT;` for all
   three of `SEM_AI_MAX_TOKENS`, `SEM_AI_IMAGE_BYTES_MAX`, `SEM_AI_MODEL_CONTEXT_TOKENS`.
5. **V63-D5 / V61-D4 (P3)** — either make the minimum-safe assertion reachable (assert on the values the loop
   actually wrote, at each write) or delete it and correct §4.4 to describe the pre-loop guard, which is the
   thing that really protects the set. Also: `MINIMUM_SAFE_CONTEXT` names 5 of the contract's 7 rows; identity,
   org scope, permissions and the system contract live outside the pack and are protected by omission.
6. **V63-D7 / V63-D8 (P3)** — inventory and witness corrections above.

## 4. Answers to the seven-part founder mandate

1. **Token-budget path — the invariant HOLDS.** Estimator identity verified (same shape, same object, drift ≤ 1
   token from `estimatedTokens` writing itself); fitting pack untouched; optional before core; history keeps the
   newest; minimum safe context byte-identical after the hardest trim; provenance covers every pre-trim id and
   travels beside the pack; the loop terminates; the refusal is deterministic and names its limit. **One
   exception, and it is a defect:** truncation is inexpressible for `memories` and `factoryWorkOrders`
   (V63-D1), so "truncated=true whenever rows are omitted" does **not** hold for 2 of ~30 collections.
   Headroom on my own fixtures: **680–1,072 tokens** below the 12,000 hard max. Not tuned to 11,999; the margin
   is the deliberate 600-token reserve plus the last trim's overshoot.
2. **Whole-request gates.** Classified: pack budget (SAFE DEGRADATION → DETERMINISTIC REFUSAL); model context
   window (DETERMINISTIC REFUSAL, unreachable in practice — 180,000 against a ~53k worst case); attached-image
   size (DETERMINISTIC REFUSAL, exactly the web client's own 5 MB decoded cap); output `max_tokens: 8192`
   (DETERMINISTIC REFUSAL with a specific "response was cut off" message and a `mark_work_order_failed`);
   per-collection `.limit()` caps and the named-entity cap (SAFE DEGRADATION); history window (SAFE
   DEGRADATION); model-JSON parse failure, auth, provider/stream error (DETERMINISTIC REFUSAL).
   **UNSAFE HARD STOP: none found.** UNMEASURED, named: wall-clock timeout, SSE stream initialisation, the
   attached image's *token* cost. **A fifth gate is hiding: the platform request-body size limit (V63-D7)** —
   real, reachable through a 5 MB image (~6.7 MB base64), and it returns a bare 500 rather than a classified
   refusal. The candidate declares **2** UNMEASURED, not the 4 the brief expected; the 2 it names are honestly
   scoped, but the list is incomplete.
3. **The promoted contract.** `MINIMUM_SAFE_CONTEXT` is **5 of the 7** contract rows; identity, org scope,
   permissions and the system safety contract are outside the pack and protected by omission, not by the named
   assertion. The assertion §4.4 describes is **vacuous** — unreachable by construction and unprotected by any
   test (mutant M10). The pre-loop `TRIM_ORDER ∩ MINIMUM_SAFE_CONTEXT` throw is the real protection.
4. **NOT INCLUDED != DOES NOT EXIST.** The prompt is strong (absence is never non-existence; counts come from
   `context.collections.<name>.total`; a work order outside the window is "not in view", never "does not
   exist"), and `namedTargets` keeps any named company/person/task/goal/project/department resolvable across
   every status however hard the trim squeezes. **The one construction that works is V63-D1:** for `memories`
   and `factoryWorkOrders` the model is told (by the prompt) that a trimmed collection carries the real total
   and `truncated=true`, and is then handed `total: null, truncated: null` and a `scope` string that has become
   false — a window with nothing to stop it being read as the whole.
5. **Estimator re-measured on my own fixtures** (built from the `.limit()` caps read out of `index.ts`, and
   including the four protected members the candidate's fixture omits) across empty / short / 50 / 100 /
   200-turn channels, many companies, many archived companies, many tasks, many archived tasks, long names,
   armed 20- and 50-option disambiguations, and 8k/12k pasted commands. No case ships over its own budget.
   Worst headroom 680. Floor passes begin at a ~12,000-character command; `companies` reaches 2 at ~17,000 and
   `archivedCompanies` reaches 0 at ~18,000, all while the turn still answers — which is the reachability
   window for V63-D2.
6. **The v59 hardening patch is present in these exact bytes**, verified by reading the current literals rather
   than the patch file: `IMPERATIVE_HEAD_RE` (frames added, Cyrillic alternatives removed),
   `commandReadLeadEffective`, `MUTATION_VERB_ALWAYS` groups 2–3, `READ_SHAPE`'s `do(?!…)` lookahead,
   `REQUEST_FRAME_PREFIX`/`commandForRead`/`lastClauseIsMutation`, and the receipt verb+entity mapping.
   **It is present in one tier and missing in the other** — that is root cause (a) of V63-D3.
7. **The pinned witness: both halves hold.** Pre-fix 25,595 > 12,000 hard max; post-fix 11,297 ≤ 11,400 budget,
   with 12 trims and the minimum intact. But the fixture is **2.07× the incident it claims to reproduce**
   (V63-D8). The three cases that **did** succeed live on v93 are still satisfied by these bytes at source
   level: a not-found company yields the truthful not-found line, an exact-named archive executes once, and a
   fresh-channel restore of a company outside the window resolves server-side and executes
   (`company_lifecycle_matrix` 31/0 plus my six extensions, including the active/archived-twin preference).

**The two permanent `CLAUDE.md` rules.** *Static/source verification cannot substitute for live request-shape
acceptance* — honoured by saying plainly that **every** conclusion here is source- or harness-level: no live
request, no browser, no deployed-bytes comparison were available in this session, all three gated by the
harness. *Byte-identical deployment is not product-safe deployment* — moot this round, because the candidate
fails before any deployment question arises; when it is re-cut, the post-deploy live acceptance gate remains
mandatory regardless of any byte comparison.

## 5. Ledger

`qa/verification/proposed/v63_known_failure_modes_entry_138.md` → `qa/KNOWN_FAILURE_MODES.md` as **## 138**.
