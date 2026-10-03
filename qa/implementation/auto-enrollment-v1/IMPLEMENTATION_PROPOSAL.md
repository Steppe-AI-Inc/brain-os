# IMPLEMENTATION PROPOSAL — NOT A CANDIDATE

Auto-Enrollment V1, successor preparation: the system-managed release signer and the founder's password authorization of an update
(founder decision of 2026-10-02 UTC; Director r6, WO-6 revision 3), and the founder's two corrections of 2026-10-03 - the Director
stages each certified release, and every computer takes a published release by itself (CR-028; Director r7, WO-6 revision 4, text
sha256 `337882be317e8a40a996cfe30064f209838325b75c8dc5748c61fd5a209e8c53`). Built against Director r7, merged into this branch.

## Status

- **Candidate #3 remains untouched.** `95fdb85a` is the certified candidate. `CANDIDATE_NOTICE.md`, `CANDIDATE_REPORT.md`,
  `INVENTORY.md`, `MIGRATION_PRIVILEGES.md`, `predicted_catalog_difference.json`, `compat_matrix.json` and `evidence/` in this
  directory are candidate #3's records. They are not regenerated here and do not describe this proposal.
- **The successor is NOT frozen.** No candidate SHA is named. The proposal is the commits after `047ba31` on this branch.
- **No deployment occurred.** No Edge Function was deployed and no web change reached production.
- **No live plane changed.** Nothing of this proposal was applied to the Factory project or to Brain OS production. The release
  signer's bootstrap file (sha256 `333536de52fdfcbf7a5b51a399f142cbae5af35b444d78f10c70c6dd7718450f`, unchanged since `07140dd`) is
  judged BOOTSTRAP FILE — VERIFIED (Director r7's Stage A record, 33/33) and is not applied yet; the production trust set
  (`scripts/factory-runner/enrolled/trust/production.json`) is still empty.
- **CR-027 and CR-028 are canonicalized** (r6, r7). The r7 texts are reconciled here (below).

**BLOCKED — the one-time signer bootstrap** (the founder applies the verified file; the Director records the public key in WO-6).

## What the proposal contains

- The signer: `scripts/factory-control-plane/release_signer.sql`, applied once before the migration by the path contract §0 names.
- The migration: `v1/000` (one grant on `sign_release` to `factory_owner`), `v1/060` (the authorizing session and entry time on a
  release), `v1/220` (`factory.admin_authorize_update`; the same fresh password entry for a production `publish-release`; an update
  that is not the staged one is `not_staged`), `v1/290` (the Admin API login's grant on that one front door).
- The Admin API: the `authorize-update` operation; the password entry read from the caller's own token; the staged check - the
  Director's signature over the four values, and the installer at the staged path having the staged digest (`_shared/pe_image.ts`,
  the runtime's digest); the signed manifest placed in release storage.
- `factory-release-stage` (new Edge function): a prepared update exists only under the Director's signature over its four values; only
  the request that first stages a statement receives its installer's upload address. The Director stages with its own tooling.
- The runtime: a computer takes the published release of its channel by itself, through the existing upgrade gate
  (`scripts/factory-runner/enrolled/upgrade.mjs` `takePublished`, `worker.mjs`), reading at most 256 MiB.
- The web: Brain OS → Factory → Update, which re-reads the Factory's state whatever the answer (AC-5(o)).
- Judging planes: `qa/factory/v1/vault_standin.sql`, then the signer file, before the migration.
- `qa/factory/v1/password_change_probe.mjs`: the non-mutating question to the live Brain OS Auth that S-8's stated limit depends on
  (a test account, never the founder's). Not run: BLOCKED — TEST ACCOUNT REQUIRED (r7).

### The r7 reconcile (founder's instruction of 2026-10-04, "reconcile r7 now")

- The Admin API itself checks the installer at the staged path (absent, or another digest: `not_staged`) - WO-6 r4, contract §2.
- `scripts/factory-build/stage-release.mjs` is removed: no implementer-authored program receives or invokes the Director's key -
  WO-6 r4, contract §4. FOUNDER_PREPARED_STEPS step 7.3 states the statement the Director's own tooling signs and sends.
- `factory-release-stage` answers a statement sent again `already`, with no upload address - S-7, AC-5(q).

## Developer verification (targeted, never acceptance)

Run by the implementing session on the trees named. It is the implementer's own evidence; nothing here is independent.

| check | tree | result |
|---|---|---|
| `qa/factory/v1/release_stage_acceptance.mjs` | the r7 reconcile | 7/7 (SG3, SG6: no address for a re-send; SG4: the installer check; SG7: the digest equals the runtime's); removing either new guard fails it |
| `qa/scenarios-runner/factory_v1_static_contract.mjs` | the r7 reconcile | 73 passed, 0 failed |
| `deno check` of the three function entry points and the staging modules | the r7 reconcile | clean |
| `qa/factory/v1/schema_acceptance.mjs`, `admin_acceptance.mjs` | `8ac331f` | 82/82, 46/46 |
| `qa/factory/v1/update_authorization_acceptance.mjs`, through the real Admin API login | `8ac331f` | 23/23 |
| `qa/factory/v1/release_signer_acceptance.mjs` | `8ac331f` | 12/12 |
| `qa/factory/v1/gate_acceptance.mjs`, `runtime_units.mjs`, `release_trust_unit.mjs`, `installer_input_acceptance.mjs` | `8ac331f` | 9/9, 35/35, 8/8, 10/10 |
| web `tsc --noEmit`, `eslint` (the Update panel) | `8ac331f` | clean |

The r7 reconcile changes only `_shared/release_stage.ts`, `_shared/pe_image.ts`, the Admin API entry point's wiring, the removed
command and the staging suite; the suites on `8ac331f` do not load those paths (the authorization suite injects the staged check).
Not run: the mutation and reference campaigns, the package and release suites (they build the installer), the web suite for the
Update page's server action - all part of the one L4 run on the frozen SHA.

## Order from here

1. The founder applies the verified bootstrap file by contract §0's path; the Director reads the public key from the live plane and
   records it in a WO-6 revision.
2. The implementer reconciles that Director revision and adds exactly the recorded key to the production trust set; the remaining
   affected L3 checks run.
3. The password-change probe's prerequisite (a Brain OS test account) is resolved and the probe runs.
4. The Work PC is restarted; ONE successor SHA is frozen; ONE L4 certification runs; the frozen successor goes to Home.
