# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-004 — Installer distribution visibility: public bucket or short-lived signed URL**
Filed 2026-09-26 by the implementer. Status: **OPEN — NOT IMPLEMENTED (either choice).**

## Requirement affected

How BrainFactorySetup.exe reaches a clean PC ("download BrainFactorySetup.exe" in the binding flow).

## Observed evidence

- The exe contains no secret. The pairing code is the only enrollment input, and it is one-time, short-lived and HMAC-verified
  server-side.
- A clean PC has no GitHub or Brain OS session.
- The repository (`Steppe-AI-Inc/brain-os`) is private, so a GitHub Release would require a login.

## The two options

| Option | Effect | Tradeoff |
|---|---|---|
| A. Public bucket on the Factory project | Anyone with the link can download the installer | Simplest for a clean PC. The binary itself is public. |
| B. Private bucket; `factory-admin-api` issues a short-lived signed URL to an authenticated founder/holding_admin, who hands it to the PC | Only admins can obtain the binary | One more step for the operator |

Either way, the page shows the sha256 and the signed/unsigned state from `factory.installer_releases`.

## Why the implementer does not choose

Distribution visibility is a security-boundary decision.

## Interim behavior

- `installer/latest` returns the URL recorded in `factory.installer_releases.download_url`, together with the sha256 and the
  signing state.
- Whoever publishes the release at the founder's deploy decides the visibility.
- Nothing is uploaded during this phase (BLOCKED — FOUNDER).

## Compatibility / security impact

None until a release is published.
