# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-007 — S-9 (`tenant_id` on every factory row) and `factory.plane_identity`, a row that exists only on some planes (S-10)**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** two ratified requirements (S-9 and S-10) that cannot both hold for this one row; which one yields, and how, is a Director
  decision.
- **The candidate does not rely on this change request.** Until the Director decides, the ratified r3 behaviour stands: the migration
  adds no reference to `factory.plane_identity`, and `plane_identity` (where it exists) keeps no `tenant_id`. The candidate's schema
  acceptance records the exclusion explicitly (below) instead of leaving it silent.

## Requirement

- **S-9** (`SECURITY_TENANCY.md:19`): "Every factory row carries `tenant_id`, and company-scope match is a hard gate."
- **S-10** (`SECURITY_TENANCY.md:20`; contract §1 "No plane-conditioned behaviour"): no SQL object the candidate adds or changes may
  decide, read or write from a value that tells the live plane from a disposable one — `factory.plane_identity` is named as exactly
  such a value.

## Evidence

- `factory.plane_identity` is a `69df2f52` provisioning record: `scripts/factory-runner/provision-control-plane.mjs` creates and fills
  it at `:298-301` (described at `:25`; read back at `:234-238`), and only on a plane provisioned `--allow-dedicated-supabase`: 0 or 1
  row, plane-dependent. It is not created by the V1 migration.
- `supabase/control-plane/v1/010_tenancy.sql:52` records, in a comment, that it is deliberately not referenced: adding `tenant_id`
  to it would require a statement that names `factory.plane_identity`, which the plane-conditioned-behaviour scan
  (`VERIFICATION_SPEC.md` §3.4) lists as a hit — "a record or object that exists on only one plane".
- The migration's own `tenant_id` roll-out (`010_tenancy.sql:54-61`) covers the eight `69df2f52` tables that exist on every plane;
  `plane_identity` is not among them, because it does not exist on every plane.
- `qa/factory/v1/schema_acceptance.mjs` excludes `plane_identity` from its `factory_runner`-privilege scan (`:77`
  `c.relname <> 'plane_identity'`) and from its S-9 row P5b (every other table in schema `factory` - the eight `69df2f52` tables and
  the nineteen the migration adds - has a NOT NULL `tenant_id`), and prints an `INFO` line naming that exclusion on every run.

## Why it must be the Director's decision

S-9 read universally requires every factory row to carry `tenant_id`; S-10 read universally forbids any SQL object from referencing
`factory.plane_identity`. On a dedicated-Supabase plane the two cannot both hold for that one row without a plane-conditioned
reference. This is a conflict between two ratified security requirements, so the implementer cannot resolve it by weakening either;
it keeps the r3 behaviour and asks.

## Requested decision (any one)

1. **S-9 does not bind `factory.plane_identity`.** It is a `69df2f52` provisioning artifact, not a Factory data row; the invariant
   reads over the model's own tables. (No code change; the r3 comment and the suite note already state this.)
2. **S-9 binds it, by a plane-agnostic path the Director names.** For example, a `69df2f52`-provisioner change (outside the candidate's
   authority) that adds the column at provisioning time, so the V1 migration never references the row. The Director states the path.
3. **Some other resolution the Director specifies.**

## Alternative considered (and why not adopted)

Adding `tenant_id` to `plane_identity` inside the V1 migration with `alter table if exists factory.plane_identity ...`. Rejected: the
statement still names `factory.plane_identity`, an object that exists on only some planes, so the §3.4 scan classes it a hit and it is
a REJECTED finding. `if exists` does not remove the reference.

## Impact

- **If (1):** no change; the r3 comment stands.
- **If (2) or (3):** the change is in the `69df2f52` provisioner or a Director-named path, not in the V1 migration, and is re-verified
  against the §3.4 scan.
- No product code, migration statement, contract row or acceptance criterion changes on the strength of this CR before it is decided.
