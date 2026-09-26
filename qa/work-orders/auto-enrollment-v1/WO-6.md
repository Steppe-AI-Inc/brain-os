# WO-6 — Release manifest, pinned trust set, signing abstraction and runtime upgrade

- **Binding**, revision 1, issued by the DIRECTOR.
- Contract: §1 (Runtime release); S-5.
- Founder text: II.4, II.11.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **Manifest.** Source SHA / version, artifact digest, signing key id, signature, and the hash of the Director receipt that certified
  the candidate.
- **Publishing and status.**
  - The release lifecycle is exactly contract §2's Release table.
  - Publishing, superseding and revoking a release are **founder-only** (tier `founder`; CR-003). No Admin API or server path adds a
    trust key.
- **Certified bytes.**
  - The artifact is **reproducible**: the verifier rebuilds it from the CERTIFIED candidate SHA and obtains the same digest.
  - The manifest's digest must equal the receipt's reproduced digest.
  - Every build input is pinned: the base Node executable by version and sha256, tool versions by lockfile, and no network fetch of an
    unpinned input.
  - The trust set is embedded in the artifact. Each entry is (key id, public key); the key id is the key's fingerprint or bound to it
    one-to-one, and no key id is shared by two keys. The verifier reads back every entry as (key id, public-key sha256), with the
    channel and trust mode.
  - The digest is the PE Authenticode image hash (S-5). The production-channel artifact's digest is the one the founder signs; a
    dev-channel digest is recorded separately.
  - **The live trust set (the founder's public keys) is a source input.** It is committed only after C-3, by a Director-recorded
    change, so the live release candidate contains it in its SHA and is certified with it. Before C-3 the live trust set is empty and
    no live-mode release exists.
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
  - A **production-channel** artifact, the only kind a live-plane node installs, has no dev mode: it trusts only the founder's keys
    and **refuses a dev-key signature**. A disposable plane tests it by installing a production-channel build.
  - No key the implementer generated or holds is ever a trust root on the live plane.
  - Refusal happens **before execution**. A sentinel payload in a refused artifact never runs.
- **Upgrade and rollback.** Runtime upgrade plumbing exists. Adopting the previous certified release is its inverse, and a node never
  silently downgrades.
- **Stamping.** The release a node runs is stamped on the node, every run and every checkpoint.
- **What the implementer completes** (II.11):
  - the signing abstraction;
  - test / dev signing;
  - the key-id model;
  - verification;
  - rotation / revocation mechanics;
  - release manifest semantics.

## Must satisfy
AC-3, AC-5, S-5, P-9

## Founder gate inside this WO: C-3, production release-signing key custody (the only founder gate)
- The implementer **must not choose, create or use the real production signing authority.** It states only the **interface** a
  production key must satisfy (algorithm, key-id format, rotation), without naming a custody option, provider or key.
- Final acceptance waits for C-3.
- Installer Authenticode signing is a separate founder / external boundary, under WO-4.

## Candidate report must include
- The manifest format and key-id model.
- The verification point in the start path.
- Each refusal case, including outside-trust-set, dev-key on a production-channel build, and a key added through the server.
- The rotation / revocation tests.
- Proof that no production key material or authority is referenced.
