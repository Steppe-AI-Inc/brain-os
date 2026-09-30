# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-023 — Under the r3 plane-conditioned-behaviour scan (S-10; VERIFICATION_SPEC §3.4), which class covers the observer role's name
that the founder writes into prepared step 1b, in its GRANT and in its read-back?**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation` (migration-privileges area,
  after the independent verifier's review of that area).
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a clarification of how a Director requirement is read. No Director text is edited, and no product behaviour is changed
  by this request.
- **Until the Director decides, the candidate keeps step 1b as it is.** The candidate relies on no answer; the verifier classes every
  hit itself (§3.4: "A candidate's own annotation never classifies a hit").

## Requirement

- §3.4, scope of the scan: "every SQL object and migration statement the candidate adds or changes, its Edge handlers and its
  prepared founder steps, which is S-10's scope".
- §3.4, **Hits:** "a literal naming a record or object that exists on the live plane or on a disposable one, but not on both (an id,
  name, host or project ref)"; "a value derived from a hit ... is classed like the hit it comes from".
- §3.4, **Classes:** "**carried**: only stored, returned or logged ... No branch compares it with a fixed value"; "**decides** (a
  REJECTED finding): a branch, predicate, guard or refusal depends on it, or it chooses which record or object is read or written, and
  no class below fits".
- §3.3, fidelity check: the exceptions include "rows the event log records as a founder-approved live change that a disposable plane
  does not carry (for example the observer role and its grants)".
- Contract (`docs/architecture/features/factory-node-management-auto-enrollment.md`): the Director's live observer login is "a
  founder-provisioned SELECT-only role. It holds SELECT on every `factory` relation, including those the migration adds (a recorded
  founder change), and on `storage.buckets`".

## Evidence

What the candidate does (`qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md`, step 1b): after step 1, the founder runs,
as the applying login, `set local role factory_owner` and one `grant select on <the 19 new tables and their three identity
sequences> to <observer role>`, then one read-back,
`... and not pg_catalog.has_table_privilege('<observer role>', c.oid, 'SELECT')` over the relations of schema `factory`, which returns
no row when every relation is readable. `<observer role>` is a placeholder the founder replaces with the name of the observer role
the founder provisioned. That role exists on the live plane only (the developer suite uses a stand-in: schema row OB1).

- The name is a grantee: it is stored in the ACLs of the 22 relations. In the read-back it is the role whose privilege is probed,
  and the result is displayed to the founder. No statement branches on it or compares it with anything, and it does not choose which
  relation is written: the relation list is fixed.
- The developer scan (`qa/scenarios-runner/factory_v1_plane_scan.mjs`) reports no hit for the placeholder itself; it counts the
  read-back's privilege probe with the other founder-step read-backs, for which its inventory proposes carried. It does not stand in
  for the verifier's scan.

## Why

The founder-supplied name refers to an object that exists on the live plane and not on a disposable one, and step 1b is within the
scan's scope. The r3 class list does not name this case. "Carried" fits what the value does (it is stored as an ACL entry and
displayed), but the class text speaks of values that are "stored, returned or logged", and a grantee in a GRANT may be read as
choosing what is written. The implementer cannot settle this by annotation.

## Alternative

1. **(proposed) Carried.** The observer role's name in step 1b's GRANT and read-back is classed carried: it is stored as an ACL entry
   and displayed, no branch depends on it, and the objects written are a fixed list. The receipt names this construction. No change.
2. **Not a candidate step.** Step 1b is removed from the candidate's prepared steps, and the observer's SELECT on the new relations
   stays entirely a Director-recorded founder change (§3.3 already excepts "the observer role and its grants"), written by the
   Director with the observer provisioning.

## Impact

- Alternative 1: none on code or rows. The verifier's receipt lists the hit with the class carried.
- Alternative 2: `FOUNDER_PREPARED_STEPS.md` loses step 1b (and its row in the step table); schema row OB1 and mutant OB are removed
  or moved to the Director's own procedure; `MIGRATION_PRIVILEGES.md` and the candidate report drop their references to step 1b. No
  migration change.
- Either way the Director's decision is recorded in `qa/work-orders/` before the candidate is noticed.
