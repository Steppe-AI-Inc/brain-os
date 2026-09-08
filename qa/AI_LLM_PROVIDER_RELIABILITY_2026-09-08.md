# AI / LLM Provider Reliability — Forensic Audit, 2026-09-08

**Author:** Work-PC independent QA (production acceptance authority). **Method:** read-only.
Production `pvphxgrtdfrudejjhzjk`; `sem-ai-command` **v94** (carries the rolled-back **v92**
source). Evidence = live `SELECT`s against production (no writes, no config change, no deploy,
no secret read) + the deployed Edge source at `origin/master`. Nothing here changed the active
model. Where evidence is insufficient the row says **UNKNOWN** rather than a guess.

---

## EXECUTIVE ANSWER — why only Haiku appeared to work

**Because Haiku is the only model that was ever left switched on. The alternatives did not
"fail unreliably" in production — with one exception they were never dispatched to at all.**

Model choice in Brain OS is **not per-request**. `sem-ai-command` resolves it once per turn:

```ts
// index.ts:1708
const { data } = await supabase.from('ai_providers')
  .select('provider,model').eq('is_active', true).limit(1).maybeSingle();
```

A single global row decides the model for every user and every turn. The database enforces
that only one can be active — `ai_providers_single_active_idx UNIQUE (is_active) WHERE
is_active = true` — and the UI's `setActiveProvider()` clears the others before setting one.
There is **no per-user, per-channel or per-request model selection**, and **no model-to-model
fallback anywhere in the deployed source**.

So "only Haiku is reliably usable" is, mechanically, "only Haiku is `is_active = true`".

The one genuine alternative that *was* active — **Claude Sonnet 4.6** — worked: 32 real calls,
zero recorded failures, and it stopped at 15:28 on 08-24 because Haiku was activated four
minutes later. That is a configuration switch, not a failure.

The **OpenAI family is a different story and did genuinely fail**, but it failed *while being
made to work* on 08-24, was never left active, and never served a single production turn. Its
failure is documented below with live evidence and is a real, still-unfixed
runtime-compatibility problem — just not one that is affecting production today.

---

## PROVIDER × MODEL MATRIX

`ai_providers` carries **no key column by design** (migration 202608260001) — secrets are Edge
Function secrets. "Secret presence" below is inferred from behaviour, never read.

| Provider | Model id | Active | Secret | Model id valid | Requests actually sent | Ever served prod | Calls | First → last | Classification |
|---|---|---|---|---|---|---|---|---|---|
| anthropic | **claude-haiku-4-5** | **ACTIVE** | YES (471 successful calls) | YES | YES | **YES** | **471** | 08-24 15:32 → 09-08 06:45 | **WORKING** |
| anthropic | claude-sonnet-4-6 | inactive | YES (same key path) | YES | YES (while active) | **YES** | **32** | 08-24 03:20 → 08-24 15:28 | **WORKING (deactivated, not broken)** |
| openai | gpt-5-mini | inactive | UNKNOWN¹ | YES | YES (08-24 diagnostics only) | NO | 0 | — | **BROKEN — edge-runtime stream stall** |
| openai | gpt-5.6-sol | inactive | UNKNOWN¹ | YES | YES (08-24 diagnostics only) | NO | 0 | — | **BROKEN — verified live: 200 + stalled body 2+ min** |
| openai | gpt-5.6-luna | inactive | UNKNOWN¹ | YES | UNKNOWN | NO | 0 | — | **UNVERIFIED (same family as the two above)** |
| anthropic | claude-sonnet-5 | inactive | YES (same key path) | UNVERIFIED² | **NO** | NO | 0 | — | **UNVERIFIED — never activated, never called** |

¹ `OPENAI_API_KEY` is definitely present in production for a *different* reason — embeddings.
`buildContext()` uses it for `text-embedding-3-small` and memory RAG works, so the key exists
and is valid for embeddings. Whether the same key is entitled to the gpt-5 family is **UNKNOWN**
— the 08-24 failures were stalls, not 401/403, so entitlement was never disproven.
² `claude-sonnet-5` was created 08-24 12:32 and never activated. Its id has never been sent to
Anthropic from this system, so validity is unverified here.

**Configured in the pricing catalogue but never even present in `ai_providers`** (UI/cost
options only, zero production reality): `claude-fable-5`, `claude-opus-5`, `gpt-5.6-terra`,
`gpt-5`, `gpt-5-pro`, `gpt-5-nano`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini`.
**Opus has never been configured or called** — the founder's impression that Opus "wasn't
working" corresponds to no request ever having been made.

---

## HISTORICAL TIMELINE (from `model_usage`, every tag ever written)

| Window | Tag | Calls | What it means |
|---|---|---|---|
| 08-23 15:05 → 08-24 02:54 | `fallback-no-api-key` | 8 | **No real LLM.** Deterministic `fallbackPlan()`. This is the answer to "when was Brain OS using deterministic fallback instead of a real LLM". |
| **08-24 03:20** | `claude-sonnet-4-6` | — | **First genuine LLM call in the product's history** (4 minutes after the first anthropic row was created at 03:16). |
| 08-24 03:20 → 15:28 | `claude-sonnet-4-6` | 32 | Sonnet 4.6 serving real production traffic. |
| 08-24 09:03 → 11:36 | *(openai rows created)* | 0 | gpt-5-mini, gpt-5.6-sol, gpt-5.6-luna configured. **Never served.** |
| **08-24 11:38** | *(haiku row created + activated)* | — | **Haiku becomes the active model.** |
| 08-24 12:32 | *(claude-sonnet-5 row created)* | 0 | Never activated. |
| 08-24 15:32 → **09-08 06:45** | `claude-haiku-4-5` | **471** | Everything since. Uninterrupted. |
| 08-28 → 09-07 | `deterministic-*` (4 tags) | 13 | Non-LLM short-circuits (confirmation, disambiguation, clarification, plan-execution). Correctly tagged, not LLM traffic. |

**Models that have EVER genuinely served production traffic: exactly two** — `claude-sonnet-4-6`
(32) and `claude-haiku-4-5` (471). Everything else is configuration or UI.

---

## CONFIRMED ROOT CAUSES

**1. OpenAI gpt-5 family — stream stall in the Supabase Deno edge runtime. CONFIRMED.**
Source comment at `index.ts:1440-1447`, written from a live observation:
> *"Verified live: a gpt-5.6-sol request sat with a 200 response but a stalled body for 2+
> minutes, well past the 90s fetch timeout, and never resolved."*

`AbortSignal.timeout` guards only connection setup; once headers return, a stalled body is not
cut off. The mitigation shipped (`readWithTimeout`, a per-read idle timer). Contemporary
work-order records on 08-24 corroborate the sequence:
- 15:44 / 15:48 — *"OpenAI fetch never resolved even with the temperature fix + timeouts;
  switching to a manual race-based fetch"*
- 16:05 — *"OpenAI gpt-5.6/gpt-5-mini models remain unreliable in this edge runtime even after
  temperature fix and manual race"*
- 16:12 / 16:21 — *"Superseded by maxDuration fix on /chat/stream route"*, *"investigating
  platform-level execution ceiling"*

**2. OpenAI gpt-5 family — `temperature` rejected. CONFIRMED, already fixed.**
`index.ts:1601-1604`: the gpt-5 family returns **400 "Unsupported parameter"** for
`temperature`; only gpt-4.x accepts it. Guarded by `supportsTemperature = !/^gpt-5/.test(model)`.
This was a real cause of early failures and is closed in the deployed source.

**3. Sonnet 4.6 — no failure at all. CONFIRMED.** 32 successful calls, zero failed work orders
attributable to it, cleanly superseded by the Haiku activation 4 minutes later.

**4. Haiku — genuinely healthy at real Brain context sizes.** 471 calls, 14.2M input tokens
(~30k input tokens/call average), latest 09-08 06:45. This is not a "works on a tiny prompt"
result.

---

## UNRESOLVED / UNKNOWN ROOT CAUSES

| Question | Verdict |
|---|---|
| Is `OPENAI_API_KEY` entitled to the gpt-5 family? | **UNKNOWN.** Failures were stalls, not 401/403. Never disproven. |
| Is `claude-sonnet-5` a valid, entitled model id for this account? | **UNKNOWN.** Never sent. |
| Is `claude-opus-5` / `claude-fable-5` usable? | **UNKNOWN.** Never configured, never sent. |
| Do the gpt-5 stalls persist now that `readWithTimeout` shipped? | **UNKNOWN.** No OpenAI row has been active since 08-24, so the mitigation has never been exercised in production. |
| Max-output-token / structured-output / tool incompatibility for untested models? | **UNKNOWN.** Anthropic path pins `max_tokens: 8192` (`index.ts:1554`); untested models were never exercised against the real Brain JSON contract. |

---

## SILENT FALLBACK FINDINGS — the critical invariant

**The dangerous pattern the founder described — "requested model A → A fails → Haiku serves →
UI says A worked" — DOES NOT EXIST in the deployed source.** Verified by reading every
reassignment of `model` and `providerName` in `index.ts`:

| Site | Assignment | Silent? |
|---|---|---|
| 2323 | `providerName = activeProvider.provider; model = activeProvider.model` | Configuration read, not fallback |
| 2497 | `model = 'deterministic-plan-execution'` | **Tagged** in `model_usage` |
| 2506 | `model = 'fallback-no-api-key'` | **Tagged**, and the user-visible summary says *"Fallback planner created tasks because AI provider is not configured or failed."* |
| *(deterministic branch)* | `model = deterministic.tag` | **Tagged** |

There is **no catch-and-retry with a different model**. A provider failure propagates:
`callAnthropicStreaming`/`callOpenAIStreaming` throw → outer catch (`index.ts:4299`) →
`mark_work_order_failed(errorMessage)` → `send({type:'error', error})` to the browser. The
failure reason is persisted and surfaced. **Verdict: NO SILENT MODEL-TO-MODEL FALLBACK.**

**Residual gap, and it is real.** The invariant the founder wants is
`REQUESTED + ACTUAL + FALLBACK REASON + FAILURE REASON` observable. Today:

- **ACTUAL** — recorded (`model_usage.model_name`). ✅
- **FAILURE REASON** — recorded on the work order + streamed to the client. ✅
- **FALLBACK REASON** — encoded only as a magic string in the model tag
  (`fallback-no-api-key`), not a structured field. ⚠️
- **REQUESTED** — **not recorded anywhere.** There is no requested-model field, because the
  request never names a model; "requested" is implicitly "whatever row was active at that
  instant". If the active row is changed, past `model_usage` rows cannot be re-associated with
  what was configured at the time. ⚠️

The one substitution that *can* happen silently-ish: if the active provider is anthropic but
`ANTHROPIC_API_KEY` were missing, `key` is undefined → the `!key` branch runs the deterministic
planner and returns **tasks** with a plausible summary. It is tagged in the DB, but a founder
reading only the chat could believe the LLM planned it. Filed as **BUG-026 (P2)**.

---

## TOKEN-PREFLIGHT SEPARATION (kept strictly separate, as instructed)

| Layer | Status | Evidence |
|---|---|---|
| **Provider connection health** | HEALTHY (anthropic) | 471 Haiku calls, latest 09-08 06:45 |
| **Model availability** | 1 of 6 configured models active; 4 never called | `ai_providers`, `model_usage` |
| **Token / prompt capacity** | **AT RISK — separate defect** | v93 measured 12,340 tokens on an empty channel (hard stop 12,000); Home PC measures the deployed build at ~10,570, ~1,430 below the stop |
| **Response / parser health** | HEALTHY, one historical miss | exactly one `Model returned invalid JSON` work order, 08-31 11:16, out of 524 |

**No evidence links the token preflight to provider failure.** The preflight (`index.ts:2316`)
returns HTTP 413 **before** any provider is resolved or any key is read — it cannot be caused by,
or cause, a provider problem. They are independent. A 413 during acceptance testing is the
ledger-#133/#134 class, not a provider defect.

---

## SAFE PRODUCTION FINDINGS (obtained without changing anything)

- Only one model can be active — DB-enforced unique partial index. A "two models fighting"
  scenario is **impossible**, which I checked before filing it as a risk.
- `model_usage` has **524 rows**; `work_orders` has **524 done**, 29 rejected, 10 queued —
  1:1 with completed turns. Accounting is consistent.
- `estimated_cost_usd` totals **$17.37** and is populated on every row.
  **`actual_cost_usd` is `0` on all 524 rows** (never null, never positive) — cost reconciliation
  against real provider billing never happens. Filed as **OBS-COST-NEVER-RECONCILED (P3)**.

---

## CONTROLLED MODEL TEST REQUIRED

Proving any alternative model requires flipping the single global active row, which switches the
model **for the whole product and every user**. I did not do it and will not do it autonomously.

| # | Provider | Model | Exact test | Risk | What Home PC / staging must provide |
|---|---|---|---|---|---|
| 1 | anthropic | `claude-sonnet-5` | Activate; send 3 turns (short question, real-context question, a mutation); capture `model_usage` tag, receipt, latency; deactivate | **Medium** — global switch; unverified model id could 404 every turn until reverted | Staging project, or a founder-authorized ≤10-min production window with immediate revert |
| 2 | openai | `gpt-5.6-sol` | Same, specifically to test whether `readWithTimeout` closed the stall documented at index.ts:1440 | **High** — this model is *known* to stall; every turn could hang until the idle timer fires | Staging strongly preferred; this is the one real unresolved failure |
| 3 | openai | `gpt-5-mini` | Same | High | Staging |
| 4 | anthropic | `claude-opus-5` / `claude-fable-5` | Add row, activate, same 3 turns | Medium | Confirm entitlement first — never configured |
| 5 | — | — | Missing-key behaviour: unset `ANTHROPIC_API_KEY` and confirm the user-visible surface says "no LLM", not a plausible plan | **High** — degrades prod | Staging only |

**Cheaper alternative that needs no production switch:** a staging or local Edge deployment
pointed at a scratch DB, with the same key, exercising each model id once. This answers
entitlement + stall + JSON-contract compatibility for all six models without touching prod.

---

## HOME-PC IMPLEMENTATION REQUIREMENTS

1. **Record the requested model, not just the served one.** Add `requested_model` +
   `resolved_model` + `fallback_reason` (structured, nullable) to `model_usage`. Today
   "requested" is unrecoverable after the active row changes.
2. **Make the no-key fallback unmistakable in the UI** (BUG-026): the chat must state that no
   LLM ran. A tagged DB row is not enough — the founder reads the chat, not `model_usage`.
3. **Persist provider failures as first-class rows**, not only as a streamed `error` event and a
   rejected work order. There is currently no queryable "provider call failed" table, which is
   why "which models failed and why" had to be reconstructed from prose in work-order summaries.
4. **Reconcile `actual_cost_usd`** or drop the column (OBS-COST-NEVER-RECONCILED).
5. **Per-request model override** (design question, not a defect): if the founder is meant to
   choose a model per conversation, the current single-global-row design cannot express it.
6. **Re-test the gpt-5 family against the shipped `readWithTimeout`** in staging before ever
   re-activating an OpenAI row in production.

---

## SCOPE STATEMENT (constitution §17)

This audit verifies: the active-model mechanism, the complete `ai_providers` configuration, the
complete `model_usage` history (every tag ever written, 524 rows), the absence of model-to-model
fallback in the deployed v92/v94 source, and the documented OpenAI failure mode — as of
2026-09-08 against production. It does **not** verify entitlement for any unsent model id, nor
the current behaviour of any model other than `claude-haiku-4-5`, because proving those requires
a global production switch that only the founder may authorize.
