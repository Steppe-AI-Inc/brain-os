# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-003 — A founder-only tier for granting `release_broker` authority and for publishing installer releases**
Filed 2026-09-26 by the implementer. Status: **OPEN — NOT IMPLEMENTED.**

## Requirement affected

Who may perform the two highest-risk admin transitions:
- (a) granting an authorization envelope with `max_security_role = 'release_broker'`;
- (b) publishing a BrainFactorySetup.exe release that every node trusts.

The ratified governance treats `founder` and `holding_admin` as functionally identical (`governance/roles/FOUNDER.md`,
`HOLDING_ADMIN.md`). The admin API implements exactly that.

## Observed evidence

- `governance/ACTION_RISK_LEVELS.md` and `governance/policies/PRODUCTION.yaml` do not model deploy or security actions in the
  approvals system.
- `governance/capabilities/CAPABILITY_MATRIX.yaml` lists `production.deploy` as `enforced: false`.
- A release_broker node holds release authority, and an installer release is code every node executes.

## Why implementation cannot satisfy it under the current rule

Restricting either action to the founder alone is an authorization-rule change, which requires ratification.

## Proposed alternative

Only `profiles.role = 'founder'`, re-derived per call, may:
- set `max_security_role = 'release_broker'` in an envelope;
- call `publish_release`.

`holding_admin` keeps every other admin operation.

## Interim behavior

The ratified equivalence stands: founder | holding_admin for both actions. Every such action is audited with the actor's role.

## Compatibility / security impact

The proposal is stricter and only narrows. Nothing existing depends on holding_admin performing these actions.
