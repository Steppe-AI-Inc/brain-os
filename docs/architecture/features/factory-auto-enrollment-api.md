# Factory auto-enrollment — Node API and Admin API wire contract (engineering, Part C of the feature contract)

The implementer's interface specification. Every shape satisfies Part A of `factory-auto-enrollment.md` and implements nothing
from Part B. Both APIs are thin: each route authenticates, applies whole-request gates, calls exactly **one** SQL front-door
function (one transaction), and maps its jsonb result to HTTP. No lifecycle logic lives in the handlers.

## 0. Common

| Item | Rule |
|---|---|
| Deployment | Supabase Edge Functions on the Factory project `npvhuoozkbexddnvkqsj`; source in `supabase/control-plane/edge/supabase/functions/`. Local tests run the same `handler.ts` under Node 24 behind `node:http`. |
| Base URLs | Node: `https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-node-api` · Admin: `…/functions/v1/factory-admin-api` (overridable for tests / preview) |
| Content type | `application/json; charset=utf-8` both ways. Unknown top-level or nested fields → `400 unknown_field`. |
| Idempotency | Every mutating call carries `Idempotency-Key: <uuid>`. A replay returns the original result. A key reused with a different body → `409 idempotency_key_reused`. A raw pairing code is never stored for replay. |
| Time | Every response carries `server_time` (ISO-8601, server clock). Clients keep an offset from it; lease timing stays on the client's monotonic clock. |
| Success | `200 {"ok": true, "server_time": …, …payload}` |
| Error | `{"ok": false, "server_time": …, "error": {"code": "<snake>", "message": "<human, no secrets>", "retry_after_s": <int, optional>}}` |
| Receipts are not errors | `denied` and `already_*` are **200 with `ok: true` and a receipt whose `outcome` says so** (OPERATING_TRUTH_MODEL §6). HTTP 4xx/5xx is reserved for identity, validation, size, rate and transient failures. |

HTTP status map: `400` validation / `unknown_field` / `reserved_capability` / `bad_code_format` · `401` node identity
(`session_expired`, `session_unknown`, `credential_revoked`, `credential_superseded`, `computer_archived`, `assertion_invalid`,
`assertion_replayed`, `assertion_expired`, `tenant_suspended`) and admin identity (`admin_identity_unverifiable`) · `403`
`denied` for an unauthorized admin · `404` route not found · `409` `idempotency_key_reused` · `413` `payload_too_large` · `429`
`rate_limited` (with `Retry-After`) · `503` `transient`, `crypto_unavailable`, `plane_unavailable`.

## 1. Node API

### 1.1 `GET /v1/time`
→ `{ok, server_time, api_protocol: 1}`. No auth.

### 1.2 `POST /v1/enroll/start` (no auth; the code is the only input)

Request:
```json
{ "code": "LLLL-SSSS-SSSS-SSSC",
  "public_key": "<base64url raw 32-byte Ed25519 public key>",
  "fingerprint": { "machine_hash": "<hex sha256>", "hostname": "…", "os": "…", "arch": "x64", "cpu_cores": 8, "total_mem_mb": 32768, "free_disk_mb": 100000 },
  "client": { "runtime_version": "…", "runtime_sha256": "<hex>" } }
```
- The edge validates the check character locally (`400 bad_code_format`) and computes
  `mac = HMAC-SHA256(FACTORY_PAIRING_PEPPER, "BRAIN-PAIR-V1|" + normalized)`.
- It then calls `factory_api.enroll_start(locator, mac, pepper_version, ip_hash, public_key, fingerprint, client)`.

→ `{ok, enrollment_id, nonce, computer_display, tenant_display, expires_at}`

Errors are receipts. The HTTP status is 200 with `ok: false` only for pairing outcomes, which keeps the UI simple:
`error.code ∈ {pairing_invalid, pairing_expired, pairing_revoked, pairing_consumed, pairing_in_progress, pairing_locked,
computer_archived}`. `rate_limited` is 429.

### 1.3 `POST /v1/enroll/complete` (no auth; proof of possession)

Request: `{ "enrollment_id": "<uuid>", "thumbprint": "<base64url sha256(raw public key)>", "signature": "<base64url Ed25519
signature over UTF-8 'BRAIN-ENROLL-V1|' + enrollment_id + '|' + nonce + '|' + thumbprint>" }`

The edge reads the bound key through `factory_api.enroll_challenge`, verifies the signature, then calls
`factory_api.enroll_complete`.

→ `{ok, node_id, credential_id, computer_id, computer_display, tenant_display, envelope: EnvelopeSummary, outcome:
"executed"|"already_completed"}`

### 1.4 `POST /v1/session` (key-signed assertion → session token)

Request: `{ "assertion": "<compact JWS>" }`
- JWS header: `{"alg":"EdDSA","typ":"bf-node-assertion+jwt","kid":"<credential_id>"}`.
- Payload: `{"iss": credential_id, "sub": node_id, "aud": "<node base URL>/v1/session", "iat": <unix s>, "exp": <≤ iat+60>, "jti":
  "<uuid>"}`.
- Accepted window: `iat ∈ [server−120 s, server+60 s]`.

→ `{ok, session_token: "bfs_<base64url 32 bytes>", expires_at, node_id}`

Only sha256(session_token) is stored. TTL 600 s. Refresh at 70 % of the TTL, or once after a 401 `session_expired`.

### 1.5 `POST /v1/node/<op>` (`Authorization: Bearer bfs_…`, `Idempotency-Key`)

The body is op-specific. `node_id`, `tenant_id`, `security_role`, `envelope`, `computer_id` and `may_*` are rejected anywhere in
the body (`400 unknown_field`). Every op goes to `factory_api.node_call(session_hash, op, request_id, args)`.

| op | args (request body) | result |
|---|---|---|
| `register` | `{capabilities: [..], resources: Resources, runtime: {version, sha256, source_commit}, agent_identity}` | `{node_id, computer_id, envelope: EnvelopeSummary, settings: {lease_seconds, idle_poll_ms, stale_after_s}}` |
| `beat` | `{runtime_phase, resources, admission: {admit, reason}}` | `{stamped: bool, drain_requested: bool, next_poll_ms}` |
| `claim` | `{work_types: [..], lease_seconds, requested_provider, requested_model, reasoning_effort, admission: {admit, reason}, resources}` | `{run: Run \| null, reason, next_poll_ms}` |
| `heartbeat` | `{run_id, lease_seconds}` | `{renewed: bool}` (false = lease lost / taken over) |
| `checkpoint` | `{run_id, checkpoint_id, location, scenario, payload}` | `{written: bool}`, or outcome `lease_lost` |
| `complete` | `{run_id, status: "done"\|"failed", summary, head_commit, candidate, termination_reason, actual_provider, actual_model, fallback_reason, usage}` | `{superseded: bool, verification: {state, verification_work_order_id} \| null}` |
| `give-back` | `{held_run_ids: [..]}` | `{given_back: [run_id..]}` |
| `abort` | `{run_id}` | `{given_back: bool}` |
| `run-context` | `{run_id}` | `{work_order: {work_order_id, work_type, title, handoff, owned_surface, requires_security_role, priority_rank, verifies_run_id, verifies_work_order_id}, checkpoints: [..], verified_run: {run_id, status, candidate, termination_reason, checkpoints: [..]} \| null}` (only for a run the caller holds) |
| `run-setup` | `{run_id, worktree, branch, base_commit}` | `{written: bool}` |
| `verify` | `{run_id, verdict: "pass"\|"fail", candidate, evidence}` | `{outcome: executed\|already_verified\|stale_authority\|candidate_mismatch\|policy_refused\|lease_lost, verification_state}` |
| `acceptance-handover` | `{run_id, target_node_id, lease_seconds}` | `{handed_over: bool}` (factory_acceptance work only) |
| `report-state` | `{enrollment_state: "RUNTIME_INSTALLING"\|"INSTALL_FAILED"\|"REGISTERING"\|"REGISTRATION_FAILED", reason}` | `{recorded: bool}` |
| `status` | `{}` | `NodeStatus` |
| `credential/rotate` | `{new_public_key, signature_by_old_key}` | `{credential_id, thumbprint}` (the old one → superseded) |
| `credential/self-revoke` | `{reason}` | `{revoked: true}` |
| `release` | `{channel}` | `{manifest, signature, download_url} \| null` |

`Run`: `{run_id, work_order_id, attempt_count, lease_expires_at, requested_provider, requested_model}`.
`Resources`: `{cpu_cores, cpu_load_pct, total_mem_mb, free_mem_mb, free_disk_mb, locality_keys: [..]}`.
`EnvelopeSummary`: `{version, max_security_role, allowed_work_types, may_verify, may_coordinate, company_ids, max_concurrent_runs,
max_heavy, preferred_work_class}`.

## 2. Admin API (`Authorization: Bearer <Brain OS access token>`, `Idempotency-Key` on mutations)

Identity is re-derived **on every call**:
1. The token issuer must equal `${BRAIN_OS_SUPABASE_URL}/auth/v1`.
2. `GET ${BRAIN_OS_SUPABASE_URL}/auth/v1/user` must return 200.
3. `POST …/rest/v1/rpc/is_founder_or_admin` under the same token must return exactly `true`.
4. `GET …/rest/v1/profiles?select=id,role&auth_user_id=eq.<uid>` supplies the role, for audit.

Any failure → `401 admin_identity_unverifiable` or `403 denied`, and nothing is changed. The tenant comes from configuration
(`brain_os_project_ref`), never the body. CR-001 (allow-list) is **not** implemented.

Every mutation returns `{ok: true, receipt: LifecycleResult, …}`, where `LifecycleResult` is
`{operation, id, previousStatus, newStatus, changed, authorized, postconditionPassed, reason, outcome}`, with
`outcome ∈ {executed, already_current, already_archived, already_active, already_revoked, already_draining, already_undrained,
denied, not_found, stale_state, conflict, expired}`.

| Method + route | Body | Result |
|---|---|---|
| `GET /v1/computers?limit=50&offset=0` | — | `{collection: CollectionEnvelope<ComputerSummary>}` (`total` from `count(*)`) |
| `GET /v1/computers/:id` | — | `{computer: ComputerDetail}` |
| `POST /v1/computers` | `{display_name, envelope: EnvelopeInput}` | `{receipt, computer: ComputerSummary}` |
| `POST /v1/computers/:id/envelope` | `{expected_version, envelope: EnvelopeInput}` | `{receipt, computer}` (outstanding codes revoked) |
| `POST /v1/computers/:id/rename` | `{display_name}` | `{receipt, computer}` |
| `POST /v1/computers/:id/pairing-code` | `{ttl_minutes: 5..60, purpose: "enroll"\|"re_pair"}` | `{receipt, pairing: {code, locator, expires_at}}` (**the only response that ever contains `code`**) |
| `POST /v1/computers/:id/pairing-code/revoke` | `{}` | `{receipt}` |
| `POST /v1/computers/:id/credential/revoke` | `{reason}` | `{receipt}` (leases expired) |
| `POST /v1/computers/:id/re-pair` | `{ttl_minutes}` | `{receipt, pairing}` (the active credential is revoked + a re_pair code in one transaction) |
| `POST /v1/computers/:id/drain` · `/undrain` · `/archive` · `/restore` | `{}` | `{receipt, computer}` |
| `POST /v1/computers/:id/test-job` | `{}` | `{receipt, work_order_id}` |
| `GET /v1/verifications/waiting?limit&offset` | — | `{collection: CollectionEnvelope<WaitingVerification>}` |
| `GET /v1/installer/latest?channel=stable` | — | `{release: {version, channel, download_url, sha256, size, authenticode_signed, published_at} \| null}` |
| `POST /v1/installer/releases` | `{manifest, signature, download_url}` | `{receipt}` (CR-003 interim: founder \| holding_admin) |

`EnvelopeInput`: `{max_security_role: "generic"|"verifier"|"release_broker", allowed_work_types: [..], may_verify: bool,
may_coordinate: bool, company_ids: [uuid..] | null, max_concurrent_runs: 1..8, max_heavy: 0..8, preferred_work_class:
"implementation"|"verification"|"coordination"|null}`.

`ComputerSummary`:
```json
{ "computer_id": "…", "display_name": "…", "lifecycle": "active|archived", "enrollment_kind": "enrolled|legacy_manual",
  "enrollment_state": "<states.json enrollment name>", "runtime_state": "<states.json runtime name>|null", "state_reason": "…|null",
  "stalled": {"since": "…", "reason": "…"} | null,
  "node_id": "…|null", "reported_hostname": "…|null", "last_heartbeat_at": "…|null",
  "runtime_version": "…|null", "runtime_sha256": "…|null", "release_known": true,
  "envelope": EnvelopeSummary, "drain_requested_at": "…|null",
  "current_run": {"run_id": "…", "work_order_id": "…", "work_type": "…", "title": "…", "run_role": "authoring|verification"} | null,
  "pairing": {"state": "issued|started", "locator": "LLLL", "expires_at": "…", "purpose": "enroll|re_pair"} | null,
  "credential": {"status": "active|superseded|revoked", "thumbprint": "…", "key_protection": "dpapi|acl_only", "issued_at": "…"} | null }
```
`ComputerDetail` = `ComputerSummary` + `{envelope_versions: [EnvelopeSummary + created_at, created_by_role], credentials: [..],
enrollment_milestones: [{state, at}], recent_runs: CollectionEnvelope<{run_id, work_order_id, title, status, run_role,
started_at, finished_at}>, audit: CollectionEnvelope<{at, actor_kind, actor_role, operation, outcome}>, resources: Resources |
null}`.

`WaitingVerification`: `{work_order_id, title, verification_state, waiting_since, reason, authoring_run_id,
authoring_computer_display}`.

## 3. Whole-request gates (every one is classified in `qa/factory/factory_api_request_gate_inventory_contract.mjs`)

| Gate | Where | Class |
|---|---|---|
| body > 64 KiB (node), > 256 KiB (`checkpoint` payload op), > 8 KiB (enroll), > 16 KiB (admin) | edge | DETERMINISTIC REFUSAL `413` |
| unknown / identity field | edge | DETERMINISTIC REFUSAL `400` |
| enroll rate: 20/min per source IP, 600/min per tenant | SQL | DETERMINISTIC REFUSAL `429` + `Retry-After` |
| per-code attempt cap 5 | SQL | DETERMINISTIC REFUSAL (code revoked `attempts_exceeded`) |
| node rate: 240 calls/min per credential | SQL | DETERMINISTIC REFUSAL `429` (the node honors `Retry-After` as transient) |
| admin rate: 60 mutations/min per actor | SQL | DETERMINISTIC REFUSAL `429` |
| assertion window / replay | edge + SQL | DETERMINISTIC REFUSAL `401` (one offset-corrected retry) |
| session expiry | SQL | SAFE DEGRADATION (re-exchange once) |
| claim `lock_timeout` 5 s | SQL function SET | SAFE DEGRADATION (`claim_lock_busy`, nothing claimed) |
| `statement_timeout` 15 s | SQL function SET | `503 transient` |
| `min_runtime_version` | SQL | DETERMINISTIC REFUSAL `update_required` (visible) |
| Brain OS Auth unreachable | edge (admin) | DETERMINISTIC REFUSAL `401 admin_identity_unverifiable`, nothing changed |
| Ed25519 self-test | edge cold start | DETERMINISTIC REFUSAL `503 crypto_unavailable` |
| Edge wall clock / CPU limits | platform | **UNMEASURED** until the founder's deploy |

## 4. SQL front doors (the ONLY things the handlers call; one call = one transaction)

Every front door returns `jsonb`:
- success: `{"ok": true, …payload}`;
- failure: `{"ok": false, "error": {"code", "message", "retry_after_s"?}}`.

The edge maps `error.code` to HTTP with one table (`_shared/http.ts`, §0). Pairing outcomes are 200 with `ok: false`. Binary
values are `bytea`, passed as `Buffer` / `Uint8Array` by postgres.js. Public keys and nonces are returned base64url-encoded.

| Function | Grant | Called by |
|---|---|---|
| `factory_api.enroll_start(p_locator text, p_code_mac bytea, p_pepper_version int, p_ip_hash text, p_public_key bytea, p_fingerprint jsonb, p_client jsonb) → jsonb` | `factory_node_api` | `/v1/enroll/start` |
| `factory_api.enroll_challenge(p_enrollment_id uuid) → jsonb {ok, public_key, nonce, state}` | `factory_node_api` | `/v1/enroll/complete` (before signature verification) |
| `factory_api.enroll_complete(p_enrollment_id uuid, p_thumbprint text, p_nonce text) → jsonb` | `factory_node_api` | `/v1/enroll/complete` (after the edge verified the signature over that nonce) |
| `factory_api.credential_key(p_credential_id uuid) → jsonb {ok, public_key, status, node_id}` | `factory_node_api` | `/v1/session` |
| `factory_api.session_issue(p_credential_id uuid, p_jti uuid, p_assertion_exp timestamptz, p_session_hash bytea, p_ttl_s int) → jsonb {ok, expires_at, node_id}` | `factory_node_api` | `/v1/session` |
| `factory_api.node_call(p_session_hash bytea, p_op text, p_request_id uuid, p_args jsonb) → jsonb` | `factory_node_api` | `/v1/node/<op>` (op names as in §1.5, with `-` and `/` → `_`: `give_back`, `run_context`, `run_setup`, `acceptance_handover`, `report_state`, `credential_rotate`, `credential_self_revoke`) |
| `factory_legacy.node_call(p_node_id text, p_op text, p_request_id uuid, p_args jsonb) → jsonb` | `factory_runner` | the branch's direct-PG transport (certified suites); same ops, same core |
| `factory_admin.admin_call(p_actor jsonb, p_op text, p_request_id uuid, p_args jsonb) → jsonb` | `factory_admin_api` | every admin route |

- `p_actor` = `{auth_user_id, profile_id, role, brain_os_project_ref}`, re-derived by the edge on every call.
- Admin ops: `list_computers`, `get_computer`, `add_computer`, `set_envelope`, `rename_computer`, `issue_pairing_code`,
  `revoke_pairing_code`, `revoke_credential`, `re_pair`, `drain`, `undrain`, `archive_computer`, `restore_computer`,
  `send_test_job`, `list_waiting_verifications`, `latest_release`, `publish_release`.
- For `issue_pairing_code` and `re_pair` the edge generates the code and passes `{locator, code_mac, pepper_version,
  ttl_minutes, purpose}`. SQL never sees the code or the pepper.
- A `unique_violation` on the locator is returned as `error.code = 'locator_collision'`, and the edge retries with a new code
  (at most 5 times).
