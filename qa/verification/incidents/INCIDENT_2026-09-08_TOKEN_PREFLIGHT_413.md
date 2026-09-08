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
