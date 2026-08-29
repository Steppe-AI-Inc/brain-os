---
name: messaging-channel
description: The pattern for adding a new external messaging channel (Telegram, WhatsApp, Messenger, Instagram, Viber) to Brain OS via Chatwoot. Use for any Factory Work Order in the messaging track (Phase 10 of the master plan) - this is greenfield work, there is no existing channel integration to extend.
---

# Messaging Channel Integration

As of this skill's creation, **zero messaging integration exists in this codebase** —
confirmed by grep across `web/`/`supabase/`, not assumed. `qa/scenarios/messaging/`
already contains 9 real acceptance-criteria specs (Telegram/WhatsApp/Messenger/
Instagram/Viber/cross-channel), each currently marked `AUTOMATION STATUS: NOT
APPLICABLE — feature not yet implemented`. Read the relevant channel's spec there
first — it is real, already-written acceptance criteria, not something to re-derive.

## Ownership split — do not blur this

**Chatwoot owns**: provider webhooks, conversation transport, contacts, messages,
attachments, delivery states, agent assignment, the omnichannel inbox itself.
**Brain OS owns**: organization/company state, CRM/business state, AI classification,
lead creation, tasks, permissions, automation. Store only the business-critical mapping
— Chatwoot account/inbox → Brain OS company, Chatwoot contact → Brain OS external
contact, Chatwoot conversation → Brain OS conversation/link — never duplicate Chatwoot's
own tables inside Brain OS.

## The real target flow (Telegram first, same shape for every later channel)

```
External channel → Chatwoot (or a validated native adapter) → Brain OS
  → resolve correct company → external contact → conversation
  → classify (e.g. = sales) → create a real sales_leads row
  → assign salesperson → AI drafts a reply
  → human approval, or an explicitly allowed auto-response
  → reply reaches the customer
  → customer replies → verify no duplicate webhook/message processing
```

Every arrow above must be real and independently verifiable — a webhook that reaches
Chatwoot but never produces a real `sales_leads` row is not "integrated," it's plumbing
with a dead end.

## Non-negotiable test before calling any channel done

**Duplicate webhook/message delivery must be tested for real**, not assumed handled by
an idempotency key existing in the code. Fire the same webhook payload twice (or use the
provider's own retry-simulation if available) and confirm exactly one lead/conversation
update results, not two.

## Sequencing (per the master plan's Phase 10)

Chatwoot spike (self-hosted community edition only — its `enterprise/` directory is
separately licensed, do not depend on it) → Telegram → WhatsApp/Messenger/Instagram
(shared Meta infrastructure) → Viber last, and Viber must never block the commercial
demo gate. Each channel ships as an ordinary Factory Work Order once the factory itself
is proven operational — this is not special, hand-built infrastructure work exempt from
the normal delivery/verification discipline (`feature-delivery` skill applies here
exactly as it does everywhere else).

## Reference-only fallbacks — do not adopt preemptively

`evolution-foundation/evolution-api` (WhatsApp) and `grammyjs/grammY` (native Telegram)
are only worth evaluating if Chatwoot's own path for that specific channel proves
genuinely inadequate during real integration work — not adopted speculatively ahead of
that finding.
