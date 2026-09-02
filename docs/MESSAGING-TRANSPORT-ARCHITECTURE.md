# External messaging transports — canonical channel layer + one adapter interface

Status: **DESIGN + PREPARED MIGRATION ONLY.** No adapter is implemented, no webhook is
deployed, nothing external is contacted. The migration below is gated on founder
authorization at `supabase db push` like every other DB change.

## The founder's constraints, verbatim discipline

- **DO NOT BUILD ANOTHER MESSENGER.** Brain OS chat already exists; Slack, Telegram,
  WhatsApp, Messenger and Viber are TRANSPORTS into it, never parallel products.
- One canonical channel layer (`chat_channels` — already live) + **one** adapter
  interface. A transport adapter translates; it never owns state, never routes
  authority, never becomes a second orchestrator.
- **Channel → organization binding is explicit.** Every external transport binding
  names the company it speaks for; an unbound transport cannot reach any company data.
- **Unknown external users never get employee authority.** An inbound message's
  external identity maps to a person/profile ONLY through an explicit, founder/manager-
  created identity binding. No binding → the message may at most create a quarantined
  inbound record; it never executes commands, never reads company context.
- **Outbound governance:** every outbound external message is a real, auditable row
  first (who, to which transport, on whose authority), and sending is a capability the
  founder can disable per transport.

## Architecture

```
external user ──(Telegram/Slack/… webhook)──▶ transport adapter (ONE interface)
      │                                            │ translate only
      ▼                                            ▼
external_identity_bindings ──authorizes──▶ chat_channels (canonical layer, already live)
                                                   │
                                                   ▼
                                     sem-ai-command (existing brain, unchanged authority)
                                                   │
                                                   ▼
                            outbound_messages (queued, governed) ──▶ adapter ──▶ transport
```

### The one adapter interface (implementation phase, not this commit)

```ts
interface ChannelTransportAdapter {
  transport: 'telegram' | 'slack' | 'whatsapp' | 'messenger' | 'viber';
  // Inbound: webhook payload -> normalized inbound message. NO authority decisions here.
  parseInbound(raw: unknown): NormalizedInboundMessage | null;
  // Outbound: send an approved outbound_messages row. Returns transport message id.
  send(binding: ChannelTransportBinding, message: OutboundMessage): Promise<string>;
  // Liveness for the health matrix — a real API call, never a stored flag.
  healthCheck(binding: ChannelTransportBinding): Promise<TransportHealth>;
}
```

Authority lives entirely OUTSIDE adapters: the inbound pipeline resolves
`external_identity_bindings` → profile, refuses unbound identities, and only then hands
a message to the canonical channel. An adapter bug can garble text; it cannot escalate.

## Prepared migration (202609020003, gated)

Three tables, all additive:

1. `channel_transport_bindings` — transport, external chat/workspace id, the canonical
   `chat_channels.id` it feeds, the **company_id it speaks for** (explicit org
   binding), enabled flag, created_by. Managed by founder/admin or that company's
   manager (RLS mirrors the invitation-management tier).
2. `external_identity_bindings` — transport + external user id → profile_id, with
   status (active/revoked) and audit fields. **Creation is founder/manager-only**; an
   inbound identity with no active binding gets NO profile, NO context, NO execution.
3. `outbound_messages` — the governed outbound queue: channel, binding, body, status
   (queued/sent/failed/blocked), created_by_profile_id, sent_at, transport_message_id,
   error. Insert tier = the channel's write tier; a transport with `enabled=false` on
   its binding blocks sends at the queue, not in adapter code.

Inbound messages from UNBOUND identities are deliberately NOT stored in a table in this
phase — storing attacker-controlled content behind RLS someone might later widen is a
risk with no current consumer; the adapter drops them with a transport-level reply.
Revisit only with a concrete quarantine-review feature.

## Sequencing

1. This design + migration reviewed by the independent DB/security verifier (same
   queue as 202609020001/2 — serialized behind BUG-002 verifier #8).
2. Founder authorizes the three prepared migrations in one push decision or
   individually.
3. Adapter interface + ONE transport (Telegram first — founder's stated order) behind
   a feature flag, webhook deployed only with explicit deploy authorization.
4. Work-PC live acceptance with a real Telegram test bot before any real channel binds.
