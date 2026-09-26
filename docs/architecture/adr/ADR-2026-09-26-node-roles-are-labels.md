# ADR 2026-09-26 — Node roles are labels; authority is role-based, never machine-based

**Status:** ACCEPTED.
- Recorded by the implementer on the founder's explicit instruction ("GOVERNANCE EVOLUTION", 2026-09-26). The text of the decision is
  the founder's.
- **Ratified by the DIRECTOR on 2026-09-26, with the amendments in "Director ratification" below.** Those amendments bring it in line
  with the founder's later rulings (founder text Part II).
- This ratified text, on branch `factory/auto-enrollment-v1-director`, is the canonical copy.

**Supersedes:** the machine-specific wording "Home/Main PC = implementation; Work PC = independent QA" in:
- `CLAUDE.md` §1/§3/§7/§8;
- `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` §1/§2/§7/§8;
- `docs/architecture/templates/FEATURE_CONTRACT_TEMPLATE.md` §10;
- the operative procedures `.claude/skills/feature-delivery/SKILL.md`, `.claude/skills/commercial-demo-release/SKILL.md`,
  `qa/PRODUCTION_CHECKLIST.md` and `docs/MESSAGING-TRANSPORT-ARCHITECTURE.md`;
- any remaining machine-named acceptance or closing rule elsewhere in the repository, for example
  `qa/work-orders/AI_PROVIDER_RELIABILITY.md` §6. It is read as role language: independent acceptance by a distinct authorized verifier,
  recorded by the Director; the implementer never closes.

## Context

The development constitution bound roles to physical machines. The Home PC implemented and the Work PC independently accepted.
Factory auto-enrollment (canonical contract `docs/architecture/features/factory-node-management-auto-enrollment.md`; the
implementer's engineering design is `docs/architecture/features/factory-auto-enrollment.md` on its branch) makes every computer an enrolled node whose
authority comes from a server-side authorization envelope. Under that model a machine name cannot be the source of authority, in
the product or in the process that builds it.

## Decision

The machine-specific mapping is **SUPERSEDED**. The underlying invariant is **preserved**:

**IMPLEMENTER MUST NOT SELF-CERTIFY.**

Canonical model:
- Hostname does not create authority.
- Home / Work / Laptop are node labels, not permanent roles. The Director is a logical Factory capability, not a hostname.
- NODE IDENTITY ≠ AUTHORIZED CAPABILITY ENVELOPE ≠ RESOURCE PROFILE ≠ CURRENT ASSIGNMENT ROLE.
  - A node may be authorized for several capabilities.
  - Its envelope is granted at Add Computer enrollment.
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
| IMPLEMENTER | Implementation proposal, engineering decomposition, technical subtasks, estimates, sequencing, and implementation (including implementation architecture and design, at the "implementation" rung of the precedence ladder) — against the ratified contract. Canonical architecture / governance is Director-ratified. |
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

These hostnames are never encoded as role rules in the product, and never grant anything.

**This milestone's founder restrictions** (II.1; contract S-16). They are restrictions only: they remove eligibility and never add it.
- No Auto-Enrollment product code is authored on the Home machine by any session or run, Factory-scheduled or not, and the Director
  capability authors no product code. At the product layer, an authoring run of such work never executes on the computer the
  restriction is bound to. A Factory admin binds the restriction to the Home computer's record at its Add Computer enrollment; it is
  keyed to the enrolled computer, never to a hostname.
- Every milestone candidate is certified on a different physical node from every member of its authoring set (a different enrolled
  computer record whose reported fingerprint also differs; a hostname or a different fingerprint alone never satisfies it).

Both are campaign-level policy data (`factory.verification_policies`, scope `campaign`), issued by the Director. They are not the
generic Factory independence invariant. The Director writes their content. Through the Admin API a Factory admin may only make a
policy stricter, and the campaign rows are frozen for this milestone. The certification front door enforces the independence floor
whatever the policy says. No node credential or implementer migration can create or relax a policy.

## Consequences

- `CLAUDE.md` §1/§3/§7/§8 and `FEATURE_COMPLETENESS_CONTRACT.md` §1/§2/§7/§8 use role language (Director / implementer /
  independent verifier / acceptance) and point here for the current placement.
- The canonical coordination ledgers and acceptance state belong to the **DIRECTOR** capability, as their single writer. That
  includes the single-writer QA files `qa/BUG_QUEUE.json`, `qa/COVERAGE_LEDGER.json`, `qa/FIXTURE_REGISTRY.json` and
  `qa/HANDOFF_STATE.json`.
  - The independent verifier contributes immutable verification evidence / receipts through the defined workflow.
  - The implementer may publish candidate / fix reports, but may not alter independent verification evidence or self-close its
    candidate (founder ruling C-5).
- Factory independence is enforced by run provenance, agent-principal identity and verifier authority (`factory.verification_policies`
  and the new-model certification records, which live in their own table). It is never enforced by hostname.

## Director ratification (2026-09-26)

- **Proposal ratified.** Commit `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` on `factory/auto-enrollment-v1-contract`; file sha256
  `964b79b1bbe7f5e8c44da9d5f6f061be7b3676990df7d0b195fbe9e50351beb8`.
- **Amendments from founder text** (`docs/architecture/features/factory-node-management-auto-enrollment.FOUNDER_TEXT.md`; Part II unless
  Part I is named):
  1. **QA single-writer model (C-5, II.6).** The original consequence gave the QA files to the independent-acceptance role. Replaced:
     the Director owns the canonical coordination ledgers and acceptance state, the verifier contributes immutable receipts, and the
     implementer publishes reports only.
  2. **Capability model (C-2, II.10).** Added the four-way separation and "the Director is a logical capability, not a hostname". There
     is no permanent question of which physical node holds the verifier role.
  3. **Contract authority (II.8, II.11).** The implementer can never define or alter the work / acceptance contract it is judged
     against, and hostname or resource fitness can never create authority.
  4. **Precedence (II.2).** FOUNDER-APPROVED CURRENT PRODUCT POLICY → CURRENT CANONICAL CONTRACT → CANONICAL ARCHITECTURE / GOVERNANCE →
     PRODUCT INVARIANTS → CERTIFIED BASELINE SEMANTICS → IMPLEMENTATION → LEGACY TEST / MACHINE-SPECIFIC ASSUMPTIONS.
  5. **Constitution wording (C-4, II.5).** `CLAUDE.md` §3 and §7, `FEATURE_COMPLETENESS_CONTRACT.md` §2 and §7, and
     `FEATURE_CONTRACT_TEMPLATE.md` §10 also lose their remaining machine names.
  6. **Milestone restrictions (S-16; II.1, II.10, I A.3 §1, I A.4 §8).** The "Home must NOT implement" line and the campaign's physical
     separation, recorded as restrictions.
- **Director decisions, not founder text** (made under the Director's authority, I A.4 §1):
  7. **Policy authority.** The Director writes policy content. Through the Admin API policies may only be made stricter, and the campaign
     rows are frozen for the milestone. The certification front door enforces the independence floor whatever the policy says.
  8. **Independence at identity level.** A second run of an authoring identity never certifies, and the authoring set is checked after a
     takeover.
  9. **Architecture rung.** The implementer's architecture is implementation architecture; canonical architecture / governance is
     Director-ratified.
  10. **Branch naming.** Canonical copies live on the Director branch, and implementation on `factory/auto-enrollment-v1-implementation`.
- **One copy per governance document.**
  - At commit `27d78ff6` the implementer marked its drafts on `factory/auto-enrollment-v1-contract` "SUPERSEDED — NOT CANONICAL", and
    restored `CLAUDE.md` and `FEATURE_COMPLETENESS_CONTRACT.md` to the baseline.
  - This ratified text, on the Director branch, is the only canonical copy.
  - The implementation branch carries the Director commit's versions unchanged.
- **What the ratification does not do.** It does not touch `master`. The constitution change reaches `master` only by a
  founder-authorized pull request.
