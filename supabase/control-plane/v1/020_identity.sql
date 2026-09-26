-- FACTORY CONTROL PLANE V1 - PART 020: computers, authorization envelopes, agent principals, node credentials, fingerprints.
-- Contract §1 "the four facts, kept separate": NODE IDENTITY (computers + principals + their node ids) != AUTHORIZED CAPABILITY
-- ENVELOPE (authorization_envelopes) != RESOURCE PROFILE (reported on factory.nodes, part 070) != CURRENT ASSIGNMENT (a run).

set local role factory_owner;

-- ---------------------------------------------------------------------------------------------------
-- CAPABILITY NAMES. `factory-enrolled-v1` is RESERVED (S-10): every new-model work order requires it, the frozen legacy claim
-- path can never hold it, and an enrolled node holds it only by being enrolled - it is never written into an envelope or
-- reported by a node.
-- ---------------------------------------------------------------------------------------------------
create function factory._capability_reserved(c text) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$ select lower(btrim(coalesce(c, ''))) = 'factory-enrolled-v1' $$;

create function factory._capability_name_ok(c text) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$ select c is not null and c ~ '^[a-z0-9][a-z0-9._:/-]{0,63}$' $$;

-- an envelope's capability list: well-formed names, none reserved, no duplicates, at most 64
create function factory._envelope_capabilities_ok(cs text[]) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$
    select cs is not null
       and cardinality(cs) <= 64
       and not exists (select 1 from unnest(cs) c where not factory._capability_name_ok(c) or factory._capability_reserved(c))
       and (select count(*) from unnest(cs)) = (select count(distinct c) from unnest(cs) c)
  $$;

-- a list of work types / work classes: well-formed names, 1..32 of them
create function factory._work_names_ok(ws text[]) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$
    select ws is not null
       and cardinality(ws) between 1 and 32
       and not exists (select 1 from unnest(ws) w where w is null or w !~ '^[a-z0-9][a-z0-9_.-]{0,63}$')
  $$;

-- ---------------------------------------------------------------------------------------------------
-- COMPUTERS. The durable, Factory-issued record Add Computer creates. Hostname and fingerprint are descriptive metadata and
-- never grant (S-1); they are reported by the node and live on factory.nodes / computer_fingerprints.
-- ---------------------------------------------------------------------------------------------------
create table factory.computers (
  computer_id               uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references factory.tenants (tenant_id),
  display_name              text not null check (length(btrim(display_name)) between 1 and 120),
  created_at                timestamptz not null default now(),
  created_by                uuid not null,                         -- the Factory admin's Brain OS auth user id
  -- ARCHIVED (contract §2, Computer lifecycle): every active credential revoked, no work; history stays readable.
  archived_at               timestamptz,
  archived_by               uuid,
  -- DRAIN (runtime state machine): set = draining, null = not draining. No new work while set.
  drain_requested_at        timestamptz,
  drain_requested_by        uuid,
  -- the envelope in force; every version is kept (authorization_envelopes)
  current_envelope_version  integer not null default 1 check (current_envelope_version >= 1),
  -- S-16(a) (S-14's one permitted campaign write): bound only at this computer's Add Computer, add-only, never unbound or
  -- rebound through the Admin API (guard, part 080). Admin-set, never node-reported.
  s16a_bound_at             timestamptz,
  s16a_bound_by             uuid,
  -- the release a Factory admin adopted for this computer (adopt / roll back; contract §2 Release). FK added in part 060.
  adopted_release_id        uuid,
  -- the machine fingerprint recorded at the computer's first registration (contract §1); every later report is kept in
  -- computer_fingerprints. Descriptive: it only ever refuses (S-16b), never grants.
  registered_fingerprint    text check (registered_fingerprint is null or registered_fingerprint ~ '^[0-9a-f]{64}$'),
  unique (tenant_id, computer_id),
  check ((archived_at is null) = (archived_by is null)),
  check ((drain_requested_at is null) = (drain_requested_by is null)),
  check ((s16a_bound_at is null) = (s16a_bound_by is null))
);
-- at most one ACTIVE computer carries the S-16(a) binding in a tenant: a rebinding elsewhere is refused while it is active
create unique index computers_one_active_s16a on factory.computers (tenant_id)
  where s16a_bound_at is not null and archived_at is null;

-- ---------------------------------------------------------------------------------------------------
-- AUTHORIZATION ENVELOPES: what a computer MAY do. Immutable versions; the computer points at the one in force. Set at Add
-- Computer, amended only by a Factory admin (founder-only for release_broker), audited. A node credential can never change it
-- (S-4): no node front door writes this table.
-- ---------------------------------------------------------------------------------------------------
create table factory.authorization_envelopes (
  tenant_id                uuid not null,
  computer_id              uuid not null,
  version                  integer not null check (version >= 1),
  -- the roles the scheduler may assign this computer's work under (gate 5); several may be authorized
  authorized_roles         text[] not null
                           check (cardinality(authorized_roles) between 1 and 3
                                  and authorized_roles <@ array['generic', 'verifier', 'release_broker']::text[]),
  -- the capabilities this computer may be assigned (gate 6). Detection on the node may only restrict this list.
  authorized_capabilities  text[] not null default '{}' check (factory._envelope_capabilities_ok(authorized_capabilities)),
  -- gate 4: the work types this computer is authorized for; null = every work type
  allowed_work_types       text[] check (allowed_work_types is null or factory._work_names_ok(allowed_work_types)),
  -- gate 3: optionally narrowed to company_ids; null = not narrowed
  company_ids              uuid[] check (company_ids is null or cardinality(company_ids) between 1 and 256),
  -- gate 11
  max_concurrent_runs      integer not null default 1 check (max_concurrent_runs between 1 and 32),
  max_heavy                integer not null default 1 check (max_heavy >= 0 and max_heavy <= max_concurrent_runs),
  -- ranking only; never excludes (P-6)
  preferred_work_class     text check (preferred_work_class is null or preferred_work_class ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  created_at               timestamptz not null default now(),
  created_by               uuid not null,
  reason                   text check (reason is null or length(reason) <= 500),
  primary key (computer_id, version),
  foreign key (tenant_id, computer_id) references factory.computers (tenant_id, computer_id)
);

alter table factory.computers
  add constraint computers_current_envelope_fk foreign key (computer_id, current_envelope_version)
  references factory.authorization_envelopes (computer_id, version) deferrable initially deferred;

-- ---------------------------------------------------------------------------------------------------
-- AGENT PRINCIPALS (S-13): the identity a run records. Add Computer creates exactly one per computer; a further one only by the
-- explicit, audited admin action "create an agent principal". A node can never mint one (no node front door writes here).
-- A principal is never deleted or reused; it is retired by revoking its credentials. Its node_id is the durable node identity
-- used in the 69df2f52 tables (factory.nodes.node_id, agent_runs.node_id).
-- ---------------------------------------------------------------------------------------------------
create table factory.agent_principals (
  principal_id  uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  computer_id   uuid not null,
  node_id       text not null unique check (node_id ~ '^node-[0-9a-f]{32}$'),
  created_via   text not null check (created_via in ('add_computer', 'admin_create')),
  created_at    timestamptz not null default now(),
  created_by    uuid not null,
  unique (tenant_id, principal_id),
  unique (computer_id, principal_id),
  foreign key (tenant_id, computer_id) references factory.computers (tenant_id, computer_id)
);
create unique index agent_principals_one_from_add_computer on factory.agent_principals (computer_id) where created_via = 'add_computer';

-- ---------------------------------------------------------------------------------------------------
-- NODE CREDENTIALS (S-2, S-3). A per-node Ed25519 key pair; only the public key is stored. active | superseded | revoked; a
-- superseded or revoked credential never becomes active again (guard, part 080). At most one active credential per principal.
-- A key is registered once, ever: re-pair and rotate always bring a new key.
-- ---------------------------------------------------------------------------------------------------
create table factory.node_credentials (
  credential_id           uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null,
  computer_id             uuid not null,
  principal_id            uuid not null,
  public_key              bytea not null check (octet_length(public_key) = 32),
  key_thumbprint          text not null unique check (key_thumbprint ~ '^[0-9a-f]{64}$'),   -- sha256(public_key), hex
  status                  text not null default 'active' check (status in ('active', 'superseded', 'revoked')),
  issued_at               timestamptz not null default now(),
  issued_via              text not null check (issued_via in ('enrollment', 'rotate')),
  enrollment_id           uuid unique,                    -- exactly one credential per enrollment
  replaces_credential_id  uuid references factory.node_credentials (credential_id),
  superseded_at           timestamptz,
  revoked_at              timestamptz,
  revoked_by_kind         text check (revoked_by_kind is null or revoked_by_kind in ('admin', 'server')),
  revoked_by              uuid,
  revoke_reason           text check (revoke_reason is null or revoke_reason in
                            ('admin_revoke', 'repair', 'archive', 'rotate_race')),
  unique (tenant_id, credential_id),
  foreign key (tenant_id, principal_id) references factory.agent_principals (tenant_id, principal_id),
  foreign key (computer_id, principal_id) references factory.agent_principals (computer_id, principal_id),
  check ((issued_via = 'enrollment') = (enrollment_id is not null)),
  check (issued_via <> 'rotate' or replaces_credential_id is not null),
  check ((status = 'superseded') = (superseded_at is not null)),
  check ((status = 'revoked') = (revoked_at is not null)),
  check ((status = 'revoked') = (revoked_by_kind is not null and revoke_reason is not null)),
  check (key_thumbprint = encode(sha256(public_key), 'hex'))
);
create unique index node_credentials_one_active_per_principal on factory.node_credentials (principal_id) where status = 'active';

-- ---------------------------------------------------------------------------------------------------
-- MACHINE FINGERPRINTS REPORTED PER COMPUTER (contract §1; S-16b). sha256 of the Windows MachineGuid, reported by the node at
-- registration and on every run. Kept per computer so the campaign's physical-separation rule can compare EVERY fingerprint a
-- computer has reported. Descriptive: it only ever refuses.
-- ---------------------------------------------------------------------------------------------------
create table factory.computer_fingerprints (
  tenant_id          uuid not null,
  computer_id        uuid not null,
  fingerprint        text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  first_reported_at  timestamptz not null default now(),
  last_reported_at   timestamptz not null default now(),
  primary key (computer_id, fingerprint),
  foreign key (tenant_id, computer_id) references factory.computers (tenant_id, computer_id)
);
create index computer_fingerprints_by_fingerprint on factory.computer_fingerprints (tenant_id, fingerprint);

reset role;
