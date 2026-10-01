# ARTIFACT RELAY V0 — feature contract (founder decision, 2026-10-01)

A bounded bootstrap capability. It moves one private candidate bundle (an archive, its `.sha256` and its detached signature) from the
implementer's Factory node to the verifier's Factory node, privately and with receipts. It is not a file store.

It lives outside every candidate. This branch shares no file and no history with a candidate, the relay's database objects live in
their own schema, and no candidate role holds a privilege on them. The relay never decides who verifies: the founder approves one
install that registers the two nodes, and the code only enforces that registration.

## 1. Canonical state

| thing | where | what it is |
|---|---|---|
| relay node | `factory_relay.nodes`, and the deployed function's `registry.ts` | a Factory node id, its relay role (`sender` or `verifier`) and its Ed25519 public key. Written only by the founder's install. At most one active node per role, one registration per node, one node per key. Both places must agree for a node to be served. |
| artifact | `factory_relay.artifacts` | `artifact_id`, `candidate_sha`, `sender_node_id`, `recipient_node_id`, `sender_signing_fingerprint`, `archive_sha256`, `object_path`, `created_at`, `expires_at`, `delivery_state` (plus the archive's name and size, and `preserved_as_evidence`) |
| artifact file | `factory_relay.artifact_files` | the three objects of an artifact: the archive, `<archive>.sha256`, `<archive>.sha256.sig`, each with its declared size, sha256 and object path |
| receipt | `factory_relay.receipts` | one row per state change: append-only, chained per artifact, carrying the action and request its actor signed and that actor's registered key |
| request | `factory_relay.requests` | one row per accepted request: the replay guard |
| bytes | the PRIVATE bucket `factory-private-artifacts` | the three objects, under `candidate/<candidate_sha>/<artifact_id>/` |

## 2. State machine (`delivery_state`)

```
CREATED --(the sender stored all three files)--> UPLOADED --(the recipient holds the recorded bytes)--> DELIVERED
DELIVERED --(the recipient's checks pass)--> VERIFIED --(the recipient extracted and began intake)--> CONSUMED
DELIVERED --(a check fails)--> REFUSED            VERIFIED --(the recipient declines)--> REFUSED
CREATED | UPLOADED | DELIVERED | VERIFIED --(expires_at passed, not preserved)--> EXPIRED
```

- CONSUMED, REFUSED and EXPIRED are final. Every transition writes exactly one receipt. No other transition exists.
- A REFUSED or EXPIRED artifact does not block a new delivery of the same archive. A live or CONSUMED one does: sending again is the
  same artifact.
- After `expires_at` the bytes are deleted and a `PURGED` receipt is written, unless the founder marked the artifact
  `preserved_as_evidence`. A preserved artifact does not expire at all.

## 3. The boundary: what stands in place of the gateway's JWT check

The function is deployed with the gateway's JWT verification **off**, because a node holds no project key. The function is then the
whole of the authentication. It is written in two parts that cannot be mixed up (`relay.ts`):

- `authenticate()` is given the request, the registry and the time, and nothing else. It is handed no address, no key and no way
  to call out, so nothing privileged can happen before it accepts a request.
- `relay()` runs only for a request `authenticate()` accepted. It is the only code that holds the project's key.

A request is accepted only when all of this holds; the first seven are checked with no call out of the function at all:

| what must hold | where it is checked |
|---|---|
| the method is POST, on the relay's one route | `authenticate()` |
| the node is registered (the function's own registry) | `authenticate()` |
| that node's registered key signed the canonical request: the method, the action, the node, the time, the nonce, the sha256 of the body | `authenticate()` |
| the time is within five minutes | `authenticate()`, and again by the database entry |
| the action is one of the eight, it is the signed one, and it is the action of the body | `authenticate()` |
| the node's registered role may ask for that action (sender: create, upload; verifier: inbox, download, receipt) | `authenticate()`, and again by the database entry |
| what the action needs is present and well formed (an artifact id, a file kind, a state, the content) | `authenticate()` |
| the node and that very key are registered **and not revoked** | the database entry, first thing |
| the nonce was never seen from that node | the database entry |
| the artifact is bound to that node as its sender or its recipient | the database entry |

The database entry (`factory_relay.rpc`, reached only as `service_role`) is the first call `relay()` makes and the only one a
refused request ever makes; a refusal there changes nothing. Storage is reached only after it accepted the request.

There is no other way in. The function reads six request headers and no other: no bearer token, no API key, no cookie. No node
ever receives the project's key, a database credential, a storage credential or a signed URL.

## 4. Invariants and the rows that hold them

| # | invariant | rows |
|---|---|---|
| 1 | **The bucket is private.** Every relay operation refuses while the bucket is missing or public, while row level security is off on `storage.objects`, or while any policy exists there. | S06 S07 S08 E44 |
| 2 | **A node holds nothing of the platform.** It holds its own relay key and settings. The project's key exists only inside the Edge Function, which takes it from what the platform injects; the relay adds no secret. No answer carries a credential, a platform address or a signed URL. The installer never reads the project's keys. | E15 E16 E17 E46 I10 |
| 3 | **Every request is refused before any privileged work unless section 3 holds.** | N-* (90 requests, each with 0 calls out of the function), P-control P-pure P-headers P-order, D-* (one call to the entry, none to storage), E21 E22 S13 S36 S37 |
| 4 | **The sender is the registered sender; the recipient is the registered verifier.** A sender cannot name a recipient. Only the bound recipient lists, downloads or receipts an artifact; for any other node the artifact does not exist. The registration registers both nodes or neither, and only nodes the Factory knows. | S09 S14 S15 S22 S23 S34 E20 D-wrong-recipient D-enumeration |
| 5 | **The relay stores only what was declared, once.** A file's size and sha256 must equal the values declared at `create`. An object is never overwritten, and an object that already sits on an artifact's path is adopted only if it is the declared bytes. | S19 S20 S21 E41 E42 E45 |
| 6 | **Receipts are immutable.** No path updates or deletes one and a trigger refuses both, for the owner too. Each is chained to the one before and carries the action and request its actor signed; a reader checks both. | S24 S27 E13 E35 |
| 7 | **Nothing else can use the relay.** `PUBLIC`, `anon`, `authenticated` and `factory_runner` hold no privilege on the schema, its tables or its functions. `service_role` can execute the one entry function and nothing else. Row level security is on with no policy. The install and every relay function resolve names in `pg_catalog` only: the proofs run on a plane where a decoy schema sits ahead of `pg_catalog` for every login the relay meets. | S04 S05 S27 S35 |
| 8 | **The recipient verifies before it extracts**, in memory, with a trust anchor and an expected file set that come from its own side: the detached signature (namespace `file`, the trusted key), the archive sha256 (the signed `.sha256`, and the relay record), safe archive paths and one reading of the archive, the exact file set, the internal `SHA256SUMS`. Extraction writes the verified bytes, never a second read of the archive. | B01–B62 E12 E30 E31 E34 |
| 9 | **A node's private key never leaves the node.** Each node makes its own key; only the public half is registered. The verifier's registration reaches the install as a Director-signed commit on top of the exact relay commit. | E02 E15 I02 I12 |
| 10 | **Bundles expire.** Past its retention an artifact's bytes are deleted and it can no longer be downloaded, unless the founder preserved it as evidence. | S28 S29 E43 |
| 11 | **The install is one bounded operation** on one project: committed, signed, manifest-true bytes only; read-only checks before and after; safe to run again; removable. It stops, with nothing changed, until the verifier's registration is published and the Director has recorded the founder-approved change. | I01–I15 |

Each rule also has a mutant that removes it, and the row that then goes red (`test/*_mutation.mjs`).

## 5. Security and tenancy

| actor | may | may not |
|---|---|---|
| sender node | create an artifact, upload its three files, read its status | choose the recipient, list, download, write a receipt |
| verifier node | list, download and receipt artifacts addressed to it, read their status | create or upload, see another node's artifacts |
| any other caller | nothing (401, with no call out of the function) | everything |
| founder (one access token, one run) | install, remove, register or deactivate a node, preserve an artifact as evidence | — |

Encryption in transit is TLS on both hops (node to function, function to storage); a node refuses a relay address that is not https.
At rest the bytes are in a private bucket that no node credential can read.

## 6. Inverse actions

| action | inverse |
|---|---|
| install (`relay/install.ps1`) | `relay/install.ps1 -Uninstall`: the function, the empty bucket, the schema and its wrapper |
| register a node | `select factory_relay.deactivate_node('<node id>')`: refused from the next request on. A deactivated registration, and its key, never come back: the node makes a new key and the install is run again. |
| deliver a bundle | none. A delivered bundle cannot be recalled; its bytes are deleted at `expires_at`. |
| preserve as evidence | `select factory_relay.preserve('<artifact id>', false)` |

## 7. Limits of V0 (stated, not hidden)

- One sender, one verifier, three files of at most 1 MiB each, and one intake profile: a candidate's private handoff
  (`CANDIDATE<n>_HANDOFF_<short sha>.zip`). The recipient refuses any other archive.
- Retention is 14 days unless the sender asks for 1 to 30. Expiry is applied on the next relay request, not on a timer; from
  `expires_at` on, a download is refused whether or not that request has come.
- **The project's own service key is not an adversary the relay defends against.** Whoever holds it (the dashboard, any other
  Edge Function on the same project) can read the bucket and call the database entry as any node. What does not depend on the
  relay at all is the recipient's check of the detached signature against its own trusted fingerprint.
- No end-to-end encryption: the bytes are protected by TLS in transit and by the private bucket at rest.
- The function answers anyone on the internet with a 401 and no database call. V0 has no rate limit of its own.
- A signed request is bound to its method, action, node, time, nonce and body, not to the relay's address. V0 has one relay.
- A node's relay private key is a file in the user's profile, protected by that profile's permissions.
- The receipt chain shows a partial edit. Against a rewrite by the database owner, what holds is each node's signature on its own
  receipts, checked against a key known outside the relay.
- Removal with objects still in the bucket leaves the bucket for the dashboard: the relay deletes an artifact's bytes only when it
  expires.
- Two `create` requests for the same archive at the same instant: one is answered `create_in_progress`. That path has no test.
- **Measured locally only.** The database half runs on a disposable PostgreSQL dressed like the project; the function runs under
  Node and under Deno against a stand-in for the project's REST and Storage routes; the installer runs against a stand-in for the
  management API and the Supabase CLI. The hosted Edge runtime, hosted Storage, the gateway, the management API and the CLI are
  first measured by the founder's install, whose last step is a selfcheck through the deployed function.

## 8. Proofs

```
RELAY_TEST_MODULES=<a node_modules with embedded-postgres and pg> node test/all.mjs             # the six acceptance proofs
RELAY_TEST_MODULES=...                                             node test/all.mjs --mutation  # and the five mutation proofs
```
