# Action Risk Levels

Brain OS already has a real risk enum — `risk_level` (`low`, `medium`, `high`,
`critical`), used on `tasks.risk_level` and `approvals.risk_level`. This document maps
that real 4-tier system to the finer-grained 6-tier model (L0–L5) proposed alongside
this file, so the mapping is explicit rather than requiring a schema migration to adopt
a new enum wholesale.

## Real enum vs. proposed model

| Proposed | Meaning | Maps to real `risk_level` | Maps to real `approval_domain` | Approval required today? |
|---|---|---|---|---|
| L0 | Read-only | n/a — reads aren't gated by `risk_level` at all, only by RLS `select` policies | n/a | No — reads are governed entirely by SECURITY_INVARIANTS.md / DATA_CLASSIFICATION.md, not by an approval flow |
| L1 | Reversible internal operation | `low` | `general` | No — `approval_required` defaults false, confirmed live (`qa/ACCEPTANCE_TESTS.md` #5) |
| L2 | Meaningful internal modification | `medium` | `general` / `production` | Depends on `approval_required` flag the AI or user sets; no forced-keyword override at this tier |
| L3 | External communication / money / customer impact | `high` | `external_comms` / `finance` | Yes if `approval_required` or a forced-keyword match; `financial_reports` writes require manager+/hr_finance regardless of approval flow |
| L4 | Legal / payroll / production / security | `critical` (usually) | `salary_hr` / `legal` / `production` (high-risk instances) | **Yes, always, non-negotiable** — see forced-approval keywords below |
| L5 | Ownership / banking / destructive / irreversible | `critical` | `legal` (closest existing domain — no dedicated `ownership`/`banking` domain exists yet) | Yes, and currently **routes to `legal`'s tightest gate**: founder/admin or the explicit assigned approver only, per `approvals_update_approver` — no company manager can ever approve this tier, by design |

**Gap, stated plainly:** the real enum has 4 tiers where the proposed model has 6. There
is no dedicated `approval_domain` for "ownership/banking" distinct from `legal` — a
migration adding one (e.g. `ownership_banking`) plus a corresponding RLS clause in
`approvals_update_approver` (founder/admin only, no exceptions) would be needed to make
L5 truly distinct from L4/legal rather than just sharing its gate. Not built this pass;
sharing `legal`'s existing founder-or-explicit-approver-only gate is at least as strict
as L5 requires, so this is a naming/clarity gap, not a permission gap.

## Forced-approval keyword detection (the real L4 mechanism today)

`sem-ai-command`'s `detectForcedApprovalKeywords()` scans every AI-generated task's
title/description regardless of what the model set `approvalRequired` to — a task
matching a high-risk keyword (salary, terminate, legal, contract, wire transfer, delete
production data, etc. — see the function itself for the live list) gets
`approval_required` forced to `true` even if the model didn't ask for it. This is the
concrete mechanism that makes "the LLM can't talk its way out of an approval gate" real
rather than aspirational — verified live via the 2026-08-27 adversarial prompt-injection
test (SECURITY_INVARIANTS.md #6): asked the model to bypass approval for a salary
change, it didn't attempt to, and the resulting task/approval landed in the `salary_hr`
domain as forced, not as a compliant bypass.

## Deploy/security-change risk (not currently modeled in the enum at all)

"Deploy a production RLS migration" and "push a Supabase Edge Function" have no
`risk_level`/`approval_domain` representation whatsoever — they're pure human/agent-CLI
actions outside the `tasks`/`approvals` system entirely. This is why the auto-mode
safety classifier (this session's own tool-permission layer, not a Brain OS mechanism)
is currently the *only* gate on this class of action — confirmed real 2026-08-27 when it
correctly blocked an unattended `supabase db push --linked` for a live RLS policy
change and required the founder's explicit authorization before it proceeded. Worth
noting as a real, working control, not a gap — but it's an operator-tool-level control,
not a Brain-OS-level one, so it wouldn't apply if this repo were ever operated by a
different tool without an equivalent classifier. If that risk matters, the honest fix is
a real deploy-approval mechanism inside Brain OS itself (e.g. a `production_deploy`
`approval_domain`, gated the same way `legal` is) — not currently built, flagged here as
the most concrete unimplemented piece of this whole governance layer.
