# messaging/ — intended-behavior specs (feature NOT built)

**No messaging integration exists in this codebase.** Confirmed by grep: no Telegram /
WhatsApp / Viber / Instagram / Messenger webhook handlers, no external-identity or
conversation tables, no inbound/outbound message model. `chat_channels` are Brain OS's own
INTERNAL chat threads, not external customer conversations.

Every scenario in this directory therefore has **AUTOMATION STATUS: NOT APPLICABLE —
feature not yet implemented**. They are written as honest, detailed intended-behavior
specifications so that when the messaging subsystem IS built, it is built correctly against
Brain OS's existing security model — NOT as a parallel, ungoverned system. The security
requirements every one of these depends on are consolidated in
`qa/scenarios/core/organizations/SC-109-new-integration-checklist.md`.

**These must never be reported as tested, passing, or production-ready.** For the Viber
scenario specifically (SC-081), the required report format when it IS eventually exercised
against a real (non-commercial) account is written verbatim into that file:
"FIXTURE VERIFIED / LIVE BLOCKED ON COMMERCIAL ACCOUNT. Do not report production-ready."

| Scenario | Channel | Intent |
|---|---|---|
| SC-075 | Telegram | new customer inbound → tenant mapping |
| SC-076 | Telegram | duplicate webhook → dedup/idempotency |
| SC-077 | Telegram | invalid auth → reject unauthenticated webhook |
| SC-078 | WhatsApp | customer support conversation authorization |
| SC-079 | Messenger | sales lead capture → correct company |
| SC-080 | Instagram | public comment → DM transition |
| SC-081 | Viber | provider-blocker fixture-only report format |
| SC-082 | cross-channel | identity merge with ambiguous-match manual review |
| SC-083 | cross-channel | wrong-conversation reply binding |
