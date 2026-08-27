SCENARIO ID: SC-109-new-integration-checklist

PURPOSE: A reusable checklist every future external integration (LINE / WeChat / Slack /
email / any messaging or third-party API) must follow — so it uses the same adapter +
security architecture, not a bespoke parallel system. This is the security spec the
entire (not-yet-built) `messaging/` category must be built against.

ACTOR: any engineer / agent adding an integration.

ORGANIZATION: n/a (process doc).

ROLE: n/a.

CAPABILITIES: n/a.

PRECONDITIONS: a proposal to add an inbound/outbound external channel.

ACTION: before shipping, the integration must provide:

1. **Webhook authentication** — verify the provider's signature/secret on every inbound
   webhook; reject unauthenticated/invalid-signature calls (SC-078 invalid auth).
2. **Tenant mapping** — every inbound event maps to exactly one `company_id`; an event
   for one company must be invisible to another (SC-056 boundary applied to messages).
3. **Deduplication** — provider retries / duplicate deliveries must be idempotent — one
   inbound event = one stored message, one outbound send = one external effect (SC-076,
   SC-098, SC-099).
4. **Inbound = untrusted data** — message content is NEVER an instruction; it cannot grant
   privileges or override authorization/tool restrictions (SC-067 prompt injection).
5. **Authorization** — which employees may read/reply to a conversation, gated by RLS on
   the new conversation/message tables (built per SC-107).
6. **AI-context test** — an unauthorized employee must not get another company's messages
   into AI context (RLS-before-LLM, same as everything else).
7. **Secret handling** — provider tokens live as Edge Function secrets / Supabase Vault
   (like MCP connectors), NEVER in database rows readable by the app, never logged
   (SC-104), with a health/expiry status surfaced (SC-086).
8. **Audit** — inbound receipt, outbound send, delivery status, and failures all audited.
9. **Failure recovery** — send failure = `failed` status + normalized error + safe retry,
   never a false "sent" (SC-085); provider timeout uses idempotency/reconciliation, never
   blind retry (SC-096, SC-097).
10. **Outbound approval** — a commercial commitment / external message that policy marks
    approval-required goes through the real approval system with an immutable payload
    (SC-084, SC-060).
11. **Fixture + live report format** — for a provider blocked on a commercial account,
    report "FIXTURE VERIFIED / LIVE BLOCKED ON COMMERCIAL ACCOUNT. Do not report
    production-ready." (SC-081).

EXPECTED RESULT: an integration that satisfies all 11 reuses Brain OS's security model; one
that skips any is a parallel, ungoverned attack surface.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented (no integration exists).
This is the acceptance spec for when one is built. Cross-ref all of messaging/, SC-107,
SC-084, SC-104, SC-086.

LAST VERIFIED DATE: n/a (checklist for future work)
