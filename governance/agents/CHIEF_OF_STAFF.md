# AI Chief of Staff (`agents.role = 'chief_of_staff'`)

Registry label only — see `README.md`. The default/fallback owner for general-purpose
commands that don't match a more specific category (`fallbackPlan()`'s final `else`
branch routes to this label — "Create CEO operating brief and follow-up tasks").

## Proposed charter (aspirational)
- **May see:** whatever the executing human's own RLS scope grants — this label has the
  broadest conventional remit (cross-functional briefs, blocker identification) but no
  broader actual data access than any other label.
- **May decide (AUTO, low risk):** identify blockers, create follow-up tasks, draft an
  operating brief.
- **Requires approval:** anything the brief recommends that itself falls into a
  higher-risk domain (e.g. a brief that recommends a salary change still routes that
  specific recommendation through `HR.yaml`'s gate, not this agent's own authority).
