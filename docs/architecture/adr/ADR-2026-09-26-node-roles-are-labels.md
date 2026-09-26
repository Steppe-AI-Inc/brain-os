# ADR 2026-09-26 — Node roles are labels; authority is role-based, never machine-based

**Status:** ACCEPTED. Recorded by the implementer on the founder's explicit instruction ("GOVERNANCE EVOLUTION", 2026-09-26).
The text of the decision is the founder's; this file records it and does not add to it.

**Supersedes:** the machine-specific mapping in `CLAUDE.md` §1/§8 and `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` §1/§8:
"Home/Main PC = implementation; Work PC = independent QA".

## Context

The development constitution bound roles to physical machines. The Home PC implemented and the Work PC independently accepted.
Factory auto-enrollment (`docs/architecture/features/factory-auto-enrollment.md`) makes every computer an enrolled node whose
authority comes from a server-side authorization envelope. Under that model a machine name cannot be the source of authority, in
the product or in the process that builds it.

## Decision

The machine-specific mapping is **SUPERSEDED**. The underlying invariant is **preserved**:

**IMPLEMENTER MUST NOT SELF-CERTIFY.**

Canonical model:
- Hostname does not create authority.
- Home / Work / Laptop are node labels, not permanent roles.
- Node authorization defines what the node MAY do.
- Detected capabilities define what the node CAN do.
- Work Orders define what work REQUIRES.
- The scheduler selects eligible nodes automatically.
- Resource fitness ranks eligible nodes only.
- The current assignment is temporary.
- A run that materially authored a candidate cannot independently certify that candidate.
- Independent acceptance requires a distinct authorized verifier identity and provenance.
- Physical-node separation is required only when the acceptance policy explicitly requires it.

**Language.** Future architectural language says **INDEPENDENT ACCEPTANCE**, not "INDEPENDENT WORK-PC ACCEPTANCE". Historical
evidence may continue to say Work-PC where it describes what actually happened. History is not rewritten.

## Work Order authority (the governance that accompanies this ADR)

| Party | Owns |
|---|---|
| DIRECTOR | Canonical product contract, invariants, binding Work Orders, binding acceptance criteria, verification specification. Reviews and ratifies any proposal that changes WHAT MUST BE TRUE. |
| IMPLEMENTER | Implementation proposal, engineering decomposition, technical subtasks, estimates, sequencing, implementation — against the ratified contract. |
| INDEPENDENT ACCEPTANCE | Verifies the implementation against criteria the implementer did not define for itself. |

Some proposals change what must be true: the product contract, an invariant, a security boundary, a tenancy rule, a Work Order
requirement, an acceptance criterion, a verification rule, takeover/fencing behavior, or the definition of PASS. The implementer
may PROPOSE such a change but MUST NOT treat it as binding or implement against it until the Director ratifies it.
- Flow: DISCOVERS ISSUE → CHANGE REQUEST / PROPOSAL → DIRECTOR RATIFICATION → BINDING CONTRACT/WO UPDATE → IMPLEMENTATION.
- While a change waits, every non-conflicting item that remains valid under the ratified contract continues.
- Implementation details that do not change what must be true stay entirely within the implementer's authority: file and module
  structure, helpers, test organization, refactoring, packaging mechanics, sequencing, local disposable test infrastructure, and
  semantics-preserving performance work.

## Current placement (NOT architectural authority)

For the auto-enrollment milestone only:
- DESKTOP-8P5HVAO = primary implementation / build / test / package machine.
- DESKTOP-MDPE6FS = Director / Coordinator / Independent Verifier.
- Third PC = real zero-touch acceptance machine only.

These hostnames are never encoded as role rules in the product. Where this milestone's final acceptance requires physical-node
separation, that is a campaign-level acceptance policy (`factory.verification_policies`, scope `campaign`). It is not the generic
Factory independence invariant.

## Consequences

- `CLAUDE.md` §1/§8 and `FEATURE_COMPLETENESS_CONTRACT.md` §1/§8 use role language (implementer / independent acceptance) and
  point here for the current placement.
- The single-writer QA files (`qa/BUG_QUEUE.json`, `qa/COVERAGE_LEDGER.json`, `qa/FIXTURE_REGISTRY.json`,
  `qa/HANDOFF_STATE.json`) belong to the independent-acceptance role, wherever that role currently runs.
- Factory independence is enforced by run provenance and verifier authority (`factory.verification_policies`, the certification
  record on `factory.agent_runs`). It is never enforced by hostname.
