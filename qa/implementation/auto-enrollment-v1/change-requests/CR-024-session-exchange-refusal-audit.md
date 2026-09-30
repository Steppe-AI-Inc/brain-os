# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-024 — Which refusals of the session exchange (`POST /v1/session`) contract §9 requires to leave an audit row: the candidate
audits a refused revoked or superseded credential and a replayed assertion, and no other session refusal**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a clarification of how a Director requirement is read. No Director text is edited, and no product behaviour is changed by
  this request.
- **Until the Director decides, the candidate keeps its current behaviour** (below), and the candidate report states it. The candidate
  relies on no answer.

## Requirement

- **Contract §9** (`docs/architecture/features/factory-node-management-auto-enrollment.md`, "Failure modes (all required)"), the
  receipt column:
  - "missing entity": "server log, no secrets";
  - "stale state (expired / consumed / revoked code, revoked credential)": "audit row";
  - "unauthorized (incl. a self-promoted employee, or an admin not in `tenant_admins`)": "audited refusal";
  - "archived / inactive target (archived computer, revoked release)": "unchanged".
- **S-3** (`...SECURITY_TENANCY.md`): the credential is re-checked inside the transaction of every node call, the session exchange
  included, and after a revocation commits every node call is refused. S-3 itself states no receipt.
- **AC-4** (`qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md`): after the revoke commits, every S-7 node operation from that
  computer is refused, and "The server rows are unchanged by those attempts."

## Evidence

What the candidate does at this commit. The Edge handler (`supabase/control-plane/edge/supabase/functions/_shared/node_api.ts`)
checks the assertion's shape and its Ed25519 signature under the key it presents, then calls `factory.node_session_open`
(`supabase/control-plane/v1/140_sessions.sql`) with that key's thumbprint. Every refusal is named (P-9); nothing else is written
unless stated:

| refusal | where | the credential is identified | row written |
|---|---|---|---|
| `bad_assertion` 400 (shape: version, fields, jti) | Edge `node_api.ts:223`; front door `140_sessions.sql:19-22` | no | none |
| `bad_signature` 401 | Edge `node_api.ts:225` (the database is not called) | no | none |
| `unknown_key` 401 | `140_sessions.sql:27-29` | no (no credential holds the key) | none |
| `credential_revoked` / `credential_superseded` 401 | `140_sessions.sql:30-34` | yes | audit row `node.session`, refused, `credential_<status>` |
| `computer_archived` 403 | `140_sessions.sql:35-38` | yes | none |
| `bad_assertion` 401 (audience other than `factory-node-api`) | `140_sessions.sql:39-41` | yes, active, signature verified | none |
| `assertion_expired` 401 (expired, longer than 60 s, or from the future) | `140_sessions.sql:42-44` | yes, active, signature verified | none |
| `assertion_replayed` 401 (a jti already used) | `140_sessions.sql:50-54` | yes | audit row `node.session`, refused, `assertion_replayed` |

- Every other node call follows the same mapping (`supabase/control-plane/v1/100_node_common.sql`, `factory._node_session` and
  `factory._node_ctx_for_credential`): `credential_<status>` is audited; `session_invalid`, `session_expired` and `computer_archived`
  write no row.
- An archive revokes every credential of the computer in the same transaction (`210_admin_computers.sql`, `admin_archive`), so
  after it commits a call from that computer meets `credential_revoked` first and is audited. `computer_archived` is a second
  check for an active credential on an archived computer, which a committed archive does not leave.
- The Admin API makes the same split between authentication and authorization (`200_admin_common.sql`, `factory._admin`): a
  caller without a Brain OS session is refused `not_authenticated` with no row; an authenticated caller whose live role or
  `tenant_admins` membership does not allow the action is refused `not_authorized` with an audit row.
- Developer rows: `qa/factory/v1/enrollment_acceptance.mjs` SE1-SE6 drive the signature, unknown-key, audience, lifetime, replay and
  shape refusals through the Node API and read back that no session and no jti row was written; SE5 also reads the one audit row a
  replay writes.

The reading the candidate implements: a revoked or superseded credential is "stale state", so it is audited; a replayed assertion is
treated like a consumed code, so it is audited; an unknown key is a "missing entity" (and no tenant can be named for a row, since
`factory.audit_events.tenant_id` is required); an archived computer is an "archived target", whose receipt is "unchanged"; and a
request that fails authentication (malformed, a bad signature, another audience, an assertion outside its lifetime) is a failed
proof, not an authorized identity being refused, so it writes no row, as `not_authenticated` writes none on the Admin API.

## Why

§9 has no row for a node request that fails authentication. Two of its rows can be read to cover some of these refusals:

- "unauthorized ... audited refusal" gives only persona examples (an employee, an admin not in `tenant_admins`). It can be read as
  covering only an authenticated caller who lacks authority, as the candidate reads it, or as covering every refused caller,
  including a node whose assertion names another audience.
- "stale state (expired / ...)" lists expired, consumed and revoked codes and a revoked credential. It can be read as covering an
  expired assertion, since the candidate already audits a replayed (consumed) one, or as limited to the codes and credentials it
  names.

For `computer_archived` the §9 receipt "unchanged" and AC-4's "server rows are unchanged by those attempts" point the other way from
an audit row. Whether a refused node call must leave a row is a receipt the verifier judges (§9 "all required"), so the implementer
may not settle it by its own reading.

## Alternative

1. **(proposed) The current mapping stands.** Only refusals of an identified credential that is revoked or superseded, and a replayed
   assertion, write an audit row. The other session refusals are named and write nothing: an unknown key and a malformed or unsigned
   assertion are "missing entity" (server log); an archived computer is "unchanged"; another audience and an assertion outside its
   lifetime are failed authentication. No change.
2. **Every refusal of an identified credential is audited.** `computer_archived`, the audience refusal and `assertion_expired` also
   write one `node.session` audit row (outcome refused, reason the refusal name), in the tenant of the identified credential. The same
   would then apply on every node call to `computer_archived` and `session_expired` (`100_node_common.sql`). Refusals where no
   credential is identified (`bad_assertion` by shape, `bad_signature`, `unknown_key`, `session_invalid`) stay without a row.
3. **Some other rule the Director specifies**, for example option 2 for the session exchange only.

## Impact

- **Alternative 1:** none on code or rows. The candidate report states the mapping above.
- **Alternative 2:** `140_sessions.sql` gains three `factory._audit` calls, and `100_node_common.sql` two; `enrollment_acceptance.mjs`
  SE3 and SE4 assert one audit row each, and `computer_archived` gets a row that plants an active credential on an archived
  computer; one mutant per new audit call. A node
  whose clock is wrong would write one row per exchange it attempts until it corrects its clock from `GET /v1/time`.
- Either way the Director's decision is recorded in `qa/work-orders/` before the candidate is noticed.
