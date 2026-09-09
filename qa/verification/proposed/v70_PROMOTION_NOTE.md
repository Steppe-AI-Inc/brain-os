# VERIFIER #70 / CAMPAIGN #130 — PROMOTION NOTE

**Candidate:** `31979e8be62ed3d7c2bae2f5fa1bc8edea9cdf7b`
**index.ts sha256 (CRLF, as committed):** `e03ddceb3718e48cb9c4ec3260ad8062232e9a5416aee262ae0bc5d5e6bb7472`
**index.ts sha256 (LF-normalised):** `a80d03bfd0713ea5222443d945e4838329b0a3585232cb3081c1aa9c83b2e0a7`
**Verdict:** **FAIL** — EDGE STATUS = **NOT DEPLOYMENT READY** under the contract bar.

---

## 1. WHAT TO PROMOTE

| file | destination | why |
|---|---|---|
| `v70_regression_additions.mjs` | `qa/scenarios-runner/v70_clause_model_and_veto_boundary_contract.mjs` | 74 rows; 55 CONTRACT green on `31979e8`, 19 DEFECT red. Exits non-zero on any failure. Correct from any cwd (walks up for `qa/scenarios-runner/_gate_extract.mjs`), honours `SEM_INDEX_SRC`. |
| `v70_known_failure_modes_entry_152.md` | append to `qa/KNOWN_FAILURE_MODES.md` as **## 152** | `## 150` and `## 151` are taken. |
| `qa/verification/scratch/v70_survivor_exit_proof.mjs` | `qa/scenarios-runner/mutation_sweep_survivor_exit_proof.mjs` | **closes the standing residual #68 left open.** Replaces the three-spelling source-pattern row in `mutation_sweep_safety_contract.mjs:68-70` with a real run of each proof tool against a deliberately-surviving mutant. 9/9 tools exit non-zero. |

The remaining `qa/verification/scratch/v70_*.mjs` files are measurement instruments, not contracts. Keep them
for reproduction; do not promote them as suites.

---

## 2. THE PRIMARY MISSION — THE CONSUMER DERIVATION TABLE

> WHICH CONSUMER OF THIS CONCEPT DOES NOT DERIVE FROM ITS DEFINITION,
> AND WHAT REQUEST SHAPE REACHES THAT CONSUMER?

Instrument: `qa/verification/scratch/v70_consumer_table.mjs` — for each canonical alternation, take its
`|`-delimited vocabulary, then scan every other line for `|`-delimited tokens and report any line that
re-spells ≥25% of that vocabulary WITHOUT naming the canonical constant. Reported as candidates, then read and
classified by hand. **This table is the answer, and it was produced before a single test case was written.**

| canonical definition | line | consumers | NON-DERIVING consumer | request shape that reaches it | classification |
|---|---|---|---|---|---|
| `ENTITY_NOUN_ALTERNATION` | 1789 | `IMPERATIVE_OBJECT`, `NAMED_TARGET_AFTER_ENTITY_SRC`, `STRONG_OBJECT`, `ENTITY_NOUN_PHRASE`, `ADJECTIVAL_PARTICIPLE_BEFORE_ENTITY`, `commandEntityNoun` | `MUTATION_VERB_WITH_OBJECT` (6104) re-spells 29 of 81 nouns | `set the manager of Alice to Bob` | **INTENTIONALLY DIFFERENT** — registered in source (6077-6087) as an owed convergence, sized 24/18, containment 1.00. Honest registration, not drift wearing a decision's clothes. |
| `REQUEST_FRAME_ADDRESSED` | 1720 | `REQUEST_FRAME_ALTERNATION`, `QUESTION_SUPPRESSING_FRAME` | none | — | **CONVERGED** |
| `REQUEST_FRAME_ALTERNATION` | 1722 | `IMPERATIVE_HEAD_RE`, `REQUEST_FRAME_ALTERNATION_INTENT`, `REQUEST_FRAME_PREFIX` | none | — | **CONVERGED** |
| `REQUEST_FRAME_DELIBERATIVE` | 1739 | `REQUEST_FRAME_ALTERNATION_INTENT`, `hypotheticalRequest` | none | — | **CONVERGED** (#67-D4's fix holds) |
| `REQUEST_FRAME_READ_VERB` | 1763 | `QUESTION_SUPPRESSING_FRAME` | `commandReadLead` (3953) and `READ_SHAPE` (6110) each re-spell 6 of 7 | `tell me what happened to ACME` | **ACCIDENTAL OVERLAP, sized and NOT currently harmful** — all three lists agree today; they are three places to forget. |
| `CONFIRMATION_ALTERNATION` | 1797 | `CONFIRMATION_COMMAND`, the executor's bulk_confirmation gate | `SELECTION_FILLER` (452) shares 13 of 17 | bare `yes` / `ok, go ahead` | **INTENTIONALLY DIFFERENT** — `SELECTION_FILLER` strips filler words out of an ordinal *selection*; it is not deciding intent. |
| `MUTATION_VERB_ALTERNATION` | 1758 | `IMPERATIVE_LEAD`, `MUTATION_VERB_STEM`, `MUTATION_IMPERATIVE_VERB`, `FIRST_CLAUSE_VERB`, `MUTATION_VERB_ING_STEMS`, `MN_LOAN_VERB`, `negatedRequest`'s verb half, the negation gate | none | — | **CONVERGED** (#68's closure holds; 120 entries, all consumers derive) |
| `AMBIGUOUS_MUTATION_VERB_ALTERNATION` | 1779 | `lexiconObject`'s extractor | `MUTATION_VERB_WITH_OBJECT` (6104, 21/25), `MUTATION_VERB_PROPER_OBJECT` (6107, 14/25) | `create ACME Robotics`, `close the deal` | **ACCIDENTAL OVERLAP — REGISTERED with a written reason and a size.** The comment at 1777-1778 says it "replaces THREE hand-written spellings" including these two; **it replaced one.** The 6077-6087 comment is the accurate one. Fix the 1777 claim. |
| `REQUEST_NEGATED_ALTERNATION` | 1784 | the negation gate (3480) | **`commandNegatedLead` (3950), `negatedRequest` (7307)** | `keep ACME, and do not ever archive it` | **ACCIDENTAL DRIFT — V70-D5, a live counter-example to the invariant.** The source claims all three converged. One did. |
| CLAUSE SPLIT | **no canonical definition exists** | 3484, 3960, 6146 | **all three** | `Archive ACME. Do not delete it.` | **ACCIDENTAL DRIFT — V70-D6.** Three spellings, drifted three ways, and it is the concept V70-D1 and V70-D2 both turn on. |
| `COMPLETION_WORD` / `PAST_COMPLETION_CLAIM_PATTERN` / `COMPLETION_VERB` / `CONFIRMED_COMPLETION` | 3168-3169, 6857, 6919 | the belt, the receipt, the confirmed arm | each other | any completion claim | **IDENTICAL SEMANTICS *for the vocabulary*, INTENTIONALLY DIFFERENT *for the pattern shape*.** 8 of 24 words disagree. Ruling in §6. |
| `MUTATION_RESULT_FIELDS` / `MUTATION_ARRAY_FIELDS` / `OTHER_MUTATION_FIELDS` | 1788, 6068, 3938 | the negation gate, the intent tier, the executor | each other | any mutation | **IDENTICAL SEMANTICS for two of three** (100% and 91% containment; `OTHER_MUTATION_FIELDS` deliberately omits the four company-lifecycle fields the block handles itself). Registered debt in the ratchet. `MUTATION_RESULT_FIELDS` ≡ `MUTATION_ARRAY_FIELDS` at 100% — converge these two. |

**Verdict on the invariant:** `ONE BUSINESS/GRAMMAR CONCEPT → ONE CANONICAL DEFINITION → MULTIPLE CONSUMERS`
is **NOT** satisfied. Two semantic duplicates remain that are neither intentional nor registered
(REQUEST_NEGATED_ALTERNATION, CLAUSE SPLIT), and one pair is 100%-identical registered debt
(MUTATION_RESULT_FIELDS ≡ MUTATION_ARRAY_FIELDS). Per the founder mandate: **IF ANY SEMANTIC DUPLICATE
REMAINS: FAIL.**

**"IF THE EXECUTOR CAN ACT WHERE THE RECEIPT TIER IS BLIND: FAIL."** — I could not construct such a case. The
executor's `commandFallbackAllowed` requires `IMPERATIVE_HEAD_RE`, which is a strict subset of what the intent
tier admits, and the clause splitter at 3960 is a strict subset of the one at 6146. `EXECUTOR ⊆ INTENT` holds
by construction on both axes. **This half of mandate 1 PASSES.**

---

## 3. `concept_duplication_ratchet_contract` — RULING ON ITS BLINDNESS

#68 named two blindnesses: (a) it compares only NAMED alternations, so an inline-regex vocabulary is
invisible; (b) the converged name was never registered. (b) is fixed. **(a) is not, and it MUST be.**

Proof that it matters, from this round: the ratchet is green while `commandNegatedLead` (an inline regex
literal) hand-spells the negation vocabulary and `negatedRequest` hand-spells it a third time. The ratchet
cannot see either, because neither is a named `const X = "a|b|c"`. Both are V70-D5.

**Required change:** the scan must extract vocabulary from **regex literals and constructed regexes** as well
as from named string alternations, and compare those against every canonical. My
`v70_consumer_table.mjs` does exactly this in 90 lines and found both non-deriving consumers on the first run.
Until that lands, the ratchet's green is a statement about naming conventions, not about duplication.

---

## 4. FOUNDER MANDATE FOR THIS ROUND (2026-09-09) — ANSWERED

1. **PRIMARY MISSION / table** — §2 above. **FAIL** on the semantic-duplicate clause; **PASS** on
   executor-⊆-receipt.
2. **REQUEST CONSISTENCY, both directions** — **FAIL in both.** Direction A: 6 of 293 fabrications ship
   (V70-D3). Direction B: 800 of 1,600 PP-less truthful reads rewritten (V70-D2). Both measured on the same
   run, so neither was fixed at the other's expense — they are both open at once, which is a first for this
   campaign and is the strongest available evidence that the object boundary is not yet the right shape.
3. **NEVER-SILENT RECEIPT, structurally, both directions** — **PASS structurally, FAIL behaviourally.** No
   mutation-intent turn ends silent; every fabrication on a *recognised* request is receipted (480/480). The
   failure is upstream: V70-D3 turns make the request unrecognised, so the receipt is never asked.
4. **VACUITY / MUTATION-SWEEP SAFETY** — **PASS, and the standing residual is CLOSED.** Every sweep and proof
   re-run by me. 7 architecture mutants: 7 killed, 0 survived, index.ts byte-identical after. Zero-target and
   floor guards intact; **the recorded floor VALUES have not been lowered** (`vacuity_sweep` 10,
   `vacuity_sweep2` 10, `mutation_proof_v60_v61` 5, `vacuity_sweep_extended` 120, v56 8, v57 4, v58 5, v66 5,
   v67 5, v68 4 — all present and all met). The survivor gate is now proven **behaviourally**, not by source
   pattern: 9/9 tools exit non-zero against a deliberate survivor.
5. **NAMED TARGETS STRUCTURE (FIELD_NAME_MATCH ≠ SEMANTIC_CONTRACT_MATCH)** — **PASS.** `namedTargets` holds
   rows resolved from THIS turn's command; its envelope sits BESIDE the rows, not inside
   `context.collections` (a map of envelopes is not an envelope — the name-match trap, correctly avoided);
   `shown`/`total`/`truncated` are present on every window; an unknown total is `null` with `truncated: true`,
   never a lower bound presented as exact; and it survives every trim pass (measured, not asserted).
6. **DUPLICATED-CONCEPT SWEEP** — §2 table. IDENTICAL SEMANTICS: `MUTATION_RESULT_FIELDS` ≡
   `MUTATION_ARRAY_FIELDS` (converge). ACCIDENTAL DRIFT: `REQUEST_NEGATED_ALTERNATION` ×3, CLAUSE SPLIT ×3
   (converge). ACCIDENTAL OVERLAP, registered: `AMBIGUOUS_MUTATION_VERB_ALTERNATION` ×3,
   `REQUEST_FRAME_READ_VERB` ×3. INTENTIONALLY DIFFERENT: `SELECTION_FILLER`, `OTHER_MUTATION_FIELDS`,
   the four completion PATTERN SHAPES. UNKNOWN: none.
7. **OPEN TOKEN-BUDGET GAPS — NOT RESOLVED, and none of the evidence below is LIVE.** Every budget number in
   this report is a source-level measurement of sliced product code against fixtures I built. No request was
   made to a provider. `SEM_AI_MODEL_CONTEXT_TOKENS=180000` is still ONE value for every model and is still
   range-asserted only; it is unreachable today only because the pack gate bounds the compact pack to ~11.4k.
   The platform request-body limit, the wall-clock timeout and SSE stream initialisation remain **UNMEASURED
   AND NAMED**. `compactionCheckpoint.summary` is still untrimmable (V61-D5).
8. **IF YOU FAIL THIS CANDIDATE** — every finding above carries a reproduction command, a root cause, a size,
   and a red row in `v70_regression_additions.mjs`. §7 below is the fix design.

---

## 5. FOUNDER MANDATE CARRIED FROM 2026-09-08 — ANSWERED

1. **ATTACK THE TOKEN-BUDGET FIX.** Independently re-measured with my own fixtures
   (`v70_budget_probe.mjs`), built from the real `.limit()` caps in `index.ts`, not reused:

   | fixture | pack tokens | trims | preflight (cap 12,000) | request tokens (cap 180,000) |
   |---|---|---|---|---|
   | empty channel | 832 | 0 | fits, 11,168 headroom | 20,134 |
   | short channel, every collection at cap | 11,207 | 25 | fits, 793 headroom | 34,160 |
   | 50 / 100 / 200-turn history | 11,210 / 11,211 / 11,213 | 25 | fits | 34,163-34,166 |
   | many companies / archived companies / tasks / archived tasks | 11,206-11,207 | 25 | fits | 34,159-34,161 |
   | 130-char names everywhere | 10,786 | 52 | fits, 1,214 headroom | 31,327 |
   | 130-char names + 200 turns | 10,788 | 52 | fits | 31,329 |
   | everything at cap + 200 turns + long names + armed pendingAction | 10,763 | 52 | fits, 1,237 headroom | 31,322 |

   **0 hard stops. 0 packs still over budget after all three passes.** The margin is the hardcoded
   `-600` in `packBudget = max(2000, SEM_AI_MAX_TOKENS - 600)` — deterministic, not tuned to 11,999, and my
   fixtures are not small (200 turns, every collection at its cap, 130-character names). A fitting pack is
   unchanged (empty channel: 0 trims). Optional context trims before core (`TRIM_ORDER` runs memories →
   archived → display collections → conversationHistory → approvals → projects/goals/tasks/people/companies).
   History trims **oldest first** and preserves the newest turn (verified: with 200 turns and 2 kept, the kept
   rows are turns 198-199). Envelopes retain the exact total; `truncated` is true whenever rows are omitted —
   **0 emptied collections were left unmarked**. `namedTargets`, `currentTurn`, `pendingAction`,
   `activeChannelId`, `counts`, `continuity`, `recentlyResolvedEntities`, `recentlyDeletedEntities` all
   survive intact. **THE ESTIMATOR MATCHES THE PREFLIGHT EXACTLY** (`packTokens()` = 11,210 =
   `estimateTokens({command, contextPack})` = 11,210), and `estimateRequestTokens` measures
   `JSON.stringify(x, null, 2)`, which is byte-for-byte what both `callAnthropicStreaming` and
   `callOpenAIStreaming` send. **INVARIANT HOLDS at source level.**

2. **EVERY OTHER WHOLE-REQUEST GATE, classified by me independently:**

   | gate | classification |
   |---|---|
   | auth / identity | DETERMINISTIC REFUSAL |
   | pack token estimate vs `SEM_AI_MAX_TOKENS` (12,000) | SAFE DEGRADATION, then DETERMINISTIC REFUSAL with a cause and an action |
   | attached image bytes vs `IMAGE_BYTES_MAX` (5 MB) | DETERMINISTIC REFUSAL |
   | request tokens vs `SEM_AI_MODEL_CONTEXT_TOKENS` (180,000) | DETERMINISTIC REFUSAL (unreachable today) |
   | **output token cap** (`max_tokens: 8192` / `max_output_tokens: 8192`) | DETERMINISTIC REFUSAL — `stopReason === 'max_tokens'` produces *"Response was cut off before it finished"*, the work order is marked failed, nothing executes. **Classified; I checked because the inventory did not list it separately.** |
   | provider error / stream failure | DETERMINISTIC REFUSAL |
   | history length / `HISTORY_FIELD_CAP` | SAFE DEGRADATION (inside the pack) |
   | system-prompt size (18,824 tokens) | measured and pinned |
   | tool-schema size | N/A — this function uses no tool schema |
   | **the negation gate** | DETERMINISTIC REFUSAL **on a predicate that over-fires** — V70-D1. It is a whole-turn gate and belongs in this inventory; it is not currently in it. |
   | per-request wall-clock timeout | **UNMEASURED, NAMED** |
   | edge runtime request-body size limit | **UNMEASURED, NAMED** |
   | SSE stream initialisation after preflight | **UNMEASURED, NAMED** |

   **Judgement on the declared UNMEASURED set: honestly scoped, and it is three, not four.** I hunted for a
   hidden fifth and found the output-token cap already handled (safely) and the negation gate NOT listed —
   the latter should be added, because it refuses a whole turn's mutations on a text predicate.

3. **THE PROMOTED CONTRACT (§4.4 `TOKEN_BUDGET_EXHAUSTION_MUST_DEGRADE_CONTEXT_NOT_PRODUCT_AVAILABILITY`).**
   `MINIMUM_SAFE_CONTEXT` = `currentTurn, continuity, counts, collections, pendingAction,
   recentlyResolvedEntities, recentlyDeletedEntities, activeChannelId, namedTargets`.
   **Is it the contract's set? Partly, and the gap should be stated rather than papered over.**
   - current user command → `currentTurn` ✔
   - durable pending action → `pendingAction` ✔
   - canonical entity/action state for this turn's targets → `namedTargets` ✔
   - execution-result requirements + the safety/truth contract → live in `SYSTEM_PROMPT`, which is never
     trimmed ✔ (protected by construction, not by this list)
   - **authenticated identity and permissions → NOT in the pack at all.** `profile: {id, role}` is a sibling
     of `contextPack` in the request body, so no trim can reach it. Structurally safe, but **not a member of
     `MINIMUM_SAFE_CONTEXT` and not covered by its assertion.**
   - **organization scope → no dedicated pack key.** It is implicit in RLS and in `counts`. Same status.

   **Is any member protected only by OMISSION from `TRIM_ORDER`?** No. Two independent mechanisms: a guard at
   2950-2952 throws if `TRIM_ORDER` ever names a protected key, and a byte-for-byte before/after comparison of
   all 8 byte-stable members plus a key-set comparison of `collections` at 3005-3008.
   **Is the assertion vacuous?** No — its reachability is DEMONSTRATED by injection and execution in
   `v63_intent_coverage_and_caps_contract.mjs:336-352`, not merely asserted. (The row in
   `architecture_context_budget_contract.mjs:154` *is* a source-pattern row; the real one is in v63.)

4. **NOT INCLUDED IN THE PROMPT ≠ DOES NOT EXIST.** I could not construct a turn where a trim makes the
   product say something does not exist or answer a count from a window. Every trimmed collection keeps
   `shown/total/truncated`; `counts` (totals only, never trimmed) is the only source of a total; the
   `contextBudget.note` tells the model in words that a trimmed window is a window; and any entity named in
   the command is re-read server-side into `namedTargets` across every status. Measured with 200-turn history
   + every collection at cap + long names: 52 trims, 0 collections emptied without `truncated: true`.

5. **ESTIMATOR ACCURACY** — §5.1 table. Headroom reported. Not tuned to 11,999.

6. **THE v59 HARDENING PATCH, AS THESE EXACT BYTES** — `v59_intent_fallback_tier_contract.mjs` green on this
   sha, run from the filesystem, not read from a report.

7. **THE PINNED LIVE INCIDENT REGRESSION WITNESS, both halves** — `request_gate_inventory_contract.mjs`
   reports pre-fix **25,595** tokens (over the 12,000 hard limit — the pre-fix half really does fail) and
   post-fix **11,297** against a budget of 11,400 with 12 trims (the post-fix half really does answer, AND it
   degraded rather than merely fitting, AND it kept its minimum safe context). Both halves genuinely
   discriminate; the fixture is not too small to have failed.

---

## 6. RULING ON THE COMPLETION-VOCABULARY FAMILY (#141)

**CONFIRMED that `PAST_COMPLETION_CLAIM_PATTERN` is byte-identical to deployed v92** (measured against
`qa/verification/scratch/v92/index.v92.ts`, sha256 `795c20c8…`, itself byte-identical to
`git c9dfab5bd433:supabase/functions/sem-ai-command/index.ts`).
**CONFIRMED that the byte-pin blocks converging PCCP — and OVERTURNED as a reason not to converge the other
three.** Measured drift: **8 of 24** participle words (`activated`, `added`, `cleared`, `closed`, `confirmed`,
`deactivated`, `done`, `sent`).

**What the contract row should assert instead** — two clauses, not one:
1. `PAST_COMPLETION_CLAIM_PATTERN`'s literal is byte-identical to deployed v92 *(unchanged: this is what keeps
   the v92 belt differential a valid reference corpus)*, **and**
2. its participle vocabulary is a **documented subset** of a new single
   `COMPLETION_PARTICIPLE_VOCABULARY`, with every omitted word listed and reasoned in the source.

Then build `COMPLETION_WORD`, `COMPLETION_VERB` and `CONFIRMED_COMPLETION` from that one vocabulary. Three of
four spellings gone; the pin keeps working; the drift becomes a compile-time-visible list instead of an
invisible 8.

---

## 7. FIX DESIGN FOR THE IMPLEMENTING SESSION

**F1 (V70-D6, and the root of V70-D1).** Add one canonical definition at module level, above every consumer:
```
const CLAUSE_SPLIT = /(?<=[.!?])\s+|[,;]\s+|\s[—–-]\s+|\s+(?:and then|then|and|so|but|yet|however|though|although|while|whereas)\s+/i;
```
Replace all three sites (3484, 3960, 6146) with it. **Measure BOTH directions before concluding**: widening
the executor's splitter at 3960 makes `IMPERATIVE_HEAD_RE` reachable on more last-clauses, which is the
direction that can turn a read into an execution. Re-run `v57`, `v58`, `v61` A1 (80 turns) and
`company_lifecycle_matrix` — v61's A1 is the suite that caught two of the three failed #69 formulations.

**F2 (V70-D1).** With F1 in place, additionally treat `instead of`, `rather than` and `without` as CONTRAST
markers rather than negators for the mixed-turn test: a clause containing only a contrast marker and no
negator should not suppress a sibling imperative. Keep them in `REQUEST_NEGATED_ALTERNATION` for the
leading-position test, where they really are refusals.

**F3 (V70-D2).** Remove `OBJECT_HAS_PREPOSITIONAL_PHRASE` from the `isHeadlineObject` conjunction. The
remaining two conjuncts — opens with nothing referring, AND names nothing — are the actual definition, and
they classify `Order status report` and `Order status report for the board` identically, which is the point.
**Then measure the other direction**: `archive work order` (a real request with no name and no determiner)
must still refer — v61's A1 pins exactly this and is what killed the first formulation of the #69 veto.

**F4 (V70-D3).** Two independent edits. (a) `NAMED_TARGET_AFTER_ENTITY_SRC` currently requires `[A-Z0-9]`;
add a lowercase-with-digit-or-hyphen arm (`[a-z]+[-_]\w*\d`) so `wo-1` names a target while a plain lowercase
word still does not. (b) Give `ENTITY_NOUN_ALTERNATION` the hyphenated and closed spellings of every compound
noun (`work[- ]?order`, `business[- ]?unit`, `purchase[- ]?order`, `product[- ]?line`, `chat[- ]?channel`,
`software[- ]?spec`). Both are additive, so the read direction can only be affected through the veto — re-run
the 3,200-row read corpus in `v70_read_direction.mjs`.

**F5 (V70-D4).** `index.ts:7307`: `(?:\w+\s+){0,3}` → `(?:\\w+\\s+){0,3}`. Then keep the whole-file scan row
in the promoted suite, so the seventh instance is caught wherever it lands.

**F6 (V70-D5).** Build `commandNegatedLead` and `negatedRequest` from `REQUEST_NEGATED_ALTERNATION`, and
correct the false provenance claim at `index.ts:1777-1778` (it says three spellings of the ambiguous verb set
were replaced; one was).

**F7 (harness).** Promote `v70_survivor_exit_proof.mjs` and delete the three-spelling source-pattern row at
`mutation_sweep_safety_contract.mjs:68-70`. Extend `concept_duplication_ratchet_contract` to extract
vocabulary from REGEX LITERALS as well as named alternations (§3).

---

## 8. WHAT I COULD NOT MEASURE — SOURCE-LEVEL ONLY, WOULD STILL NEED LIVE ACCEPTANCE

Stated plainly, because `CLAUDE.md` now carries **STATIC / SOURCE VERIFICATION CANNOT SUBSTITUTE FOR LIVE
REQUEST-SHAPE ACCEPTANCE** and **BYTE-IDENTICAL DEPLOYMENT IS NOT PRODUCT-SAFE DEPLOYMENT**:

* **Every budget conclusion in §5 is source-level.** No request reached a provider. The 2026-09-08 incident
  was a whole-request gate that 24 rounds of source verification missed; my fixtures are mine, and a real
  workspace is not a fixture.
* **The provenance link to the DEPLOYED v92 is INTEGRATION-LEVEL, not byte-direct.** I verified
  `qa/verification/scratch/v92/index.v92.ts` is byte-identical to `git c9dfab5bd433` (sha256 `795c20c8…`).
  I did not run `supabase functions download` — no credentials in this worktree. "Deployed v92 == c9dfab5b"
  is carried from the record, not re-derived by me.
* **`deno check` ran, and the runtime-fatal classes are ZERO** (TS2448 / TS2454 / TS2304 / TS2552 / TS2551 all
  absent). Remaining: TS7006 ×10 (implicit any), TS2322 ×6 (`Timeout` vs `number` — node-lib typing noise,
  not Deno runtime), TS2339 ×1, TS7034/TS7005 ×1. **No count is pinned.**
* **No browser, no UI, no live AI chat.** This session is a source/worktree verifier with no browser tools
  available, so every UI and AI-chat truth check in the skill's protocol is **BLOCKED**, not skipped:
  UI ↔ DB and AI ↔ DB were not exercised against the live product. No synthetic `QA-VERIFY-*` data was created
  (nothing in this campaign touched the database), so there is nothing to clean up.
* **No DB access.** Codex E's behavioural half stays `BLOCKED — NEEDS LIVE/DB EVIDENCE`; I verified only that
  the prepared migration cannot reach production through this deployment and read its policy analysis.
* **`persistenceOutcome` is not rendered anywhere.** Codex C is closed in the function and open in `web/`.
