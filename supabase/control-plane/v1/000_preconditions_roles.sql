-- FACTORY CONTROL PLANE V1 (Auto-Enrollment) - PART 000: preconditions, roles, schema privileges.
--
-- HOW THIS MIGRATION IS SHAPED
--   * It is the ordered concatenation of the files in supabase/control-plane/v1/, composed by
--     scripts/factory-control-plane/migration.mjs into ONE transaction. No file here opens or closes a transaction: the
--     composer (and the founder's prepared live step, with the Director's wrapper) owns BEGIN / COMMIT.
--   * It lives in a subdirectory on purpose. The frozen 69df2f52 provisioning (provision-control-plane.mjs and the harnesses
--     built on it) applies every top-level `NNN_*.sql` and then grants DML on every factory table to factory_runner. Kept out
--     of that glob, a frozen-code plane stays exactly the 69df2f52 plane, and the authority tables below are never handed to
--     the legacy role by a provisioning run.
--   * It runs once, on a plane provisioned as 69df2f52, as that plane's admin login (the founder's on the live plane). It
--     stops before changing anything if the plane is not that plane, or if it was already applied.
--   * No statement here decides what it does from a value that tells the live plane from a disposable one (S-10). The
--     migration reads no plane identity, database name, server address or setting.
--
-- OWNERSHIP. Every object this migration creates is owned by factory_owner, a NOLOGIN role. The SQL front doors are
-- SECURITY DEFINER functions owned by it, so inside a front door current_user = 'factory_owner'. The guards use exactly
-- that fact to tell the engine from any other writer; it is never a GUC, never a session flag (SECURITY_INVARIANTS #8).

do $pre$
begin
  if to_regclass('factory.agent_runs') is null or to_regclass('factory.work_orders') is null
     or to_regclass('factory.director_lease') is null or to_regclass('factory.checkpoints') is null then
    raise exception 'factory v1 migration: this plane is not provisioned as 69df2f52 (factory.agent_runs / work_orders / checkpoints / director_lease missing)';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'factory_runner') then
    raise exception 'factory v1 migration: role factory_runner is missing; provision the plane as 69df2f52 first';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname in ('factory_owner', 'factory_node_api', 'factory_admin_api'))
     or to_regclass('factory.tenants') is not null then
    raise exception 'factory v1 migration: already applied (factory_owner / factory.tenants exist); it runs exactly once';
  end if;
end
$pre$;

-- ---------------------------------------------------------------------------------------------------
-- ROLES. All NOLOGIN. The founder's provisioning step (prepared, never run by the candidate) gives the two API roles LOGIN and
-- a password; that password is a production secret and appears nowhere here.
--   factory_owner      owns every new object; SECURITY DEFINER front doors run as it.
--   factory_node_api   the Node API's database login: EXECUTE on the node front doors only; no table privilege.
--   factory_admin_api  the Admin API's database login: EXECUTE on the admin front doors only; no table privilege.
-- None of them is a member of factory_runner, and factory_runner is a member of none of them (S-10).
-- ---------------------------------------------------------------------------------------------------
create role factory_owner nologin noinherit nocreatedb nocreaterole noreplication;
create role factory_node_api nologin noinherit nocreatedb nocreaterole noreplication;
create role factory_admin_api nologin noinherit nocreatedb nocreaterole noreplication;

-- The migrating login must be able to create objects AS factory_owner (and hand them to it). SET only: it does not inherit
-- factory_owner's privileges.
grant factory_owner to current_user with inherit false, set true;

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
-- as its admin login. Every such entry in schema factory is revoked, whichever role recorded it, so no table created from
-- here on reaches the legacy role by default. (The entry's owner is read from the catalog, never assumed.)
-- ---------------------------------------------------------------------------------------------------
do $acl$
declare r record;
begin
  for r in
    select pg_catalog.pg_get_userbyid(d.defaclrole) as owner
      from pg_catalog.pg_default_acl d
      join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
     where n.nspname = 'factory'
       and exists (select 1 from pg_catalog.aclexplode(d.defaclacl) a
                    where a.grantee = (select oid from pg_catalog.pg_roles where rolname = 'factory_runner'))
  loop
    execute format('alter default privileges for role %I in schema factory revoke all on tables from factory_runner', r.owner);
    execute format('alter default privileges for role %I in schema factory revoke all on sequences from factory_runner', r.owner);
    execute format('alter default privileges for role %I in schema factory revoke all on functions from factory_runner', r.owner);
  end loop;
end
$acl$;

set local role factory_owner;

-- factory_owner's own objects give PUBLIC nothing by default (PostgreSQL grants EXECUTE on functions to PUBLIC by default).
alter default privileges in schema factory revoke execute on functions from public;
alter default privileges in schema factory revoke all on tables from public;
alter default privileges in schema factory revoke all on sequences from public;

-- ---------------------------------------------------------------------------------------------------
-- THE 69df2f52 COLUMNS of each 69df2f52 table. The legacy guard (part 080) lets a legacy writer touch these and nothing this
-- migration adds. Asserted below against the catalog BEFORE any column is added: a plane whose 69df2f52 tables differ is not the
-- plane this migration was written for, and it stops.
-- ---------------------------------------------------------------------------------------------------
create function factory._baseline_columns(t text) returns text[]
  language sql immutable parallel safe set search_path = ''
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

do $cols$
declare t text; have text[]; want text[];
begin
  foreach t in array array['nodes', 'work_orders', 'work_order_dependencies', 'agent_runs', 'surface_locks', 'checkpoints',
                           'founder_notifications', 'director_lease'] loop
    select array_agg(a.attname::text order by a.attname) into have
      from pg_catalog.pg_attribute a
     where a.attrelid = ('factory.' || t)::regclass and a.attnum > 0 and not a.attisdropped;
    select array_agg(c order by c) into want from unnest(factory._baseline_columns(t)) c;
    if have is distinct from want then
      raise exception 'factory v1 migration: factory.% does not have exactly its 69df2f52 columns (has %, expected %)', t, have, want;
    end if;
  end loop;
end
$cols$;

reset role;
