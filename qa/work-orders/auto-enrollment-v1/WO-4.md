# WO-4 — BrainFactorySetup.exe and the persistent node runtime

- **Binding**, revision 1, issued by the DIRECTOR.
- Contract: §3 P-4.
- Founder text: I A.1 §1, I A.2 (installer).
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **One executable.** A single Node SEA executable is both setup and runtime. It installs per user, without admin rights, and bundles
  its runtime.
- **The only human steps on the clean PC:** download `BrainFactorySetup.exe` (public, its file sha256 shown; CR-004), run it, enter the
  pairing code. Nothing after that.
- **What the enrolled computer never needs:** Git, npm, a source checkout, a PowerShell bootstrap, `runner.env`, CA copying, a
  PostgreSQL URL, Supabase credentials, or manual machine-role assignment.
- **Key handling.** The installer generates the node key pair locally and never exports the private key.
- **Release verification.** The installer and runtime verify every release against the **pinned trust set** (S-5, WO-6) before
  executing it.
- **Reproducible build.** The build is reproducible: the verifier, building from the candidate SHA, obtains the identical artifact digest
  (S-5). The digest is the PE Authenticode image hash, so the founder's Authenticode signature never changes it.
- **Persistent runtime.**
  - A per-user task at logon plus a watchdog, installed as a standard user with no elevation, and no Windows service (I A.2; the
    reconciliation in contract §0).
  - After a logoff or a reboot, the runtime starts at the installing user's next logon with no other step, returns through
    RECOVERING (contract §2) and is ALIVE within 180 s of the logon, and a killed runtime is restarted. While the user is logged off,
    the computer derives STALE / OFFLINE and its leases lapse into the certified takeover.
  - An install or registration failure is recorded as `INSTALL_FAILED` / `REGISTRATION_FAILED`, and a retry reuses the credential
    (no new code).
  - The runtime reports its phases.
  - Every refusal is shown by name, and no secret appears in any log.
- **Two different signatures.** **Installer Authenticode signing** (I A.2) is a founder / external boundary. Until then the installer
  is Authenticode-unsigned, with a published sha256. The published sha256 (I A.2, CR-004) is the sha256 of the downloadable file as
  served; it is shown next to the S-5 digest (the PE Authenticode image hash), and the two are different values. This is separate from
  **release-manifest signing** (WO-6, C-3), which is never absent.

## Must satisfy
AC-1, AC-5, S-2, S-5, S-12, P-4, P-9

## Depends on
WO-2, WO-3, WO-6.

## Founder boundary
Installer Authenticode code signing is a founder / external action (I A.2). Until then the installer is published unsigned, with its
sha256.

## Candidate report must include
- A clean-machine rehearsal transcript, on a machine that is **not** the acceptance machine.
- The installed-footprint listing, proving none of the forbidden items are present.
