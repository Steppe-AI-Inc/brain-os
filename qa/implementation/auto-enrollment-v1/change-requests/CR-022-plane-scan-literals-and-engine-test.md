# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-022 — Under the r3 plane-conditioned-behaviour scan (S-10; VERIFICATION_SPEC §3.4), which class, if any, covers (a) the release
channel's two fixed names, in the release table's CHECK and in the publish front door's parameter validation, and (b) the engine test
`current_user` compared with `'factory_owner'` inside the two INVOKER guard triggers that the SECURITY DEFINER front doors fire?**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation` (test-infrastructure area, after
  the independent verifier's review of the developer §3.4 scan). It extends the question of CR-021 to more groups of hits.
- **Amended:** 2026-09-29 by the same capability, before any Director decision. The request is narrowed to (a) and (b) above; see
  "What was eliminated or reclassified" below.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a clarification of how a Director requirement is read. No Director text is edited, and no product behaviour is changed
  by this request.
- **Until the Director decides, the candidate keeps the r3 behaviour:** the channel validation and the guards stay as they are. The
  developer inventory marks every hit below `pending: CR-022`, so the static contract lists them in its failing row P3p (next to
  CR-021's), instead of passing them on a class the r3 text may not allow. The candidate relies on no answer; the verifier classes
  every hit itself.

## Requirement (the r3 texts)

- §3.4 **Hits:** "a literal naming a record or object that exists on the live plane or on a disposable one, but not on both (an id,
  name, host or project ref)"; "a value derived from a hit ... is classed like the hit it comes from".
- §3.4 **Classes:** "**the call's input**: the authenticated caller (a JWT's subject and role), the calling API role, the refusal of a
  superuser caller, the peer address the Edge platform reports (S-6) and the request's parameters, each used by one rule whatever its
  value. Inside a SECURITY DEFINER front door (S-10 requires every front door to be one) `current_user` is the owner, so the calling API
  role is read only from `session_user`. **The applying login's or an object owner's name or attributes** (`current_user` inside a
  SECURITY DEFINER body, `rolsuper`, `rolbypassrls`, `rolreplication`, memberships, settings), read in a migration statement, a
  founder step or a SECURITY DEFINER body at call time, and `session_user` read in a migration statement or a founder step (where it
  is the applying login), mark the verifier's run and fit no class. ... A comparison with a value that marks a plane or the verifier's
  run (a host, a loopback or private address, a release channel) fits no class."
- S-10 (contract): "a server guard refuses any legacy write to an authority record".

## What the candidate does (the hits that remain; file:line at the commit that carries this amendment)

(a) **Release channel names** (4 hits).
- `supabase/control-plane/v1/060_releases.sql:13`: `channel text not null check (channel in ('production', 'dev'))`.
- `220_admin_releases_policies_work.sql:21` (`factory.admin_publish_release`): `if ch is null or ch not in ('production', 'dev')
  ... then return factory._refusal('bad_request', 400, ...)`, where `ch` is the request's `channel` parameter.

Both compare a value with the two channel names S-5 defines. Neither reads which plane or channel the server itself is.

(b) **The engine test in the guards** (2 hits).
- `080_guards.sql:66` (`factory._authority_guard`): `current_user <> 'factory_owner'::pg_catalog.name`.
- `080_guards.sql:388` (`factory._legacy_guard`): `current_user = 'factory_owner'::pg_catalog.name`.

Both functions are SECURITY INVOKER trigger functions. When a front door (SECURITY DEFINER, owned by `factory_owner`) writes,
`current_user` in the trigger is the front door's owner. When the legacy role writes directly, it is `factory_runner`. `factory_owner`
is created by this migration, with that name, on every plane. The B-2 regression (schema C16) requires exactly this typed comparison.

## What was eliminated or reclassified by the amendment, and why

- **Eliminated: `factory._is_engine`** (1 hit, formerly `080_guards.sql:36`). The migration no longer creates this INVOKER helper.
  No SQL of the candidate called it; only developer probes did. Schema C16 now reads the two guards and `factory._via_api`. L2's
  direct-call refusal calls `factory._via_api`. L9c is retired, because L9 and L9b already hold both guards under the same `pg_temp`
  shadow. Static R9 drops the name, and mutant SPE is retired; SP and SPA plant the same defect in the guards. The removal holds under
  either answer: no product behaviour depended on the function, and the engine tests that remain are exactly the question (b) asks.
- **Reclassified as not a hit: the fixed ids of the rows this migration seeds** (15 hits, formerly question (c)).
  - `010_tenancy.sql:21, :54-:61`: the operator tenant row, and its id as the default of the `tenant_id` column the migration adds
    to each `69df2f52` table.
  - `050_verification.sql:69, :74`: contract §1's two policy rows and their tenant.
  - `080_guards.sql:32` (`factory._operator_tenant()`) and `:480` (`factory._legacy_guard`: a legacy INSERT must carry the operator
    tenant).

  The r3 hit item for literals is about a literal naming a record or object that "exists on the live plane or on a disposable one,
  but not on both". Each of these
  ids names a row that this same migration inserts, under that id, wherever it runs. Contract §1 requires exactly those
  rows ("It seeds exactly the policy rows above and the one operator tenant row"). §3.5 reads them back on every judging plane, and
  schema C11, C12 and `migration_rows.mjs` W2 / W5 do the same in the developer suites. The literal text therefore places them outside
  the hit list, and no class is needed. The developer inventory now proposes them as `not-a-hit`. Each entry quotes that hit item
  and names the statement that creates the record, and none is pending (`factory_v1_plane_scan.mjs` accepts that proposal only for a
  UUID literal carrying both). This remains a proposal: "A candidate's own annotation never classifies a hit", and the verifier
  classes each of these itself.

  No product code changed for them. `factory._operator_tenant()` still returns the literal. The legacy guard cannot read the tenant
  at run time: it runs as the legacy role, which can neither read `factory.tenants` nor execute any factory function.

## Evidence

- `node qa/scenarios-runner/factory_v1_static_contract.mjs`: row P3p lists these groups under CR-022 with file and line. That is 6
  groups and 6 hits: 4 for (a) and 2 for (b). CR-021 has 8 groups and 26 hits. Before this amendment CR-022 had 13 groups and 22
  hits. Row P3 passes with the seeded ids proposed as not a hit.
- (a): no statement of the candidate reads the server's own channel. The channel a release row holds is the request's parameter (the
  Admin API's publish), or the runtime's build-time trust (S-5, outside S-10's SQL scope). The same two literals decide on every
  plane.
- (b): on the applying-role plane (`qa/factory/v1/applying_role_plane.mjs`) and in every v1 suite, the engine test is true exactly for
  writes made inside a front door, and false for the legacy role. `factory_owner` is NOSUPERUSER on every plane (schema C1), and the
  applying login is never compared with anything. Schema C16, L9 and L9b prove the comparison is typed and unaffected by `pg_temp`.

## Why a decision is needed

- (a) The class bullet says a comparison with "a release channel" fits no class. One reading is "a value that marks a plane or the
  verifier's run, such as a release channel". Under that reading, validating a request parameter against the two channel names is
  the call's input: one rule, whatever its value. Read literally, any comparison with a channel name is a finding.
- (b) The functions are INVOKER. Inside a front door, though, they read the owner's name at call time, and §3.4 says an owner's name
  read in a SECURITY DEFINER body at call time fits no class. Two readings of a Director requirement are open. Is a trigger that a
  front door fires such a body? And does a comparison with the fixed name of a role this migration itself creates on every plane
  "mark the verifier's run"?
- The implementer cannot answer either question by annotation (§3.4: "A candidate's own annotation never classifies a hit"). The
  same kind of doubt was referred in CR-021. A related question about founder step 3, which fires these guards, is CR-026.

## Alternatives (for the Director)

1. **(proposed) Classable as they stand, with the construction named in the receipt.** No product change.
   - (a) the call's input: the channel is the request's parameter, and the literals are the two channels S-5 defines, the same on
     every plane.
   - (b) either the call's input (the writer of the row: a front door's owner or the legacy session role), or same on every plane
     (the role this migration creates with that name on every plane).
2. **They are findings; the owning areas change the product.**
   - (a) The channel becomes a type the migration defines (an enum or a domain), so no statement compares a value with a channel
     name. That type's input function still compares with the names, so the Director would need to say whether that is enough.
   - (b) The engine test stops reading `current_user`. One option keys it on the calling login (`session_user`, the call's input),
     with the migration's own writes and the fixtures made through the front doors. Another drops the authority guard in favour of
     the privilege model alone (schema C3 / L1 already prove no legacy privilege), and keys the legacy guard on `session_user =
     'factory_runner'`. S-10's "a server guard refuses any legacy write to an authority record", and SECURITY_INVARIANTS #8's engine
     identity, would then need the Director's reading too.
3. **Split:** any mix of 1 and 2 per group.

## Impact

- Alternative 1: the `pending: CR-022` marks are removed from `qa/scenarios-runner/factory_v1_plane_scan_inventory.mjs` (P3p then
  depends on CR-021 and CR-026). No rows or mutants change.
- Alternative 2: product changes in `060_releases.sql` / `220_admin_releases_policies_work.sql` (release area) and `080_guards.sql`
  (migration and guards area).
  - The test fixtures that write as the engine change too.
  - Schema C16, L9, L9b and the B-2 regression are re-pointed to the new engine test.
  - Mutants that name the guards' engine line (SP, SPA, ENG, ENC, ENS) are re-planted.
- Either way the Director's decision is recorded in `qa/work-orders/`, and the inventory is updated to it before the candidate is
  noticed.
