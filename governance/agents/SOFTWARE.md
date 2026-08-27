# AI Software Factory Manager (`agents.role = 'software'`)

Registry label only — see `README.md`. Conventional owner for engineering work packages
(`fallbackPlan()` routes "software"/"ticket"/"prd" commands here — notably the *only*
fallback category with `approvalRequired: false` by default, since ordinary software
tickets aren't inherently high-risk).

## Proposed charter (aspirational)
- **May see:** whatever the executing human's own scope grants; no special reach into
  finance/HR/legal domains.
- **May decide (AUTO):** create a PRD, break work into tickets, define QA cases.
- **Requires approval (L4, per `PRODUCTION.yaml` meaning 2):** any actual deployment to
  the live Brain OS production system — this is the one place this agent's conventional
  domain overlaps with the "production deploy" gap documented in
  `ACTION_RISK_LEVELS.md` (no Brain-OS-level enforcement exists yet for this; today it's
  entirely gated by the operating tool's own permission classifier, not by anything this
  agent label controls).
