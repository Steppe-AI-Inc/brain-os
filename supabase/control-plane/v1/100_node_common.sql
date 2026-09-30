-- FACTORY CONTROL PLANE V1 - PART 100: what every Node API front door shares (WO-2; S-3, S-4, S-7, S-10).
--
-- THE SHAPE OF A NODE CALL. The Edge handler authenticates the transport (it hashes the opaque session token, or verifies an
-- Ed25519 signature against the public key the request presents) and calls EXACTLY ONE front door. The front door, in one
-- transaction:
--   1. resolves the session to its credential and takes a SHARE lock on the credential row, so the call and a revocation are
--      serialized on that row (S-3): a revoke (an UPDATE, which needs the row exclusively) waits for this call to commit, or this
--      call waits for the revoke and then sees `revoked` and is refused. No effect of a revoked credential commits after its
--      revocation;
--   2. derives tenant, computer, principal, node id and the CURRENT envelope from that credential - never from the request body;
--   3. does its one operation.
-- A refusal is a jsonb result {ok:false, refused:<name>, http:<status>, message}; the handler turns it into that HTTP status,
-- naming the cause (P-9). A refusal found before any write commits nothing but its audit row, if it has one.

set local role factory_owner;

create type factory.node_ctx as (
  tenant_id                uuid,
  computer_id              uuid,
  principal_id             uuid,
  credential_id            uuid,
  node_id                  text,
  envelope_version         integer,
  authorized_roles         text[],
  authorized_capabilities  text[],
  allowed_work_types       text[],
  company_ids              uuid[],
  max_concurrent_runs      integer,
  max_heavy                integer,
  preferred_work_class     text,
  draining                 boolean,
  s16a_bound               boolean
);

create function factory._refusal(code text, http integer, message text, extra jsonb default '{}'::jsonb) returns jsonb
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select jsonb_build_object('ok', false, 'refused', code, 'http', http, 'message', message) || coalesce(extra, '{}'::jsonb) $$;

create function factory._audit(p_tenant uuid, p_actor_kind text, p_actor_id text, p_action text, p_target_kind text, p_target_id text,
                               p_outcome text, p_reason text default null, p_detail jsonb default '{}'::jsonb) returns void
  language sql volatile set search_path = pg_catalog, pg_temp
  as $$
    insert into factory.audit_events (tenant_id, actor_kind, actor_id, action, target_kind, target_id, outcome, reason, detail)
    values (p_tenant, p_actor_kind, p_actor_id, p_action, p_target_kind, p_target_id, p_outcome, left(p_reason, 300), coalesce(p_detail, '{}'::jsonb))
  $$;

-- superusers are refused (S-10): a front door serves the API logins, never an administrator's session
create function factory._refuse_superuser() returns void
  language plpgsql stable set search_path = pg_catalog, pg_temp
  as $$
  begin
    if exists (select 1 from pg_catalog.pg_roles r where r.rolname = session_user and r.rolsuper) then
      raise exception using errcode = '42501', message = 'factory_superuser_refused: the Factory front doors never run for a superuser session (S-10)';
    end if;
  end $$;

-- the credential behind a node call, locked (SHARE per call; EXCLUSIVE for the calls that change the credential itself), and
-- the context derived from it. Refusal names: session_invalid, session_expired, credential_superseded, credential_revoked,
-- computer_archived.
create function factory._node_ctx_for_credential(p_credential_id uuid, p_exclusive boolean, p_op text,
                                                 out ctx factory.node_ctx, out refusal jsonb)
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  declare cred record; comp record; env record;
  begin
    if p_exclusive then
      select c.* into cred from factory.node_credentials c where c.credential_id = p_credential_id for update;
    else
      select c.* into cred from factory.node_credentials c where c.credential_id = p_credential_id for share;
    end if;
    if not found then
      refusal := factory._refusal('session_invalid', 401, 'no such node credential'); return;
    end if;
    if cred.status <> 'active' then
      perform factory._audit(cred.tenant_id, 'node', cred.principal_id::text, 'node.' || p_op, 'credential', cred.credential_id::text,
                             'refused', 'credential_' || cred.status);
      refusal := factory._refusal('credential_' || cred.status, 401,
        'this node credential is ' || cred.status || '; every node operation is refused (S-3)'); return;
    end if;
    select c.* into comp from factory.computers c where c.computer_id = cred.computer_id;
    if comp.archived_at is not null then
      refusal := factory._refusal('computer_archived', 403, 'this computer is archived: it takes and does no work'); return;
    end if;
    select e.* into env from factory.authorization_envelopes e
     where e.computer_id = comp.computer_id and e.version = comp.current_envelope_version;
    ctx := row(cred.tenant_id, cred.computer_id, cred.principal_id, cred.credential_id,
               (select p.node_id from factory.agent_principals p where p.principal_id = cred.principal_id),
               env.version, env.authorized_roles, env.authorized_capabilities, env.allowed_work_types, env.company_ids,
               env.max_concurrent_runs, env.max_heavy, env.preferred_work_class,
               comp.drain_requested_at is not null, comp.s16a_bound_at is not null)::factory.node_ctx;
  end $$;

-- THE ENROLLMENT WALK OF A CREDENTIAL (contract §2 Enrollment; S-14): the state of the enrollment that issued it, or - for a credential
-- a rotation issued (it has no enrollment of its own) - of the nearest credential it replaces that has one. So a rotation never
-- starts a credential afresh: it carries the walk it came from. Null when no enrollment is found (never ALIVE by default).
-- The chain of rotations is followed with no depth limit (a node may rotate any number of times over its life): the walk stops at the
-- first credential that has an enrollment, and the list of credentials already visited ends it on a chain that would loop.
create function factory._credential_walk_state(p_credential uuid) returns text
  language sql stable set search_path = pg_catalog, pg_temp
  as $$
    with recursive ch(cid, prev, d, enrolled, seen) as (
      select c.credential_id, c.replaces_credential_id, 0, exists (select 1 from factory.enrollments e where e.credential_id = c.credential_id),
             array[c.credential_id]
        from factory.node_credentials c where c.credential_id = p_credential
      union all
      select c.credential_id, c.replaces_credential_id, ch.d + 1, exists (select 1 from factory.enrollments e where e.credential_id = c.credential_id),
             ch.seen || c.credential_id
        from ch join factory.node_credentials c on c.credential_id = ch.prev
       where not ch.enrolled and not (c.credential_id = any (ch.seen)))
    select e.state from ch join factory.enrollments e on e.credential_id = ch.cid order by ch.d limit 1
  $$;

create function factory._node_session(p_token_hash bytea, p_exclusive boolean, p_op text, out ctx factory.node_ctx, out refusal jsonb)
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  declare s record; r record;
  begin
    perform factory._refuse_superuser();   -- S-10: every node operation (and the rotation) reaches it here
    if p_token_hash is null or octet_length(p_token_hash) <> 32 then
      refusal := factory._refusal('session_invalid', 401, 'a node session token is required'); return;
    end if;
    select x.* into s from factory.node_sessions x where x.token_hash = p_token_hash;
    if not found or s.revoked_at is not null then
      refusal := factory._refusal('session_invalid', 401, 'unknown or ended node session'); return;
    end if;
    if s.expires_at <= now() then
      refusal := factory._refusal('session_expired', 401, 'the node session expired; exchange a new key-signed assertion'); return;
    end if;
    select * into r from factory._node_ctx_for_credential(s.credential_id, p_exclusive, p_op);
    -- the session's expiry judged again at the server's clock after the credential lock was granted (the wait may be up to the
    -- lock timeout): a session that expired while this call waited is refused, never served
    if r.refusal is null and s.expires_at <= pg_catalog.clock_timestamp() then
      refusal := factory._refusal('session_expired', 401, 'the node session expired; exchange a new key-signed assertion'); return;
    end if;
    ctx := r.ctx; refusal := r.refusal;
  end $$;

-- GET /v1/time: server time and protocol version only (S-7). A front door like the others: a superuser session is refused (S-10).
create function factory.node_time() returns jsonb
  language plpgsql stable security definer set search_path = pg_catalog, pg_temp
  as $$
  begin
    perform factory._refuse_superuser();   -- S-10: GET /v1/time too
    return jsonb_build_object('ok', true, 'server_time', now(), 'protocol', 1);
  end $$;

-- revocations the API may deliver to a node (S-5: revocations only - never a key): revoked release ids and digests, revoked key ids
create function factory._revocations(p_tenant uuid) returns jsonb
  language sql stable set search_path = pg_catalog, pg_temp
  as $$
    select jsonb_build_object(
      'releases', coalesce((select jsonb_agg(jsonb_build_object('release_id', r.release_id, 'digest', r.digest) order by r.revoked_at)
                              from factory.releases r where r.tenant_id = p_tenant and r.state = 'revoked'), '[]'::jsonb),
      'key_ids', coalesce((select jsonb_agg(v.key_id order by v.revoked_at) from factory.release_revocations v
                            where v.tenant_id = p_tenant and v.kind = 'key'), '[]'::jsonb))
  $$;

-- a size- and shape-checked object from a request body (the Edge also rejects unknown fields; this is the server's own bound)
create function factory._obj(p jsonb, key text) returns jsonb
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select case when jsonb_typeof(p -> key) = 'object' and octet_length((p -> key)::text) <= 8192 then p -> key end $$;

create function factory._hex64(p text) returns text
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select case when p ~ '^[0-9a-f]{64}$' then p end $$;

-- VALUES FROM A CALLER'S JSON ARE CAST ONLY AFTER THEIR SHAPE IS KNOWN (P-9: a malformed value is refused by name or ignored, never an
-- unnamed error). Each helper tests the shape inside a CASE before it casts, so the cast never sees another shape.
-- a uuid in its canonical text form (8-4-4-4-12 lower-case hex), before a ::uuid cast
create function factory._is_uuid(p text) returns boolean
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select coalesce(p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) $$;

-- a JSON number read as numeric, or null for any other shape (a string, an object, null, absent)
create function factory._num(p jsonb, key text) returns numeric
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select case when jsonb_typeof(p -> key) = 'number' then (p ->> key)::numeric end $$;

-- a JSON number read as an integer: rounded, and held to the integer range (so a caller's 1e30 is a very large integer that the
-- caller's own range check then refuses by name, never an overflow); null for any other shape
create function factory._jint(p jsonb, key text) returns integer
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select case when jsonb_typeof(p -> key) = 'number'
                    then least(2147483647::numeric, greatest(-2147483648::numeric, round((p ->> key)::numeric)))::integer end $$;

-- THE RESOURCE REPORT a node sends (register, heartbeat, claim; S-1: descriptive only - the gates' minimum-resource check and the
-- ranking read it, for this node and for its peers). Null when the body carries none or it is well formed; else the named problem. The
-- values the gates and the ranking read are numbers (or null: not known); anything else is refused, so a malformed report never
-- reaches another node's claim (part 110 also reads every value through factory._num).
create function factory._resources_problem(p_body jsonb) returns text
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$
    select case
      when jsonb_typeof(p_body) is distinct from 'object' or not (p_body ? 'resources') or jsonb_typeof(p_body -> 'resources') = 'null' then null
      when jsonb_typeof(p_body -> 'resources') <> 'object' or octet_length((p_body -> 'resources')::text) > 8192
        then 'resources is an object of at most 8 KiB'
      else (select 'resources.' || k || ' is a number' from unnest(array['cpu_cores', 'cpu_pct', 'disk_free_mb', 'ram_free_mb', 'ram_total_mb']) k
             where jsonb_typeof(p_body -> 'resources' -> k) not in ('number', 'null') order by k limit 1)
    end
  $$;

-- S-4 on every path: a body never names identity, tenant or authority. The Edge refuses such a body before calling; the front
-- doors refuse it too, so a direct call (the API role's) behaves exactly like one through the Node API.
create function factory._names_identity(p jsonb) returns text
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$
    select k from jsonb_object_keys(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) k
     where k in ('node_id', 'tenant_id', 'principal_id', 'computer_id', 'credential_id', 'security_role', 'role', 'roles', 'capabilities',
                 'envelope', 'envelope_version', 'authorized_roles', 'authorized_capabilities', 'company_ids', 'max_concurrent_runs',
                 'max_heavy', 'agent', 'agent_id', 'identity', 'tenant', 'may_verify')
     order by k limit 1
  $$;

create function factory._identity_refusal(p jsonb) returns jsonb
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select case when factory._names_identity(p) is not null then factory._refusal('identity_from_body_refused', 400,
          'the body may not name ' || factory._names_identity(p) || ': identity, tenant and authority come from the credential (S-4)') end $$;

reset role;
