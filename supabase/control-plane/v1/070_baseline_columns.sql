-- FACTORY CONTROL PLANE V1 - PART 070: new-model columns on the 69df2f52 tables (P-2: "columns may be added, but no other table
-- holds lease, lock or completion state").
--
-- RULES FOR EVERY COLUMN HERE
--   * Nullable, with no default. A frozen-code (legacy) insert names none of them, so on a legacy row they are NULL; the guard in
--     part 080 refuses a legacy write that sets or changes any of them. NULL is how a row says "legacy".
--   * No evidence field of BASELINE_69df2f52_EVIDENCE_MANIFEST.json is touched: nothing is backfilled into an existing row, no
--     existing column changes type, default or content (P-1). In particular `factory-enrolled-v1` is never added to a legacy
--     work order's requires_capabilities.
--   * The engine (the front doors, running as factory_owner) is the only writer of these columns.

-- the migrating login adds foreign keys from its 69df2f52 tables to factory_owner's tables: REFERENCES for this part only
set local role factory_owner;
grant references on factory.agent_principals, factory.node_credentials, factory.authorization_envelopes, factory.releases
  to session_user;
reset role;

-- ---------------------------------------------------------------------------------------------------
-- NODES. A node row per agent principal (its durable node_id). A row with principal_id NULL is a `legacy_manual` node: no envelope,
-- no certification of release candidates (contract §1). The resource profile below ranks and may exclude; it never authorizes.
-- ---------------------------------------------------------------------------------------------------
alter table factory.nodes
  add column principal_id         uuid unique,
  add column computer_id          uuid,
  -- the runtime state machine's phase as the node last reported it (contract §2 Runtime). STALE / OFFLINE are never stored:
  -- they are derived from last_heartbeat_at (180 s / 30 min).
  add column runtime_phase        text check (runtime_phase is null or runtime_phase in
                                    ('RECOVERING', 'AVAILABLE', 'CLAIMING', 'BUSY', 'CHECKPOINTING', 'COMPLETING', 'DRAINING')),
  add column runtime_phase_at     timestamptz,
  -- detected capabilities and telemetry (the resource profile): an object, size-capped
  add column reported_resources   jsonb check (reported_resources is null or (jsonb_typeof(reported_resources) = 'object'
                                    and octet_length(reported_resources::text) <= 8192)),
  add column reported_at          timestamptz,
  -- descriptive metadata only (S-1)
  add column machine_fingerprint  text check (machine_fingerprint is null or machine_fingerprint ~ '^[0-9a-f]{64}$'),
  add column reported_hostname    text check (reported_hostname is null or length(reported_hostname) <= 255),
  add column reported_os          text check (reported_os is null or length(reported_os) <= 255),
  -- the release this node runs (contract §1: stamped on the node, every run and every checkpoint)
  add column runtime_version      text check (runtime_version is null or length(runtime_version) <= 64),
  add column runtime_digest       text check (runtime_digest is null or runtime_digest ~ '^[0-9a-f]{64}$'),
  add column release_id           uuid references factory.releases (release_id),
  add column first_claim_cycle_at timestamptz,
  add constraint nodes_principal_fk foreign key (tenant_id, principal_id)
    references factory.agent_principals (tenant_id, principal_id),
  add constraint nodes_principal_computer_fk foreign key (computer_id, principal_id)
    references factory.agent_principals (computer_id, principal_id),
  add constraint nodes_enrolled_has_computer check ((principal_id is null) = (computer_id is null));

-- ---------------------------------------------------------------------------------------------------
-- WORK ORDERS. A NEW-MODEL work order is one whose requires_capabilities holds the reserved `factory-enrolled-v1` (S-10); the
-- frozen legacy claim path can never hold it, and the claim front door refuses a work order without it.
-- ---------------------------------------------------------------------------------------------------
alter table factory.work_orders
  -- gate 3 (company scope); the business company the work belongs to, by value
  add column company_id                uuid,
  -- P-7: NUMERIC priority. A larger number is more urgent; ordering is numeric (2 < 10 < 100), never lexical.
  add column priority_num              integer check (priority_num is null or priority_num between -1000000 and 1000000),
  -- the verification gate (contract §2 Verification; CR-002 ratified)
  add column requires_verification     boolean,
  add column verification_state        text check (verification_state is null or verification_state in (
                                         'IMPLEMENTED', 'WAITING_FOR_INDEPENDENT_VERIFICATION', 'VERIFICATION_CLAIMED',
                                         'VERIFIED', 'VERIFICATION_FAILED', 'COMPLETE')),
  add column verification_state_at     timestamptz,
  add column verification_reason       text check (verification_reason is null or length(verification_reason) <= 300),
  -- a verification work order points at the work order and the completing run (the candidate) it verifies
  add column verifies_work_order_id    uuid references factory.work_orders (work_order_id),
  add column verifies_run_id           uuid references factory.agent_runs (run_id),
  -- the current candidate: the run whose completion is awaiting / received certification; a new authoring run replaces it and
  -- voids every certification of the old one
  add column current_candidate_run_id  uuid references factory.agent_runs (run_id),
  -- the acceptance campaign a work order belongs to (e.g. auto-enrollment-v1): the campaign policy applies to it
  add column campaign_key              text check (campaign_key is null or campaign_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  -- gate 12: hard minimum resources (narrowing only), e.g. {"ram_mb": 4096, "disk_mb": 20000, "cpu_cores": 2}
  add column min_resources             jsonb check (min_resources is null or (jsonb_typeof(min_resources) = 'object'
                                         and octet_length(min_resources::text) <= 2048)),
  -- ranking: queue age is measured from here
  add column queued_at                 timestamptz,
  -- who submitted it through the Admin API (a Factory admin's auth user id)
  add column submitted_by              uuid,
  add constraint work_orders_new_model_is_complete check (
    not ('factory-enrolled-v1' = any (requires_capabilities))
    or (priority_num is not null and requires_verification is not null and queued_at is not null)),
  add constraint work_orders_verification_only_new_model check (
    (verification_state is null and verifies_work_order_id is null and verifies_run_id is null and current_candidate_run_id is null)
    or 'factory-enrolled-v1' = any (requires_capabilities));
create index work_orders_new_model_queue on factory.work_orders (tenant_id, status, priority_num desc, queued_at)
  where 'factory-enrolled-v1' = any (requires_capabilities);
create index work_orders_verifies on factory.work_orders (verifies_work_order_id) where verifies_work_order_id is not null;

-- ---------------------------------------------------------------------------------------------------
-- RUNS. An ENROLLED run is one with principal_id set: the principal of the credential it authenticated with (S-13), never a
-- request-body field. Its lease is the 69df2f52 lease_expires_at, owned by the front doors; the frozen legacy reaper skips it.
-- ---------------------------------------------------------------------------------------------------
alter table factory.agent_runs
  add column principal_id               uuid,
  add column computer_id                uuid,
  add column credential_id              uuid,
  -- authoring (holds a lease on the work order it authors) or verification (runs a verification work order)
  add column run_kind                   text check (run_kind is null or run_kind in ('authoring', 'verification')),
  -- the scheduler's current assignment for this run (contract §1: temporary, within the envelope)
  add column assignment_role            text check (assignment_role is null or assignment_role in ('generic', 'verifier', 'release_broker')),
  -- the envelope in force when the run was claimed
  add column envelope_version           integer,
  -- the release the run ran on (stamp) and the machine fingerprint it reported
  add column release_id                 uuid references factory.releases (release_id),
  add column runtime_version            text check (runtime_version is null or length(runtime_version) <= 64),
  add column runtime_digest             text check (runtime_digest is null or runtime_digest ~ '^[0-9a-f]{64}$'),
  add column machine_fingerprint        text check (machine_fingerprint is null or machine_fingerprint ~ '^[0-9a-f]{64}$'),
  -- exact candidate provenance at completion: the content digest of what the run completed (with head_commit, 69df2f52)
  add column candidate_tree             text check (candidate_tree is null or candidate_tree ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  -- the checkpoint this run resumed from, when it took over (authoring set: the writer of a consumed checkpoint)
  add column resumed_from_checkpoint_id uuid references factory.checkpoints (checkpoint_id),
  add constraint agent_runs_principal_fk foreign key (tenant_id, principal_id)
    references factory.agent_principals (tenant_id, principal_id),
  add constraint agent_runs_principal_computer_fk foreign key (computer_id, principal_id)
    references factory.agent_principals (computer_id, principal_id),
  add constraint agent_runs_credential_fk foreign key (tenant_id, credential_id)
    references factory.node_credentials (tenant_id, credential_id),
  add constraint agent_runs_envelope_fk foreign key (computer_id, envelope_version)
    references factory.authorization_envelopes (computer_id, version),
  add constraint agent_runs_enrolled_is_complete check (
    (principal_id is null and computer_id is null and credential_id is null and run_kind is null and envelope_version is null
       and assignment_role is null)
    or (principal_id is not null and computer_id is not null and credential_id is not null and run_kind is not null
       and envelope_version is not null and assignment_role is not null));
create index agent_runs_enrolled_by_work_order on factory.agent_runs (work_order_id, run_kind) where principal_id is not null;
create index agent_runs_enrolled_in_progress_by_computer on factory.agent_runs (computer_id)
  where principal_id is not null and status = 'in_progress';

-- ---------------------------------------------------------------------------------------------------
-- CHECKPOINTS. Stamped with the principal and the release that wrote them.
-- ---------------------------------------------------------------------------------------------------
alter table factory.checkpoints
  add column principal_id     uuid,
  add column computer_id      uuid,
  add column release_id       uuid references factory.releases (release_id),
  add column runtime_version  text check (runtime_version is null or length(runtime_version) <= 64),
  add column runtime_digest   text check (runtime_digest is null or runtime_digest ~ '^[0-9a-f]{64}$'),
  add constraint checkpoints_principal_fk foreign key (tenant_id, principal_id)
    references factory.agent_principals (tenant_id, principal_id),
  add constraint checkpoints_enrolled_has_computer check ((principal_id is null) = (computer_id is null));

-- ---------------------------------------------------------------------------------------------------
-- SURFACE LOCKS. Both fleets hold surface locks in this one table (S-10). An ENROLLED lock (principal_id set) carries
-- lease_expires_at = 'infinity': the frozen legacy pick treats a lock whose lease has passed as free, so an enrolled lock must
-- never look lapsed to it (AC-9 mixed fleet). Its real lifetime is its run's lease; only the front doors read that and expire it.
-- ---------------------------------------------------------------------------------------------------
alter table factory.surface_locks
  add column principal_id uuid,
  add constraint surface_locks_principal_fk foreign key (tenant_id, principal_id)
    references factory.agent_principals (tenant_id, principal_id),
  add constraint surface_locks_enrolled_never_lapses check (principal_id is null or lease_expires_at = 'infinity');

set local role factory_owner;
revoke references on factory.agent_principals, factory.node_credentials, factory.authorization_envelopes, factory.releases
  from session_user;
reset role;
