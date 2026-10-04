# WO-6 — Release manifest, pinned trust set, signing abstraction and runtime upgrade

- **Binding**, revision 5, issued by the DIRECTOR.
- Contract: §0 (C-3), §1 (Runtime release; the release-signer bootstrap), §2 (Release), §4, §7; S-5, S-7, S-8, S-10, S-12.
- Founder text: II.4, II.11, II.18, II.19, II.20.
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
  - **The founder's update authorization** (II.18, II.19; S-8). Brain OS → Factory → Update shows the prepared update the Director
    staged (S-5; contract §4): the version, source SHA, digest and receipt sha256 of a CERTIFIED candidate's verifier-reproduced
    production-channel artifact. The founder re-enters the existing Brain OS account password and confirms. That one confirmation
    authorizes exactly that update: the Factory then signs, publishes and supersedes automatically, in one transaction, and every
    node takes the published release by itself (contract §2 Release). The authority is the existing founder-only rule (S-8), and the
    confirmation also needs a fresh entry of the founder's own password (S-8); no new role exists for it (II.18), and a
    `profiles.role` alone never suffices. A production release published by any other path needs the same entry. The Admin API
    checks the Director's signature over the staged values and the served installer's digest; the front door signs exactly those
    values, each checked to its fixed format, in the manifest's canonical encoding, which a node parses back to exactly those values,
    and refuses, audited, whatever the Admin API does not report as staged (`not_staged`).
  - **Staging** (II.19; contract §4; S-7). The Director stages each CERTIFIED release through `factory-release-stage`: a statement
    of its four values signed with `director_signing_key` in namespace `brain-factory-prepared-update-v1`, formed and signed with the
    Director's own tooling over the exact values it checked. No implementer-authored program receives or invokes that key, and the
    Director signs a staging statement only for a CERTIFIED release, for the live plane (a staging signature is valid on every plane
    that runs the function). The function checks the signature against the pinned Director key, refuses a statement whose version is
    not newer than the prepared one (the same statement excepted), and writes only the prepared update. Only the request that first
    stages a statement receives the upload address for its installer, and a staged version's installer path only ever holds bytes
    with the staged digest. A signature can stage, never publish.
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
    So the live release candidate contains them in its SHA and is certified with them. Revision 5 records them ("The live trust
    set", below); before it the live trust set was empty and no live-mode release existed.
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
- **Automatic take** (II.19; contract §2 Release). Every node takes its channel's published release by itself, at a heartbeat between
  claims, through the unchanged upgrade gate, unless a Factory admin's adopt pins it; it fetches only from the release storage fixed
  in its artifact (S-5).
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
  - the founder's update authorization: its Admin API front door and the Factory → Update page;
  - the release-stage function and the node's automatic take.

## The live trust set (recorded by revision 5)
The founder applied the release-signer bootstrap on 2026-10-04 (contract §0, §1). The Director then read the signer's public half from
the live plane, read-only, through `factory_signer.public_key()` as a non-owner login, and it equals what the founder's run reported
(ledger event log). The live trust set is exactly this one entry:

| key id | public key (Ed25519, 32 bytes) |
|---|---|
| `ed25519:d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e` | `4iR7Ra54qciQ5xT-xnXEF1E90x415CEIokAMMvZdkrU` (base64url without padding, as `public_key()` returns it); hex `e2247b45ae78a9c890e714fec675c417513dd31e35e42108a2400c32f65d92b5` |

- The key id is `ed25519:` followed by the sha256 of the 32-byte public key.
- The implementer's next candidate adds exactly this entry to the trust-set source, and nothing else. The verifier reads it back as
  (key id, public-key sha256), with the channel and trust mode ("Certified bytes").
- The bootstrap: `scripts/factory-control-plane/release_signer.sql`, sha256
  `333536de52fdfcbf7a5b51a399f142cbae5af35b444d78f10c70c6dd7718450f`, at implementer commit
  `8ac331ffda37456a4afa63c692024016ffb40806` (the file Stage A judged). The founder applied it at 2026-10-04T04:10:11Z by
  `psql -X -1 -v ON_ERROR_STOP=1 -f`, through the Director's founder procedure; the founder's attestation of that path is in the
  event log.
- The referent: the Director's post-bootstrap catalog read,
  `qa/verification/auto-enrollment-v1/LIVE_PLANE_CATALOG_SNAPSHOT_POST_BOOTSTRAP.json` (`snapshot_sha256`
  `f2bc674133cb33eed1d2fc1d1c47718a171b4e08de07c050642612337f0a78f9`), equals the pre-candidate referent plus exactly the difference
  the judged file produces on a judging plane. It is the judging planes' referent from this revision (contract §1, "Observed, then the
  referent"; `VERIFICATION_SPEC.md` §3.3), and every judging plane applies the bootstrap at the sha256 above (contract §1, "Judging
  planes").
- Replacing the signer (the removal step and a new bootstrap, contract §1 "Rejection") needs a new WO-6 revision recording the new key.

## Must satisfy
AC-3, AC-5, AC-7, S-5, S-7, S-8, S-10, S-12, P-9

## Depends on
WO-1, WO-8 (`tenant_admins` and the Factory Admin API, which the update authorization uses).

## Founder boundary
C-3 is decided by the founder (II.18): a Factory-managed release signer. No founder gate remains.
- The implementer builds the release signer and its one-time bootstrap. A verifier judges the bootstrap's file, and the founder then
  applies it (contract §0, §1; it needs no key handling). The implementer never applies it to the live plane and never holds the
  signer's key, an owner-level (signing-equivalent, S-5) credential of the live plane, or the Admin API login.
- The founder applied the bootstrap on 2026-10-04, and revision 5 records the signer's public key (S-5); final acceptance no longer
  waits for either.
- Installer Authenticode signing is a separate founder / external boundary, under WO-4.

## Candidate report must include
- The manifest format and key-id model.
- The verification point in the start path.
- Each refusal case, including outside-trust-set, dev-key on a production-channel build, and a key added through the server.
- The rotation / revocation tests.
- Proof that no code path places private release-signing material anywhere S-5 forbids, and that the signing authority is referenced
  only as the release signer.
- The cases of AC-5(o), (p), (q) and (r).
- The live trust-set entry in the trust-set source, byte-equal to "The live trust set" above.
