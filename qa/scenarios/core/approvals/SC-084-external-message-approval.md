SCENARIO ID: SC-084-external-message-approval

PURPOSE: An AI-drafted commercial commitment ("we can sell 50 devices for $90,000") is an
external-comms / finance action that policy marks approval-required. It must sequence:
draft -> approval with an exact recipient+content payload -> approve -> send ->
provider-id recorded -> delivery event -> audit. Modifying the content after approval must
require a NEW approval.

ACTOR: SALES_EMPLOYEE (drafts) + authorized approver (manager/founder).

ORGANIZATION: CLIX GPS.

ROLE: `employee` drafts; `company_manager`/`founder` approves external_comms.

CAPABILITIES: sem-ai-command's `detectForcedApprovalKeywords` forces approval for message/
discount/contract language and routes the domain (external_comms / finance). Approval
decision gated by `approvals_update_approver`.

PRECONDITIONS: a chat command asking to commit a price/quantity to an external party.

ACTION: Model drafts the commitment; server forces an approval in the correct domain;
approver approves; (future) the message is sent via a provider; then someone attempts to
change the committed price after approval.

EXPECTED RESULT: The forced approval is created in external_comms/finance domain (real,
testable). On approval, the commitment is authorized. The send/provider-id/delivery-event
steps are **NOT APPLICABLE** — no messaging provider exists. A post-approval content
change must require a brand-new approval (see SC-060 — note this is currently only
convention/UI-enforced, not a DB constraint; flagged).

EXPECTED DENIALS: an unauthorized member cannot approve the external_comms/finance
approval; the model cannot bypass the forced-approval keyword scan (server-side, not
prompt-dependent).

EXPECTED DATABASE STATE: one `pending` approval created with the correct domain; on
approval, `approved`. No message rows (subsystem absent).

EXPECTED AUDIT EVENTS: `ai_command_request_completed` on draft; `approval_decided` on
approval (once decide_approval deployed).

EXPECTED AI VISIBILITY: n/a for the approval; the draft content is the caller's own.

CLEANUP: n/a (approval creation is testable in a rolled-back txn if desired).

AUTOMATION STATUS: PARTIAL. The approval-routing + approval-immutability half is real and
overlaps SC-057/SC-060 (AUTOMATED / KNOWN GAP respectively). The send / provider-id /
delivery-event half is NOT APPLICABLE — feature not yet implemented. Cross-ref
governance/policies/SALES.yaml, governance/ACTION_RISK_LEVELS.md, SC-060, messaging/.

LAST VERIFIED DATE: not run as a single flow (send half not buildable); approval-routing
covered by SC-057 (2026-08-27)
