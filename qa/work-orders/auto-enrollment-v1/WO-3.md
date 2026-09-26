# WO-3 — Add Computer: pairing and enrollment protocol (the capability envelope is granted here)

- **Binding**, revision 1, issued by the DIRECTOR.
- Contract: §2 (Enrollment), §4.
- Founder text: I A.1 §2–§3, I A.3 §2, I A.4 §9; II.10.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **Flow.** A Factory admin (S-8) configures the computer's **authorized capability envelope**, then issues a pairing code. The clean PC
  enters it, and enrollment completes automatically.
  - The node receives exactly that envelope.
  - Enrollment grants authorization. The installer never decides it.
- **States and transitions.** Exactly contract §2's Enrollment table, including the failure states, retry-with-same-credential after
  `INSTALL_FAILED` / `REGISTRATION_FAILED`, and admin re-pair from `CREDENTIAL_REVOKED`.
- **Pairing security.**
  - A code is a random public **locator** (unique among live codes) plus a secret of **at least 55 bits of entropy from a CSPRNG**
    inside the Factory server boundary. It is never derived from a counter or a clock.
  - Verification: `HMAC-SHA256(FACTORY_PAIRING_PEPPER, normalized_code)`.
  - The pepper lives only in the Edge secret store; SQL never sees the code or the pepper.
  - **TTL ≤ 15 min.**
  - **≤ 5 failed attempts per locator**, after which that code is revoked.
  - **≤ 20 attempts per source IP per hour**: the connecting peer address as the Edge platform sees it, never a client-supplied header.
  - **≤ 60 attempts per tenant per hour**, unknown locators included.
  - The code is one-time, atomically consumed, tenant-bound and envelope-bound.
  - Every attempt is audited. Comparison is constant-time.
  - Revoked, expired and consumed codes fail closed.
- **Credential issuance.** The pairing code is never a credential. Exactly one credential is issued per enrollment, bound to the
  presented key by proof of possession and to the principal the pairing code was issued for (at Add Computer, the computer's first
  principal; S-13).
- **No shared secret in the installer.** It never receives a database password, `FACTORY_RUNNER_PG_URL` or any shared secret.

## Must satisfy
AC-8, S-4, S-6, S-8, S-12, P-9

## Depends on
WO-1, WO-2.

## Founder boundary
Creating the production pepper secret is a founder action.

## Candidate report must include
- The transition table, with a test per transition and per failure state.
- Every abuse case at its boundary value, including a spoofed forwarding header.
- The code generator's source (the CSPRNG call) and its entropy calculation.
- The dump / source scan proving no pepper and no plain-SHA-256 code.
