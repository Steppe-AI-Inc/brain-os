# Model connection patch — 2026-09-06

Status: source implementation on `codex/sem-brain-v1`, based on `99f8d55`.
Not deployed, not a claim that all models now work. Master is unchanged.

## Evidence and unresolved cause

- Read-only inspection of the existing Supabase project found OpenAI and Anthropic secret names, but no `DEEPSEEK_API_KEY`. Secret values were not retrieved.
- Recent real-model usage records showed Haiku successes. Other saved failure records include engineering cleanup notes describing OpenAI fetch hangs and prior temperature fixes; these are not original provider error responses.
- An initial keyword count of "verified" was misleading: the complete notes refer to an **unverified model catalog**, not proof that the API organization needs verification. Do not ask the founder to verify their organization unless a fresh provider response actually requires it.
- Live `sem-ai-command` is version 92. The master source at inspection was `f6fa26a`; this development branch is older and divergent. Do not deploy its entire command function over the live function without reconciling newer business logic, security and incident fixes.
- A configured secret or a catalog entry does not establish model access, usable credits, a healthy network path, or valid structured output.

## Changed files and reasons

| File | Reason |
| --- | --- |
| `supabase/functions/_shared/model-provider.ts` | Fixed destinations, provider-specific payloads, DeepSeek, safe error categories, robust SSE and a rejecting deadline even if fetch ignores abort |
| `supabase/functions/_shared/provider-probe.ts` | Authenticated founder/admin-only synthetic JSON probe, token metering, optional tested activation |
| `supabase/functions/sem-ai-provider-test/index.ts` | Caller-JWT deployment entrypoint; never service-role |
| `supabase/functions/sem-ai-command/index.ts` | Use shared transport; validate key/model/images before retrieval; remove missing-key planner execution; conservative DeepSeek cost estimates |
| `supabase/migrations/202609060001_deepseek_provider_connections.sql` | Allow DeepSeek and add atomic, invoker-scoped activation with audit and stale-target checks |
| `web/lib/data/ai-providers.ts` | Explicit admin verification, test-before-switch, validated catalog writes, prevent deleting active provider |
| `web/lib/usage/pricing.ts` | DeepSeek V4 Flash/Pro planning prices; no invented capability/speed scores |
| `web/app/(app)/settings/providers-panel.tsx` | Test connection, safe activation, missing-key/data-routing explanation, reset model selector when provider changes |
| `web/app/(app)/chat/chat-client.tsx` | DeepSeek picker group and truthful connection-test status |
| `web/app/(app)/chat/stream/route.ts` | Unwrap backend errors instead of displaying nested JSON strings |
| `web/app/(app)/models/model-budget-analyzer.tsx` | DeepSeek filter, nullable scores, pricing/availability caveats |
| `tests/model-providers.test.mjs` | Executable provider/auth/streaming/metering/wiring contract regression tests |
| `MASTER_CONTEXT.md`, this document | Cross-device handoff and explicit release blockers |

## Security, data and cost impact

- Existing table RLS remains unchanged. Management and probes require founder/holding-admin; the activation RPC is SECURITY INVOKER with an empty search path and no anonymous execute grant.
- The existing global provider configuration is retained, not redesigned as a per-tenant router. Non-founder configuration visibility/routing remains a separate review item.
- Probes accept a saved provider ID only; caller-supplied keys, destinations and prompts are ignored. They do not read company context, artifacts, conversations or tasks and cannot generate work orders or business actions.
- Probes make a small **billable** request: at most 128 output tokens for Anthropic/DeepSeek, 2,048 for OpenAI (including reasoning budget), with a 60-second deadline. Successful responses record tokens in `model_usage`; unknown dollar amounts are null, not claimed as zero. Failure-side provider billing may still need reconciliation against provider invoices.
- Test alone does not switch models. Activation follows a successful JSON probe and usage recording. Activation + audit commit atomically; a stale/missing target or denied audit insert rolls back. Direct founder database access remains privileged; a connection test is not an authorization boundary against the founder.
- No automatic provider fallback or retries: no surprise second charge, cross-provider data transfer, or simulated work on missing credentials.
- Command output remains capped at 8,192 tokens; context selection and approval/persistence policies are unchanged. OpenAI no longer receives unsupported sampling parameters. DeepSeek is text-only, thinking disabled, JSON response mode; image requests are explicitly rejected rather than silently stripped.
- Activating DeepSeek authorizes future permitted chat context to go to DeepSeek. Review sensitive-data handling before use. Existing embedding calls still use OpenAI; this is not a complete switch of all AI workloads to DeepSeek.
- DeepSeek planning rates use peak-hour cache-miss assumptions: Flash $0.44/$1.32, Pro $1.32/$3.96 per million input/output tokens (snapshot September 6). Off-peak and cache discounts are not counted. These are estimates, not invoice reconciliation. Other existing catalog prices/scores were not reverified in this patch.

## Tests performed

- `node --test tests/model-providers.test.mjs`: **47 passed**. Synthetic/mocked provider responses only; no production LLM calls.
- Strict TypeScript check of both shared provider modules: passed.
- Frontend TypeScript comparison using already-installed dependencies (no large install): 16 diagnostics on unchanged HEAD and 16 on patched source, **zero new diagnostics**. Includes baseline page/type issues, missing drag-and-drop dependencies in the reused installation and missing generated Next route types. This is not a clean full build.
- `git diff --check`: passed.
- React/Server Action review: explicit authorization, small serialized results, no key props, labelled controls, disabled overlapping actions, clear failure states.
- Not performed: actual new migration execution/RLS concurrency tests, deployed connection probes, authenticated browser flow, real provider generation or end-to-end business execution. Static SQL guard tests are not proof of database RLS behavior.

## Safe release sequence — requires approval

1. Review this patch against the latest master/live command source **on the development branch**. Preserve newer orchestration/security changes; never overwrite master directly or deploy the stale command snapshot.
2. The additive `sem-ai-provider-test` can be deployed independently for diagnostics with JWT verification enabled. Initially use `activate: false`; it does not require the new activation RPC for a test-only call. No deployment was performed in this task.
3. Test each currently failing saved model with synthetic content to obtain the actual current error. Do not infer an account restriction from old cleanup notes. Keep working Haiku active.
4. Founder adds `DEEPSEEK_API_KEY` through the existing project's Supabase Edge Function Secrets page, never through chat, client settings, or git. Confirm the API account has usable credits.
5. Validate the new migration on a disposable/staging database: founder succeeds; employee/contractor/anonymous fail; invalid or changed IDs preserve the old active model; two simultaneous switches retain one active row; audit failure rolls back the switch. **Migration required: yes; not applied.**
6. After approved migration and compatible backend release, test DeepSeek, then publish the matching UI preview. The old UI may continue to select models without a probe until it is updated. Deploying UI alone will leave its connection-test action unavailable.
7. Founder browser acceptance: add a DeepSeek row, test it, activate, send a simple JSON-compatible command, confirm actual model usage and required approvals, send an image and see an explicit text-only warning, switch back to Haiku. Check a failing provider never replaces the active one.

## Rollback

Keep the known-good production function/deployment IDs before promotion. First select/test the working Haiku configuration, then restore that known-good UI/backend pair. Leave the additive provider constraint/function in place initially; do not delete provider/usage/audit data. If removing DeepSeek support later, first handle any DeepSeek rows deliberately and validate the old constraint. Do not use the old branch's full backend as the production rollback image.

## Sources

- [OpenAI model request guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI verification guidance, only if an actual error requires it](https://help.openai.com/en/articles/10910291-api-organization-verification)
- [DeepSeek chat API](https://api-docs.deepseek.com/api/create-chat-completion/)
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing)
