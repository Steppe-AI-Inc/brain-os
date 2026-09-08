# Verifier #59 — promotion note (campaign #119, candidate 821f5308)

Verdict: **PASS — EDGE STATUS = DEPLOYMENT READY (contract bar)** for `821f5308a0ce9c9d624c6139ee65e25b37c4b35f`,
index.ts sha256 `715246f3be9710b74193529ce9c07d44a6f3ad3739f132b6216ac04e8f519aa9`. Nothing in this note changes the
candidate's bytes; every item is a QA artifact or a PREPARED change for the implementing session.

## 1. Promote as-is

| Artifact (this branch) | Promote to | Why |
|---|---|---|
| `qa/verification/proposed/v59_regression_additions.mjs` | `qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs` | 84 pins: CONTRACT (never-silent receipt, intent derivation, server-side lifecycle, precedence, envelopes, create re-read, CRLF, deploy surface) + DEFECT V59-D1..D4 (model-emits-nothing tier) + V59-S1 + 4 RESIDUAL lines. Real windows via `_gate_extract.mjs`; path correct from any cwd; honours `SEM_INDEX_SRC`. **Red by design on 821f530 (72/12)**; 83/1 on the hardening patch; the last red is V59-S1 until item 2 lands. |
| `qa/verification/proposed/v59_lifecycle_rpc_only_contract_repaired.mjs` | replaces `qa/scenarios-runner/architecture_lifecycle_rpc_only_contract.mjs` | The committed suite cannot load (real CR/LF bytes inside the `/\r\n/g` literal at line 86 — SyntaxError). The repaired copy is byte-identical except that literal and its two relative paths; prints 31/0 on the candidate. Keep the committed name; fix the two `resolve(HERE, …)` depths back to `../..` when moving it. |
| `qa/verification/proposed/v59_known_failure_modes_entry_132.md` | `qa/KNOWN_FAILURE_MODES.md` ## 132 | Also corrects #131's "matrix 31/31" (never observed on the committed bytes). |
| `qa/verification/scratch/v59/*` | keep on the artifact branch | Instruments + JSON evidence: receipt matrix, intent corpus (18,720 × 4), lifecycle attack, executor→window chain, belt-vs-v92, machinery, mutation proof (16/16, in-place swap sha-restored), shadow-aware TDZ scan, fix builder/measure, `*_fix.json` = the same instruments on the patched bytes. |

## 2. FIX PREPARED — `qa/verification/proposed/v59_hardening.patch` (do NOT fold into the deploy of 821f530)

Six anchors, 25 changed lines, closes V59-D1..D4 in the model-emits-nothing tier:
1. `MUTATION_VERB_ALWAYS`: `(bring … back)` and `(get X <participle>)` as **capture groups** (`lexiconAlways` reads the first non-empty group — a non-capturing alternative matches and yields nothing; caught by measurement, not by reading).
2. `IMPERATIVE_HEAD_RE`: the three dead Cyrillic alternatives removed (vacuous under `/u` `\b`; Mongolian executes through the model's `requestIntent`, verified); frames `when(ever) you get/have a chance|moment|minute|time`, `if you can/could/would`, `don't forget to`, `be a dear and`, `I'd appreciate if you…` admitted.
3. `commandReadLeadEffective`: the read-lead veto is decided on the clause the imperative test looked at (closes the dead `do me a favour and` / `list …, then archive` allowances).
4. Lexicon `READ_SHAPE` veto decided after stripping the same frames and never on an imperative last clause; `do(?!\s+not|n't|\s+me a favour)`.
5. Receipt: a Cyrillic lexicon verb maps to archive/restore/delete (reason becomes "could not resolve which company", not "not an operation I can execute").
6. Receipt entity from the command noun (`task|goal|person|project|department`) when the model gave neither `entityType` nor a typed field.

Measured on the patched bytes (`v59_fix.ts` sha256 `8f20e96b9b78de4795b89a194798ab98320d5afb98fde12bf94d78d833b2e47b`, CRLF-pure): battery 56/56, gates v48–v58 green (v46/v53 standing reds unchanged), receipt matrix 340/340, model-absent no-intent 12.2 % → 6.7 %, belt-vs-v92 unchanged (0/0), `v59_regression_additions` 83/1. Applying it produces a **new candidate SHA** → verifier #60, `deno check` by class, CRLF, byte-verify. It is not a precondition for deploying 821f530.

## 3. Not closed (sized, for the backlog)

- V59-D5 lexicon false positives with no model classification (8/64 ordinary reads, 111/800 verb-headed reads; 0 when the model classifies).
- V59-R1 model `other`/`read` + fabricated completion ships (V57-D1 intended departure; v92 corrected 126/244 of my fabrication corpus on text shape).
- V59-R2 durable pending-action row has no source-freshness check (needs a swallowed write error at :6448 or a lost CAS race; 30-min TTL). Fix shape: `pending_action_source_work_order_id === lastTurnRow.id` or `pending_action_created_at >= lastTurnRow.created_at`.
- V59-R3 idioms outside any lexicon with the model emitting nothing: shelve / retire / bin / scrap / "back to active" / bare `archive X?`.
- Mongolian command fallback (no English verb) never executes without the model tier — by design after the patch, disclosed.
- Harness caveat for whoever reuses my instruments: `SUCCESS_WORDS` in `v59_lib.mjs` is negation-blind ("nothing was restored" matches) — the two chain/receipt "failures" it produced were adjudicated as harness artifacts, not product defects.

## 4. Blocked in this session (coverage gaps, not silently skipped)

- Live DB / live function bytes / deployed UI / live AI chat: Supabase CLI (`npx`) and browser tools gated → **BLOCKED**. v92 provenance is integration-level (recorded download 795c20c8… == git c9dfab5bd433).
- `deno check`: no deno binary, `npx` gated → **BLOCKED** (class counts carried from #58's record, disclosed).

## 5. Verdict line

PASS — EDGE STATUS = DEPLOYMENT READY (contract bar). index.ts sha256 715246f3be9710b74193529ce9c07d44a6f3ad3739f132b6216ac04e8f519aa9.
