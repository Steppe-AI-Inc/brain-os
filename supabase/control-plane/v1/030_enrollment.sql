-- FACTORY CONTROL PLANE V1 - PART 030: pairing codes, enrollment attempts, pairing attempts, node sessions, assertion replay.
-- Contract §2 (Enrollment); S-6 (pairing security); S-3 (sessions never outlive a revocation: the credential is re-checked in
-- every call's transaction, whatever session the node holds).
--
-- WHAT SQL NEVER SEES: the pairing code and the pepper. The Edge boundary generates the code (CSPRNG), computes
-- HMAC-SHA256(FACTORY_PAIRING_PEPPER, normalized_code) and passes only the locator and that MAC. Nothing here can recompute
-- or reverse it. Session tokens are stored only as sha256.

set local role factory_owner;

-- ---------------------------------------------------------------------------------------------------
-- PAIRING CODES. A random public LOCATOR (unique among live codes) plus a secret of at least 55 bits; stored as the locator and
-- the MAC only. Bound to one tenant, one computer, one target principal and one envelope version (an envelope amendment revokes
-- the outstanding code). TTL <= 15 minutes; at most 5 failed attempts on its locator, after which it is revoked.
-- ---------------------------------------------------------------------------------------------------
create table factory.pairing_codes (
  code_id           uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  computer_id       uuid not null,
  principal_id      uuid not null,             -- the principal the credential will be bound to (S-13)
  envelope_version  integer not null,          -- the envelope fixed before the code existed
  purpose           text not null check (purpose in ('add_computer', 'add_principal', 'repair', 'restore')),
  locator           text not null check (locator ~ '^[0-9A-HJKMNP-TV-Z]{4,10}$'),   -- Crockford base32
  code_mac          bytea not null check (octet_length(code_mac) = 32),
  pepper_version    integer not null check (pepper_version >= 1),
  state             text not null default 'PAIRING_CODE_ISSUED'
                    check (state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED', 'PAIRING_CONSUMED', 'PAIRING_EXPIRED', 'PAIRING_REVOKED')),
  issued_at         timestamptz not null default now(),
  issued_by         uuid not null,
  expires_at        timestamptz not null,
  failed_attempts   integer not null default 0 check (failed_attempts between 0 and 5),
  started_at        timestamptz,
  consumed_at       timestamptz,
  consumed_by_enrollment_id uuid,
  expired_at        timestamptz,
  revoked_at        timestamptz,
  revoke_reason     text check (revoke_reason is null or revoke_reason in
                      ('admin', 'envelope_amended', 'attempts_exceeded', 'reissued', 'computer_archived')),
  check (expires_at > issued_at and expires_at <= issued_at + interval '15 minutes'),
  check ((state = 'PAIRING_CONSUMED') = (consumed_at is not null and consumed_by_enrollment_id is not null)),
  check ((state = 'PAIRING_EXPIRED') = (expired_at is not null)),
  check ((state = 'PAIRING_REVOKED') = (revoked_at is not null and revoke_reason is not null)),
  check (state = 'PAIRING_CODE_ISSUED' or state = 'PAIRING_EXPIRED' or state = 'PAIRING_REVOKED' or started_at is not null),
  unique (tenant_id, code_id),
  foreign key (tenant_id, principal_id) references factory.agent_principals (tenant_id, principal_id),
  foreign key (computer_id, principal_id) references factory.agent_principals (computer_id, principal_id),
  foreign key (computer_id, envelope_version) references factory.authorization_envelopes (computer_id, version)
);
-- the locator is unique among LIVE codes, and a principal has at most one live code
create unique index pairing_codes_live_locator on factory.pairing_codes (locator)
  where state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED');
create unique index pairing_codes_one_live_per_principal on factory.pairing_codes (principal_id)
  where state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED');

-- ---------------------------------------------------------------------------------------------------
-- ENROLLMENTS. One row per enrollment attempt that presented a matching code (PAIRING_STARTED). The founder's enrollment states
-- apply per credential (contract §1): the attempt that consumes the code walks PAIRING_VERIFIED -> NODE_ID_ISSUED ->
-- NODE_CREDENTIAL_ISSUED in one transaction, then RUNTIME_INSTALLING -> REGISTERING -> ALIVE (or INSTALL_FAILED /
-- REGISTRATION_FAILED, retried with the same credential), and CREDENTIAL_REVOKED when its credential is revoked. An attempt that
-- loses the consume records PAIRING_CONSUMED; one whose code expired or was revoked records that state.
-- The proof-of-possession challenge is a random value the server issued at start; it is not a secret.
-- ---------------------------------------------------------------------------------------------------
create table factory.enrollments (
  enrollment_id        uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  code_id              uuid not null,
  computer_id          uuid not null,
  principal_id         uuid not null,
  public_key           bytea not null check (octet_length(public_key) = 32),
  key_thumbprint       text not null check (key_thumbprint ~ '^[0-9a-f]{64}$' and key_thumbprint = encode(sha256(public_key), 'hex')),
  challenge            bytea not null check (octet_length(challenge) = 32),
  challenge_expires_at timestamptz not null,
  state                text not null default 'PAIRING_STARTED' check (state in (
                         'PAIRING_STARTED', 'PAIRING_VERIFIED', 'NODE_ID_ISSUED', 'NODE_CREDENTIAL_ISSUED',
                         'RUNTIME_INSTALLING', 'INSTALL_FAILED', 'REGISTERING', 'REGISTRATION_FAILED', 'ALIVE',
                         'CREDENTIAL_REVOKED', 'PAIRING_CONSUMED', 'PAIRING_EXPIRED', 'PAIRING_REVOKED')),
  state_reason         text check (state_reason is null or length(state_reason) <= 200),
  started_at           timestamptz not null default now(),
  state_at             timestamptz not null default now(),
  credential_id        uuid unique,
  reported_fingerprint text check (reported_fingerprint is null or reported_fingerprint ~ '^[0-9a-f]{64}$'),
  reported_hostname    text check (reported_hostname is null or length(reported_hostname) <= 255),
  unique (tenant_id, enrollment_id),
  foreign key (tenant_id, code_id) references factory.pairing_codes (tenant_id, code_id),
  foreign key (tenant_id, principal_id) references factory.agent_principals (tenant_id, principal_id),
  foreign key (computer_id, principal_id) references factory.agent_principals (computer_id, principal_id),
  check ((credential_id is not null) = (state in ('NODE_CREDENTIAL_ISSUED', 'RUNTIME_INSTALLING', 'INSTALL_FAILED',
                                                   'REGISTERING', 'REGISTRATION_FAILED', 'ALIVE', 'CREDENTIAL_REVOKED')))
);
create index enrollments_by_code on factory.enrollments (code_id);
create unique index enrollments_one_credential_per_code on factory.enrollments (code_id) where credential_id is not null;

alter table factory.node_credentials
  add constraint node_credentials_enrollment_fk foreign key (enrollment_id) references factory.enrollments (enrollment_id);
alter table factory.pairing_codes
  add constraint pairing_codes_consumed_by_fk foreign key (consumed_by_enrollment_id) references factory.enrollments (enrollment_id);
alter table factory.enrollments
  add constraint enrollments_credential_fk foreign key (credential_id) references factory.node_credentials (credential_id)
  deferrable initially deferred;

-- The walk itself, append-only: AC-1's "server rows walk the founder's enrollment states to ALIVE".
create table factory.enrollment_transitions (
  transition_id  bigint generated always as identity primary key,
  tenant_id      uuid not null,
  enrollment_id  uuid not null,
  from_state     text,
  to_state       text not null,
  at             timestamptz not null default clock_timestamp(),
  actor_kind     text not null check (actor_kind in ('installer', 'node', 'server', 'admin')),
  reason         text check (reason is null or length(reason) <= 200),
  foreign key (tenant_id, enrollment_id) references factory.enrollments (tenant_id, enrollment_id)
);
create index enrollment_transitions_by_enrollment on factory.enrollment_transitions (enrollment_id, transition_id);

-- ---------------------------------------------------------------------------------------------------
-- PAIRING ATTEMPTS: every attempt, audited (S-6), and the source of the rate limits: <= 20 per source IP per hour (the
-- connecting peer address as the Edge platform sees it, never a client header) and <= 60 per tenant per hour, unknown locators
-- included (an unknown locator counts against the operator tenant). The per-locator cap lives on the code (failed_attempts).
-- ---------------------------------------------------------------------------------------------------
create table factory.pairing_attempts (
  attempt_id   bigint generated always as identity primary key,
  tenant_id    uuid not null references factory.tenants (tenant_id),
  at           timestamptz not null default clock_timestamp(),
  peer_ip      inet not null,
  phase        text not null check (phase in ('start', 'complete')),
  locator      text check (locator is null or locator ~ '^[0-9A-HJKMNP-TV-Z]{4,10}$'),
  code_id      uuid references factory.pairing_codes (code_id),
  outcome      text not null check (outcome ~ '^[a-z_]{2,40}$')
);
create index pairing_attempts_by_ip on factory.pairing_attempts (peer_ip, at);
create index pairing_attempts_by_tenant on factory.pairing_attempts (tenant_id, at);

-- ---------------------------------------------------------------------------------------------------
-- NODE SESSIONS. A key-signed assertion (POST /v1/session) is exchanged for an opaque, short-lived token, stored only as its
-- sha256. A session never carries authority by itself: every call re-reads the credential inside its own transaction (S-3).
-- ---------------------------------------------------------------------------------------------------
create table factory.node_sessions (
  session_id     uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  credential_id  uuid not null,
  token_hash     bytea not null unique check (octet_length(token_hash) = 32),
  issued_at      timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  check (expires_at > issued_at and expires_at <= issued_at + interval '15 minutes'),
  foreign key (tenant_id, credential_id) references factory.node_credentials (tenant_id, credential_id)
);
create index node_sessions_by_credential on factory.node_sessions (credential_id);

-- Assertion replay store: a jti is accepted once per credential while its assertion could still be valid.
create table factory.node_assertion_jtis (
  tenant_id      uuid not null,
  credential_id  uuid not null,
  jti            text not null check (length(jti) between 16 and 128 and jti ~ '^[A-Za-z0-9_-]+$'),
  seen_at        timestamptz not null default now(),
  expires_at     timestamptz not null,
  primary key (credential_id, jti),
  foreign key (tenant_id, credential_id) references factory.node_credentials (tenant_id, credential_id)
);

reset role;
