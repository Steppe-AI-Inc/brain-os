# Artifact Relay V0

Moves one private candidate bundle from the implementer's Factory node to the verifier's Factory node: privately, with receipts,
and with the verifier checking everything itself before a single file is extracted. The contract is
[`ARTIFACT_RELAY_V0.md`](ARTIFACT_RELAY_V0.md).

This branch is the relay and nothing else. It shares no file and no history with any candidate, and it holds no private material:
every bundle in its tests is throwaway content signed by a throwaway key.

## Install: one command, run by the founder

```
.\relay\install.ps1 -Plan     # prints exactly what would change; needs no token and touches nothing
.\relay\install.ps1           # the install; safe to run again
```

It asks for a Supabase access token without echo (or takes `SUPABASE_ACCESS_TOKEN`), uses it for this one run and stores it
nowhere. The token must be able to run SQL and deploy a function on the Factory non-production project; a fine-grained,
short-lived token limited to that project is enough. The installer changes that one project and has no option that names another.

In order, stopping at the first thing that is not as it must be:

1. this checkout: a clean tree at a commit signed by the implementer key, every file equal to `MANIFEST.sha256`
2. the verifier's registration: a Director-signed commit on top of this exact commit (below)
3. the Director's record of the founder-approved change, so that the install is never read as a finding against a candidate
4. pre-check (read-only)
5. the schema `factory_relay` and `public.factory_relay_rpc(jsonb)`, in one transaction
6. the private bucket `factory-private-artifacts`
7. the two registrations: this node as sender, the Director's node as verifier
8. post-check (read-only)
9. the Edge Function `factory-artifact-relay`, JWT verification off, deployed with the same two registrations
10. a selfcheck from this node through the deployed function

and then one line: `ARTIFACT RELAY V0 INSTALL: PASS` or `FAIL`, and a receipt (`install-receipt.json`) that holds no secret.
It never asks for, reads or prints the project's API keys. `.\relay\install.ps1 -Uninstall` removes what it installed.

[`FOUNDER_STEP.md`](FOUNDER_STEP.md) is the same install by hand, for recovery only.

## The verifier publishes its key

The verifier's private key is made on the verifier and never leaves it. Its public half reaches the install as one signed commit,
so nobody has to carry it. On the verifier, in a clone of this branch at the relay commit:

```
git switch -c factory/artifact-relay-v0-verifier <the relay commit>
node relay/relay.mjs keygen --node <the verifier's Factory node id> --role verifier --url https://<project ref>.supabase.co/functions/v1/factory-artifact-relay
node relay/relay.mjs registration            # writes registrations/verifier.json
git add registrations/verifier.json
git commit -m "Artifact Relay V0: verifier registration"       # signed with the Director signing key
git push origin factory/artifact-relay-v0-verifier
```

The installer accepts it only as exactly that: one commit, signed by the Director key, whose parent is the relay commit being
installed, adding exactly `registrations/verifier.json`.

## On a node

The sender, with the archive and its `.sha256` and `.sha256.sig` next to it:

```
node relay/relay.mjs keygen --node <factory node id> --role sender --url https://<project ref>.supabase.co/functions/v1/factory-artifact-relay
node relay/relay.mjs send --archive <dir>/CANDIDATE2_HANDOFF_c667367.zip --candidate <40-hex candidate sha> --fingerprint SHA256:<the signing identity>
node relay/relay.mjs status
```

The verifier:

```
node relay/relay.mjs selfcheck      # REGISTERED once the install has run
node relay/relay.mjs receive --trust-fingerprint SHA256:<the signing identity this verifier trusts> --intake-dir <an absolute private directory> --wait 60
```

`receive` downloads the three files, confirms they are the recorded bytes (DELIVERED), runs the five checks in memory (the
implementer's detached signature, the archive sha256, safe archive paths, the exact file set, the internal `SHA256SUMS`), and only
then writes the verified bytes into a new directory under the intake directory (VERIFIED, CONSUMED). On a failed check it writes a
REFUSED receipt with the check's name and extracts nothing. The intake directory holds:

```
<intake>/CANDIDATE2_HANDOFF_c667367_<artifact id>/
  bundle/        the files of the archive, as verified
  delivered/     the three delivered files, untouched
  INTAKE.json    the record, the checks, the hashes
  RECEIPTS.json  the receipts as they stood at CONSUMED
```

### What the node command does on the machine it runs on

It reads and writes two places: its own directory (`~/.brain-factory-relay`, or `RELAY_HOME`) holding the node's key and settings,
and, on the verifier, the intake directory (`registration` also writes the one file it names). It starts no process. It opens one
connection: the relay address it was given. It refuses an address that is not https, an intake directory inside a git work tree,
and one inside a cloud-synced folder.

### Checking a delivery without this code

The verifier does not have to take this code's word. The three delivered files are kept as they arrived:

```
cd <intake>/CANDIDATE2_HANDOFF_c667367_<artifact id>/delivered
ssh-keygen -Y check-novalidate -n file -s CANDIDATE2_HANDOFF_c667367.zip.sha256.sig < CANDIDATE2_HANDOFF_c667367.zip.sha256    # prints the signing key's fingerprint
sha256sum -c CANDIDATE2_HANDOFF_c667367.zip.sha256
```

and `node relay/relay.mjs verify-local --archive ... --candidate ... --trust-fingerprint ...` runs the five checks on local files
with no relay at all.

## What is where

| path | what |
|---|---|
| `relay/install.ps1`, `relay/install.mjs` | the installer |
| `relay/relay.mjs`, `relay/lib/` | the node command. Node 18 or later, no dependency. |
| `supabase/functions/factory-artifact-relay/` | the boundary: the only place the project's key exists. `registry.ts` is empty as committed; the installer writes the two registrations into the deployed copy. |
| `sql/001`, `sql/002` | the schema and the bucket |
| `sql/000`, `sql/003`, `sql/020`, `sql/021` | read-only checks |
| `sql/010` | the registration statement |
| `sql/098`, `sql/099` | removal |
| `test/` | the proofs |
| `MANIFEST.sha256` | the sha256 of every file above that is applied, deployed or run |

## The proofs

```
RELAY_TEST_MODULES=<a node_modules that holds embedded-postgres and pg> node test/all.mjs --mutation --frozen
```

| proof | what it runs on |
|---|---|
| `harness_proof` | the proofs' own harness: how a mutation proof judges a mutant, and that every script parses |
| `sql_acceptance` | the install, as the function calls it, on a disposable PostgreSQL dressed like the project, with a decoy schema ahead of `pg_catalog` |
| `bundle_acceptance` | the verifier's checks, against every bundle they must refuse |
| `boundary_proof` | the function's authentication: every request that must be refused, with a spy on the function's only way out |
| `e2e` | the node command, the function's own code (inside Node, then under Deno), the database half, and a stand-in for the project's REST and Storage routes |
| `install_acceptance` | the installer, against a stand-in for the management API and the Supabase CLI, in a throwaway signed repository |
| `sql_mutation`, `bundle_mutation`, `boundary_mutation`, `e2e_mutation`, `install_mutation` | each rule removed in turn; the acceptance must go red |

None of them touches a real project. What only the founder's install measures is listed in the contract, section 7.
