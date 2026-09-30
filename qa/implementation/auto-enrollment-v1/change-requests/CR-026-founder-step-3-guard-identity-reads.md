# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-026 — Under the r3 plane-conditioned-behaviour scan (S-10; VERIFICATION_SPEC §3.4), is founder step 3 a founder step that
reads `session_user` or an object owner's name? Step 3 provisions the Factory admins by inserting into `factory.tenant_admins` under
`set local role factory_owner`. That insert fires two row triggers of the migration. `factory._tenant_admins_guard` reads
`session_user` through `factory._via_api()`, and `factory._authority_guard` reads `current_user`. Neither read appears in the step's
own text.**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation` (test-infrastructure area,
  while narrowing CR-021 and CR-022 to what the Director must decide).
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a clarification of how a Director requirement is read. No Director text is edited, and no product behaviour is changed
  by this request.
- **Until the Director decides, the candidate keeps the r3 behaviour:** step 3 and both guards stay as they are. The candidate relies
  on no answer; the verifier classes every hit itself.
- **Relation to other requests:** CR-022 (b) asks about the same `current_user` comparison when a SECURITY DEFINER front door fires
  the guards. This request asks only about the founder-step context, which CR-022 does not cover. CR-001 and CR-003 (ratified) made
  `factory.tenant_admins` founder-only, written by a prepared step and never through an API.

## Requirement (the r3 texts)

- §3.4 scope: "It covers every SQL object and migration statement the candidate adds or changes, its Edge handlers and its prepared
  founder steps, which is S-10's scope."
- §3.4 **Classes**, the call's input: "Inside a SECURITY DEFINER front door (S-10 requires every front door to be one) `current_user`
  is the owner, so the calling API role is read only from `session_user`. **The applying login's or an object owner's name or
  attributes** (`current_user` inside a SECURITY DEFINER body, `rolsuper`, `rolbypassrls`, `rolreplication`, memberships, settings),
  read in a migration statement, a founder step or a SECURITY DEFINER body at call time, and `session_user` read in a migration
  statement or a founder step (where it is the applying login), mark the verifier's run and fit no class."
- S-10 (contract): "a server guard refuses any legacy write to an authority record".

## What the candidate does

- **Founder step 3** (`qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md`, "3. Record the Factory admins"). Run by the
  applying login `postgres` in one transaction, it does exactly this: `set local role factory_owner;`, then `insert into
  factory.tenant_admins (tenant_id, auth_user_id, tier) select tenant_id, '<id>'::uuid, 'founder' from factory.tenants where
  is_operator;`. The step's own text reads no role name, attribute or setting (static contract R6 checks every code span of the
  document).
- **The triggers that insert fires** (`supabase/control-plane/v1/080_guards.sql`), both SECURITY INVOKER:
  - `factory_v1_a_authority` runs `factory._authority_guard()`, whose `current_user <> 'factory_owner'::pg_catalog.name` is at
    `:66`. In step 3, `current_user` is `factory_owner`, the role the step set, which owns every object the migration creates. The
    test is false, and the write goes on.
  - `factory_v1_c_invariants` runs `factory._tenant_admins_guard()`, which calls `factory._via_api()` (`:37`): `session_user in
    ('factory_node_api'::pg_catalog.name, 'factory_admin_api'::pg_catalog.name)`. In step 3, `session_user` is the applying login.
    The test is false, and the write goes on.

  Through an API, the same guard refuses every write to `factory.tenant_admins`. That is its purpose (S-8; CR-001, CR-003): no
  front door may write the table, whichever front door a defect might add.
- **The developer scan** (`qa/scenarios-runner/factory_v1_plane_scan.mjs`) classes a function by where it is defined, not by which
  statements fire it. It proposes `factory._via_api`'s `session_user` as the call's input: the calling API role inside the front
  doors. It lists the guards' `current_user` under CR-022 (b). It scans founder steps for their SQL text only, so it does not report
  step 3. That is a stated limit of the approximation; the verifier's own scan governs.
- **The static gate tracks this request** (added 2026-09-30): the inventory lists both reads as hand-listed UNTRACED entries marked
  `pending: CR-026`, anchored to step 3's INSERT, the `factory_v1_c_invariants` and `factory_v1_a_authority` triggers on
  `factory.tenant_admins`, `factory._via_api`'s `session_user` test and `factory._authority_guard`'s `current_user` test. Row
  P3p lists them under CR-026 and stays red until the Director decides; row P3 fails if an anchor is no longer in the source.

## Evidence

- Schema acceptance FS1 runs step 3 from the document, as the applying login, on the developer applying-role plane. The founder row is
  written through the authority guard.
- Four rows check the paths other than the step:
  - schema E10: the table refuses every writer that is not the engine;
  - E10b: a write that arrives through an API login is refused by the tenant-admins guard by name, even from inside a SECURITY
    DEFINER body owned by `factory_owner`. No front door writes the table, so the row plants a probe one and drops it afterwards.
    Mutant TAG reverts the guard, and E10b must fail;
  - L1: `factory_runner` is refused;
  - C9: the API roles hold no table privilege.
- On every plane the step runs on, the two reads have the same outcome: the applying login is never an API login, and the step always
  sets `factory_owner`. Nothing in the step, or in the triggers it fires, branches on which plane it is.

## Why a decision is needed

Two readings of §3.4 are open, and the implementer cannot choose between them by annotation (§3.4: "A candidate's own annotation
never classifies a hit").

- **Reading A.** "Read in ... a founder step" means a read the step's own statements make. The triggers are schema objects of the
  migration; they read the same values for every writer, and they are classed where they are defined. In the step, the read's outcome
  is fixed: the step allows the write, and no plane changes that. Under this reading step 3 is not a hit, and the guards stay under
  CR-022 (b).
- **Reading B.** A founder step reads whatever runs because of it. Under this reading step 3 reads `session_user` where it is the
  applying login, and `current_user` where it is the objects' owner. Both "mark the verifier's run and fit no class": a REJECTED
  finding in a founder step.

## Alternatives (for the Director)

1. **(proposed) Reading A.** A trigger that a founder step's statement fires is classed by the function's own context, as for any
   other writer. Its reads in step 3 are covered by the class the Director gives the guards: CR-022 (b) for `current_user`, and the
   call's input for `factory._via_api`'s `session_user`. No product or step change.
2. **Reading B, with a product change** (the owning areas: migration and guards, founder steps). Every option changes the S-8 guard
   CR-001 / CR-003 rely on, or the S-10 authority guard, so each needs the Director's reading of those texts too:
   - (a) `factory._tenant_admins_guard` stops reading `session_user`. The founder-only property would then rest on the privilege model
     and a source rule instead of a run-time guard. The API roles hold no privilege on the table (C9). A static row would refuse any
     front door that names `factory.tenant_admins` in a write. The Director would need to accept a source rule in place of a server
     guard for this table.
   - (b) `factory.tenant_admins` leaves the authority guard's list. The guard would then no longer refuse a direct write by
     `factory_runner` to that table, so it would rest on the privileges `factory_runner` does not hold (C3, L1). S-10 asks for a
     server guard on every authority record, so this needs the Director's reading of S-10 too.
   - (c) Step 3 writes through a founder-only SQL function instead of an INSERT. This does not remove the reads: the insert inside the
     function fires the same triggers.
3. **Reading B, recorded as an accepted exception** for this one prepared step: the reads are listed in the receipt, with their fixed
   outcome in the step. No product change.

## Impact

- Alternative 1 or 3: no product change. The verifier's receipt records the class, or the exception, for step 3's trigger reads.
- Alternative 2: changes in `080_guards.sql`, in `FOUNDER_PREPARED_STEPS.md` step 3, and in the rows that prove the founder-only
  property (FS1, E10, E10b and mutant TAG, or a new static row). They are re-pointed to the chosen mechanism.
- Either way the Director's decision is recorded in `qa/work-orders/`, and the developer inventory is updated to it before the
  candidate is noticed.
