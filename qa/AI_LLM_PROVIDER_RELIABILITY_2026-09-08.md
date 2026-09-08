# AI / LLM PROVIDER RELIABILITY — FORENSIC AUDIT

**Date:** 2026-09-08 · **Scope:** read-only production investigation · **Author:** Home PC (implementation node)

**Constraints honoured.** No production secret changed. No deployment. No Edge Function modified. The
globally-active production model was NOT switched. No provider was activated. Every finding below comes
from: production DB reads, the Edge Function secret *name* list (values never retrieved), deployed
function metadata, and repository source. One outbound network call was made — a `GET /v1/models`
against a **local Vercel-pulled** key, which turned out to be an 11-character placeholder; see §5.

**Method note that governs every line of this report.** A configured row is not a credential, a
credential is not entitlement, entitlement is not a served request, and a served request is not a
correct one. Where the evidence stops, the finding says UNKNOWN. Several of the stored production error
strings are *engineering cleanup notes written after the fact*, not original provider responses — they
are quoted as what they are, never as provider errors.

---

## 1. EXECUTIVE ANSWER — "Why only Haiku appeared to work"

**Because Haiku is the only model that was ever left active after 2026-08-24, the single day on which
every alternative was tried, and most of the alternatives were never actually tried at all.**

The founder's impression is correct about Haiku and unfounded about most of the rest. "Not working"
is being used for three states that have completely different causes:

| state | models | what the evidence actually shows |
|---|---|---|
| **PROVEN WORKING** | `claude-haiku-4-5` | 471 served calls, 2026-08-24 15:32 → 2026-09-08 06:45 (today), unbroken |
| **PROVEN FAILING in this runtime** | `gpt-5.6-sol`, `gpt-5-mini` | tried live on 2026-08-24 between 09:26 and 16:21; every attempt failed; **never tried again since** |
| **NEVER TRIED — no evidence either way** | `claude-sonnet-5`, `gpt-5.6-luna` | configured rows, **zero** calls, **zero** recorded failures. Not broken. Unverified. |
| **NOT CONFIGURED AT ALL** | `claude-opus-5`, `claude-fable-5`, `gpt-5`, `gpt-5-pro`, `gpt-4o`, `gpt-4.1`, … | exist only in the pricing catalog / analyzer UI. No `ai_providers` row. They were never selectable as an active model. |

Three model identities have EVER served production traffic in `sem-ai-command`, in the whole history of
the table: `fallback-no-api-key` (not an LLM at all), `claude-sonnet-4-6`, and `claude-haiku-4-5`.

**Zero OpenAI calls have ever succeeded.** Not one row, in 524 recorded turns over 16 days.

The reason Haiku *stayed* is ordinary: on 2026-08-24 the founder worked through the catalog in one
sitting, OpenAI failed in a way that could not be fixed that day, `claude-haiku-4-5` was activated at
15:32, it worked, and the switch was never touched again. `claude-sonnet-5` was created 80 minutes
later at 12:32 and appears to have never been selected. Nothing has attempted a non-Haiku model since
2026-08-24 16:21 — **15 days ago**.

---

## 2. PROVIDER × MODEL MATRIX

Secret presence is by *name only*, from the Edge Function secret list. Values were never retrieved.

| provider | configured model | row created | active | secret | model id valid | entitled | request sent | provider served | response parsed | model_usage | last success | failures seen | failure stage | fallback | classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| anthropic | `claude-haiku-4-5` | 08-24 11:38:08 | **YES** | YES | proven | proven | 471 | 471 | 470 | 471 rows | **2026-09-08 06:45** | 1 (invalid JSON, 08-31) | model output | none | **WORKING** |
| anthropic | `claude-sonnet-4-6` | 08-24 03:16:14 | no | YES | proven as of 08-24 | proven as of 08-24 | 32 | 32 | 31 | 32 rows | 2026-08-24 15:28 | 1 (invalid JSON, 08-24) | model output | none | **WORKING — STALE** (unexercised 15 days; still hardcoded in 3 live functions, §7.4) |
| anthropic | `claude-sonnet-5` | 08-24 12:32:57 | no | YES | plausible, untested | UNKNOWN | **0** | — | — | **0 rows** | never | **none recorded** | n/a | none | **UNVERIFIED** |
| openai | `gpt-5.6-sol` | 08-24 11:34:16 | no | YES | accepted by API (HTTP 200) | appears yes | ≥8 | **headers only** | **NO** | 0 rows | never | 8 work orders, 08-24 11:34→16:21 | **stalled stream body** | none | **BROKEN** — root cause confirmed, §4.1 |
| openai | `gpt-5-mini` | 08-24 09:03:38 | no | YES | UNKNOWN | UNKNOWN | ≥9 | UNKNOWN | NO | 0 rows | never | 9 work orders, 08-24 09:26→12:39 | UNKNOWN (notes overwritten) | none | **BROKEN — cause UNKNOWN**, §4.2 |
| openai | `gpt-5.6-luna` | 08-24 11:36:42 | no | YES | UNKNOWN | UNKNOWN | **0** | — | — | **0 rows** | never | none recorded | n/a | none | **UNVERIFIED** |
| deepseek | (none saved) | — | — | **NO — `DEEPSEEK_API_KEY` absent** | — | — | 0 | — | — | 0 | never | — | — | — | **BLOCKED_BY_CREDENTIAL** |
| — | `claude-opus-5`, `claude-fable-5`, `gpt-5`, `gpt-5-nano`, `gpt-5-pro`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini`, `gpt-5.6-terra` | never created | — | n/a | n/a | n/a | 0 | — | — | 0 | never | — | — | — | **CATALOG/UI ONLY — never a real option** |

Secrets present (names only, values never read): `ANTHROPIC_API_KEY` (set 2026-08-24T03:15:22Z),
`OPENAI_API_KEY` (set 2026-08-24T08:16:32Z), plus the platform `SUPABASE_*` set. **No `DEEPSEEK_API_KEY`.**
Neither provider key has been rotated since creation; this audit gives no reason to rotate either.

Production-safe testability: every row above can be tested **without switching the active model** using
the already-deployed `sem-ai-provider-test` function with `activate: false` (§8). It has never been run.

---

## 3. HISTORICAL TIMELINE

All times UTC. Sources: Edge secret `updated_at`, `ai_providers.created_at`, `model_usage`,
`work_orders`, `audit_logs`, deployed-function metadata.

| when | event | evidence |
|---|---|---|
| **2026-08-23 15:05 → 08-24 02:54** | **Brain OS ran with NO LLM at all.** 8 turns served by the deterministic `fallbackPlan()` — a hand-written task generator, not a model. | 8 × `model_usage.model_name = fallback-no-api-key`, 0 output tokens |
| 2026-08-24 **03:15:22** | `ANTHROPIC_API_KEY` created | Edge secret `updated_at` |
| 2026-08-24 03:16:14 | `claude-sonnet-4-6` row created | `ai_providers` |
| **2026-08-24 03:20** | **FIRST GENUINE LLM CALL IN THE PRODUCT'S HISTORY** — Anthropic, `claude-sonnet-4-6`, five minutes after the key was created | first `model_usage` row with real output tokens |
| 2026-08-24 **08:16:32** | `OPENAI_API_KEY` created | Edge secret `updated_at` |
| 2026-08-24 09:03:38 | `gpt-5-mini` row created | `ai_providers` |
| 2026-08-24 09:26 → 12:39 | **OpenAI attempts begin failing.** 9 work orders rejected, later annotated "Stuck in a provider hang caused by an unverified model catalog entry" | `work_orders.output.error` |
| 2026-08-24 11:34 / 11:36 | `gpt-5.6-sol`, `gpt-5.6-luna` rows created | `ai_providers` |
| 2026-08-24 11:38:08 | `claude-haiku-4-5` row created | `ai_providers` |
| 2026-08-24 12:32:57 | `claude-sonnet-5` row created — **and never used, to this day** | `ai_providers` + 0 `model_usage` |
| 2026-08-24 15:28 | **last ever `claude-sonnet-4-6` call** | `model_usage` |
| **2026-08-24 15:32** | **Haiku becomes the serving model.** Unbroken since. | `model_usage`, 471 rows to 09-08 06:45 |
| 2026-08-24 15:29 → 16:21 | Final OpenAI attempts, interleaved with Haiku. "gpt-5.6-sol streaming body never terminated past 90s"; then "OpenAI fetch never resolved even with the temperature fix + timeouts"; then "OpenAI gpt-5.6/gpt-5-mini models remain unreliable in this edge runtime … needs deeper investigation later" | `work_orders.output.error` |
| **2026-08-24 16:21** | **Last non-Haiku attempt of any kind.** Nothing since. | full `work_orders` + `model_usage` scan |
| **2026-08-24 ~16:00** | **OpenAI embeddings stop working, silently.** Last memory with an embedding: 15:36. Every one of the 63 memories created since 16:27 has a NULL embedding. | `memories.embedding` |
| 2026-08-28 10:28 | one `ai_providers` row created from chat; **not** activated | `audit_logs.metadata` — `aiProvidersCreated=1`, `aiProviderActivated=false` |
| 2026-09-06 21:47 (+08) | Branch `codex/sem-brain-v1` commit `24be8d7` adds a real provider abstraction, synthetic probes and DeepSeek support. **Not merged to master.** | git |
| **2026-09-06 14:35:44Z** | **`sem-ai-provider-test` DEPLOYED to production** (v1, ACTIVE) — from a local machine, not CI (`entrypoint_path` is `/tmp/user_fn_…`). Its migration was **not** applied. **Never invoked since.** | `supabase functions list`; 0 probe-shaped `model_usage` rows |
| 2026-09-08 01:50 / 02:10 | v93 token-preflight deploy and rollback — **a different incident**, see §6 | function versions |

### Answers to the six historical questions

1. **When was Brain OS using deterministic fallback instead of a real LLM?**
   2026-08-23 15:05 → 2026-08-24 02:54, 8 turns, because no provider key existed yet. It has not
   happened since — but the path is still live and would re-arm instantly if a key went missing (§7.2b).
2. **When did the first genuine Anthropic call happen?** 2026-08-24 03:20, five minutes after
   `ANTHROPIC_API_KEY` was created at 03:15:22.
3. **Which models have EVER genuinely served production traffic?** Exactly two: `claude-sonnet-4-6`
   (32 calls) and `claude-haiku-4-5` (471 calls). Nothing else, ever.
4. **Which merely existed as configuration/UI options?** `claude-sonnet-5` and `gpt-5.6-luna` (configured,
   never called); `gpt-5-mini` and `gpt-5.6-sol` (configured, called, never succeeded); and the entire
   remaining pricing catalog — `claude-opus-5`, `claude-fable-5`, `gpt-5`, `gpt-5-pro`, `gpt-5-nano`,
   `gpt-5.6-terra`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini` — which never had a row at all.
5. **When did Haiku become the reliable active model?** 2026-08-24 15:32, and it has served every
   LLM turn since without a single provider-side failure.
6. **Were Sonnet/Opus failures caused by …?** **The premise does not hold.** There are no Sonnet or Opus
   failures on record. `claude-sonnet-5` has never been called; `claude-opus-5` was never configured.
   `claude-sonnet-4-6` never failed on the provider side — it was *replaced*, not broken. The failures
   in the record are **OpenAI only**; their causes are in §4.

---

## 4. CONFIRMED ROOT CAUSES

### 4.1 `gpt-5.6-sol` — provider returns 200, then the stream never terminates (CONFIRMED)

Failure stage: **REQUEST SENT ✓ → PROVIDER SERVED headers ✓ → RESPONSE BODY NEVER COMPLETED ✗ → NEVER
PARSED ✗ → NO model_usage ✗.**

Verified live at the time and recorded permanently in the deployed source: a `gpt-5.6-sol` request "sat
with a 200 response but a stalled body for 2+ minutes, well past the 90s fetch timeout, and never
resolved." The reason the timeout did not save it is specific and still true of the code:
`AbortSignal.timeout` on `fetch` guards **connection setup only** — once headers are back and the body
is being read, an already-open stream that stalls is not cut off by that signal in the Supabase Deno
edge runtime.

This is **not** a credential, entitlement, model-ID, token-preflight or prompt-size failure. It is a
transport/streaming failure. Classification: **BROKEN — streaming parser / transport incompatibility.**

A mitigation was written afterwards (`readWithTimeout`, a per-read idle timeout that resets on every
chunk, plus an overall deadline in `consumeSSE`). **It has never been exercised against OpenAI**, because
no OpenAI call has been attempted since. Whether it makes `gpt-5.6-sol` usable is **UNKNOWN and testable**
(§8, test T2).

### 4.2 `gpt-5` family — `temperature` is rejected outright (CONFIRMED, and separately fixed)

Reasoning-tier models reject `temperature` with a 400 "Unsupported parameter"; only the `gpt-4.x` family
accepts it. The code now branches on `supportsTemperature = !/^gpt-5/.test(model)`. This was a genuine
defect — but the record is explicit that **fixing it did not make the models work**: the very next
rejected work order reads "OpenAI fetch never resolved even with the temperature fix + timeouts."
So this is a real root cause of *some* early 400s and **not** the root cause of the hangs.

### 4.3 The `fallback-no-api-key` era — absent credential (CONFIRMED)

8 turns, 2026-08-23 15:05 → 08-24 02:54, ended within five minutes of `ANTHROPIC_API_KEY` being created.
Unambiguous.

### 4.4 A misreading that must not be repeated (CONFIRMED as a misreading)

The stored string "unverified model catalog entry" refers to **Brain OS's own catalog entry being
unverified**. It does **not** say the OpenAI organisation requires verification. The parallel workstream
on `codex/sem-brain-v1` reached the same conclusion independently and recorded it as a warning. **Do not
ask the founder to verify their OpenAI organisation on this evidence.** Only a fresh provider response
saying so would justify it.

---

## 5. UNRESOLVED ROOT CAUSES — marked UNKNOWN, not guessed

1. **Why OpenAI streams stall in this Deno edge runtime.** UNKNOWN. The proximate behaviour is
   established (§4.1); the mechanism — OpenAI-side reasoning latency, edge-runtime SSE handling, an
   incompatible `/v1/responses` streaming shape, or a proxy — is not. Never re-tested after 08-24 16:21.
2. **Whether the Edge `OPENAI_API_KEY` is valid today.** UNKNOWN. It has not been used in 15 days.
   A `GET /v1/models` was run against the **local Vercel-pulled** `OPENAI_API_KEY` from
   `web/.env.production.local`: it is an **11-character placeholder**, not a real key, and returned
   `401 invalid_api_key`. That is a real finding about the **web/Vercel** copy (§7.3) and says **nothing
   whatsoever** about the Edge Function secret, which is a separate value and was never read.
3. **OpenAI account entitlement for the `gpt-5.x` tier.** UNKNOWN. Never established by a provider
   response.
4. **`claude-sonnet-5` and `claude-opus-5` availability.** UNKNOWN. Zero calls, zero failures.
5. **Whether `claude-sonnet-4-6` is still served by Anthropic.** UNKNOWN — last proven 2026-08-24. This
   matters more than it looks: three live production functions hardcode it (§7.4).
6. **`gpt-5-mini`'s actual failure mode.** UNKNOWN — the nine stored errors were overwritten with
   cleanup prose during incident response, destroying the original provider responses.

---

## 6. TOKEN-PREFLIGHT SEPARATION — the four health questions kept apart

The founder's instruction to keep these separate is correct, and the evidence supports separation.

| dimension | verdict | evidence |
|---|---|---|
| **PROVIDER CONNECTION HEALTH** | Anthropic **HEALTHY**; OpenAI **UNKNOWN since 08-24** | 471 Anthropic successes today; no OpenAI attempt in 15 days |
| **MODEL AVAILABILITY** | `claude-haiku-4-5` available; everything else UNVERIFIED or BROKEN | §2 |
| **TOKEN / PROMPT CAPACITY** | separate, still **OPEN** | the v93 preflight incident |
| **RESPONSE / PARSER HEALTH** | Anthropic 2 JSON-parse failures in 503 calls (0.4%); OpenAI never reached parsing | `ai_command_json_parse_failed` ×2 |

**They are not the same incident.** Every provider failure is 2026-08-24. The token-preflight incident is
2026-09-08 (v93 deployed 01:50Z, P1 found by live acceptance, rolled back 02:10Z). Different date,
different layer, different mechanism: the preflight rejects the *request Brain OS builds* before any
provider is contacted; the provider failures happen after a 200 from OpenAI. **No evidence links them.
They stay separate.**

**And the corollary the founder stated, which this audit adopts as a rule:** a model that answers a tiny
prompt is not HEALTHY. The deployed probe (§8) sends a one-line synthetic prompt. A probe PASS proves
credential + entitlement + JSON-shaped output. It proves **nothing** about behaviour under a real Brain
context pack of 25k–120k tokens. Those are two different tests, and the second one still depends on the
token-budget work landing.

---

## 7. SILENT FALLBACK FINDINGS

### 7.1 The good news, stated precisely

**`sem-ai-command` has NO cross-model fallback, and cannot acquire one by accident.** The dispatch is a
single if/else chain: deterministic plan → deterministic short-circuit → *no key* → anthropic →
openai. There is no retry, no second provider, no "try the next model". A provider failure propagates to
the outer `catch`, marks the work order `rejected`, and emits an SSE `error`. Model B never answers for
Model A.

**So the specific scenario the founder described — "requested model A → A fails → Haiku serves → UI
still says A worked" — does not occur on the chat path.** Searched for and not found.

The actual served model is also reported truthfully: the `done` event carries the real `model` variable,
and the UI renders it in the per-message **Details** panel. It is collapsed by default, which is a UX
choice, not a lie.

### 7.2 The bad news — three real silent-degradation paths

**(a) EMBEDDINGS FAIL SILENTLY, AND ARE FAILING RIGHT NOW — P1, live, 15 days old.**

`embedTexts()` swallows every failure: a missing key, a non-2xx response and any thrown error all return
`null` per input, with no log, no `contextError`, no audit row and no user-visible signal. The comment
says this is deliberate ("chat must never hard-fail"), and degrading is the right call — **doing it
invisibly is not.**

Production evidence:

```
memories WITH an embedding:     3   (2026-08-24 10:59 → 15:36)
memories with NULL embedding:  63   (2026-08-24 16:27 → 2026-09-07 12:26)
```

Every memory written in the last fifteen days has no embedding. The call site is present in the
**deployed v92 source** (`embedTexts(memoryFacts…, openaiKey)`) and on the query side too
(`embedText(command, openaiKey)`), so the code is running and returning nulls — this is a failing call,
not a removed one. **Semantic memory retrieval has been silently dead since 2026-08-24 ~16:00 and
nothing anywhere surfaced it.** It began within the same hour OpenAI chat was abandoned, which points at
a shared OpenAI-side cause, but the cause itself is UNKNOWN (§5.2).

This is the most important finding in this audit after the executive answer, and it is entirely
independent of the model-selection question.

**(b) `fallback-no-api-key` fabricates a plan when a key is missing.** With no key the deterministic
planner produces tasks and approvals that are persisted as a real work order. It is honestly labelled —
`model_usage.model_name = fallback-no-api-key`, and the summary says so — but the founder sees a
normal-looking plan, and this path would re-arm instantly and invisibly if a secret were ever
mis-set. (The `codex/sem-brain-v1` branch removes this path entirely; that judgement looks right.)

**(c) Failures are invisible to every dashboard.** A provider failure writes `work_orders.output.error`
and nothing else — **no `audit_logs` event and no `model_usage` row**. Both surfaces anyone reads for AI
health are blind to failure by construction. The 8 failed `gpt-5.6-sol` turns are indistinguishable from
"never attempted" in `model_usage`; only the raw `work_orders` table remembers, and its error strings
were later overwritten by hand.

### 7.3 The web/Vercel OpenAI credential is a placeholder

`OPENAI_API_KEY` in `web/.env.local`, `web/.env.production.local` and `web/.env.qa.local` is an
11-character placeholder that returns `401 invalid_api_key`. The legacy `api/ai-command.js` and
`netlify/functions/ai-command.mjs` paths, which read `process.env.OPENAI_API_KEY`, therefore cannot work.
Whether anything still routes to them is a separate question, not answered here.

### 7.4 Four other live LLM surfaces bypass the provider system entirely

These are ACTIVE deployed functions. None consults `ai_providers`, none records `model_usage`, so none
of them appears anywhere in this audit's usage evidence:

| function | version | model, hardcoded | risk |
|---|---|---|---|
| `analyze-financial-document` | 3 | `claude-sonnet-4-6` | breaks silently if that model is retired (§5.5) |
| `generate-technical-drawing` | 4 | `claude-sonnet-4-6` | same |
| `generate-onboarding-plan` | 2 | `claude-sonnet-4-6` | same |
| `sem-artifact-analyze` | 3 | `gpt-4.1-mini` (OpenAI) | on the provider path with **zero** proven successes |

Changing the active model in Settings does not affect any of them. Their health is **UNVERIFIED**.

### 7.5 Provider switching is unaudited

`updateActiveProvider()` is a bare `UPDATE ai_providers SET is_active = true`. There is no audit event,
no history table and no `updated_at`. **The switch history in §3 had to be reconstructed indirectly**
from `model_usage` boundaries and row-creation times. One activation via chat is recorded
(`aiProviderActivated`), but UI switches — which is how every real switch happened — leave no trace.

Related: selecting a model in the chat picker is a **global production configuration change** affecting
every user, not a per-conversation preference. That is why this audit did not use it.

### 7.6 The required invariant is NOT satisfied today

> REQUESTED PROVIDER/MODEL + ACTUAL PROVIDER/MODEL + FALLBACK REASON + FAILURE REASON must remain observable.

| element | today |
|---|---|
| ACTUAL model, on success | ✅ recorded in `model_usage`, shown in the UI Details panel |
| REQUESTED model, on **failure** | ❌ **not recorded anywhere** — a failed turn stores an error string with no model name |
| FAILURE REASON | ⚠️ only in `work_orders.output.error`; no audit event, and **overwritable by hand** (it was) |
| FALLBACK REASON | ⚠️ `fallback-no-api-key` is recorded as a model name; degraded embeddings record nothing at all |
| WHO switched the model, and when | ❌ not recorded |

---

## 8. CONTROLLED / STAGING TESTS REQUIRED

**CONTROLLED MODEL TEST REQUIRED** — none of these were run, because each needs either a founder session
or a credential this session must not handle. All of them can be done **without switching the globally
active model.**

The path already exists in production: **`sem-ai-provider-test`, ACTIVE v1, deployed 2026-09-06T14:35Z.**
It takes `{"id": "<ai_providers row uuid>", "activate": false}`, requires a founder/holding-admin JWT,
sends a synthetic one-line prompt, records tokens in `model_usage`, and **with `activate:false` cannot
change the active provider**. Its activation RPC migration is not applied, so even `activate:true` would
fail closed with a 503 rather than half-switching. It has never been invoked.

| # | provider / model | exact test | expected risk | what Home PC / staging must provide |
|---|---|---|---|---|
| **T1** | anthropic `claude-sonnet-5` | POST `sem-ai-provider-test` with `{id:"b462537c-3cbc-480c-b131-be200a6e0897", activate:false}` | ≤128 output tokens, one billable call, cents. Active model unchanged. | founder/holding-admin JWT (browser session). Nothing else. |
| **T2** | openai `gpt-5.6-sol` | same shape, that row's id | may hang up to the 60s probe deadline; the probe has its own rejecting deadline, so it fails cleanly. ≤2048 tokens billed **even on failure** — reconcile against the invoice. | founder JWT. **This is the test that resolves §5.1 and §5.2 at once.** |
| **T3** | openai `gpt-5-mini`, `gpt-5.6-luna` | same | as T2 | founder JWT |
| **T4** | **OpenAI credential + entitlement** | `GET https://api.openai.com/v1/models` with the **Edge** `OPENAI_API_KEY` | zero cost, pure read. Definitively separates BLOCKED_BY_CREDENTIAL from BLOCKED_BY_ENTITLEMENT from transport failure. | the Edge secret value, used **only** inside the Supabase dashboard or on a staging box — never pasted into a repo, chat or CI log. Not this session. |
| **T5** | **embeddings — highest priority** | `POST /v1/embeddings`, `text-embedding-3-small`, input "test", with the **Edge** `OPENAI_API_KEY` | ~2 tokens, effectively free | as T4. Resolves the live P1 in §7.2(a). |
| **T6** | anthropic `claude-sonnet-4-6` | probe against the existing row | ≤128 tokens | founder JWT. Confirms whether the three hardcoded functions in §7.4 still work at all. |
| **T7** | **real-context capacity** | after T1/T2 pass, one real Brain command on a saturated workspace | this is where the token-budget work meets the provider question | **blocked until the token-preflight P1 is live-verified.** Do not conflate (§6). |
| **T8** | deepseek | none possible | — | `DEEPSEEK_API_KEY`, founder-added via the Supabase dashboard, plus migration `202609060001` applied. **BLOCKED_BY_CREDENTIAL.** |

**Not required, and explicitly not recommended:** switching the global active provider to test a model.
T1–T3 make that unnecessary.

---

## 9. SAFE PRODUCTION FINDINGS (no change made, none proposed here)

1. **Haiku is genuinely healthy.** 471 calls, still serving as of today 06:45. No provider-side failure
   ever recorded against it. Leave it active.
2. **No silent cross-model fallback exists.** The founder's worst case is not happening.
3. **Both provider secrets are present and neither needs rotation** on this evidence. Nothing in this
   audit indicates a leaked or compromised key. (The web-side placeholder in §7.3 is not a credential.)
4. **The probe function is deployed and safe to use** with `activate:false`, and fails closed on
   activation because its migration is absent.
5. **`sem-ai-provider-test` is an untracked production surface** — deployed 2026-09-06 from a local
   machine (`/tmp/user_fn_…`), source only on `codex/sem-brain-v1`, never on master. It is benign and
   useful, but it is production code that no branch of record contains. Governance item, not a defect.
6. **A second author is working on `supabase/functions/sem-ai-command/index.ts`.** Branch
   `codex/sem-brain-v1` (`24be8d7`, 2026-09-06) rewrites 201 lines of the same hot file this campaign is
   certifying. Its own handoff says not to deploy it over the live function without reconciliation. **Two
   independent workstreams are editing the same deploy surface** — this needs a founder-level sequencing
   decision before either lands.

---

## 10. MODEL_USAGE EVIDENCE (verbatim)

```
model_name                    calls  first_call   last_call    in_tokens   out_tokens
----------------------------  -----  -----------  -----------  ----------  ----------
fallback-no-api-key               8  08-23 15:05  08-24 02:54       7,929           0
claude-sonnet-4-6                32  08-24 03:20  08-24 15:28     313,341      44,395
claude-haiku-4-5                471  08-24 15:32  09-08 06:45  14,238,028     305,458
deterministic-confirmation        5  08-28 11:17  08-30 15:08      49,390           0
deterministic-disambiguation      2  08-29 16:30  08-30 05:48      19,049           0
deterministic-clarification       5  08-30 05:40  09-07 12:54      52,396           0
deterministic-plan-execution      1  08-30 14:24  08-30 14:24       8,957           0
                                                            TOTAL 524 rows
```

Every row has a `work_order_id` and a non-null `estimated_cost_usd`, i.e. **none is probe-shaped** —
independent confirmation that `sem-ai-provider-test` has never completed a call.

Audit events, whole history: `ai_command_executed` 525, `ai_command_request_completed` 524,
`ai_command_json_parse_failed` 2. **There is no provider-failure event type at all.**

Failed work orders: 29 total. 22 are the 2026-08-24 OpenAI window; 5 are an RLS defect on `tasks`
(08-24 → 08-25); 1 a malformed UUID (08-26); 1 an invalid-JSON reply from Haiku (08-31).

---

## 11. HOME-PC IMPLEMENTATION REQUIREMENTS

Ordered by severity. None is started; none touches the frozen release candidate.

**P1 — `EMBEDDING_DEGRADATION_MUST_NOT_BE_SILENT`.** `embedTexts()` must report. Minimum: push a
`contextError` when embeddings were requested and all came back null, and record it in the
`ai_command_request_completed` metadata so it is queryable. Degrading stays correct; degrading invisibly
does not. Add a regression that fails when an embedding failure produces no signal. **Then resolve the
live failure itself via T5.** Fifteen days of dead memory retrieval went unnoticed because no surface
could show it.

**P1 — `PROVIDER_FAILURE_MUST_BE_OBSERVABLE`.** A failed provider call must write an `audit_logs` event
carrying `{provider, requested_model, failure_stage, http_status, provider_error_code, elapsed_ms}`.
Today a failure writes one hand-overwritable string. This is what made this audit reconstructive rather
than factual for `gpt-5-mini` (§5.6).

**P1 — `REQUESTED_MODEL_ALWAYS_RECORDED`.** Record the requested provider/model on the pending work order
**before** the call, so a failed turn still says what was asked for. Satisfies the founder's invariant
for the half that is currently missing (§7.6).

**P2 — `PROVIDER_SWITCH_MUST_BE_AUDITED`.** `updateActiveProvider` writes an audit row: who, from what,
to what, when. Add `updated_at` to `ai_providers`. Without it the switch history is unrecoverable.

**P2 — `MODEL_CATALOG_MUST_NOT_ADVERTISE_UNTESTED_MODELS`.** The UI and pricing catalog list ~14 models
of which one is proven. Either mark each row with its real last-verified status, or stop offering
unverified models as if they were equivalent choices. This is the mechanism that produced the founder's
question in the first place.

**P2 — Reconcile with `codex/sem-brain-v1`.** That branch already contains a provider abstraction, safe
error categories, a rejecting deadline, and 47 offline tests. Do not reimplement it. Do not deploy its
stale `sem-ai-command` snapshot either. Requires the founder sequencing decision in §9.6.

**P3 — Hardcoded-model surfaces (§7.4).** The four other LLM functions should either consult
`ai_providers` or declare their pinned model explicitly with a verified-on date.

**P3 — Retire the placeholder web OpenAI key** (§7.3), or delete the legacy `api/` and `netlify/` command
paths that depend on it.

---

## 12. WHAT THIS AUDIT DOES NOT CLAIM

- It does not claim any OpenAI model is permanently broken. It claims they failed on 2026-08-24 and were
  never retried. T2/T3 settle it.
- It does not claim the Edge `OPENAI_API_KEY` is invalid. That was never tested (§5.2).
- It does not claim `claude-sonnet-5` or `claude-opus-5` are unavailable. They were never called.
- It does not link the provider failures to the v93 token-preflight incident. No evidence supports that,
  and §6 keeps them apart deliberately.
- It does not mark the token-preflight P1 resolved, closed, or affected in any way.
