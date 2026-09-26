# WO-9 — Independent verification model, policies and the verification state machine

- **Binding**, revision 1, issued by the DIRECTOR.
- Contract: §1 (Verification record, Policies), §2 (Verification).
- Founder text: I A.3 §1, I A.4 §8; II.1, II.3, II.10.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **The authoring set.** A candidate's authoring set is every run that held a lease on the work order or wrote a checkpoint the
  completing run consumed, each with its identity and computer.
- **Identity.** The agent principal bound to the authenticating credential (WO-1). Each node credential is bound to exactly one
  Factory-issued agent principal; a node can never mint one. A credential issued by rotate, re-pair or restore is bound to the
  principal of the credential it replaces (WO-1). A run records the principal of the credential it authenticated with. A request-body
  field never counts.
- **Distinctness.**
  - The certifying run is not in the authoring set.
  - The certifying identity is none of the authoring identities.
  - The certifier holds verifier authority in its current envelope.
  - The certification names its work order and the exact candidate provenance, and counts only while that provenance is the work
    order's current candidate.
  - A second run of any authoring identity can never certify. After a takeover, neither A nor B can certify.
  - **This floor is enforced by the certification front door whatever the policy rows say**, and never depends on which plane it
    runs on (S-10).
- **Where authority comes from.** Certification authority derives from the work order, the authoring run, the certifying run, the
  distinct authorized verifier identity, exact provenance, current authority and the policy.
- **What is never enough.** A different hostname, fingerprint or machine is never sufficient on its own.
- **Policies are Director-issued data** (contract §1): the tenant default and the campaign "Auto-Enrollment V1".
  - The campaign requires physical-node separation from every member of the authoring set for every milestone candidate, whoever the
    author is. A different physical node means a different enrolled computer record whose reported fingerprint also differs (equal
    fingerprints refuse); a hostname or a different fingerprint alone never satisfies it.
  - No node credential or implementer migration can create or relax a policy beyond the Director-stated rows.
- **The verification state machine** is exactly contract §2, including **`VERIFICATION_FAILED`** (CR-002 ratified):
  - it is never COMPLETE;
  - its dependents stay blocked;
  - there is no automatic re-verification of the same candidate;
  - a new candidate means a new authoring run, and a new candidate whose content is identical to a FAILED one (the same tree) is
    refused as a resubmission;
  - a lapsed or released verification claim returns the work to WAITING_FOR_INDEPENDENT_VERIFICATION.
  - VERIFIED → COMPLETE is moved only by the server. With no eligible verifier, the work stays WAITING.
- **No founder poke.** A verification claim and the return to repair happen with no founder keystroke.

## Must satisfy
AC-3, AC-14, AC-16, S-13, S-16, P-10

## Depends on
WO-1, WO-2, WO-5.

## Candidate report must include
- Tests AC-14 (a)–(o).
- The policy-write refusal test.
- The certification record format.
