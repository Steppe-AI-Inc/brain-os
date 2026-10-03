# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-028 — Two founder corrections to r6 (2026-10-03): the Factory stages each certified release, and every computer takes a
published release by itself. Director r6 still makes per-release staging a founder action, has the founder compare the four values by
hand, and has nodes take a published release "by the unchanged path". (Contract §0, §1, §2, §4; S-5; S-16; WO-6 r3; VERIFICATION_SPEC
final acceptance)**

**This is a CANONICALIZATION request.** The founder's corrections are product decisions and are not submitted for reconsideration.
The Director is asked to record them in the binding texts. The implementer edits no Director text.

- **Written:** 2026-10-03 by the IMPLEMENTER capability, in the implementer namespace. It is filed when
  `factory/auto-enrollment-v1-implementation` carries it (VERIFICATION_SPEC §3.1).
- **Built on:** Director r6 `7f8edf2c703f89799b62b3106c3d6d7397b25b3c` (WO-6 revision 3, text sha256
  `634a4023da9a5df41269d2628dc4dc6147286383b144fc40fbbc3358737bbc80`), merged into the implementation branch.
- **Status of the implementation: IMPLEMENTATION PROPOSAL — NOT A CANDIDATE.** Candidate #3 (`95fdb85a`, CERTIFIED) remains
  untouched; the successor is NOT frozen and no candidate SHA is named; no deployment occurred; no live plane changed; Director
  canonicalization of this request is required before the successor is frozen.

## The founder's corrections (as received by the implementer session; the founder holds the originals)

Message of 2026-10-03, "RESUME SUCCESSOR DEVELOPMENT — TWO PRODUCT CORRECTIONS", the parts that change the contract, verbatim:

> CORRECTION 1 — "UPDATE AUTOMATICALLY". Do not interpret automatic update as only: sign → publish → supersede. Founder product intent
> is: Brain OS → Factory → Update → re-enter existing account password → Confirm → Factory carries the approved update through
> automatically. The founder must not subsequently: manually publish it; manually stage files; manually upgrade each Factory node;
> manually run release-engineering commands. Determine the SMALLEST delta needed to connect the already-existing release/update
> primitives so the approved release proceeds through the required Factory update automatically. Reuse existing upgrade/install
> primitives. Do NOT redesign the update system.
>
> CORRECTION 2 — RELEASE STAGING. Per-release staging is NOT a founder action. Before the Update button becomes actionable, Factory
> must already have the prepared release assets staged and know: candidate SHA; release version; installer/runtime digest;
> certifying receipt; release manifest inputs. Founder interaction begins only at: [ UPDATE ] → password re-entry → Confirm.
> Staging/preparation belongs to Factory.

The same message keeps the one-time signer bootstrap as r6 states it ("A verifier checks the bootstrap bytes before founder
authorization/execution. Do not expand bootstrap beyond what WO-6 r3 now requires"): this request changes nothing about it.

## Director sentences the corrections change

| where | says now (r6) | after the corrections (proposal) |
|---|---|---|
| contract §0, founder boundaries | "the prepared update's staging, per release (S-5): before Factory → Update, the founder places the verifier-reproduced installer and its unsigned manifest, which the Director provides, in the Factory's release storage" | not a founder boundary: the Director stages each certified release through `factory-release-stage`, signed with its signing key |
| contract §4, who may | "staging the prepared update in the Factory's release storage: the founder, per release" | the Director, per certified release, by a statement signed with `director_signing_key` |
| WO-6 r3, founder boundary | "Per release, the founder stages the prepared update in the Factory's release storage" | removed |
| WO-6 r3, update authorization | "shows the prepared update (S-5; the founder stages it, contract §0)" | ...the Director stages it; the front door publishes only the staged values |
| S-5, the prepared update | "before the confirmation the Director gives the founder the certifying receipt's source SHA, reproduced digest and receipt sha256 [...] and the founder confirms only when they match" | the Factory holds that binding: a prepared update exists only under the Director's signature over its four values, and the front door refuses any other values (`not_staged`) |
| contract §0 (C-3 bullet) | "The confirmation installs nothing on any node; nodes take the published release by the unchanged path (WO-6, upgrade and rollback)." | The confirmation installs nothing on any node. Every node takes the published release of its channel by itself at a heartbeat, through the unchanged upgrade gate, unless an admin adopt pins it. |
| contract §2, Release table | (no row) | node on release X → node on the published release Y of its channel: the node itself, at a heartbeat, through the gate; never while an admin adopt pins it |
| contract §2 Release table, "candidate → certified" | "the Director never writes the plane" | the Director records nothing on the plane; its staging writes only the prepared update and the installer to release storage, through `factory-release-stage` |
| S-16 | copied Director-recorded bytes "in two cases only" | the Director's signing key (`director_signing_key.public_key`), pinned in `_shared/release_stage.ts`: a value the Director documents fix (case 1), or a third case |
| VERIFICATION_SPEC §6 | "the release under acceptance is the verifier-reproduced artifact of a CERTIFIED candidate, staged by the founder (contract §0)" | ...staged by the Director through `factory-release-stage` |

## What the preparation does (developer evidence only)

- **Correction 1** (`scripts/factory-runner/enrolled/upgrade.mjs` `takePublished`, `worker.mjs`): at a heartbeat - between claims,
  never while work runs - the worker reads the plane's published release of its channel (the heartbeat already names it). When it is
  not the one running and no admin adopt pins the computer, it fetches that release's installer and signed manifest from the release
  storage compiled into the artifact (`build-sea.mjs` `RELEASE_BASE`; never an address the plane, the manifest or the environment
  names) and offers them to `upgrade()`, the one gate every release switch already uses: the plane's fresh state, the trust set
  pinned in the runtime, the revocations, no silent downgrade, only the published or adopted release. Installed, the worker exits
  SWITCH_RELEASE as for an adopt; the supervisor verifies the release again before it runs it. A release not taken is not fetched
  again for 15 minutes. Rows: `gate_acceptance.mjs` GA7-GA9.
- **Correction 2** (`_shared/release_stage.ts`, new function `factory-release-stage`, `scripts/factory-build/stage-release.mjs`):
  - the Director signs the statement `{"channel":"production","digest","receipt_sha256","source_sha","v":1,"version"}` (canonical
    JSON) with `ssh-keygen -Y sign`, namespace `brain-factory-prepared-update-v1`, using its existing key;
  - the function checks the signature against the pinned key, refuses an older version over a newer prepared one, writes
    `production/prepared.json` (the release tool's unsigned manifest form, unchanged for the page) and `production/prepared.sig`,
    and answers an upload address for that version's installer that never overwrites one that is there;
  - at Confirm the Admin API re-checks the signature (authenticated storage reads) and that the four values asked for are the
    staged ones, and hands the front door `staged` after its body whitelist; `factory.admin_authorize_update` refuses anything else
    409 `not_staged`, audited, before anything is signed;
  - rows: `release_stage_acceptance.mjs` SG1-SG6, `update_authorization_acceptance.mjs` UE5, UA12.
- Nothing here can sign a release, and the release-signer bootstrap file is unchanged (sha256
  `333536de52fdfcbf7a5b51a399f142cbae5af35b444d78f10c70c6dd7718450f`).

## What the canonical record still has to state

None of these reopens the founder's corrections; each is a detail the binding texts must state before a candidate is judged.

1. **Who signs a staged update.** Proposed: the Director's `director_signing_key`, because the Director is the party that certifies;
   the namespace and the statement's form as above.
2. **The pinned key under S-16** (above): case 1, or a third case.
3. **The new Edge function under S-10 and AC-7.** It is public (no Supabase JWT, like the other two), authenticates only by the
   Director's signature, and writes only two release-storage objects and one upload address. It is inside the §3.4 scan scope
   (every Edge source); AC-7's persona matrix does not apply to it as written.
4. **The node's automatic take.** Its rules as above, and its 15-minute retry, are the implementer's reading of "proceeds through
   the required Factory update automatically".
5. **Judging planes.** A production-channel build compiled with the live release storage would, on a judging plane, ask that public
   storage for a release the judging plane published; the gate refuses whatever it gets unless it is signed by a key of the pinned
   trust set. Whether a judging plane must point such a build elsewhere is the Director's to state.

## Known limits (stated, not changed)

- Once staged, the Director's signature is public (`prepared.sig`): sending it again re-stages the same statement, and only that
  (an older one is refused `not_newer`); the installer's path is write-once.
- A holder of the Director's signing key can stage, never publish: publication still needs the founder's session and a fresh
  password entry.
- A computer that cannot take the published release keeps its own, claims nothing (`RELEASE_NOT_CURRENT`) and tries again.
- S-8's stated limit stands: the password entry adds protection beyond the session only while Brain OS Auth refuses a password
  change without the current password. `qa/factory/v1/password_change_probe.mjs` asks the live Auth exactly that (non-mutating,
  with a test account, never the founder's); it has not been run.
- First measured live: the Storage API's signed-upload and authenticated-read routes the function and the Admin API use.

## Impact

- On candidate #3: none.
- On the successor: it is not frozen before the Director's record of these corrections. The release-signer bootstrap path does not
  depend on this request (r6 decides it): judged file, founder application, the Director's record of the public key, the trust
  set; then one candidate, one certification, independent QA.
