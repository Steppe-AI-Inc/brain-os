-- ARTIFACT RELAY V0 - install (see ARTIFACT_RELAY_V0.md).
--
-- WHAT THIS ADDS, AND NOTHING ELSE:
--   schema   factory_relay            4 tables, their indexes and triggers, and the functions below
--   function public.factory_relay_rpc(jsonb)   the one function the API can reach; EXECUTE for service_role only
-- It creates no role, no extension, no secret and no storage policy, and it changes no existing object.
-- The private bucket is created separately (FOUNDER_STEP.md): every relay call refuses until it exists and is private.
--
-- Apply once, as the database owner login (postgres), in one transaction. A second application stops at the first check.

begin;

-- The install does not depend on the search_path of the login that applies it: a name it does not qualify resolves in pg_catalog.
set local search_path = pg_catalog, pg_temp;

do $pre$
begin
  if pg_catalog.to_regnamespace('factory_relay') is not null then
    raise exception 'artifact relay: schema factory_relay already exists - nothing was changed';
  end if;
  if pg_catalog.to_regprocedure('public.factory_relay_rpc(jsonb)') is not null then
    raise exception 'artifact relay: public.factory_relay_rpc(jsonb) already exists - nothing was changed';
  end if;
  if pg_catalog.to_regrole('service_role') is null or pg_catalog.to_regrole('anon') is null or pg_catalog.to_regrole('authenticated') is null then
    raise exception 'artifact relay: the roles service_role, anon and authenticated must exist (a Supabase project) - nothing was changed';
  end if;
  if pg_catalog.to_regclass('storage.buckets') is null or pg_catalog.to_regclass('storage.objects') is null
     or not pg_catalog.has_table_privilege(current_user, 'storage.buckets', 'select') then
    raise exception 'artifact relay: % cannot read storage.buckets, so the private-bucket guard could not work - nothing was changed', current_user;
  end if;
end
$pre$;

create schema factory_relay;
revoke all on schema factory_relay from public;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- NODES. Written only by the founder (register_node / deactivate_node). At most one active node per role, and per node id.
-- public_key is the Ed25519 public key as the 43-character base64url form of its 32 bytes.
create table factory_relay.nodes (
  public_key     text         primary key check (public_key ~ '^[A-Za-z0-9_-]{43}$'),
  node_id        text         not null check (node_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$'),
  relay_role     text         not null check (relay_role in ('sender', 'verifier')),
  label          text         not null check (pg_catalog.length(label) between 1 and 80),
  active         boolean      not null default true,
  registered_at  timestamptz  not null default pg_catalog.now(),
  deactivated_at timestamptz
);
create unique index nodes_one_active_per_role on factory_relay.nodes (relay_role) where active;
create unique index nodes_one_active_per_node on factory_relay.nodes (node_id) where active;

-- ARTIFACTS. The binding (who sent, who receives, what was declared) never changes after the row is written.
create table factory_relay.artifacts (
  artifact_id                 uuid         primary key default pg_catalog.gen_random_uuid(),
  candidate_sha               text         not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  sender_node_id              text         not null,
  recipient_node_id           text         not null,
  sender_signing_fingerprint  text         not null check (sender_signing_fingerprint ~ '^SHA256:[A-Za-z0-9+/]{43}$'),
  archive_name                text         not null check (archive_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  archive_sha256              text         not null check (archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_size                integer      not null check (archive_size between 1 and 1048576),
  object_path                 text         not null unique,
  created_at                  timestamptz  not null default pg_catalog.now(),
  expires_at                  timestamptz  not null,
  delivery_state              text         not null default 'CREATED'
                              check (delivery_state in ('CREATED', 'UPLOADED', 'DELIVERED', 'VERIFIED', 'CONSUMED', 'REFUSED', 'EXPIRED')),
  state_at                    timestamptz  not null default pg_catalog.now(),
  preserved_as_evidence       boolean      not null default false,
  purged_at                   timestamptz,
  check (sender_node_id <> recipient_node_id),
  check (expires_at > created_at)
);
-- one live (or consumed) delivery per sender, candidate and archive; a REFUSED or EXPIRED one does not block a new delivery
create unique index artifacts_one_live_delivery on factory_relay.artifacts (sender_node_id, candidate_sha, archive_sha256)
  where delivery_state not in ('REFUSED', 'EXPIRED');

-- The three objects of an artifact: the archive, its .sha256 and its detached signature.
create table factory_relay.artifact_files (
  artifact_id  uuid         not null references factory_relay.artifacts (artifact_id),
  kind         text         not null check (kind in ('archive', 'sha256', 'signature')),
  name         text         not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  size         integer      not null check (size between 1 and 1048576),
  sha256       text         not null check (sha256 ~ '^[0-9a-f]{64}$'),
  object_path  text         not null unique,
  stored_at    timestamptz,
  primary key (artifact_id, kind),
  unique (artifact_id, name)
);

-- RECEIPTS. Append-only and hash-chained per artifact. A node's receipt carries the request it signed.
create table factory_relay.receipts (
  receipt_id           bigint       generated always as identity primary key,
  artifact_id          uuid         not null references factory_relay.artifacts (artifact_id),
  seq                  integer      not null check (seq >= 1),
  state                text         not null check (state in ('CREATED', 'UPLOADED', 'DELIVERED', 'VERIFIED', 'CONSUMED', 'REFUSED', 'EXPIRED', 'PURGED')),
  actor_node_id        text,                       -- null: the relay itself (EXPIRED, PURGED)
  actor_public_key     text,                       -- the actor's registered key when the receipt was written
  at                   timestamptz  not null,
  detail               jsonb        not null default '{}'::jsonb,
  request_ts           bigint,
  request_nonce        text,
  request_body_sha256  text,
  request_signature    text,
  request_action       text,                       -- the action the request was signed for
  request_body         text,                       -- the signed body itself when it is small (never an upload's content)
  prev_hash            text         not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash                 text         not null check (hash ~ '^[0-9a-f]{64}$'),
  unique (artifact_id, seq)
);

-- REQUESTS. One row per authenticated request: the replay guard (node, nonce), and what an upload still has to finish.
create table factory_relay.requests (
  node_id      text         not null,
  nonce        text         not null check (nonce ~ '^[0-9a-f]{32}$'),
  request_id   uuid         not null unique default pg_catalog.gen_random_uuid(),
  ts           bigint       not null,
  op           text         not null,
  body_sha256  text         not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  signature    text         not null check (signature ~ '^[A-Za-z0-9_-]{86}$'),
  artifact_id  uuid,
  file_kind    text,
  at           timestamptz  not null default pg_catalog.now(),
  finished_at  timestamptz,
  primary key (node_id, nonce)
);
create index requests_by_time on factory_relay.requests (at);

-- A second fence behind the missing grants: row level security with no policy.
alter table factory_relay.nodes          enable row level security;
alter table factory_relay.artifacts      enable row level security;
alter table factory_relay.artifact_files enable row level security;
alter table factory_relay.receipts       enable row level security;
alter table factory_relay.requests       enable row level security;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- IMMUTABILITY. Receipts: no update, delete or truncate. Artifacts and files: the binding columns never change; no delete.
create function factory_relay._immutable() returns trigger
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
begin
  raise exception 'artifact relay: % on factory_relay.% is refused (immutable)', tg_op, tg_table_name using errcode = 'P0001';
end
$f$;

create trigger receipts_immutable before update or delete on factory_relay.receipts
  for each row execute function factory_relay._immutable();
create trigger receipts_no_truncate before truncate on factory_relay.receipts
  for each statement execute function factory_relay._immutable();
create trigger artifacts_no_delete before delete on factory_relay.artifacts
  for each row execute function factory_relay._immutable();
create trigger artifacts_no_truncate before truncate on factory_relay.artifacts
  for each statement execute function factory_relay._immutable();
create trigger artifact_files_no_delete before delete on factory_relay.artifact_files
  for each row execute function factory_relay._immutable();
create trigger artifact_files_no_truncate before truncate on factory_relay.artifact_files
  for each statement execute function factory_relay._immutable();

create function factory_relay._artifact_binding_fixed() returns trigger
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
begin
  if (new.artifact_id, new.candidate_sha, new.sender_node_id, new.recipient_node_id, new.sender_signing_fingerprint, new.archive_name,
      new.archive_sha256, new.archive_size, new.object_path, new.created_at, new.expires_at)
     is distinct from
     (old.artifact_id, old.candidate_sha, old.sender_node_id, old.recipient_node_id, old.sender_signing_fingerprint, old.archive_name,
      old.archive_sha256, old.archive_size, old.object_path, old.created_at, old.expires_at) then
    raise exception 'artifact relay: the binding of an artifact never changes' using errcode = 'P0001';
  end if;
  if old.purged_at is not null and new.purged_at is distinct from old.purged_at then
    raise exception 'artifact relay: a purge is recorded once' using errcode = 'P0001';
  end if;
  return new;
end
$f$;
create trigger artifacts_binding_fixed before update on factory_relay.artifacts
  for each row execute function factory_relay._artifact_binding_fixed();

create function factory_relay._file_declaration_fixed() returns trigger
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
begin
  if (new.artifact_id, new.kind, new.name, new.size, new.sha256, new.object_path)
     is distinct from (old.artifact_id, old.kind, old.name, old.size, old.sha256, old.object_path) then
    raise exception 'artifact relay: a declared file never changes' using errcode = 'P0001';
  end if;
  if old.stored_at is not null and new.stored_at is distinct from old.stored_at then
    raise exception 'artifact relay: an object is stored once' using errcode = 'P0001';
  end if;
  return new;
end
$f$;
create trigger artifact_files_declaration_fixed before update on factory_relay.artifact_files
  for each row execute function factory_relay._file_declaration_fixed();

create function factory_relay._node_identity_fixed() returns trigger
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'artifact relay: a node registration is deactivated, never deleted' using errcode = 'P0001';
  end if;
  if (new.public_key, new.node_id, new.relay_role, new.label, new.registered_at)
     is distinct from (old.public_key, old.node_id, old.relay_role, old.label, old.registered_at) then
    raise exception 'artifact relay: a node registration never changes; deactivate it and register again' using errcode = 'P0001';
  end if;
  if old.active is false and new.active then
    raise exception 'artifact relay: a deactivated registration is not reactivated; register again' using errcode = 'P0001';
  end if;
  return new;
end
$f$;
create trigger nodes_identity_fixed before update or delete on factory_relay.nodes
  for each row execute function factory_relay._node_identity_fixed();

-- ---------------------------------------------------------------------------------------------------------------------------------
-- HELPERS (internal: no role but the owner can execute them)
create function factory_relay._refusal(p_name text, p_status integer, p_detail text default null) returns jsonb
  language sql immutable set search_path = pg_catalog, pg_temp
as $f$
  select pg_catalog.jsonb_build_object('ok', false, 'refused', p_name, 'status', p_status)
      || case when p_detail is null then '{}'::jsonb else pg_catalog.jsonb_build_object('detail', p_detail) end
$f$;

-- null when the private bucket is in place; otherwise the name of the refusal. Fail closed: a public bucket, row level security
-- switched off on storage.objects, or any policy on storage.objects stops the relay.
create function factory_relay._bucket_state() returns text
  language plpgsql stable set search_path = pg_catalog, pg_temp
as $f$
declare v_public boolean;
begin
  if pg_catalog.to_regclass('storage.buckets') is null or pg_catalog.to_regclass('storage.objects') is null then return 'storage_unavailable'; end if;
  select b.public into v_public from storage.buckets b where b.id = 'factory-private-artifacts';
  if not found then return 'bucket_missing'; end if;
  if v_public is distinct from false then return 'bucket_not_private'; end if;
  -- a private bucket is private only while row level security guards the objects and no policy opens them to an API role
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'storage.objects'::regclass) then return 'storage_rls_off'; end if;
  if exists (select 1 from pg_catalog.pg_policy pol where pol.polrelid = 'storage.objects'::regclass) then return 'storage_policy_present'; end if;
  return null;
end
$f$;

create function factory_relay._utc(p timestamptz) returns text
  language sql stable set search_path = pg_catalog, pg_temp
as $f$ select pg_catalog.to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $f$;

-- one receipt: the next seq of the artifact, chained to the one before it. The caller holds the artifact row's lock.
create function factory_relay._append_receipt(p_artifact uuid, p_state text, p_actor text, p_detail jsonb,
    p_ts bigint default null, p_nonce text default null, p_body_sha256 text default null, p_signature text default null, p_body text default null,
    p_action text default null)
  returns factory_relay.receipts
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
declare v_seq integer; v_prev text; v_at timestamptz := pg_catalog.clock_timestamp(); v_hash text; v_key text;
        v_row factory_relay.receipts;
begin
  select r.seq, r.hash into v_seq, v_prev from factory_relay.receipts r where r.artifact_id = p_artifact order by r.seq desc limit 1;
  if not found then v_seq := 0; v_prev := pg_catalog.repeat('0', 64); end if;
  v_seq := v_seq + 1;
  if p_actor is not null then
    select x.public_key into v_key from factory_relay.nodes x where x.node_id = p_actor and x.active;
  end if;
  -- hash = sha256 of: prev | artifact | seq | state | actor | at | body sha256 | signature  (every part is in a status reply)
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.concat_ws('|', v_prev, p_artifact::text, v_seq::text, p_state,
      coalesce(p_actor, 'relay'), factory_relay._utc(v_at), coalesce(p_body_sha256, ''), coalesce(p_signature, '')), 'UTF8')), 'hex');
  insert into factory_relay.receipts (artifact_id, seq, state, actor_node_id, actor_public_key, at, detail, request_ts, request_nonce,
      request_body_sha256, request_signature, request_action, request_body, prev_hash, hash)
    values (p_artifact, v_seq, p_state, p_actor, v_key, v_at, coalesce(p_detail, '{}'::jsonb), p_ts, p_nonce, p_body_sha256, p_signature, p_action,
      case when p_body is not null and pg_catalog.length(p_body) <= 8192 then p_body end, v_prev, v_hash)
    returning * into v_row;
  return v_row;
end
$f$;

create function factory_relay._artifact_json(p_artifact uuid) returns jsonb
  language sql stable set search_path = pg_catalog, pg_temp
as $f$
  select pg_catalog.jsonb_build_object(
    'artifact_id', a.artifact_id, 'candidate_sha', a.candidate_sha, 'sender_node_id', a.sender_node_id, 'recipient_node_id', a.recipient_node_id,
    'sender_signing_fingerprint', a.sender_signing_fingerprint, 'archive_name', a.archive_name, 'archive_sha256', a.archive_sha256,
    'archive_size', a.archive_size, 'object_path', a.object_path, 'created_at', factory_relay._utc(a.created_at),
    'expires_at', factory_relay._utc(a.expires_at), 'delivery_state', a.delivery_state, 'state_at', factory_relay._utc(a.state_at),
    'preserved_as_evidence', a.preserved_as_evidence, 'purged', a.purged_at is not null,
    'files', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', f.kind, 'name', f.name, 'size', f.size, 'sha256', f.sha256,
                 'stored', f.stored_at is not null) order by f.kind) from factory_relay.artifact_files f where f.artifact_id = a.artifact_id))
  from factory_relay.artifacts a where a.artifact_id = p_artifact
$f$;

-- EXPIRY. Marks what passed expires_at and is not preserved, and returns the objects the function must delete.
create function factory_relay._expire_due() returns jsonb
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
declare a record; v_out jsonb := '[]'::jsonb; v_paths jsonb;
begin
  for a in select x.artifact_id, x.delivery_state from factory_relay.artifacts x
            where x.expires_at <= pg_catalog.now() and not x.preserved_as_evidence and x.purged_at is null
            order by x.created_at for update loop
    if a.delivery_state in ('CREATED', 'UPLOADED', 'DELIVERED', 'VERIFIED') then
      update factory_relay.artifacts set delivery_state = 'EXPIRED', state_at = pg_catalog.now() where artifact_id = a.artifact_id;
      perform factory_relay._append_receipt(a.artifact_id, 'EXPIRED', null, pg_catalog.jsonb_build_object('from', a.delivery_state));
    end if;
    select coalesce(pg_catalog.jsonb_agg(f.object_path order by f.kind), '[]'::jsonb) into v_paths
      from factory_relay.artifact_files f where f.artifact_id = a.artifact_id and f.stored_at is not null;
    v_out := v_out || pg_catalog.jsonb_build_object('artifact_id', a.artifact_id, 'paths', v_paths);
  end loop;
  return v_out;
end
$f$;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- THE THREE CALLS OF THE EDGE FUNCTION (reached only through factory_relay.rpc)

-- A request the function authenticated: it verified the node's signature over the method, the action, the node, the time, the
-- nonce and the body's sha256, with the key it holds for that node. Before anything else this entry checks what only the database
-- knows: that this node and this key are registered and NOT REVOKED, and that the nonce is new. A refusal changes nothing.
create function factory_relay._begin(p jsonb) returns jsonb
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
declare
  v_node text := p->>'node_id'; v_key text := p->>'public_key'; v_op text := p->>'op'; v_payload jsonb := coalesce(p->'payload', '{}'::jsonb);
  v_ts bigint; v_nonce text := p->>'nonce'; v_body_sha text := p->>'body_sha256'; v_sig text := p->>'signature'; v_body text := p->>'body';
  n factory_relay.nodes; a factory_relay.artifacts; f factory_relay.artifact_files; rq factory_relay.requests;
  v_artifact uuid; v_kind text; v_purge jsonb; v_out jsonb;
  v_candidate text; v_fp text; v_name text; v_files jsonb; v_file jsonb; v_days integer; v_recipient text; v_prefix text;
  v_state text; v_from text; v_detail jsonb; v_existing boolean := false; r factory_relay.receipts; v_bucket text;
begin
  if v_node is null or v_key is null or v_key !~ '^[A-Za-z0-9_-]{43}$' or v_op is null or v_nonce is null or v_body_sha is null or v_sig is null or (p->>'ts') is null
     or (p->>'ts') !~ '^[0-9]{10,16}$' or v_nonce !~ '^[0-9a-f]{32}$' or v_body_sha !~ '^[0-9a-f]{64}$' or v_sig !~ '^[A-Za-z0-9_-]{86}$'
     or pg_catalog.jsonb_typeof(v_payload) <> 'object' then
    return factory_relay._refusal('bad_request', 400);
  end if;
  v_ts := (p->>'ts')::bigint;
  -- the node and the very key the function authenticated with, registered and not revoked
  select * into n from factory_relay.nodes x where x.node_id = v_node and x.public_key = v_key and x.active;
  if not found then return factory_relay._refusal('not_authenticated', 401); end if;
  if pg_catalog.abs(pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint - v_ts) > 300000 then
    return factory_relay._refusal('not_authenticated', 401, 'clock');
  end if;
  -- only a registered node is told that the bucket is not private as required
  v_bucket := factory_relay._bucket_state();
  if v_bucket is not null then return factory_relay._refusal(v_bucket, 503); end if;
  if v_op not in ('selfcheck', 'create', 'upload', 'inbox', 'download', 'receipt', 'status', 'sweep') then
    return factory_relay._refusal('bad_request', 400, 'unknown operation');
  end if;
  if v_payload ? 'artifact_id' then
    if (v_payload->>'artifact_id') is null or (v_payload->>'artifact_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return factory_relay._refusal('bad_request', 400, 'artifact_id');
    end if;
    v_artifact := (v_payload->>'artifact_id')::uuid;
  end if;
  v_kind := v_payload->>'kind';
  if v_kind is not null and v_kind not in ('archive', 'sha256', 'signature') then return factory_relay._refusal('bad_request', 400, 'kind'); end if;

  -- the replay guard: a (node, nonce) is accepted once
  begin
    insert into factory_relay.requests (node_id, nonce, ts, op, body_sha256, signature, artifact_id, file_kind)
      values (v_node, v_nonce, v_ts, v_op, v_body_sha, v_sig, v_artifact, v_kind) returning * into rq;
  exception when unique_violation then
    return factory_relay._refusal('replayed_request', 409);
  end;
  delete from factory_relay.requests q where q.at < pg_catalog.now() - interval '1 day' and (q.op <> 'upload' or q.finished_at is not null);

  v_purge := factory_relay._expire_due();

  if v_op = 'selfcheck' then
    v_out := pg_catalog.jsonb_build_object('ok', true, 'relay', 'artifact-relay/v0', 'node_id', n.node_id, 'relay_role', n.relay_role, 'bucket', 'private',
      'sender_registered', exists (select 1 from factory_relay.nodes x where x.relay_role = 'sender' and x.active),
      'verifier_registered', exists (select 1 from factory_relay.nodes x where x.relay_role = 'verifier' and x.active));

  elsif v_op = 'sweep' then
    v_out := pg_catalog.jsonb_build_object('ok', true, 'expired', pg_catalog.jsonb_array_length(v_purge));

  elsif v_op = 'create' then
    if n.relay_role <> 'sender' then return factory_relay._refusal('not_the_sender', 403); end if;
    v_candidate := v_payload->>'candidate_sha'; v_fp := v_payload->>'signing_fingerprint'; v_name := v_payload->>'archive_name'; v_files := v_payload->'files';
    if v_candidate is null or v_candidate !~ '^[0-9a-f]{40}$' or v_fp is null or v_fp !~ '^SHA256:[A-Za-z0-9+/]{43}$'
       or v_name is null or v_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
       or v_files is null or pg_catalog.jsonb_typeof(v_files) <> 'array' then
      return factory_relay._refusal('bad_request', 400, 'create');
    end if;
    if pg_catalog.jsonb_array_length(v_files) <> 3 then return factory_relay._refusal('bad_request', 400, 'create'); end if;
    -- exactly the archive, <archive>.sha256 and <archive>.sha256.sig, each declared with its size and sha256.
    -- A value is seen to be present and well-formed in one statement and cast in the next: a NULL never skips a refusal, and no
    -- cast depends on the order in which a condition is evaluated.
    for v_file in select * from pg_catalog.jsonb_array_elements(v_files) loop
      if pg_catalog.jsonb_typeof(v_file) <> 'object' or (v_file->>'kind') is null or (v_file->>'name') is null
         or (v_file->>'sha256') is null or (v_file->>'sha256') !~ '^[0-9a-f]{64}$'
         or (v_file->>'size') is null or (v_file->>'size') !~ '^[0-9]{1,7}$'
         or (v_file->>'name') is distinct from (case v_file->>'kind' when 'archive' then v_name when 'sha256' then v_name || '.sha256'
                                                  when 'signature' then v_name || '.sha256.sig' end) then
        return factory_relay._refusal('bad_request', 400, 'files');
      end if;
      if (v_file->>'size')::integer not between 1 and 1048576 then return factory_relay._refusal('bad_request', 400, 'files'); end if;
    end loop;
    if (select pg_catalog.count(distinct x->>'kind') from pg_catalog.jsonb_array_elements(v_files) x) <> 3 then
      return factory_relay._refusal('bad_request', 400, 'files');
    end if;
    v_days := 14;
    if v_payload ? 'retention_days' then
      if (v_payload->>'retention_days') is null or (v_payload->>'retention_days') !~ '^[0-9]{1,2}$' then
        return factory_relay._refusal('bad_request', 400, 'retention_days');
      end if;
      v_days := (v_payload->>'retention_days')::integer;
      if v_days not between 1 and 30 then return factory_relay._refusal('bad_request', 400, 'retention_days'); end if;
    end if;
    -- THE RECIPIENT IS NOT THE SENDER'S CHOICE: it is the one active verifier node the founder registered
    select x.node_id into v_recipient from factory_relay.nodes x where x.relay_role = 'verifier' and x.active;
    if not found then return factory_relay._refusal('no_verifier_registered', 409); end if;

    select * into a from factory_relay.artifacts x
      where x.sender_node_id = n.node_id and x.candidate_sha = v_candidate
        and x.archive_sha256 = (select y->>'sha256' from pg_catalog.jsonb_array_elements(v_files) y where y->>'kind' = 'archive')
        and x.delivery_state not in ('REFUSED', 'EXPIRED');
    if found then
      -- the same declaration again is the same artifact; a different one under the same archive is refused
      if a.archive_name <> v_name or a.sender_signing_fingerprint <> v_fp or exists (
           select 1 from pg_catalog.jsonb_array_elements(v_files) y
            where not exists (select 1 from factory_relay.artifact_files g where g.artifact_id = a.artifact_id and g.kind = y->>'kind'
                               and g.name = y->>'name' and g.size = (y->>'size')::integer and g.sha256 = y->>'sha256')) then
        return factory_relay._refusal('conflicting_artifact', 409);
      end if;
      v_existing := true;
    else
      v_artifact := pg_catalog.gen_random_uuid();
      v_prefix := 'candidate/' || v_candidate || '/' || v_artifact::text || '/';
      begin
        insert into factory_relay.artifacts (artifact_id, candidate_sha, sender_node_id, recipient_node_id, sender_signing_fingerprint, archive_name,
            archive_sha256, archive_size, object_path, expires_at)
          select v_artifact, v_candidate, n.node_id, v_recipient, v_fp, v_name, y->>'sha256', (y->>'size')::integer, v_prefix || v_name,
                 pg_catalog.now() + pg_catalog.make_interval(days => v_days)
            from pg_catalog.jsonb_array_elements(v_files) y where y->>'kind' = 'archive'
          returning * into a;
      exception when unique_violation then
        return factory_relay._refusal('create_in_progress', 409);
      end;
      insert into factory_relay.artifact_files (artifact_id, kind, name, size, sha256, object_path)
        select a.artifact_id, y->>'kind', y->>'name', (y->>'size')::integer, y->>'sha256', v_prefix || (y->>'name')
          from pg_catalog.jsonb_array_elements(v_files) y;
      perform factory_relay._append_receipt(a.artifact_id, 'CREATED', n.node_id,
        pg_catalog.jsonb_build_object('recipient_node_id', v_recipient, 'candidate_sha', v_candidate, 'archive_sha256', a.archive_sha256,
          'sender_signing_fingerprint', v_fp, 'retention_days', v_days),
        v_ts, v_nonce, v_body_sha, v_sig, v_body, v_op);
    end if;
    update factory_relay.requests set artifact_id = a.artifact_id where request_id = rq.request_id;
    v_out := pg_catalog.jsonb_build_object('ok', true, 'already', v_existing, 'artifact', factory_relay._artifact_json(a.artifact_id));

  else
    -- every other operation names one artifact, except inbox
    if v_op = 'inbox' then
      if n.relay_role <> 'verifier' then return factory_relay._refusal('not_the_recipient', 403); end if;
      v_out := pg_catalog.jsonb_build_object('ok', true, 'artifacts', coalesce((
        select pg_catalog.jsonb_agg(factory_relay._artifact_json(x.artifact_id) order by x.created_at)
          from factory_relay.artifacts x
         where x.recipient_node_id = n.node_id and x.delivery_state in ('UPLOADED', 'DELIVERED', 'VERIFIED')
           and x.purged_at is null and (x.expires_at > pg_catalog.now() or x.preserved_as_evidence)), '[]'::jsonb));
    else
      if v_artifact is null then return factory_relay._refusal('bad_request', 400, 'artifact_id'); end if;
      select * into a from factory_relay.artifacts x where x.artifact_id = v_artifact for update;
      -- an artifact that is not this node's looks exactly like one that does not exist
      if not found or (a.sender_node_id <> n.node_id and a.recipient_node_id <> n.node_id) then
        return factory_relay._refusal('no_such_artifact', 404);
      end if;

      if v_op = 'status' then
        v_out := pg_catalog.jsonb_build_object('ok', true, 'artifact', factory_relay._artifact_json(a.artifact_id), 'receipts', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('seq', x.seq, 'state', x.state, 'actor_node_id', x.actor_node_id,
                   'actor_public_key', x.actor_public_key, 'at', factory_relay._utc(x.at), 'detail', x.detail, 'request_ts', x.request_ts, 'request_nonce', x.request_nonce,
                   'request_body_sha256', x.request_body_sha256, 'request_signature', x.request_signature, 'request_action', x.request_action,
                   'request_body', x.request_body,
                   'prev_hash', x.prev_hash, 'hash', x.hash) order by x.seq)
            from factory_relay.receipts x where x.artifact_id = a.artifact_id), '[]'::jsonb));

      elsif v_op = 'upload' then
        if n.relay_role <> 'sender' or a.sender_node_id <> n.node_id then return factory_relay._refusal('not_the_sender', 403); end if;
        if v_kind is null then return factory_relay._refusal('bad_request', 400, 'kind'); end if;
        if a.delivery_state <> 'CREATED' then return factory_relay._refusal('not_uploadable', 409, a.delivery_state); end if;
        select * into f from factory_relay.artifact_files x where x.artifact_id = a.artifact_id and x.kind = v_kind;
        if not found then return factory_relay._refusal('no_such_file', 404); end if;
        if f.stored_at is not null then return factory_relay._refusal('already_stored', 409); end if;
        v_out := pg_catalog.jsonb_build_object('ok', true, 'phase', 'store', 'request_id', rq.request_id, 'object_path', f.object_path,
          'kind', f.kind, 'name', f.name, 'size', f.size, 'sha256', f.sha256);

      elsif v_op = 'download' then
        if n.relay_role <> 'verifier' or a.recipient_node_id <> n.node_id then return factory_relay._refusal('not_the_recipient', 403); end if;
        if v_kind is null then return factory_relay._refusal('bad_request', 400, 'kind'); end if;
        if a.delivery_state not in ('UPLOADED', 'DELIVERED', 'VERIFIED') or a.purged_at is not null
           or (a.expires_at <= pg_catalog.now() and not a.preserved_as_evidence) then
          return factory_relay._refusal('not_downloadable', 409, a.delivery_state);
        end if;
        select * into f from factory_relay.artifact_files x where x.artifact_id = a.artifact_id and x.kind = v_kind and x.stored_at is not null;
        if not found then return factory_relay._refusal('no_such_file', 404); end if;
        v_out := pg_catalog.jsonb_build_object('ok', true, 'phase', 'fetch', 'object_path', f.object_path,
          'kind', f.kind, 'name', f.name, 'size', f.size, 'sha256', f.sha256);

      elsif v_op = 'receipt' then
        if n.relay_role <> 'verifier' or a.recipient_node_id <> n.node_id then return factory_relay._refusal('not_the_recipient', 403); end if;
        v_state := v_payload->>'state'; v_detail := coalesce(v_payload->'detail', '{}'::jsonb); v_from := a.delivery_state;
        if v_state is null or pg_catalog.jsonb_typeof(v_detail) <> 'object' or pg_catalog.length(v_detail::text) > 4096 then
          return factory_relay._refusal('bad_request', 400, 'receipt');
        end if;
        if not ((v_from = 'UPLOADED' and v_state = 'DELIVERED')
             or (v_from = 'DELIVERED' and v_state in ('VERIFIED', 'REFUSED'))
             or (v_from = 'VERIFIED' and v_state in ('CONSUMED', 'REFUSED'))) then
          return factory_relay._refusal('bad_transition', 409, v_from || ' -> ' || v_state);
        end if;
        update factory_relay.artifacts set delivery_state = v_state, state_at = pg_catalog.now() where artifact_id = a.artifact_id;
        r := factory_relay._append_receipt(a.artifact_id, v_state, n.node_id, v_detail, v_ts, v_nonce, v_body_sha, v_sig, v_body, v_op);
        v_out := pg_catalog.jsonb_build_object('ok', true, 'artifact_id', a.artifact_id, 'delivery_state', v_state, 'seq', r.seq, 'hash', r.hash);
      end if;
    end if;
  end if;

  return v_out || pg_catalog.jsonb_build_object('purge', v_purge);
end
$f$;

-- an upload's second half: the function stored the object (or failed to)
create function factory_relay._finish(p jsonb) returns jsonb
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
declare rq factory_relay.requests; a factory_relay.artifacts; v_left integer; v_state text;
begin
  if (p->>'request_id') is null or (p->>'request_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (p->>'outcome') is null or (p->>'outcome') not in ('stored', 'failed') then
    return factory_relay._refusal('bad_request', 400);
  end if;
  select * into rq from factory_relay.requests q where q.request_id = (p->>'request_id')::uuid for update;
  if not found or rq.op <> 'upload' or rq.artifact_id is null or rq.file_kind is null then return factory_relay._refusal('no_such_request', 404); end if;
  if rq.finished_at is not null then return factory_relay._refusal('already_finished', 409); end if;
  update factory_relay.requests set finished_at = pg_catalog.now() where request_id = rq.request_id;
  select * into a from factory_relay.artifacts x where x.artifact_id = rq.artifact_id for update;
  if p->>'outcome' = 'failed' then
    return pg_catalog.jsonb_build_object('ok', true, 'stored', false, 'delivery_state', a.delivery_state);
  end if;
  update factory_relay.artifact_files set stored_at = pg_catalog.now()
   where artifact_id = rq.artifact_id and kind = rq.file_kind and stored_at is null;
  if not found then return factory_relay._refusal('already_stored', 409); end if;
  select pg_catalog.count(*) into v_left from factory_relay.artifact_files x where x.artifact_id = rq.artifact_id and x.stored_at is null;
  v_state := a.delivery_state;
  if v_left = 0 and a.delivery_state = 'CREATED' then
    v_state := 'UPLOADED';
    update factory_relay.artifacts set delivery_state = 'UPLOADED', state_at = pg_catalog.now() where artifact_id = a.artifact_id;
    perform factory_relay._append_receipt(a.artifact_id, 'UPLOADED', rq.node_id,
      pg_catalog.jsonb_build_object('files', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', x.kind, 'name', x.name, 'size', x.size,
          'sha256', x.sha256) order by x.kind) from factory_relay.artifact_files x where x.artifact_id = a.artifact_id)),
      rq.ts, rq.nonce, rq.body_sha256, rq.signature, null, rq.op);
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'stored', true, 'files_left', v_left, 'delivery_state', v_state);
end
$f$;

-- the function deleted the objects of expired artifacts
create function factory_relay._purged(p jsonb) returns jsonb
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
declare v_id text; a factory_relay.artifacts; v_n integer := 0;
begin
  if pg_catalog.jsonb_typeof(p->'artifact_ids') is distinct from 'array' then return factory_relay._refusal('bad_request', 400); end if;
  for v_id in select pg_catalog.jsonb_array_elements_text(p->'artifact_ids') loop
    if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return factory_relay._refusal('bad_request', 400); end if;
    select * into a from factory_relay.artifacts x where x.artifact_id = v_id::uuid for update;
    -- only what has expired and is not preserved can be recorded as purged
    if found and a.purged_at is null and a.expires_at <= pg_catalog.now() and not a.preserved_as_evidence then
      update factory_relay.artifacts set purged_at = pg_catalog.now() where artifact_id = a.artifact_id;
      perform factory_relay._append_receipt(a.artifact_id, 'PURGED', null, '{}'::jsonb);
      v_n := v_n + 1;
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'purged', v_n);
end
$f$;

-- THE ENTRY: the only relay function any role but the owner can execute
create function factory_relay.rpc(p jsonb) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, pg_temp
as $f$
declare v_bucket text;
begin
  if p is null or pg_catalog.jsonb_typeof(p) <> 'object' or (p->>'fn') is null then return factory_relay._refusal('bad_request', 400); end if;
  -- a request of a node: _begin checks the node first, and the bucket next
  if p->>'fn' = 'begin' then return factory_relay._begin(p); end if;
  -- the function's own follow-ups to a request _begin accepted
  if p->>'fn' not in ('finish', 'purged') then return factory_relay._refusal('bad_request', 400); end if;
  v_bucket := factory_relay._bucket_state();
  if v_bucket is not null then return factory_relay._refusal(v_bucket, 503); end if;
  if p->>'fn' = 'finish' then return factory_relay._finish(p); end if;
  return factory_relay._purged(p);
end
$f$;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- THE FOUNDER'S OPERATIONS (owner only)

-- Registers one node. Where this database is a Factory plane, the node id must be a registered Factory node.
create function factory_relay.register_node(p_node_id text, p_relay_role text, p_public_key text, p_label text) returns text
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
declare v_node jsonb; v_seen text := '';
begin
  if pg_catalog.to_regclass('factory.nodes') is not null then
    execute 'select pg_catalog.to_jsonb(n) from factory.nodes n where n.node_id = $1' into v_node using p_node_id;
    if v_node is null then raise exception 'artifact relay: % is not a node of this Factory plane', p_node_id; end if;
    -- what the Factory itself records about this node, so the founder sees which node is being registered
    v_seen := ' (factory.nodes: security_role=' || coalesce(v_node->>'security_role', '-') || ', platform=' || coalesce(v_node->>'platform', '-') || ')';
  end if;
  insert into factory_relay.nodes (public_key, node_id, relay_role, label) values (p_public_key, p_node_id, p_relay_role, p_label);
  return p_node_id || ' registered as ' || p_relay_role || v_seen;
end
$f$;

create function factory_relay.deactivate_node(p_node_id text) returns text
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
begin
  update factory_relay.nodes set active = false, deactivated_at = pg_catalog.now() where node_id = p_node_id and active;
  if not found then raise exception 'artifact relay: no active registration of %', p_node_id; end if;
  return p_node_id || ' deactivated';
end
$f$;

-- Keeps (or releases) an artifact's bytes past expires_at as certification evidence.
create function factory_relay.preserve(p_artifact uuid, p_keep boolean) returns text
  language plpgsql set search_path = pg_catalog, pg_temp
as $f$
begin
  update factory_relay.artifacts set preserved_as_evidence = p_keep where artifact_id = p_artifact and purged_at is null;
  if not found then raise exception 'artifact relay: no unpurged artifact %', p_artifact; end if;
  return p_artifact::text || case when p_keep then ' preserved as evidence' else ' released to expiry' end;
end
$f$;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- PRIVILEGES. Functions are born executable by PUBLIC: every one is revoked, then exactly one is granted to exactly one role.
revoke all on all tables in schema factory_relay from public;
revoke all on all functions in schema factory_relay from public;
grant usage on schema factory_relay to service_role;
grant execute on function factory_relay.rpc(jsonb) to service_role;

-- the API reaches only the public schema: one invoker-rights wrapper, for service_role alone
create function public.factory_relay_rpc(request jsonb) returns jsonb
  language sql security invoker set search_path = pg_catalog, pg_temp
as $f$ select factory_relay.rpc(request) $f$;
revoke all on function public.factory_relay_rpc(jsonb) from public;
revoke all on function public.factory_relay_rpc(jsonb) from anon, authenticated;
grant execute on function public.factory_relay_rpc(jsonb) to service_role;

-- final check, before commit: nothing but the two grants above reaches a role other than the owner
do $post$
declare v text;
begin
  select pg_catalog.string_agg(x.what, '; ') into v from (
    select 'table ' || c.relname || ' -> ' || coalesce(nullif(g.grantee::regrole::text, '-'), 'PUBLIC') as what
      from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(c.relacl) g
     where c.relnamespace = 'factory_relay'::regnamespace and g.grantee <> c.relowner
    union all
    select 'function ' || pr.proname || ' -> ' || coalesce(nullif(g.grantee::regrole::text, '-'), 'PUBLIC')
      from pg_catalog.pg_proc pr cross join lateral pg_catalog.aclexplode(coalesce(pr.proacl, pg_catalog.acldefault('f', pr.proowner))) g
     where (pr.pronamespace = 'factory_relay'::regnamespace or pr.oid = 'public.factory_relay_rpc(jsonb)'::regprocedure)
       and g.grantee <> pr.proowner
       and not (g.grantee = 'service_role'::regrole and pr.oid in ('factory_relay.rpc(jsonb)'::regprocedure, 'public.factory_relay_rpc(jsonb)'::regprocedure))
  ) x;
  if v is not null then raise exception 'artifact relay: unexpected privilege (%) - nothing was changed', v; end if;
  if exists (select 1 from pg_catalog.pg_class c where c.relnamespace = 'factory_relay'::regnamespace and c.relkind = 'r' and not c.relrowsecurity)
     or exists (select 1 from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid where c.relnamespace = 'factory_relay'::regnamespace) then
    raise exception 'artifact relay: every relay table must have row level security on and no policy - nothing was changed';
  end if;
  if exists (select 1 from pg_catalog.pg_proc pr
              where (pr.pronamespace = 'factory_relay'::regnamespace or pr.oid = 'public.factory_relay_rpc(jsonb)'::regprocedure)
                and not coalesce(pr.proconfig, '{}'::text[]) @> array['search_path=pg_catalog, pg_temp']) then
    raise exception 'artifact relay: every relay function must pin its search_path - nothing was changed';
  end if;
end
$post$;

commit;
