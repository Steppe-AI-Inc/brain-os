# Artifact Relay V0 — the install by hand (recovery only)

The install is one command: `.\relay\install.ps1` (README). This page is what that command does, written out, for the case where
it cannot be used. Everything here is done by the founder, on the dedicated NON-PRODUCTION Factory control plane only.

## What the install changes, and nothing else

| object | added by |
|---|---|
| schema `factory_relay` (5 tables, their indexes and triggers, its functions) | `sql/001_artifact_relay_v0.sql` |
| function `public.factory_relay_rpc(jsonb)`, executable by `service_role` only | `sql/001_artifact_relay_v0.sql` |
| storage bucket `factory-private-artifacts`, private, 2 MiB per object | `sql/002_private_bucket.sql` |
| two rows in `factory_relay.nodes` | `sql/010_register_nodes.template.sql` |
| Edge Function `factory-artifact-relay`, JWT verification off, with a `registry.ts` of the same two nodes | `supabase/functions/factory-artifact-relay/` |

No role, no extension, no secret, no storage policy, and no change to an existing object. `sql/001` refuses to install twice, and
before it commits it checks that no role but `service_role` reaches anything of the relay.

## Before anything is applied: the Director's record

The Director's acceptance text (AC-10, S-11) compares the live plane with its pre-candidate snapshot and treats every difference
as a finding against each noticed candidate, unless the ledger event log records it as a founder-approved change. The relay adds
objects to that plane. So that they are never read as a finding, the Director records the founder's approval **before** its next
read of the plane; the installer refuses to run until the event log names the relay commit. The entry names only what it
approves; a text the Director can adapt:

> Founder-approved change to the live Factory plane (founder decision 2026-10-01, "close private artifact handoff gap"), outside
> every candidate: Artifact Relay V0 at relay commit `<relay commit>`. Approved, and nothing else: the schema `factory_relay` with
> the objects `sql/001_artifact_relay_v0.sql` (sha256 `<sha256>`) creates in it; the function `public.factory_relay_rpc(jsonb)`;
> the storage bucket `factory-private-artifacts` and the objects in it; the Edge Function `factory-artifact-relay`. It adds no
> role, extension, secret or storage policy and changes no existing object.

## By hand

Check the files first, in a checkout of this branch at the relay commit: `sha256sum -c MANIFEST.sha256`. Each SQL file is run
whole, as the database owner login (`postgres`); the check files and the registration are one statement each, so an editor that
shows only the last result shows all of their lines. If a file stops with an error, run `rollback;` once before anything else.

1. **Pre-check (read-only).** `sql/000_precheck.sql`. Its first eight lines each read `ok`; the lines after them list the
   Factory's nodes.
2. **Install.** `sql/001_artifact_relay_v0.sql`: one transaction, everything or nothing.
3. **Bucket.** `sql/002_private_bucket.sql`. Add no policy.
4. **Authorize the two nodes.** Put the two node ids and the two public keys into `sql/010_register_nodes.template.sql` and run
   it: one statement, both nodes or neither. Each line of its answer says what the Factory records about that node.
5. **Post-check (read-only).** `sql/003_postcheck.sql`. Its first seven lines each read `ok`; the lines after them are the two
   registered nodes.
6. **Function.** In a copy of `supabase/`, replace `functions/factory-artifact-relay/registry.ts` with the two registrations of
   step 4 (the form `relay/install.mjs` writes: one `{ node_id, relay_role, public_key }` per node), then from the directory that
   contains that `supabase/`:

   ```
   npx supabase functions deploy factory-artifact-relay --project-ref <project ref> --no-verify-jwt --use-api
   ```

   The function reads only what the platform injects into every function; set no secret. A function deployed with the committed,
   empty `registry.ts` authenticates nobody.

After step 6 each node's `node relay/relay.mjs selfcheck` answers `REGISTERED`.

## What a wrong answer means

| answer | meaning |
|---|---|
| `NOT READY not_authenticated [401]` | this node, or this key, is not in the function's registry or not registered in the database |
| `NOT READY not_found [404]` | the function is reached under a path it does not serve |
| `NOT READY not_a_relay_answer (...) [401]` | the gateway answered, not the function: JWT verification is still on for it |
| `NOT READY not_a_relay_answer (...) [404]` | no function is deployed under that name, or the node was given another address |
| `NOT READY bucket_missing` / `bucket_not_private` / `storage_policy_present` / `storage_rls_off [503]` | the bucket is not private as required; the relay refuses everything until it is |
| `NOT READY relay_misconfigured [503]` | the platform injected no project key into the function |
| `NOT READY relay_error [500]` | the function could not reach the database entry; the function's log names the status it got. `the database answered 404` right after the install means the API has not yet seen the new function: run `notify pgrst, 'reload schema';` once. |

## Keeping a bundle past its retention, revoking a node, removing the relay

```
select factory_relay.preserve('<artifact id>', true);        -- keep the bytes as certification evidence
select factory_relay.deactivate_node('<node id>');           -- refused from its next request on; that registration and key never come back
```

Removal is `.\relay\install.ps1 -Uninstall`. By hand: export the receipts if they are evidence (`sql/099` says how), delete the
function `factory-artifact-relay`, run `sql/098_remove_empty_bucket.sql` (it refuses while the bucket holds an object), run
`sql/099_remove_artifact_relay_v0.sql`, and have the Director record the removal.
