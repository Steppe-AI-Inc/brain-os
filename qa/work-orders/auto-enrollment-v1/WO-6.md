# WO-6 — Release manifest, pinned trust set, signing abstraction and runtime upgrade

- **Binding**, revision 3, issued by the DIRECTOR.
- Contract: §0 (C-3), §1 (Runtime release; the release-signer bootstrap), §2 (Release), §4, §7; S-5, S-8, S-12.
- Founder text: II.4, II.11, II.18.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **Manifest.** Source SHA / version, artifact digest, signing key id, signature, and the hash of the Director receipt that certified
  the candidate.
- **Publishing and status.**
  - The release lifecycle is exactly contract §2's Release table.
  - Publishing, superseding and revoking a release are **founder-only** per S-8 (tier `founder` in `tenant_admins` and live role
    founder; CR-003). No Admin API or server path adds a trust key.
  - **The founder's update authorization** (II.18; S-8). Brain OS → Factory → Update shows the prepared update (S-5; the founder
    stages it, contract §0): the version,
    source SHA, digest and receipt sha256 of a CERTIFIED candidate's verifier-reproduced production-channel artifact. The founder
    re-enters the existing Brain OS account password and confirms. That one confirmation authorizes exactly that update: the Factory
    then signs, publishes and supersedes automatically, in one transaction (contract §2 Release), and installs nothing on any node
    (contract §0). The authority is the existing founder-only rule (S-8), and the confirmation also needs a fresh entry of the
    founder's own password (S-8); no new role exists for it (II.18), and a `profiles.role` alone never suffices. A production release
    published by any other path needs the same entry. The front door signs exactly the four values it receives, each checked to its
    fixed format, in the manifest's canonical encoding, which a node parses back to exactly those values; comparing them with the
    values the page showed is the page's job, and a mismatch is refused by name.
- **Release signer** (C-3, decided by the founder: II.18; S-5). The production release signer is Factory-managed:
  - the live plane generates its Ed25519 key itself inside the founder's release-signer bootstrap (contract §1), from the server's
    cryptographically secure random source (S-5); its private material stays inside the trusted server-side Factory boundary (S-5),
    no function returns it, and it is never anywhere S-5 forbids;
  - it signs exactly as RFC 8032 specifies, and only the production manifest it builds itself from a release's version, source SHA,
    digest and receipt sha256, inside a founder-authorized publication;
  - only its public key and key id leave the boundary;
  - the founder never generates, stores, copies, fingerprints or uses the release-signing key, and never signs a manifest by hand.
- **Certified bytes.**
  - The artifact is **reproducible**: the verifier rebuilds it from the CERTIFIED candidate SHA and obtains the same digest.
  - The manifest's digest must equal the receipt's reproduced digest.
  - Every build input is pinned: the base Node executable by version and sha256, tool versions by lockfile, and no network fetch of an
    unpinned input.
  - The trust set is embedded in the artifact. Each entry is (key id, public key); the key id is the key's fingerprint or bound to it
    one-to-one, and no key id is shared by two keys. The verifier reads back every entry as (key id, public-key sha256), with the
    channel and trust mode.
  - The digest is the PE Authenticode image hash (S-5). The production-channel artifact's digest is the one the founder authorizes
    and the release signer signs; a dev-channel digest is recorded separately.
  - **The live trust set (the release signer's public key) is a source input.** After the founder's bootstrap the Director reads the
    public key from the live plane, read-only, and a WO-6 revision records it and its key id; the implementer's next candidate adds
    exactly those bytes to the trust-set source (S-5; under S-16 they are a Director input, and the Director authors no product code).
    So the live release candidate contains them in its SHA and is certified with them. Until that revision the live trust set is
    empty and no live-mode release exists.
- **Pinned trust set.** A node verifies the manifest signature and the artifact digest **before execution**, against a **trust set
  pinned on the node**, never against a key named by the manifest or the API. Refused by name:
  - unsigned;
  - tampered (one byte);
  - revoked key;
  - revoked release;
  - correctly signed by a key outside the trust set.
- **Channel separation.**
  - Test / dev keys are trusted only on disposable planes; the live plane has no dev channel.
  - **The trust set and the trust mode are fixed in the artifact at build time, per release channel.** Nothing received at runtime adds
    a key or changes the mode: not an API response, the plane's identity or URL, pairing, the manifest, the environment or a
    configuration file. The API may deliver revocations only.
  - A **production-channel** artifact, the only kind a live-plane node installs, has no dev mode: it trusts only the live trust set
    (the release signer's key) and **refuses a dev-key signature**. A disposable plane tests it by installing a production-channel
    build.
  - No key the implementer generated or holds is ever a trust root on the live plane.
  - Refusal happens **before execution**. A sentinel payload in a refused artifact never runs.
- **Upgrade and rollback.** Runtime upgrade plumbing exists. Adopting the previous certified release is its inverse, and a node never
  silently downgrades.
- **Stamping.** The release a node runs is stamped on the node, every run and every checkpoint.
- **What the implementer completes** (II.11, II.18):
  - the signing abstraction;
  - test / dev signing;
  - the key-id model;
  - verification;
  - rotation / revocation mechanics;
  - release manifest semantics;
  - the release signer and its one-time bootstrap, prepared for the founder and never applied to the live plane by the implementer;
  - the founder's update authorization: its Admin API front door and the Factory → Update page.

## Must satisfy
AC-3, AC-5, AC-7, S-5, S-8, S-12, P-9

## Depends on
WO-1, WO-8 (`tenant_admins` and the Factory Admin API, which the update authorization uses).

## Founder boundary
C-3 is decided by the founder (II.18): a Factory-managed release signer. No founder gate remains.
- The implementer builds the release signer and its one-time bootstrap. A verifier judges the bootstrap's file, and the founder then
  applies it (contract §0, §1; it needs no key handling). The implementer never applies it to the live plane and never holds the
  signer's key, an owner-level (signing-equivalent, S-5) credential of the live plane, or the Admin API login.
- Per release, the founder stages the prepared update in the Factory's release storage (contract §0; no key handling).
- Final acceptance waits for the bootstrap and the Director's WO-6 revision recording the signer's public key (S-5).
- Installer Authenticode signing is a separate founder / external boundary, under WO-4.

## Candidate report must include
- The manifest format and key-id model.
- The verification point in the start path.
- Each refusal case, including outside-trust-set, dev-key on a production-channel build, and a key added through the server.
- The rotation / revocation tests.
- Proof that no code path places private release-signing material anywhere S-5 forbids, and that the signing authority is referenced
  only as the release signer.
- The cases of AC-5(o) and AC-5(p).
