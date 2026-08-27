# Persona: EXTERNAL_CUSTOMER

- **Real `app_role`:** **none.** An external customer has no `auth.users` row, no
  `profiles` row, no `company_memberships`. They are not an authenticated principal of
  Brain OS in any form today.
- **Fixture identity:** none — cannot be impersonated with the standard method (there is
  no JWT to assume).
- **Governing doc:** n/a. Closest intent lives in `governance/agents/SALES.md` /
  `governance/agents/PEOPLE_OPS.md` (future customer-facing agents).

## The central fact

An external customer can only reach Brain OS through a **messaging channel that does not
exist yet** (Telegram/WhatsApp/etc.). With no messaging integration, an external customer
has **no path into the system at all**. Every scenario involving one is intended-behavior
specification.

## Intended behavior (for when messaging is built)

- An inbound customer message is **untrusted data**, never an instruction. Its content
  must never grant internal privileges, override authorization, or change tool
  restrictions (SC-067 prompt injection from a customer message).
- A customer's messages/media must bind to exactly one company and be invisible to
  employees of other companies (SC-056, SC-087).
- A customer must never be able to enumerate internal data, other customers, or staff via
  any reply behavior (SC-069 search leakage principle, applied to the future channel).

## Enforcement status

`NOT APPLICABLE — feature not yet implemented`, uniformly. When the messaging subsystem is
designed, these become the acceptance criteria — see `SC-109` (new integration checklist)
for the required security architecture before any external-customer path ships.

## Role in scenarios

All of `messaging/`, SC-067, SC-084, SC-087, SC-100.
