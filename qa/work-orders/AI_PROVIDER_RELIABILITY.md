# CANONICAL WORK ORDER — `AI_PROVIDER_RELIABILITY`

**Opened** 2026-09-08 by founder directive, as a workstream SEPARATE from the `sem-ai-command` release
candidate. Nothing in this work order may be mixed into a candidate while a verifier is certifying it.

**Canonical-state note.** This file is the work order's definition, not its canonical record. Creating the
row in `work_orders` is a **production DB write**, which is a founder-only boundary and is additionally
covered by the standing production-write freeze (`PRODUCTION_WRITE_AUTHORITY_NOT_TECHNICALLY_ENFORCED`).
The insert is therefore **prepared, not performed**. Everything below is repo-side and safe.

---

## 1. Observed production truth (2026-09-08)

Recorded exactly as measured. **A configured model is not a working model, and this work order does not
claim any model works without actual successful serving evidence.**

| model / identity | evidence | state |
|---|---|---|
| `fallback-no-api-key` | 8 turns, 2026-08-23 15:05 → 08-24 02:54 | **NOT AN LLM.** A deterministic planner that ran while no provider key existed. Recorded as a model name in `model_usage`, which is why it must be named here explicitly. |
| `claude-haiku-4-5` | 471 served calls, 2026-08-24 15:32 → 2026-09-08 06:45 | **The only currently proven, actively serving model.** |
| `claude-sonnet-4-6` | 32 served calls, 2026-08-24 03:20 → 15:28 | **Historical successful calls only.** Unexercised for 15 days. Still hardcoded in three live functions. |
| `claude-sonnet-5` | configured 2026-08-24 12:32:57; **zero** calls, **zero** failures | **CONFIGURED, NO PROVEN CALLS.** Not broken — unverified. |
| `claude-opus-5` | never configured, never called | **NO PRODUCTION USAGE EVIDENCE.** |
| `gpt-5.6-sol` | ≥8 attempts, all failed 2026-08-24 | **HTTP 200, stream never terminates.** See §2. |
| `gpt-5-mini` | ≥9 attempts, all failed 2026-08-24 | Failure class **UNKNOWN** — the original provider errors were overwritten with cleanup prose. |
| `gpt-5.6-luna` | configured; zero calls | **UNVERIFIED.** |
| DeepSeek | no `DEEPSEEK_API_KEY` | **BLOCKED_BY_CREDENTIAL.** |

**No silent cross-model fallback is currently observed.** `sem-ai-command` has no retry and no second
provider: a failed call ends the turn with an SSE error and a rejected work order. Model B never answers
for model A. This is a property to PRESERVE, and §3 adds the fields that make it provable rather than
merely true today.

---

## 2. The OpenAI stream defect — a transport failure, never a success

> HTTP 200 **+** stream never terminates **=** FAILURE.

The provider accepted the request and returned headers; the body then stalled indefinitely with no terminal
event. `AbortSignal.timeout` on `fetch` guards connection setup only, so it did not fire. **A stream is
successful only after a valid terminal completion condition** — not on a 200, not on first token, not on
the absence of an error.

### Required provider result states

Every provider call resolves to exactly one of these, and `UNKNOWN` is a real answer that must be recorded
rather than smoothed into one of the others:

```
SUCCESS                  a valid terminal completion condition was observed
AUTH_ERROR               credential rejected
INVALID_MODEL            model id not accepted by the provider
NOT_AVAILABLE            model exists but is not available to this account
RATE_LIMIT               throttled
QUOTA                    entitlement or credit exhausted
STREAM_TIMEOUT           stream stalled and the idle deadline fired
STREAM_NEVER_TERMINATED  headers returned, body never reached a terminal event
NETWORK                  connection failed or was reset
SDK/API_VERSION          request shape rejected as incompatible
STRUCTURED_OUTPUT        replied, but not in the required shape
TOOL_USE                 tool/structured-call incompatibility
UNKNOWN                  none of the above could be established
```

### Required persisted fields, per call

```
requested_model      what was asked for            <- MISSING TODAY on every failed turn
actual_model         what actually served
provider
started_at
first_token_at       null distinguishes "never started" from "stalled mid-stream"
completed_at
termination_reason   the terminal condition observed, or its absence
error_class          one of the states above
```

`requested_model` is the field whose absence made the 2026-08-24 forensics reconstructive: a failed turn
records no model name anywhere, so "which model was being tried" had to be inferred from `model_usage`
boundaries and row-creation times.

---

## 3. Scope

**P1 — `EMBEDDING_DEGRADATION_MUST_NOT_BE_SILENT`.** Live defect: 63 of 66 memories have a NULL embedding
since 2026-08-24 ~16:00; semantic retrieval has returned nothing for fifteen days with no signal anywhere.
Fix prepared and dry-run verified at `qa/verification/scratch/p1/PREPARED_embedding_observability.mjs`;
**not applied** — it touches `index.ts`, which is under verification. Ledger #144.

**P1 — `PROVIDER_FAILURE_MUST_BE_OBSERVABLE`.** A failed provider call writes `work_orders.output.error`
and nothing else: no `audit_logs` event, no `model_usage` row. Both surfaces anyone reads for AI health are
blind to failure by construction, and the stored error strings are hand-overwritable (they were).

**P1 — `REQUESTED_MODEL_ALWAYS_RECORDED`.** Record the requested provider/model on the pending work order
*before* the call, so a failed turn still says what was asked for.

**P2 — `PROVIDER_SWITCH_MUST_BE_AUDITED`.** `updateActiveProvider()` is a bare `UPDATE ... SET is_active`.
No audit event, no history, no `updated_at`. The switch history in the audit had to be reconstructed
indirectly. **Hot file** — `web/lib/data/ai-providers.ts` is also modified on `codex/sem-brain-v1`;
reconcile before writing.

**P2 — `MODEL_CATALOG_MUST_NOT_ADVERTISE_UNTESTED_MODELS`.** ~14 models offered, one proven. Either carry a
real last-verified status per row or stop offering unverified models as equivalent choices.

**P2 — semantic-memory health must be visible.** If embedding coverage is degraded, **Brain must not
pretend semantic memory is healthy.** Lexical / current-context retrieval may continue where supported, but
the ACTUAL RETRIEVAL MODE must be visible rather than implied. Surface: coverage %, last successful
embedding, last embedding failure, provider/model, recent failure class (§4).

**P3 — hardcoded-model surfaces.** `analyze-financial-document`, `generate-technical-drawing`,
`generate-onboarding-plan` (all `claude-sonnet-4-6`) and `sem-artifact-analyze` (`gpt-4.1-mini`) bypass
`ai_providers` entirely and record no `model_usage`. Health **UNVERIFIED**.

**P3 — the web/Vercel `OPENAI_API_KEY` is an 11-character placeholder** returning `401`. The legacy
`api/ai-command.js` and `netlify/functions/ai-command.mjs` paths cannot work.

**Governance item.** `sem-ai-provider-test` is ACTIVE in production (v1, 2026-09-06) but its source exists
only on `codex/sem-brain-v1` and its migration is unapplied.

*Re-measured 2026-09-09, and the original wording was too strong.* The source **is** under version control:
`supabase/functions/sem-ai-provider-test/index.ts` is present on `origin/codex/sem-brain-v1` at `24be8d7`,
together with its migration `202609060001_deepseek_provider_connections.sql`. What is true is narrower and
still a real finding: **it is on no branch that leads to production** — not `master`, not
`p1/execution-truth-governance` — and the migration it depends on has never been applied, so a function is
serving production from a branch nothing deploys from. Both files are captured in the 2026-09-09 backup
bundles (`git bundle --all`), so the source is not at risk; the governance gap is provenance, not loss.
`activate:false` for this function therefore remains the correct posture until it is either merged onto a
deployable branch with its migration applied, or removed from production.

---

## 4. Read-only health surface (repo-side, safe)

`qa/verification/scratch/p1/provider_health_readonly.mjs` reports, from production reads only:
embedding coverage %, last successful embedding, last embedding failure, active provider/model, and the
recent failure classes visible in `work_orders`. It writes nothing and switches nothing.

---

## 5. Tests T1–T8

Non-production components are prepared in `qa/verification/scratch/p1/provider_probe_client.mjs`.
The production `sem-ai-provider-test` **must remain `activate: false`** — the client refuses to send
`activate: true` at all, so the global model cannot be switched by running it.

Each test needs either a founder/holding-admin JWT (T1–T3, T6) or the Edge secret used inside the Supabase
dashboard (T4, T5) — neither is available to an implementation session. T7 is blocked behind the
token-preflight P1; T8 is `BLOCKED_BY_CREDENTIAL`.

Full matrix and expected risk per test: `qa/AI_LLM_PROVIDER_RELIABILITY_2026-09-08.md` §8.

---

## 6. Definition of done

Not done until: a failed provider call is observable end to end (`requested_model`, `error_class`,
`termination_reason` all present); a stalled stream is classified `STREAM_NEVER_TERMINATED` and never as
success; embedding degradation is visible in the product rather than inferable from the database; the
provider switch is audited; and the Work PC has independently accepted the behaviour live. **Home PC never
closes this.**
