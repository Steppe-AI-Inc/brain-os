# core/legal scenarios

The `legal` approval domain is deliberately the tightest: `approvals_update_approver`
routes `legal` to `is_founder_or_admin()` OR the explicitly-assigned `approver_profile_id`
only — there is NO role-based branch, because no dedicated legal-approver role exists in
`app_role` yet. In practice legal approvals are founder-only today.

Scenarios covering the legal domain:
- **SC-057** (`core/approvals/`) — a company manager cannot approve a `legal` approval.
  Runner `sc057_manager_not_cfo.sql` includes a `legal` approval that stays `pending` when
  a manager attempts it. **PASS 2026-08-27.**
- **SC-084** (`core/approvals/`) — a contract/commitment forces an approval routed to the
  `legal`/`external_comms`/`finance` domain by `detectForcedApprovalKeywords` (keywords
  `contract`, `agreement`, `nda`, `legal` → `legal` domain).
- **SC-061 / SC-062** (`adversarial/approval_abuse/`) — authority revalidated at decision
  time; a legal approval whose target changed must revalidate.

Ground truth: `governance/capabilities/CAPABILITY_MATRIX.yaml` `legal.approve.contract`,
`governance/policies/LEGAL.yaml`, `governance/ACTION_RISK_LEVELS.md` (L5 shares legal's
gate — no dedicated ownership/banking domain yet).
