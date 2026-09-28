# WO-2 — Factory Node API: an authenticated boundary over the same lifecycle

- **Binding**, revision 2, issued by the DIRECTOR.
- Contract: §3 P-2 / P-3; S-3, S-7, S-10, S-12.
- Founder text: I A.4 §5, §6, §10; II.7.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **One path.** NODE → node-scoped credential → Factory Node API (Edge Functions on `npvhuoozkbexddnvkqsj`) → SQL front doors → the
  **SAME** canonical control-plane state machine.
- **One engine.** Edge handlers only authenticate and call exactly one front door, and make no lifecycle decisions. No second
  orchestration engine exists.
- **Preserved semantics, through the API:**
  - the shared unassigned queue;
  - atomic claims;
  - leases, lease renewal;
  - checkpoint / resume;
  - takeover;
  - **stale-worker fencing inside the front door**: renew, **checkpoint** and complete rejected for a holder whose lease was taken;
  - **exactly one successful completion, no duplicate completed side effects**;
  - surface / conflict locks;
  - restart / recovery;
  - provenance;
  - verifier independence.
- **The §6 takeover sequence** holds step by step, through the API and when the front doors are called directly.
- **Compatibility matrix (§10).**
  - Columns: OLD CALL, OLD DB PRIMITIVE, OLD TRANSACTION BOUNDARY, OLD AUTHORITY CHECK, OLD LEASE / FENCING RULE, NEW API ENDPOINT, NEW
    SERVER PRIMITIVE, NEW AUTHORITY CHECK, REGRESSION TEST, VERDICT.
  - Rows: register, heartbeat, discover / claim, lease renewal, checkpoint, complete, surface-lock acquire, surface-lock release,
    takeover / recovery, verification claim, certification.
  - No row is "migrated" before its regression passes on the new primitive.
- **Authentication.**
  - Every node call re-checks the credential status **inside its own transaction** (S-3). A session token never outlives a revocation.
  - The server stores a session token at most as its hash, never in clear (S-12).
  - Tenant, identity and authority are derived from the credential.
- **Session-less surface.** Exactly the S-7 allowlist.

- **No plane-conditioned behaviour** (S-10). No front door or handler decides what it does from a value that tells the live plane from
  a disposable one, or live operation from the verifier's run; the production-ref refusal is the one exception. What is not such a
  decision (for example pinning the front doors' `search_path` or a timeout, or a handler using its own plane's endpoint, credentials
  and keys only to connect or to verify a token or code) and the scan's classes are in S-10 and `VERIFICATION_SPEC.md` §3.4.

## Must satisfy
AC-9, S-3, S-4, S-7, S-10, S-12, P-2, P-3

## Depends on
WO-1.

## Founder boundary
Deploying the Edge Functions live is a founder action (`ALLOW_FUNCTIONS_DEPLOY=1?`).

## Candidate report must include
- The completed compatibility matrix, with every VERDICT backed by a passing regression.
- The §6 evidence from server rows.
- The static handler inventory.
