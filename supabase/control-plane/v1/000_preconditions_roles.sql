-- FACTORY CONTROL PLANE V1 (Auto-Enrollment) - PART 000: roles, schema privileges, the 69df2f52 column reference list.
--
-- HOW THIS MIGRATION IS SHAPED
--   * It is every .sql file under supabase/control-plane/v1/, in byte order of path (contract §1, WO-1 r3). The Director
--     instrument tools/build_live_migration_step.mjs builds the live-migration step from those files' committed bytes; no file
--     here opens or closes a transaction.
--   * It lives in a subdirectory on purpose. The frozen 69df2f52 provisioning (provision-control-plane.mjs and the harnesses
--     built on it) applies every top-level `NNN_*.sql` and then grants DML on every factory table to factory_runner. Kept out
--     of that glob, a frozen-code plane stays exactly the 69df2f52 plane, and the authority tables below are never handed to
--     the legacy role by a provisioning run.
--   * It runs once, on a plane provisioned as 69df2f52, as that plane's applying login (Supabase's `postgres` on the live plane:
--     NOSUPERUSER, CREATEROLE). It carries no precondition block of its own. Its statements name what they need, and the whole
--     migration is one transaction, so on any other plane it aborts and nothing commits:
--       - a second application fails at `create role factory_owner` below (roles belong to the cluster, and the first
--         application committed this one);
--       - on a plane without the 69df2f52 objects, the first statement that refers to one the plane lacks fails: the schema grant
--         (schema factory), the table grant (all eight 69df2f52 tables) or the default-privilege revoke (role factory_runner).
--     Whether a plane equals the 69df2f52 referent is decided outside the migration, before it runs: the fidelity check of
--     VERIFICATION_SPEC §3.3 on the judging planes, and AC-10's catalog comparison and the Director step's own checks on the live one.
--   * No statement here decides what it does from a value that tells the live plane from a disposable one (S-10). The
--     migration reads no plane identity, database name, server address or setting. It never reads the name or the attributes of
--     the login that applies it or of any object's owner, and the only roles it names are the fixed ones: the three it creates
--     below and 69df2f52's factory_runner. The applying login gets what it needs from documented server behaviour with constant
--     inputs: CREATE ROLE's automatic grant to the creator, createrole_self_grant set to a constant, and ALTER DEFAULT PRIVILEGES
--     without FOR ROLE.
--   * The migration's only reads of the catalog are part 990's checks (c) and (d), and each of them can only abort it. They read,
--     in pg_catalog: the pg_proc rows of schema factory (the namespace, the ACL, and the signature named in the error text) and the
--     pg_default_acl rows of schema factory (the namespace and the ACL); aclexplode of those two ACLs; and the name lookups
--     'factory'::regnamespace and 'factory_runner'::regrole. Nothing else is read, no role attribute or membership among it. How
--     VERIFICATION_SPEC §3.4 r3 classes those reads is change request CR-021; the candidate does not rely on its answer.
--   * Every function it creates pins `search_path = pg_catalog, pg_temp`: built-in names in a function body resolve in pg_catalog
--     and the session's temporary schema is listed last, so nothing a calling session creates stands in for them. The static
--     contract (R8) and the read-back after the migration (schema acceptance C10; VERIFICATION_SPEC §3.5) hold every function in
--     schema factory to exactly that setting (part 080 explains why this matters to the guards).
--
-- OWNERSHIP. Every object this migration creates is owned by factory_owner, a NOLOGIN role. The SQL front doors are
-- SECURITY DEFINER functions owned by it, so inside a front door current_user = 'factory_owner'. The guards use exactly
-- that fact to tell the engine from any other writer; it is never a GUC, never a session flag (SECURITY_INVARIANTS #8).

-- ---------------------------------------------------------------------------------------------------
-- ROLES. All NOLOGIN, created BY CONSTRUCTION with every privileged attribute off, a member of no role (no IN ROLE / ROLE / ADMIN
-- clause, no role-membership GRANT anywhere in this migration). The founder's provisioning step (prepared, never run by the
-- candidate) gives the two API roles LOGIN and a password; that password is a production secret and appears nowhere here.
--   factory_owner      owns every new object; SECURITY DEFINER front doors run as it.
--   factory_node_api   the Node API's database login: EXECUTE on the node front doors only; no table privilege.
--   factory_admin_api  the Admin API's database login: EXECUTE on the admin front doors only; no table privilege.
-- None of them is a member of factory_runner, and factory_runner is a member of none of them (S-10).
--
-- THE APPLYING LOGIN'S MEMBERSHIPS COME FROM POSTGRESQL, NEVER FROM A STATEMENT THAT NAMES IT (PostgreSQL 16+, documented under
-- CREATE ROLE and createrole_self_grant):
--   * a CREATEROLE login that is not a superuser, creating a role, is granted that role WITH ADMIN OPTION, INHERIT FALSE, SET FALSE,
--     with the bootstrap superuser as grantor. It can administer the role (the founder's step 2 gives the API roles LOGIN) and
--     cannot use its privileges;
--   * createrole_self_grant (any user may set it) makes PostgreSQL record one more membership, granted by the creator itself, carrying
--     exactly the options the setting lists. It is
--     set here to the constant 'set' for factory_owner only, so the applying login may SET ROLE factory_owner to create objects as
--     it, and never inherits factory_owner's privileges; and to the constant '' for the API roles. SET LOCAL ends with the
--     transaction. Nothing reads the setting (VERIFICATION_SPEC §3.4: a SET LOCAL of a constant is not a hit).
--   * a superuser creator is granted nothing, so the migration adds no membership row when a superuser applies it. That does not
--     make a superuser a working applier: the default-privilege revoke below acts on the entry of whichever login runs it, so only
--     the login that provisioned the plane as 69df2f52 removes that grant; any other login, a superuser included, leaves it in
--     place and part 990's check (d) aborts the migration. The live applying login is that provisioning login and no superuser.
-- ---------------------------------------------------------------------------------------------------
set local createrole_self_grant = 'set';
create role factory_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
set local createrole_self_grant = '';
create role factory_node_api nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role factory_admin_api nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant usage, create on schema factory to factory_owner;
grant usage on schema factory to factory_node_api, factory_admin_api;

-- The front doors keep queue, lease, checkpoint, surface-lock and completion state in the 69df2f52 tables (P-2), so the engine
-- needs DML on exactly those tables, and REFERENCES for the new records that point at them.
grant select, insert, update, delete, references on
  factory.nodes, factory.work_orders, factory.work_order_dependencies, factory.agent_runs, factory.surface_locks,
  factory.checkpoints, factory.founder_notifications, factory.director_lease
  to factory_owner;

-- ---------------------------------------------------------------------------------------------------
-- THE 69df2f52 DEFAULT-PRIVILEGE GRANT TO factory_runner IS REVOKED (S-10). 69df2f52's provisioning ran
--   alter default privileges in schema factory grant select, insert, update, delete on tables to factory_runner
-- as the applying login (VERIFICATION_SPEC §3.3: the applying login provisions the plane as 69df2f52). ALTER DEFAULT PRIVILEGES
-- without FOR ROLE acts on the executing login's own entry, so these statements remove that grant without naming or reading the
-- login that runs them (they name only the grantee, factory_runner). A revoke of an entry that does not exist stores nothing. Part
-- 990 fails the migration closed if any default-privilege entry in schema factory still reaches factory_runner.
-- ---------------------------------------------------------------------------------------------------
alter default privileges in schema factory revoke all on tables from factory_runner;
alter default privileges in schema factory revoke all on sequences from factory_runner;
alter default privileges in schema factory revoke all on functions from factory_runner;

set local role factory_owner;

-- PostgreSQL's built-in default lets PUBLIC execute every new function. The statement below changes factory_owner's global
-- default-privilege entry, so no function factory_owner creates from here on is executable by PUBLIC. It has to be the global
-- entry: a schema-scoped ALTER DEFAULT PRIVILEGES can only take back what an earlier schema-scoped grant gave, never the built-in
-- default (PostgreSQL, ALTER DEFAULT PRIVILEGES). With a schema-scoped statement instead, every function would keep PUBLIC
-- EXECUTE and part 990's check (c) would abort the migration. PUBLIC has no built-in privilege on tables or sequences, so there is
-- nothing to take back for those.
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------------
-- THE 69df2f52 COLUMNS of each 69df2f52 table: the reference list. The legacy guard (part 080) lets a legacy writer touch these
-- and nothing this migration adds; it carries its own copy of each list, because a guard the legacy role fires calls no function.
-- Nothing in the migration calls this function and nothing reads the catalog to compare with it. Its lists are candidate source,
-- checked outside the migration twice over: against the guard's copies (static contract R10, schema acceptance C15), and against
-- the 69df2f52 referent itself (static R12: the columns 69df2f52's own control-plane SQL gives each table, in order, and the column
-- set of the Director's r3 snapshot of the live plane before the candidate). The planes are held to that referent before the step
-- by the fidelity check (VERIFICATION_SPEC §3.3) and AC-10.
-- ---------------------------------------------------------------------------------------------------
create function factory._baseline_columns(t text) returns text[]
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$
    select case t
      when 'nodes' then array['node_id', 'capabilities', 'security_role', 'platform', 'registered_at', 'last_heartbeat_at',
        'agent_version', 'max_heavy']
      when 'work_orders' then array['work_order_id', 'title', 'work_type', 'status', 'priority', 'risk_level', 'owned_surface',
        'branch', 'base_commit', 'latest_commit', 'candidate_sha', 'release_manifest', 'handoff', 'requires_security_role',
        'requires_capabilities', 'created_at', 'updated_at', 'completed_at', 'director_state', 'next_action', 'blocked_reason',
        'last_evidence', 'last_evidence_at', 'director_node_id', 'director_state_at', 'retry_count', 'handler', 'weight']
      when 'work_order_dependencies' then array['work_order_id', 'depends_on']
      when 'agent_runs' then array['run_id', 'work_order_id', 'node_id', 'status', 'execution_provider', 'provider_run_id',
        'requested_provider', 'requested_model', 'actual_provider', 'branch', 'base_commit', 'head_commit', 'source_sha', 'worktree',
        'checkpoint_location', 'last_completed_scenario', 'remaining_scenarios', 'verification_campaign_id', 'attempt_count',
        'retry_after', 'blocked_at', 'blocked_reason', 'summary', 'error', 'verification_status', 'lease_expires_at',
        'last_heartbeat_at', 'authoring_run_id', 'authoring_node_id', 'verification_run_id', 'verification_node_id', 'started_at',
        'finished_at', 'created_at', 'updated_at', 'actual_model', 'fallback_reason', 'reasoning_effort', 'input_tokens',
        'cached_tokens', 'output_tokens', 'estimated_cost_usd', 'termination_reason']
      when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at']
      when 'checkpoints' then array['checkpoint_id', 'run_id', 'work_order_id', 'location', 'scenario', 'payload', 'created_at']
      when 'founder_notifications' then array['notification_id', 'work_order_id', 'why_blocked', 'exact_action', 'what_continues',
        'raised_at', 'resolved_at']
      when 'director_lease' then array['only_one', 'node_id', 'acquired_at', 'heartbeat_at', 'lease_seconds']
    end::text[]
  $$;

reset role;
