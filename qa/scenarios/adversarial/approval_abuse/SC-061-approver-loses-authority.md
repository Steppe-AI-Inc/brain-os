SCENARIO ID: SC-061-approver-loses-authority

PURPOSE: Authority is revalidated at DECISION time, not creation time. A manager has legal/
operational approval authority; an approval is created; the authority is revoked before
they decide; their attempt to approve must be denied.

ACTOR: a manager whose company membership / role is revoked between approval creation and
decision.

ORGANIZATION: CLIX GPS.

ROLE: `manager` at creation, downgraded to non-member (or plain employee) before deciding.

CAPABILITIES: `approvals_update_approver` and `decide_approval()` both check authority
LIVE at the moment of the decision — neither caches a creation-time grant.

PRECONDITIONS: a pending `production` approval the manager could approve; then the
manager's `company_memberships.active` is set false (or role_in_company demoted).

ACTION: after losing authority, the (ex-)manager attempts to approve.

EXPECTED RESULT: the decision is denied — `is_company_manager(company_id)` now returns
false (membership is read live), so both the RLS UPDATE path and `decide_approval()`'s
re-derived authority check fail. The approval stays `pending`.

EXPECTED DENIALS: the approve UPDATE affects 0 rows / `decide_approval` returns decided=false.

EXPECTED DATABASE STATE: approval unchanged (`pending`).

EXPECTED AUDIT EVENTS: none (no decision took effect).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED (mechanism) — the live-revalidation property is the same one
proven by sc088_091_access_revocation.sql (revoking membership immediately flips
`is_company_manager` to false on the same session) combined with sc057 (a non-manager can't
approve). A dedicated create-then-revoke-then-decide script follows directly from these two.
Cross-ref SC-057, SC-088, SC-062.

LAST VERIFIED DATE: 2026-08-27 (mechanism VERIFIED via SC-088 + SC-057 runners)
