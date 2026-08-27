# Persona: CUSTOMER_SUPPORT

- **Real `app_role`:** `employee` — **no dedicated support role exists.**
- **Fixture identity:** EMPLOYEE fixture with a temporary `employee` membership.
- **Governing doc:** `governance/roles/EMPLOYEE_BASELINE.md`.

## The central fact

**There is no external-customer conversation subsystem in this codebase.** No inbound
message tables, no conversation/thread model, no channel-to-customer identity mapping, no
webhook handlers. `chat_channels` are Brain OS's own **internal** chat threads, not
customer conversations. Confirmed by grep across the repo.

Therefore a "customer support agent handling assigned support conversations" is entirely
**intended-behavior specification**, not a testable feature. Every messaging scenario
(SC-075..SC-083, SC-100, SC-084 send half) is marked
`NOT APPLICABLE — feature not yet implemented`.

## Scope mechanism (for the internal parts that do exist)

`has_company_access(company_id)`. A support employee could be assigned internal tasks and
read company non-sensitive data exactly like any employee.

## Cannot do

- Cannot see finance/salary/ownership tiers, cannot cross companies, cannot approve.
- When the messaging subsystem *is* built, a support employee must **not** gain internal
  privileges from the content of an external customer message (SC-067 prompt injection
  from a customer message) — but that is a future requirement, not a current control.

## Role in scenarios

SC-067, SC-077 (WhatsApp support — NOT APPLICABLE), SC-087 (media security — NOT
APPLICABLE for the messaging path; note the real `documents`/Storage RLS pattern exists),
SC-100 (concurrent editing — NOT APPLICABLE for customer replies; a scoped-down internal
version is written as SC-100).
