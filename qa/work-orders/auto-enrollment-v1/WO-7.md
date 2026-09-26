# WO-7 — Node lifecycle management: drain, resume, rotate, revoke, re-pair, archive, restore

- **Binding**, revision 1, issued by the DIRECTOR.
- Contract: §1, §2, §6, §8; S-3.
- Founder text: I A.4 §4.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **Who may act.** A Factory admin (S-8) may drain, resume, rotate, revoke, re-pair, archive and restore. Every action is audited and
  re-derived server-side.
- **Revoke is immediate** (S-3). Credential status is re-checked inside the transaction of every node call, whatever session token the
  node holds.
  - The call and the revocation are serialized on the credential row (for example, a share lock per call and an exclusive lock at
    revoke; any mechanism giving the same serialization satisfies it). So a call either commits before the revocation commits, or is
    refused: no effect of a revoked credential commits after its revocation.
  - After the revocation commits, every node call is refused, including an in-flight completion.
  - Other nodes are unaffected.
  - The revoked node's leases lapse and the certified takeover applies.
  - Its evidence is intact.
- **Rotate** supersedes the old credential.
- **Re-pair** revokes a principal's active credential and issues a new pairing code for the same principal on the same durable
  computer, audited. The old credential
  never becomes active again.
- **Drain / resume.** A draining node takes no new work, and resume restores it.
- **Archive / restore.** Archive revokes every active credential of the computer and stops all work, and history stays readable.
  Restore requires a fresh re-pair (contract §2, Computer lifecycle).
- **Every inverse is verified** at candidate stage in rehearsal R-4: rotate, re-pair, drain → resume, archive → restore.

## Must satisfy
AC-4, S-3, P-1

## Depends on
WO-1, WO-2.

## Candidate report must include
- An interleaving test: a revoke commits while a session token is valid and a run is in flight; then renew, checkpoint, complete,
  heartbeat and session exchange are each refused.
- The evidence-intact check.
