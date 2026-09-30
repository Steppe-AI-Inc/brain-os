# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-013 — S-14 for an unbound record that is already ALIVE when it reports a fingerprint a record carrying the S-16(a) binding has
reported: which enrollment state it shows, when the contract's state machine has no edge from ALIVE to REGISTRATION_FAILED**

- **Filed:** 2026-09-28 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a conflict between two r3 texts. No Director text is edited.
- **Revised 2026-09-28** after verifier review. S-14's "takes no work" is unambiguous r3 text that the candidate can enforce without a
  new §2 edge, so the candidate now enforces it; this request is narrowed to the one point the r3 texts leave in conflict, the
  enrollment state such a record shows.
- **Until the Director decides, the candidate refuses such a registration by name, gives the record no work, and leaves its
  enrollment ALIVE** (below). The candidate report states this. The candidate does not rely on this request.

## Requirement (the r3 texts)

- **S-14** (`docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md`): "every registration of an
  unbound computer record whose reported machine fingerprint (contract §1) equals any fingerprint that a record carrying the binding,
  archived or not, has reported is refused by name, a retry included; **the record enters `REGISTRATION_FAILED` and takes no work**."
- **WO-8 r2**: "Registration refuses by name, a retry included, an unbound computer record whose reported machine fingerprint equals
  any fingerprint that a record carrying the binding, archived or not, has reported; that record enters `REGISTRATION_FAILED` and
  takes no work."
- **Contract §2 Enrollment** (`docs/architecture/features/factory-node-management-auto-enrollment.md`): the only edges into
  `REGISTRATION_FAILED` are from `REGISTERING`; `ALIVE` leads only to `CREDENTIAL_REVOKED`. `ALIVE` "is the stored terminal milestone
  of enrollment".
- **S-16**: a Home-computer record is any record that has reported a fingerprint a bound record reported; it "stays restricted for
  this milestone".

The case: an unbound record reached ALIVE first, and only later did a bound record report the same fingerprint (the binding was added
on another record of the same machine after the unbound one enrolled, for example when S-14's correction order was not followed).
When that ALIVE record registers again (every runtime start registers), S-14 says it "enters REGISTRATION_FAILED"; §2 has no such
edge from ALIVE.

## Evidence (what the candidate does)

- Every registration of an unbound record that has reported, in that call or ever before, a fingerprint a bound record reported is
  refused by name (`registration_failed`, reason `s16a_bound_fingerprint`), whatever its state (`supabase/control-plane/v1/
  120_node_lifecycle.sql`, `node_register`).
- **Takes no work, in every state.** The first such refusal marks the computer record (`computers.s14_registration_refused_at`,
  server-written, set once, never cleared). Gate 1 refuses every claim of a marked record, authoring and verification alike, named
  "S-14" (`110_eligibility.sql`). This is S-14's own clause; it only removes eligibility (S-1) and needs no state edge.
- **A credential still in its walk** (RUNTIME_INSTALLING, REGISTERING, REGISTRATION_FAILED) is also stepped REGISTERING ->
  REGISTRATION_FAILED, and it cannot rotate out of its walk (`140_sessions.sql`, `enrollment_not_alive`). Regressions:
  `qa/factory/v1/admin_acceptance.mjs` G2, G2b, G2r, and G2e (a fingerprint reported only at enroll/start).
- **An ALIVE credential** keeps ALIVE (no §2 edge); the computer view shows ALIVE together with the refusal time, and the Computers
  page shows an "S-14" badge. Before its registration is refused, such a record is restricted as a Home-computer record (S-16: only
  Director-document authoring). Regression: `qa/factory/v1/admin_acceptance.mjs` G2d (before the refusal: product code refused at gate
  7, Director-document work taken; after it: registration refused with the enrollment ALIVE, and a Director-document claim and a
  waiting verification both refused at gate 1).
- The real runtime also treats the refusal as final and stops REFUSED (`scripts/factory-runner/enrolled/worker.mjs`).

## Why it must be the Director's decision

The state machine is contract text, and S-14 names a state the machine does not reach from ALIVE. Adding the edge, or reading S-14's
"enters REGISTRATION_FAILED" as applying only to a record still in its walk, changes or interprets binding text. The implementer may
not choose.

## Requested decision (any one)

1. **Add the edge ALIVE -> REGISTRATION_FAILED** (trigger: a registration refused under S-14; who: server) in a contract revision; the
   candidate then steps the ALIVE credential's enrollment as well (the gate-1 refusal stays).
2. **Keep §2 as is and record the reading:** S-14's "enters REGISTRATION_FAILED" applies to a record still in its walk; an ALIVE record
   in this case keeps ALIVE, shows the S-14 refusal beside it, and takes no work (what the candidate does now).
3. **Some other resolution the Director specifies.**

## Alternative considered (and why not adopted)

Stepping ALIVE to REGISTRATION_FAILED now: the enrollment guard (`080_guards.sql`, `_enrollment_step_ok`) holds exactly §2's edges,
and adding one is a contract change. Not done.

## Impact

- Option 1: one guard edge, a `node_register` branch, and G2d's expected enrollment state changes to REGISTRATION_FAILED.
- Option 2: none.
