# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-005 — Register the implementer commit-signing key (`implementer_signing_key`)**

- **Filed:** 2026-09-26 by the IMPLEMENTER capability (placement DESKTOP-8P5HVAO).
- **Branch:** `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director commit `8f9833cea3bd8b70d995cfe5575b6dabadb8361d`.
- **Required by:** WO-10 ("Authorship provenance"), VERIFICATION_SPEC §1 and §3.1, and ledger rule 8.

## The key

| field | value |
|---|---|
| algorithm | Ed25519 (OpenSSH `ssh-ed25519`), git `gpg.format=ssh` |
| public key | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB83rmOXLyzjCwn/Mw92TR+yIX9Xmh0yLFRP4LTy1+Yc` |
| fingerprint (SHA-256) | `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek` |
| comment | `brain-factory auto-enrollment implementer commit-signing key; DESKTOP-8P5HVAO; 2026-09-26` |
| generated | 2026-09-26, on the implementing machine (DESKTOP-8P5HVAO), by `ssh-keygen -t ed25519` |

For the verifier's allowed-signers file (VERIFICATION_SPEC §3.1), one line:

```
implementer@brain-factory ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB83rmOXLyzjCwn/Mw92TR+yIX9Xmh0yLFRP4LTy1+Yc
```

## Custody (S-16 key-custody rule)

- The private key is a file under the implementing user's profile, `%USERPROFILE%\.ssh\`. Its DACL has inheritance removed and
  grants only the implementing Windows user (read back: `DESKTOP-8P5HVAO\DELL:(F)`). It has never been copied, exported,
  transmitted or placed in a repository, URL or command line, and it never leaves this machine.
- **Limitation, stated:** no hardware-backed or non-exportable SSH key is available on this machine (no FIDO security key for
  `ed25519-sk`), so the key is a software key protected by the file ACL. As S-16 records, a signature proves the signing key, not the
  authoring machine.

## Requested actions

1. **Founder:** confirm this fingerprint out of band, as displayed on the implementing machine (`ssh-keygen -l -f
   %USERPROFILE%\.ssh\brain_factory_implementer_signing_ed25519.pub`).
2. **Director:** record the key in `AUTO_ENROLLMENT_V1_LEDGER.json` as `implementer_signing_key`, with the confirmation event.

Until then, receipts use this published key (VERIFICATION_SPEC §3.1), and no candidate can be CERTIFIED.

## Compatibility / security impact

None on the product. This is a governance-layer authorship key; it never becomes a release trust root (S-5).

## Verification and configuration scope (recorded 2026-09-27)

- **Private-key ACL, read back** (`icacls`): `DESKTOP-8P5HVAO\DELL:(F)`, the only entry; inheritance removed.
- **Tooling:** Git for Windows 2.55.0, with its bundled OpenSSH `ssh-keygen` (`/usr/bin/ssh-keygen`), `gpg.format=ssh`.
- **Throwaway proof, re-run** before this record:
  - a fresh repository under the session scratch directory;
  - a commit signed with this key, read back as `%G? = G` with key `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek`;
  - `git verify-commit` reported a good signature for `implementer@brain-factory`;
  - the repository was then deleted.
- **Why the signing settings are not stored as repo-local config.** This implementation worktree's repository config is the common
  `.git/config` of `C:\Users\DELL\dev\brain-os-factory-cp`, the frozen legacy checkout.
  - A `git config --local` write would configure the legacy checkout too.
  - So would enabling `extensions.worktreeConfig`, which is itself a write to that shared file.
  - Instead, every implementation commit passes `gpg.format`, `user.signingkey`, `commit.gpgsign` and `gpg.ssh.allowedSignersFile` per
    invocation (`git -c …`) to this worktree's git commands.
  - No global, system or shared git configuration was changed; `commit.gpgsign` and `gpg.format` are set nowhere.
- **Coverage:** every commit in `8f9833ce..<candidate>` is checked with `git verify-commit` before the candidate notice.
- **What this key is not.** It signs implementer commits only. It is NOT production release-signing authority; C-3 (production
  release-signing key custody) remains UNRESOLVED / FOUNDER-GATED, and no release trust root is derived from this key (S-5).
