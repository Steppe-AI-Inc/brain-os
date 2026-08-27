# Release Chaos Test (SC-115)

Controlled failure injections run before a release. For each: the injection, the required
guarantee, and whether it is TESTABLE TODAY given Brain OS has no job workers or webhooks
yet. The overarching guarantees that must hold under EVERY injection: **no duplicate
customer message/payment, no permission bypass, no data corruption, no false success, no
lost approval.**

| Injection | Required guarantee | Testable today? |
|---|---|---|
| **Supabase unavailable** (DB down mid-command) | AI command persists all-or-nothing; on failure `mark_work_order_failed` + error event, no partial work_order/task/approval | PARTIAL — the transactional RPC (`sem_execute_ai_command`) is code-verified atomic; a real DB-outage injection is MANUAL (SC-096) |
| **Provider 500 / API error** (LLM or future messaging) | normalized error, no false success, safe retry, no partial persist | LLM case CODE-VERIFIED (502/504 normalization, `mark_work_order_failed`); messaging case NOT APPLICABLE (SC-085) |
| **Provider timeout** (result unknown) | no blind retry that could duplicate an external effect; idempotency/reconciliation | LLM timeout REAL & code-verified (idle/overall budget race — SC-097); messaging NOT APPLICABLE |
| **Duplicate / out-of-order webhook** | idempotent; one effect; monotonic status | NOT APPLICABLE — no webhooks (SC-076, SC-098, SC-099) |
| **Expired token** | health = EXPIRED/REAUTH_REQUIRED; fails safely; no token leak | NOT APPLICABLE — no external channel tokens (SC-086); MCP-vault pattern is the template |
| **AI provider unavailable** (no API key) | fallback planner runs and clearly labels itself; NEVER silently creates fake production work | CODE-VERIFIED — `fallbackPlan()` + "AI provider is not configured or failed" summary; MANUAL to exercise live (CLAUDE.md §11/§14) |
| **Job worker restart** | in-flight work resumes safely; no lost/duplicated work | NOT APPLICABLE — no job workers exist; the pending-work_order-before-LLM-call pattern already survives a client disconnect (sem-ai-command comment, verified live) |
| **Edge Function double-execution** | idempotent; one effect | approval path idempotent (`decide_approval` pending guard, SC-063/064); AI command creates a pending work_order first, then a single transactional persist |
| **Network interruption** (client disconnects mid-generation) | generation completes server-side; work_order/task/model_usage still land; user reconnects to the pending row | CODE-VERIFIED + previously verified live (sem-ai-command's pending-work_order design) |

## The guarantees, restated as pass/fail criteria

Under every injection above, verify explicitly:
1. **No duplicate external effect** — one message/payment/deletion, never two (idempotency:
   SC-063, SC-064; future messaging: SC-076/098/099).
2. **No permission bypass** — a failure never widens access (a failed migration must not
   drop RLS — SC-124; a fallback path still uses the caller's RLS).
3. **No data corruption** — atomic persistence, all-or-nothing (SC-095, SC-096).
4. **No false success** — a failed action is reported failed, never "sent"/"done"
   (SC-085, `mark_work_order_failed`).
5. **No lost approval** — an approval is never silently dropped; it stays `pending` until a
   real, authorized decision executes it exactly once (SC-059, SC-063).

## Honest scope

Roughly half the classic chaos injections (webhooks, job workers, external tokens,
messaging providers) are **NOT APPLICABLE today** because those subsystems do not exist —
do not fabricate a "pass" for them. The injections that ARE testable (DB atomicity, LLM
provider errors/timeouts, AI-unavailable fallback, approval idempotency, client
disconnect) are code-verified and partly live-verified; a full fault-injection harness is
future work. When the missing subsystems are built, they must satisfy the NOT-APPLICABLE
rows before shipping (SC-109).
