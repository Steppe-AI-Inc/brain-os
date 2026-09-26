-- FACTORY CONTROL PLANE V1 - PART 050: independence / campaign policies and certification records (contract §1; S-13, S-14,
-- S-16; WO-9).
--
-- POLICIES ARE DIRECTOR-ISSUED DATA. This migration seeds exactly the two rows of contract §1 and nothing else. Through the
-- Admin API a Factory admin may only make a policy STRICTER (guard, part 080), and the campaign rows are read-only there during
-- this milestone. Whatever a row says, the certification front door enforces the S-13 floor (run, identity, verifier authority,
-- exact provenance): a policy can only ADD requirements.

set local role factory_owner;

create function factory._document_paths_ok(ps text[]) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$
    select ps is not null
       and cardinality(ps) <= 32
       and not exists (select 1 from unnest(ps) p
                        where p is null or p !~ '^[a-z0-9][a-z0-9_.-]*(/[a-z0-9][a-z0-9_.-]*)*/$' or p ~ '(^|/)\.\.?/')
  $$;

create table factory.verification_policies (
  policy_id                          uuid primary key,
  tenant_id                          uuid not null references factory.tenants (tenant_id),
  scope                              text not null check (scope in ('tenant_default', 'campaign')),
  campaign_key                       text check (campaign_key is null or campaign_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  title                              text not null check (length(btrim(title)) between 1 and 120),
  version                            integer not null default 1 check (version >= 1),
  -- the S-13 floor, stated as data too (the front door enforces it whatever these say)
  require_distinct_run               boolean not null,   -- certifying run is not in the authoring set
  require_distinct_identity          boolean not null,   -- certifying identity is none of the authoring identities
  require_verifier_authority         boolean not null,   -- verifier authority in the certifier's CURRENT envelope
  -- physical separation: the certifying computer is a different enrolled computer record from every authoring-set member's,
  -- AND no fingerprint it has reported equals one an authoring-set member's computer reported (equal fingerprints refuse; a
  -- hostname or a different fingerprint alone never satisfies it)
  require_physical_separation        boolean not null,
  -- S-16(a): the computer bound at its Add Computer takes an authoring run only of a work order whose declared owned surfaces
  -- are non-empty and lie entirely within director_document_paths
  restrict_bound_computer_authoring  boolean not null,
  director_document_paths            text[] not null default '{}' check (factory._document_paths_ok(director_document_paths)),
  -- the milestone campaign rows cannot be changed through the Admin API (S-14)
  frozen                             boolean not null default false,
  updated_at                         timestamptz not null default now(),
  updated_by                         text not null,
  check ((scope = 'campaign') = (campaign_key is not null)),
  check (not restrict_bound_computer_authoring or cardinality(director_document_paths) > 0)
);
create unique index verification_policies_one_default on factory.verification_policies (tenant_id) where scope = 'tenant_default';
create unique index verification_policies_one_per_campaign on factory.verification_policies (tenant_id, campaign_key) where scope = 'campaign';

-- every version of every policy, append-only: the certification record cites (policy_id, version)
create table factory.verification_policy_versions (
  policy_id     uuid not null references factory.verification_policies (policy_id),
  version       integer not null,
  tenant_id     uuid not null references factory.tenants (tenant_id),
  snapshot      jsonb not null,
  recorded_at   timestamptz not null default clock_timestamp(),
  recorded_by   text not null,
  primary key (policy_id, version)
);

-- THE DIRECTOR ROWS (contract §1), exactly.
insert into factory.verification_policies
  (policy_id, tenant_id, scope, campaign_key, title, require_distinct_run, require_distinct_identity, require_verifier_authority,
   require_physical_separation, restrict_bound_computer_authoring, director_document_paths, frozen, updated_by)
values
  -- Tenant default: certifying run != authoring run; certifying identity != authoring identity; the certifier holds verifier
  -- authority in its current envelope; physical separation not required.
  ('a1e0f000-0000-4000-8000-000000000101', 'a1e0f000-0000-4000-8000-000000000001', 'tenant_default', null,
   'Tenant default', true, true, true, false, false, '{}', false, 'director:contract-§1'),
  -- Campaign "Auto-Enrollment V1": the tenant default; plus physical separation from every authoring-set member for every
  -- milestone candidate; plus no authoring run of Auto-Enrollment product code on the computer S-16(a) is bound to (product
  -- code = any path outside the Director-document paths).
  ('a1e0f000-0000-4000-8000-000000000102', 'a1e0f000-0000-4000-8000-000000000001', 'campaign', 'auto-enrollment-v1',
   'Auto-Enrollment V1', true, true, true, true, true,
   array['docs/', 'qa/verification/', 'qa/work-orders/', 'governance/'], true, 'director:contract-§1');

insert into factory.verification_policy_versions (policy_id, version, tenant_id, snapshot, recorded_by)
select p.policy_id, p.version, p.tenant_id, to_jsonb(p) - 'updated_at', p.updated_by from factory.verification_policies p;

-- ---------------------------------------------------------------------------------------------------
-- CERTIFICATION RECORDS: the new-model verification record, in its own table (S-10, S-13). The legacy verification columns of
-- agent_runs keep their 69df2f52 meaning and never count as one. A record counts only for its work order, and only while its
-- candidate_run_id is that work order's current candidate (work_orders.current_candidate_run_id); a new authoring run voids it.
-- Append-only (guard, part 080).
-- ---------------------------------------------------------------------------------------------------
create table factory.certifications (
  certification_id             uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references factory.tenants (tenant_id),
  work_order_id                uuid not null references factory.work_orders (work_order_id),   -- the certified work order
  verification_work_order_id   uuid not null references factory.work_orders (work_order_id),   -- the verification work it ran as
  -- EXACT CANDIDATE PROVENANCE: the completing run, and the commit / content digest of what it completed
  candidate_run_id             uuid not null references factory.agent_runs (run_id),
  candidate_commit             text check (candidate_commit is null or candidate_commit ~ '^[0-9a-f]{40}$'),
  candidate_tree               text check (candidate_tree is null or candidate_tree ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  -- THE CERTIFIER: run, node, principal, computer, credential, and its authority at certification
  certifying_run_id            uuid not null unique references factory.agent_runs (run_id),
  certifying_node_id           text not null,
  certifying_principal_id      uuid not null,
  certifying_computer_id       uuid not null,
  certifying_credential_id     uuid not null,
  certifier_envelope_version   integer not null,
  certifier_fingerprints       text[] not null default '{}',
  verdict                      text not null check (verdict in ('PASS', 'FAIL')),
  reason                       text check (reason is null or length(reason) <= 2000),
  -- the policies applied, as [{policy_id, version}], and the authoring set judged, as
  -- [{run_id, node_id, principal_id, computer_id, fingerprints}]
  policies                     jsonb not null check (jsonb_typeof(policies) = 'array'),
  authoring_set                jsonb not null check (jsonb_typeof(authoring_set) = 'array' and jsonb_array_length(authoring_set) >= 1),
  certified_at                 timestamptz not null default clock_timestamp(),
  check (candidate_commit is not null or candidate_tree is not null),
  check (certifying_run_id <> candidate_run_id),
  foreign key (tenant_id, certifying_principal_id) references factory.agent_principals (tenant_id, principal_id),
  foreign key (certifying_computer_id, certifying_principal_id) references factory.agent_principals (computer_id, principal_id),
  foreign key (tenant_id, certifying_credential_id) references factory.node_credentials (tenant_id, credential_id),
  foreign key (certifying_computer_id, certifier_envelope_version) references factory.authorization_envelopes (computer_id, version)
);
create index certifications_by_work_order on factory.certifications (work_order_id, certified_at);

reset role;
