# IMPLEMENTATION PROPOSAL — NOT A CANDIDATE

Auto-Enrollment V1, successor preparation: the system-managed release signer and the founder's password authorization of an update
(founder decision of 2026-10-02 UTC). Published by the IMPLEMENTER capability on the founder's instruction of 2026-10-03, together
with `change-requests/CR-027-system-managed-release-signer.md`.

## Status

- **Candidate #3 remains untouched.** `95fdb85a` is the certified candidate. `CANDIDATE_NOTICE.md`, `CANDIDATE_REPORT.md`,
  `INVENTORY.md`, `MIGRATION_PRIVILEGES.md`, `predicted_catalog_difference.json`, `compat_matrix.json` and `evidence/` in this
  directory are candidate #3's records. They are not regenerated here and do not describe this proposal.
- **The successor is NOT frozen.** No candidate SHA is named. The proposal is the commits after `047ba31` on this branch: `82adad4`,
  `ab9dd68`, `4ef8556`, `07140dd`, `e38b2b9`, `13c2ec6`, `1f972d9`, `df6c00b`, `a73499f`, and the commit that carries this file.
- **No deployment occurred.** No Edge Function was deployed and no web change reached production.
- **No live plane changed.** Nothing of this proposal was applied to the Factory project or to Brain OS production. The signer's
  bootstrap has not been run, so no signing key exists and the production trust set
  (`scripts/factory-runner/enrolled/trust/production.json`) is still empty.
- **Director canonicalization of CR-027 is required before the successor is frozen.** The binding WO-6 and the other canonical
  records still describe a founder-held key. The founder's decision supersedes that; recording it is the Director's.

**BLOCKED — DIRECTOR: CR-027 canonicalization required.**

## What the proposal contains

- The signer: `scripts/factory-control-plane/release_signer.sql`, applied once before the migration by the applying login.
- The migration: `v1/000` (one grant on `sign_release` to `factory_owner`), `v1/060` (the authorizing session and entry time on a
  release), `v1/220` (`factory.admin_authorize_update`; the same fresh password entry for a production `publish-release`), `v1/290`
  (the Admin API login's grant on that one front door, added on the founder's explicit authorization).
- The Admin API: the `authorize-update` operation, the password entry read from the caller's own token, the signed manifest placed
  in release storage.
- The web: Brain OS → Factory → Update.
- Judging planes: `qa/factory/v1/vault_standin.sql`, then the signer file, before the migration.
- Suites: `qa/factory/v1/release_signer_acceptance.mjs`, `qa/factory/v1/update_authorization_acceptance.mjs`.
- No file under `scripts/factory-runner/` or `scripts/factory-build/` is changed: the installer verifies as candidate #3 does.

## Developer verification (targeted, never acceptance)

Run by the implementing session on the tree of `a73499f`. It is the implementer's own evidence; nothing here is independent.

| check | result |
|---|---|
| `qa/scenarios-runner/factory_v1_static_contract.mjs` | 73 passed, 0 failed |
| `qa/factory/v1/schema_acceptance.mjs` | 82/82 (C18: the node login executes exactly its 15 operations; C19: the admin login exactly its 24) |
| `qa/factory/v1/admin_acceptance.mjs` | 46/46 |
| `qa/factory/v1/update_authorization_acceptance.mjs`, through the real Admin API login | 21/21 |
| `qa/factory/v1/release_signer_acceptance.mjs` | 11/11 (RS7: both API logins read neither part of the seed and are refused the signer's functions) |

Last run earlier, not repeated on this tree: `revocation_interleaving.mjs` 30/30 and the Edge boundary suite 8/8 at `07140dd`; web
`tsc` and `eslint` clean at `07140dd`.

Not run: the mutation and reference campaigns, the package and release suites, the web suite for the Update page's server action.
One independent read-only review of `4ef8556` and its bounded confirmation of `07140dd` are recorded in the messages of `07140dd`
and `e38b2b9`; nothing after `07140dd` was independently reviewed.

## Not done, and waiting on what

- The trust set holds no key: it waits for the founder's bootstrap and the Director's record of the public key.
- The candidate records named above are not regenerated, and the comments in `scripts/factory-build/` and
  `scripts/factory-runner/` that speak of a founder-held key are unchanged: they wait for the Director's wording.
- Mutation rows for the new guards and web rows for the Update page: before the freeze, not before.

## Order from here

1. The Director records the founder-approved model (CR-027) in the binding WO-6 and the applicable canonical records.
2. The founder runs the signer's one-time bootstrap.
3. The Director records the signer's public key; the implementer adds exactly those bytes to the trust set.
4. One successor is frozen, certified once, and goes to independent QA.
