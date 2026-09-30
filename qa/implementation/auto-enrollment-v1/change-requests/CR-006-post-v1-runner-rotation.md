# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-006 — After the V1 migration, rotate the `factory_runner` password without re-running the `69df2f52` provisioner**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a Director-owned runbook text that conflicts with the V1 migration's privilege model. No contract, invariant or acceptance
  semantic changes.
- **The candidate does not rely on this change request.** Its prepared rotation step (`FOUNDER_PREPARED_STEPS.md` step R) follows
  the ratified rotation text already in `qa/work-orders/FACTORY_CONTROL_PLANE_SETUP.md:114` ("change the role's password, update the
  variable on each node, restart"). Until the Director decides, the r3 texts stay as they are.
- **Public record under ledger rule 3.** The measured detail behind this request went to the Director privately, through the founder.

## Requirement

- S-10 / WO-1: "the migration revokes the baseline's default-privilege grant for every new table"; `factory_runner` holds no
  INSERT, UPDATE or DELETE on any authority record.
- `VERIFICATION_SPEC.md` §3.5 read-back: "`pg_default_acl` for schema `factory`, with no default grant to `factory_runner` on the new
  tables".

## Evidence

- Three Director-owned rows describe rotating the legacy credential by re-running the frozen `69df2f52` provisioner:
  `qa/work-orders/TWO_MACHINE_CONTROL_PLANE.md` lines 68 and 175, and `qa/work-orders/FACTORY_V1_CHECKPOINT.md` line 147.
- The implementer measured that procedure on a plane that has the V1 migration (applying-role plane, schema_acceptance rows RO1 /
  RO2); the measurement went to the Director privately, through the founder.
- The prepared step R needs none of the provisioner's statements. The applying login administers `factory_runner` through the ADMIN
  grant PostgreSQL gave it when it created the role, so it can set the password alone.

## Requested change (Director decision)

For a plane that has the V1 migration, supersede the three rows above:
- the plane's applying login rotates the `factory_runner` password with psql's `\password factory_runner`, so the SCRAM verifier is
  computed client-side and the password never appears in a statement, log or command line;
- `runner.env` is then updated on each legacy node, and the node restarted;
- the provisioner is never re-run on such a plane.

The prepared step, with its read-backs, is `FOUNDER_PREPARED_STEPS.md` step R.

## Alternative

Keep the rows and add a Director note with a compensating statement after the provisioner run. The implementer recommends the
requested change instead. The reasoning went to the Director privately with the measurement.

## Impact

- This changes Director texts only (`qa/work-orders/`). No product code, migration, contract row or acceptance criterion changes.
- Requirement IDs: S-10, WO-1, VERIFICATION_SPEC §3.5, AC-10.
- The frozen provisioner itself stays byte-identical to `69df2f52` (it is outside the candidate's authority).
