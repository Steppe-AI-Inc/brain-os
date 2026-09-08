# INCIDENT 2026-09-08 — v93 context pack exceeds the token preflight cap (P1, chat surface)

**Status: ROLLBACK IN PROGRESS.** Found during post-deploy live acceptance of `sem-ai-command` v93
(candidate 821f530, index.ts sha256 715246f3…), deployed 2026-09-08T01:50:43Z.

## Observed (production, founder session, brain.open-spot.ai)

| Channel | Command | Result |
|---|---|---|
| d506c017-3547-4773-91e7-e696ce71911a | "restore the company Nowhere Holdings Inc" | OK — "Nowhere Holdings Inc: no company by that name (searched the active and archived companies you can access) — nothing was restored." |
| d506c017 | "archive QA-SWARM-TEST-CO-VIA-CHAT" | OK — "QA-SWARM-TEST-CO-VIA-CHAT: archived." |
| 7736b4af-9ed2-4bef-9728-4a1aef70740a (fresh) | "restore QA-SWARM-TEST-CO-VIA-CHAT" | OK — "QA-SWARM-TEST-CO-VIA-CHAT: restored." (BUG-014 core repro passes) |
| 2ee72111-9a14-4671-8b44-f531a4c208ec (1 prior turn) | "What is the exact current title of that project as stored in the database right now?" | **FAIL** `{"error":"Token preflight hard stop","tokenEstimate":12340,"hardMax":12000}` (HTTP 413) |
| d514809c-9452-4d14-ad41-be2df0385237 (brand new, empty) | same question, entity named explicitly | **FAIL** — channel created, "No messages in this channel yet", no answer |

## Mechanism

`estimateTokens({command, contextPack}) = JSON.stringify(...).length / 4` and the 12,000 hard cap are
**unchanged from v92** (v92 `index.ts:2314-2316`; v93 `:2696-2698`). What changed is the size of the pack:
v93 adds `archivedCompanies` (≤12 rows), `archivedTasks` (≤15 rows), the `collections` envelope map
(24 entries) and three extra fields per history entry — together ≈ 3.5–5.3 KB of JSON ≈ 900–1,300 tokens.
The observed overage is 340 tokens, so requests that fit under v92 now exceed the cap. Short commands still
pass; a longer command that also triggers the named-entity lookups does not. The failure is safe (a 413 with
no answer, never a fabrication) but it removes the answer entirely — a functional P1 on the core surface.

Ledger context: a 2026-08-30 context-budget pass had already reduced caps (tasks 30→15, channels 30→15,
memories 20→8) because the base pack measured over the cap; v92 was tuned to sit just under it. The
workspace has since grown (20 companies, 9 archived, 25 tasks, 20 people).

## Action taken

1. Evidence preserved (screenshots + this file + channel ids above).
2. Rollback of the Edge deploy surface to v92 bytes (git `c9dfab5bd433`, index.ts LF sha256 `795c20c8…`)
   through the protected path (PR into master → `supabase-functions.yml`). Web changes and governance docs
   are NOT reverted; only `supabase/functions/sem-ai-command/index.ts`.
3. Decisive post-rollback experiment: re-run the identical question in a fresh channel on v92. Success
   there confirms the regression; failure would show the cap was already exceeded independently of v93.
4. Fix to prepare before any re-deploy: bring the pack back under budget (the `collections` map is the
   largest and most compressible addition; `archivedCompanies`/`archivedTasks` caps can be reduced; the
   per-entry history fields can be omitted when null), or raise `SEM_AI_MAX_TOKENS` — a production config
   change, which is a founder-only action. Then a fresh independent verifier on the new SHA.

## What the rollback costs (stated plainly)

Reverting the Edge surface reinstates the six Work-PC defects in production (BUG-010, 014, 002, 012 on the
chat surface; BUG-013/011 are web-side and stay fixed). The live evidence gathered before the rollback shows
the BUG-014 fix working in production: a fresh-channel restore of a company outside the context window
executed and was receipted truthfully, and a non-existent company produced the truthful not-found line.

---

## Resolution (same session)

**Decisive experiment (condition: establish regression vs pre-existing).** After the rollback, the identical
question was asked in a fresh channel on the rolled-back build: **it succeeded** —
"QA-SWARM-TEST-CO-VIA-CHAT has one project: "QA-C002-PROJ-EDITED-01"." (channel 27d56a86-a8ed-434b-a46f-44d60baf0731).
The same request 413s on v93 and answers on v92: **regression confirmed**, rollback correct.

**Measurement** (`qa/verification/scratch/p1/pack_budget_measure.mjs`, production's own estimator
`JSON.stringify(x).length / 4`, live row shapes): v93 added **1,772 tokens** over v92 —
archivedCompanies 577, archivedTasks 601, the collections map 460 (of which ~130 is prose `scope`),
history fields 134. The observed overage was 340 tokens, so the additions are the cause with room to spare.

**Rollback record.** master 55a1591 (PR #10) redeployed the v92 Edge source; workflow run 34179095353
success; `verify-deployed-bytes.sh c9dfab5bd433` → BYTE-IDENTICAL, live sha256 `795c20c8…`, 321,370 bytes;
production `sem-ai-command` **v94 ACTIVE, ezbr 22486cd751cac403, 2026-09-08T02:10:04Z** (v94 carries v92's
source). Web, shared primitives, governance documents and QA suites were not reverted.

**Structural fix (not a byte shave).** The pack now measures itself with the SAME estimator and DEGRADES
instead of letting the request 413: optional display collections are trimmed in a fixed order, core ones
last and never below a floor, and every trim is written back into that collection's envelope so the model
still sees the real total with `truncated: true` (OPERATING_TRUTH_MODEL §4.3). `context.contextBudget`
reports the estimate, the budget and exactly what was trimmed, and the prompt states that a trim never
means the rest do not exist. The two cheap wins are taken as well: the archived-companies window is 12→6
and the prose `scope` strings are gone from the envelope map. Pinned by
`qa/scenarios-runner/architecture_context_budget_contract.mjs` (12/12): an oversized pack ends under
budget; every trimmed collection reports shown/total/truncated truthfully; optional before core; core keeps
a floor; a pack under budget is untouched; trimmed history keeps the NEWEST turns; the estimator matches
the preflight; the budget leaves headroom.

**Also folded into the next candidate.** Verifier #59's prepared hardening patch (V59-D1..D4: the
`bring back` idiom, dead Cyrillic alternatives, the read-lead veto killing an established imperative, the
receipt entity from the command noun) — deliberately withheld from the authorized deploy, now applied.
`v59_regression_additions` 72/12 → **84/0** and promoted to
`qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs`.

**State after resolution.** Production: v92 source (function v94). New candidate: battery 57/57, gates
v48–v59 green (v46 at its recorded standing reds), deno by class unchanged with zero runtime-fatal, CRLF
pure. **Not deployed.** The previous authorization was scoped to the exact bytes `715246f3…`, which are now
known to breach the token budget; the new bytes need a fresh independent verifier PASS and a fresh
`ALLOW_FUNCTIONS_DEPLOY=1`.
