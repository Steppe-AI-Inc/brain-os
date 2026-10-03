# IMPLEMENTATION PROPOSAL — NOT A CANDIDATE

Auto-Enrollment V1, successor preparation: the system-managed release signer and the founder's password authorization of an update
(founder decision of 2026-10-02 UTC, canonicalized by Director r6 as WO-6 revision 3), and the founder's two corrections of
2026-10-03 - the Factory stages each certified release, and every computer takes a published release by itself
(`change-requests/CR-028-factory-staging-and-automatic-node-update.md`). Published by the IMPLEMENTER capability.

## Status

- **Candidate #3 remains untouched.** `95fdb85a` is the certified candidate. `CANDIDATE_NOTICE.md`, `CANDIDATE_REPORT.md`,
  `INVENTORY.md`, `MIGRATION_PRIVILEGES.md`, `predicted_catalog_difference.json`, `compat_matrix.json` and `evidence/` in this
  directory are candidate #3's records. They are not regenerated here and do not describe this proposal.
- **The successor is NOT frozen.** No candidate SHA is named. The proposal is the commits after `047ba31` on this branch, Director r6
  merged in.
- **No deployment occurred.** No Edge Function was deployed and no web change reached production.
- **No live plane changed.** Nothing of this proposal was applied to the Factory project or to Brain OS production. The signer's
  bootstrap has not been run, so no signing key exists and the production trust set
  (`scripts/factory-runner/enrolled/trust/production.json`) is still empty.
- **Director canonicalization of CR-028 is required before the successor is frozen.** Director r6 makes per-release staging a
  founder action, has the founder compare the four values by hand, and has nodes take a published release "by the unchanged path";
  the founder's corrections supersede those three. CR-027 is canonicalized (r6).

**BLOCKED — DIRECTOR: CR-028 canonicalization required.**

## What the proposal contains

- The signer: `scripts/factory-control-plane/release_signer.sql`, applied once before the migration (r6's path: judged by a
  verifier, then applied by the founder with a client that is not implementer-authored). Unchanged since `07140dd`.
- The migration: `v1/000` (one grant on `sign_release` to `factory_owner`), `v1/060` (the authorizing session and entry time on a
  release), `v1/220` (`factory.admin_authorize_update`; the same fresh password entry for a production `publish-release`; the
  update must be the Director-staged one, else `not_staged`), `v1/290` (the Admin API login's grant on that one front door).
- The Admin API: the `authorize-update` operation, the password entry read from the caller's own token, the staged check, the
  signed manifest placed in release storage.
- `factory-release-stage` (new Edge function) and `scripts/factory-build/stage-release.mjs` (the Director's command): a prepared
  update exists only under the Director's signature over its four values.
- The runtime: a computer takes the published release of its channel by itself, through the existing upgrade gate
  (`scripts/factory-runner/enrolled/upgrade.mjs` `takePublished`, `worker.mjs`).
- The web: Brain OS → Factory → Update, which re-reads the Factory's state whatever the answer (AC-5(o)).
- Judging planes: `qa/factory/v1/vault_standin.sql`, then the signer file, before the migration.
- `qa/factory/v1/password_change_probe.mjs`: the non-mutating question to the live Brain OS Auth that S-8's stated limit depends on
  (a test account, never the founder's). Not run.

## Developer verification (targeted, never acceptance)

Run by the implementing session on the tree of the commit that carries this file. It is the implementer's own evidence; nothing here
is independent.

| check | result |
|---|---|
| `qa/scenarios-runner/factory_v1_static_contract.mjs` | 73 passed, 0 failed |
| `qa/factory/v1/schema_acceptance.mjs` | 82/82 |
| `qa/factory/v1/admin_acceptance.mjs` | 46/46 |
| `qa/factory/v1/update_authorization_acceptance.mjs`, through the real Admin API login | 23/23 (UE5, UA12: the staged update) |
| `qa/factory/v1/release_signer_acceptance.mjs` | 12/12 (RS7 with the observer's grants; RS12: two bootstraps, two keys) |
| `qa/factory/v1/release_stage_acceptance.mjs` | 6/6 (new) |
| `qa/factory/v1/gate_acceptance.mjs` | 9/9 (GA7-GA9: the automatic take) |
| `qa/factory/v1/runtime_units.mjs`, `release_trust_unit.mjs`, `installer_input_acceptance.mjs` | 35/35, 8/8, 10/10 |
| web `tsc --noEmit`, `eslint` (the Update panel) | clean |
| `deno check` of the three function entry points | clean |

Last run earlier, not repeated on this tree: `revocation_interleaving.mjs` 30/30 and the Edge boundary suite 8/8 at `07140dd`.
Not run: the mutation and reference campaigns, the package and release suites (they build the installer), the web suite for the
Update page's server action. One independent read-only review of `4ef8556` and its bounded confirmation of `07140dd` are recorded in
the messages of `07140dd` and `e38b2b9`; nothing after `07140dd` was independently reviewed.

## Not done, and waiting on what

- The trust set holds no key: it waits for the judged bootstrap, the founder's application and the Director's record of the key.
- The candidate records named above are not regenerated, and the comments in `scripts/factory-build/` and
  `scripts/factory-runner/` that still speak of a founder-held key are unchanged: they follow the Director's records at the freeze.
- Mutation rows for the new guards and web rows for the Update page: before the freeze.

## Order from here

1. The Director records the founder's corrections (CR-028). In parallel, the r6 bootstrap path: a verifier judges
   `release_signer.sql`, the founder applies it, the Director reads the public key from the plane and records it.
2. The implementer adds exactly those key bytes to the trust set; one successor is frozen and certified once (L4).
3. Independent QA by Home.
