-- FACTORY CONTROL PLANE V1 - PART 210: the Admin API's computer actions (WO-3 Add Computer; WO-7 lifecycle; WO-8; contract §2, §4, §8).
-- Signature of every admin front door: (p_actor uuid, p_live_role text, p_body jsonb) -> jsonb. p_actor and p_live_role are what
-- the Admin API derived from the caller's own Brain OS token on this call; the body never names who is acting.

set local role factory_owner;

create function factory._not_found() returns jsonb
  language sql immutable parallel safe set search_path = ''
  as $$ select factory._refusal('not_found', 404, 'no such computer in your tenant') $$;

-- ---------------------------------------------------------------------------------------------------
-- LIST (a CollectionEnvelope: items, shown, total from an aggregate count, truncated) and GET
-- ---------------------------------------------------------------------------------------------------
create function factory.admin_list_computers(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare a record; lim integer; off integer; total integer; items jsonb; counts jsonb;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'list_computers', false);
    if a.refusal is not null then return a.refusal; end if;
    lim := least(200, greatest(1, coalesce(case when jsonb_typeof(p_body -> 'limit') = 'number' then (p_body ->> 'limit')::numeric::integer end, 100)));
    off := greatest(0, coalesce(case when jsonb_typeof(p_body -> 'offset') = 'number' then (p_body ->> 'offset')::numeric::integer end, 0));
    select count(*) into total from factory.computers m where m.tenant_id = (a.ctx).tenant_id
      and (coalesce(p_body ->> 'include_archived', 'false') = 'true' or m.archived_at is null);
    select coalesce(jsonb_agg(factory._computer_view(x.computer_id) order by x.created_at, x.computer_id), '[]'::jsonb) into items
      from (select m.computer_id, m.created_at from factory.computers m where m.tenant_id = (a.ctx).tenant_id
              and (coalesce(p_body ->> 'include_archived', 'false') = 'true' or m.archived_at is null)
             order by m.created_at, m.computer_id limit lim offset off) x;
    select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) into counts from (
      select factory._computer_view(m.computer_id) ->> 'state' s, count(*) n from factory.computers m
       where m.tenant_id = (a.ctx).tenant_id group by 1) y;
    return jsonb_build_object('ok', true, 'server_time', now(),
      'computers', jsonb_build_object('items', items, 'shown', jsonb_array_length(items), 'total', total,
                                      'truncated', off + jsonb_array_length(items) < total, 'order', 'created_at',
                                      'scope', case when coalesce(p_body ->> 'include_archived', 'false') = 'true' then 'all' else 'active' end),
      'counts_by_state', counts);
  end $$;

create function factory.admin_get_computer(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare a record; m factory.computers;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'get_computer', false);
    if a.refusal is not null then return a.refusal; end if;
    select x.* into m from factory.computers x where x.computer_id = factory._uuid(p_body, 'computer_id') and x.tenant_id = (a.ctx).tenant_id;
    if m.computer_id is null then return factory._not_found(); end if;
    return jsonb_build_object('ok', true, 'computer', factory._computer_view(m.computer_id),
      'envelope_history', (select coalesce(jsonb_agg(factory._envelope_json(e) order by e.version), '[]'::jsonb)
                             from factory.authorization_envelopes e where e.computer_id = m.computer_id),
      'audit', (select coalesce(jsonb_agg(jsonb_build_object('at', v.at, 'actor_kind', v.actor_kind, 'actor_id', v.actor_id, 'action', v.action,
                  'outcome', v.outcome, 'reason', v.reason, 'detail', v.detail) order by v.event_id desc), '[]'::jsonb)
                  from (select * from factory.audit_events v where v.tenant_id = m.tenant_id
                          and (v.target_id = m.computer_id::text or v.detail ->> 'computer_id' = m.computer_id::text)
                        order by v.event_id desc limit 50) v));
  end $$;

-- ---------------------------------------------------------------------------------------------------
-- ADD COMPUTER: the envelope is fixed first, then the computer's first (and, without the explicit action, only) principal, then the
-- pairing code (UNENROLLED -> PAIRING_CODE_ISSUED). Granting release_broker is founder-only. bind_s16a binds S-16(a) to this
-- computer - S-14's one permitted campaign write - here and nowhere else.
-- ---------------------------------------------------------------------------------------------------
create function factory.admin_add_computer(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; e record; m factory.computers; cid uuid := gen_random_uuid(); pid uuid := gen_random_uuid(); issued jsonb;
          bind boolean := coalesce(p_body ->> 'bind_s16a', 'false') = 'true';
  begin
    select * into e from factory._envelope_input(p_body -> 'envelope');
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'add_computer', e.problem is null and 'release_broker' = any (e.roles));
    if a.refusal is not null then return a.refusal; end if;
    if factory._code_input_problem(p_body) is not null then return factory._code_input_problem(p_body); end if;
    if e.problem is not null then return factory._refusal('bad_request', 400, e.problem); end if;
    if coalesce(length(btrim(p_body ->> 'display_name')), 0) not between 1 and 120 then
      return factory._refusal('bad_request', 400, 'display_name is 1..120 characters');
    end if;
    if bind and exists (select 1 from factory.computers x where x.tenant_id = (a.ctx).tenant_id and x.s16a_bound_at is not null and x.archived_at is null) then
      return factory._refusal('s16a_already_bound', 409, 'S-16(a) is already bound to an active computer: unbinding and rebinding are refused during this milestone (S-14)');
    end if;
    insert into factory.computers (computer_id, tenant_id, display_name, created_by, s16a_bound_at, s16a_bound_by)
    values (cid, (a.ctx).tenant_id, btrim(p_body ->> 'display_name'), (a.ctx).actor, case when bind then now() end, case when bind then (a.ctx).actor end);
    insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, authorized_capabilities, allowed_work_types,
                                                 company_ids, max_concurrent_runs, max_heavy, preferred_work_class, created_by, reason)
    values ((a.ctx).tenant_id, cid, 1, e.roles, e.caps, e.types, e.companies, e.max_runs, e.max_heavy, e.pref, (a.ctx).actor, 'Add Computer');
    insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by)
    values (pid, (a.ctx).tenant_id, cid, 'node-' || replace(pid::text, '-', ''), 'add_computer', (a.ctx).actor);
    select x.* into m from factory.computers x where x.computer_id = cid;
    issued := factory._issue_code(a.ctx, m, pid, 'add_computer', p_body);
    if not (issued ->> 'ok')::boolean then raise exception using errcode = 'P0001', message = 'refused:' || (issued ->> 'refused') || ':' || (issued ->> 'message'); end if;
    perform factory._audit((a.ctx).tenant_id, 'admin', (a.ctx).actor::text, 'computer.added', 'computer', cid::text, 'ok', null,
      jsonb_build_object('computer_id', cid, 'principal_id', pid, 'envelope_version', 1, 's16a_bound', bind,
        'envelope', jsonb_build_object('roles', to_jsonb(e.roles), 'capabilities', to_jsonb(e.caps), 'work_types', to_jsonb(e.types),
          'company_ids', to_jsonb(e.companies), 'max_concurrent_runs', e.max_runs, 'max_heavy', e.max_heavy)));
    return jsonb_build_object('ok', true, 'computer_id', cid, 'principal_id', pid, 'code_id', issued -> 'code_id', 'expires_at', issued -> 'expires_at',
      'computer', factory._computer_view(cid));
  end $$;

-- ISSUE A NEW CODE for a principal that holds no active credential (PAIRING_EXPIRED / PAIRING_REVOKED -> PAIRING_CODE_ISSUED)
create function factory.admin_issue_code(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; pid uuid;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'issue_code', false);
    if a.refusal is not null then return a.refusal; end if;
    if factory._code_input_problem(p_body) is not null then return factory._code_input_problem(p_body); end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    if m.archived_at is not null then return factory._refusal('computer_archived', 409, 'restore the computer first (restore issues its code)'); end if;
    pid := coalesce(factory._uuid(p_body, 'principal_id'), (select p.principal_id from factory.agent_principals p where p.computer_id = m.computer_id and p.created_via = 'add_computer'));
    if not exists (select 1 from factory.agent_principals p where p.principal_id = pid and p.computer_id = m.computer_id) then return factory._not_found(); end if;
    if exists (select 1 from factory.node_credentials c where c.principal_id = pid and c.status = 'active') then
      return factory._refusal('principal_enrolled', 409, 'this identity holds an active credential: use re-pair (it revokes that credential first)');
    end if;
    return factory._issue_code(a.ctx, m, pid, 'add_computer', p_body);
  end $$;

create function factory.admin_revoke_code(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; n integer;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'revoke_code', false);
    if a.refusal is not null then return a.refusal; end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    update factory.pairing_codes set state = 'PAIRING_REVOKED', revoked_at = now(), revoke_reason = 'admin'
     where computer_id = m.computer_id and state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED')
       and (factory._uuid(p_body, 'principal_id') is null or principal_id = factory._uuid(p_body, 'principal_id'));
    get diagnostics n = row_count;
    update factory.enrollments set state = 'PAIRING_REVOKED', state_at = now() where computer_id = m.computer_id and state = 'PAIRING_STARTED';
    if n = 0 then return jsonb_build_object('ok', true, 'already', true, 'message', 'no live pairing code'); end if;
    perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'pairing.revoked', 'computer', m.computer_id::text, 'ok', 'admin',
                           jsonb_build_object('computer_id', m.computer_id, 'codes', n));
    return jsonb_build_object('ok', true, 'revoked', n);
  end $$;

-- ---------------------------------------------------------------------------------------------------
-- AMEND THE ENVELOPE: a new version, audited (who, when, from -> to), effective on the node's next call with nobody touching the node.
-- Optimistic: expected_version must be the version in force (two admins racing: one wins, the other gets stale_state). Adding
-- release_broker is founder-only. Outstanding pairing codes are revoked (a code is bound to the envelope it was issued under).
-- ---------------------------------------------------------------------------------------------------
create function factory.admin_amend_envelope(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; e record; m factory.computers; cur factory.authorization_envelopes; grants_rb boolean; nv integer;
  begin
    select * into e from factory._envelope_input(p_body -> 'envelope');
    select * into cur from factory.authorization_envelopes x
     where x.computer_id = factory._uuid(p_body, 'computer_id') and x.version = (select m2.current_envelope_version from factory.computers m2 where m2.computer_id = factory._uuid(p_body, 'computer_id'));
    grants_rb := e.problem is null and 'release_broker' = any (e.roles) and not ('release_broker' = any (coalesce(cur.authorized_roles, '{}')));
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'amend_envelope', grants_rb);
    if a.refusal is not null then return a.refusal; end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    if e.problem is not null then return factory._refusal('bad_request', 400, e.problem); end if;
    if jsonb_typeof(p_body -> 'expected_version') <> 'number' or (p_body ->> 'expected_version')::integer <> m.current_envelope_version then
      return factory._refusal('stale_state', 409, 'the envelope changed since you read it (version ' || m.current_envelope_version || ')',
                              jsonb_build_object('current_version', m.current_envelope_version));
    end if;
    select x.* into cur from factory.authorization_envelopes x where x.computer_id = m.computer_id and x.version = m.current_envelope_version;
    if cur.authorized_roles = e.roles and cur.authorized_capabilities = e.caps and cur.allowed_work_types is not distinct from e.types
       and cur.company_ids is not distinct from e.companies and cur.max_concurrent_runs = e.max_runs and cur.max_heavy = e.max_heavy
       and cur.preferred_work_class is not distinct from e.pref then
      return jsonb_build_object('ok', true, 'already', true, 'version', cur.version);
    end if;
    nv := cur.version + 1;
    insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, authorized_capabilities, allowed_work_types,
                                                 company_ids, max_concurrent_runs, max_heavy, preferred_work_class, created_by, reason)
    values (m.tenant_id, m.computer_id, nv, e.roles, e.caps, e.types, e.companies, e.max_runs, e.max_heavy, e.pref, (a.ctx).actor,
            left(p_body ->> 'reason', 500));
    update factory.computers set current_envelope_version = nv where computer_id = m.computer_id;
    update factory.pairing_codes set state = 'PAIRING_REVOKED', revoked_at = now(), revoke_reason = 'envelope_amended'
     where computer_id = m.computer_id and state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED');
    update factory.enrollments set state = 'PAIRING_REVOKED', state_at = now() where computer_id = m.computer_id and state = 'PAIRING_STARTED';
    perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'envelope.amended', 'computer', m.computer_id::text, 'ok', left(p_body ->> 'reason', 300),
      jsonb_build_object('computer_id', m.computer_id, 'from', factory._envelope_json(cur),
        'to', (select factory._envelope_json(x) from factory.authorization_envelopes x where x.computer_id = m.computer_id and x.version = nv)));
    return jsonb_build_object('ok', true, 'version', nv, 'computer', factory._computer_view(m.computer_id));
  end $$;

-- ---------------------------------------------------------------------------------------------------
-- DRAIN / RESUME (contract §2 Runtime): a draining computer takes no new work (gate 9); resume restores it. Idempotent.
-- ---------------------------------------------------------------------------------------------------
create function factory.admin_drain(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; on_ boolean := coalesce(p_body ->> 'drain', 'true') <> 'false';
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, case when on_ then 'drain' else 'resume' end, false);
    if a.refusal is not null then return a.refusal; end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    if on_ = (m.drain_requested_at is not null) then
      return jsonb_build_object('ok', true, 'already', true, 'draining', on_);
    end if;
    update factory.computers set drain_requested_at = case when on_ then now() end, drain_requested_by = case when on_ then (a.ctx).actor end
     where computer_id = m.computer_id;
    perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, case when on_ then 'computer.drained' else 'computer.resumed' end,
                           'computer', m.computer_id::text, 'ok', null, jsonb_build_object('computer_id', m.computer_id));
    return jsonb_build_object('ok', true, 'draining', on_, 'computer', factory._computer_view(m.computer_id));
  end $$;

-- ---------------------------------------------------------------------------------------------------
-- REVOKE (S-3): the credential row is locked EXCLUSIVELY, so every node call (a SHARE lock on the same row) either commits before
-- this, or waits and is refused. A credential superseded by a rotation is followed to its active successor: a node never escapes a
-- revoke by rotating first. Its sessions are NOT ended here, on purpose: the per-call credential re-check is the one enforcement
-- (S-3) and refuses every call by name (credential_revoked). Its leases lapse into the certified takeover; its evidence stays.
-- Without principal_id: every active credential of the computer.
-- ---------------------------------------------------------------------------------------------------
create function factory._revoke_principal(p_ctx factory.admin_ctx, p_principal uuid, p_reason text) returns integer
  language plpgsql volatile set search_path = ''
  as $$
  -- ONE CREDENTIAL AT A TIME, EACH FOUND BY A FRESH STATEMENT. A rotate that commits while this revoke waits on the old credential's
  -- row leaves that row superseded and a NEW active credential this statement's snapshot cannot see; re-reading until no active
  -- credential is left means the revoke always ends on the principal's current credential - a node never escapes a revoke by
  -- rotating (R-4: a rotate races the revoke).
  declare cid uuid; ten uuid; comp uuid; n integer := 0; guard integer := 0; empty integer := 0;
  begin
    loop
      cid := null;
      select x.credential_id, x.tenant_id, x.computer_id into cid, ten, comp from factory.node_credentials x
       where x.principal_id = p_principal and x.status = 'active' order by x.issued_at limit 1 for update;
      -- an EMPTY read may be the re-check of a row a concurrent rotate just superseded: read once more under a new snapshot
      if cid is null then
        empty := empty + 1;
        exit when empty >= 2;
        continue;
      end if;
      empty := 0;
      update factory.node_credentials set status = 'revoked', revoked_at = now(), revoked_by_kind = 'admin', revoked_by = p_ctx.actor,
             revoke_reason = p_reason where credential_id = cid and status = 'active';
      if found then
        perform factory._enrollment_step(e.enrollment_id, 'CREDENTIAL_REVOKED', 'admin', p_reason)
           from factory.enrollments e where e.credential_id = cid and e.state <> 'CREDENTIAL_REVOKED';
        perform factory._audit(ten, 'admin', p_ctx.actor::text, 'credential.revoked', 'credential', cid::text, 'ok', p_reason,
                               jsonb_build_object('computer_id', comp, 'principal_id', p_principal));
        n := n + 1;
      end if;
      guard := guard + 1;
      if guard > 64 then raise exception 'factory: revoke did not converge for principal %', p_principal; end if;
    end loop;
    return n;
  end $$;

create function factory.admin_revoke_credential(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; p uuid; n integer := 0;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'revoke_credential', false);
    if a.refusal is not null then return a.refusal; end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    for p in select x.principal_id from factory.agent_principals x where x.computer_id = m.computer_id
              and (factory._uuid(p_body, 'principal_id') is null or x.principal_id = factory._uuid(p_body, 'principal_id')) loop
      n := n + factory._revoke_principal(a.ctx, p, 'admin_revoke');
    end loop;
    if n = 0 then return jsonb_build_object('ok', true, 'already', true, 'message', 'no active credential'); end if;
    return jsonb_build_object('ok', true, 'revoked', n, 'computer', factory._computer_view(m.computer_id));
  end $$;

-- ROTATE (admin-requested): the node is told on its next call and rotates its own key (the old credential is then superseded)
create function factory.admin_request_rotation(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; n integer;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'request_rotation', false);
    if a.refusal is not null then return a.refusal; end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    update factory.node_credentials set rotation_requested_at = now()
     where computer_id = m.computer_id and status = 'active' and rotation_requested_at is null
       and (factory._uuid(p_body, 'principal_id') is null or principal_id = factory._uuid(p_body, 'principal_id'));
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('ok', true, 'already', true, 'message', 'no active credential without a pending rotation'); end if;
    perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'credential.rotation_requested', 'computer', m.computer_id::text, 'ok', null,
                           jsonb_build_object('computer_id', m.computer_id, 'credentials', n));
    return jsonb_build_object('ok', true, 'requested', n);
  end $$;

-- RE-PAIR: revoke the principal's active credential and issue a new pairing code for THE SAME principal on the same computer (a new
-- key; the old credential stays revoked). CREDENTIAL_REVOKED -> PAIRING_CODE_ISSUED.
create function factory.admin_repair(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; pid uuid; n integer; issued jsonb;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'repair', false);
    if a.refusal is not null then return a.refusal; end if;
    if factory._code_input_problem(p_body) is not null then return factory._code_input_problem(p_body); end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    if m.archived_at is not null then return factory._refusal('computer_archived', 409, 'restore the computer (restore re-pairs it)'); end if;
    pid := coalesce(factory._uuid(p_body, 'principal_id'), (select p.principal_id from factory.agent_principals p where p.computer_id = m.computer_id and p.created_via = 'add_computer'));
    if not exists (select 1 from factory.agent_principals p where p.principal_id = pid and p.computer_id = m.computer_id) then return factory._not_found(); end if;
    n := factory._revoke_principal(a.ctx, pid, 'repair');
    issued := factory._issue_code(a.ctx, m, pid, 'repair', p_body);
    if not (issued ->> 'ok')::boolean then raise exception using errcode = 'P0001', message = 'refused:' || (issued ->> 'refused') || ':' || (issued ->> 'message'); end if;
    return issued || jsonb_build_object('revoked', n, 'computer', factory._computer_view(m.computer_id));
  end $$;

-- ARCHIVE: every active credential of the computer revoked, every live code revoked, no work claimed or assigned; history readable
create function factory.admin_archive(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; p uuid; n integer := 0;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'archive', false);
    if a.refusal is not null then return a.refusal; end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    if m.archived_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;
    for p in select x.principal_id from factory.agent_principals x where x.computer_id = m.computer_id loop
      n := n + factory._revoke_principal(a.ctx, p, 'archive');
    end loop;
    update factory.pairing_codes set state = 'PAIRING_REVOKED', revoked_at = now(), revoke_reason = 'computer_archived'
     where computer_id = m.computer_id and state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED');
    update factory.enrollments set state = 'PAIRING_REVOKED', state_at = now() where computer_id = m.computer_id and state = 'PAIRING_STARTED';
    update factory.computers set archived_at = now(), archived_by = (a.ctx).actor where computer_id = m.computer_id;
    perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'computer.archived', 'computer', m.computer_id::text, 'ok', null,
                           jsonb_build_object('computer_id', m.computer_id, 'credentials_revoked', n));
    return jsonb_build_object('ok', true, 'credentials_revoked', n, 'computer', factory._computer_view(m.computer_id));
  end $$;

-- RESTORE -> RE-PAIR: the computer returns to service only through a fresh pairing code for its first principal (a new key)
create function factory.admin_restore(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; pid uuid; issued jsonb;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'restore', false);
    if a.refusal is not null then return a.refusal; end if;
    if factory._code_input_problem(p_body) is not null then return factory._code_input_problem(p_body); end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    if m.archived_at is null then return jsonb_build_object('ok', true, 'already', true, 'message', 'the computer is not archived'); end if;
    if m.s16a_bound_at is not null and exists (select 1 from factory.computers x where x.tenant_id = m.tenant_id and x.computer_id <> m.computer_id
                                                 and x.s16a_bound_at is not null and x.archived_at is null) then
      return factory._refusal('s16a_already_bound', 409, 'another active computer carries the S-16(a) binding; this one cannot return while it does');
    end if;
    update factory.computers set archived_at = null, archived_by = null where computer_id = m.computer_id;
    select x.* into m from factory.computers x where x.computer_id = m.computer_id;
    pid := (select p.principal_id from factory.agent_principals p where p.computer_id = m.computer_id and p.created_via = 'add_computer');
    issued := factory._issue_code(a.ctx, m, pid, 'restore', p_body);
    if not (issued ->> 'ok')::boolean then raise exception using errcode = 'P0001', message = 'refused:' || (issued ->> 'refused') || ':' || (issued ->> 'message'); end if;
    perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'computer.restored', 'computer', m.computer_id::text, 'ok', null,
                           jsonb_build_object('computer_id', m.computer_id));
    return issued || jsonb_build_object('computer', factory._computer_view(m.computer_id));
  end $$;

-- CREATE AN AGENT PRINCIPAL: the explicit, audited admin action (S-13) - a further identity on this computer, which receives its first
-- credential only through the pairing code issued here for it
create function factory.admin_create_principal(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; pid uuid := gen_random_uuid(); issued jsonb;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'create_principal', false);
    if a.refusal is not null then return a.refusal; end if;
    if factory._code_input_problem(p_body) is not null then return factory._code_input_problem(p_body); end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    if m.archived_at is not null then return factory._refusal('computer_archived', 409, 'the computer is archived'); end if;
    insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by)
    values (pid, m.tenant_id, m.computer_id, 'node-' || replace(pid::text, '-', ''), 'admin_create', (a.ctx).actor);
    perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'principal.created', 'principal', pid::text, 'ok', null,
                           jsonb_build_object('computer_id', m.computer_id));
    issued := factory._issue_code(a.ctx, m, pid, 'add_principal', p_body);
    if not (issued ->> 'ok')::boolean then raise exception using errcode = 'P0001', message = 'refused:' || (issued ->> 'refused') || ':' || (issued ->> 'message'); end if;
    return issued || jsonb_build_object('computer', factory._computer_view(m.computer_id));
  end $$;

-- ADOPT A RELEASE for a computer (adopt / roll back to a certified release; a node never downgrades silently)
create function factory.admin_adopt_release(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; m factory.computers; r factory.releases;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'adopt_release', false);
    if a.refusal is not null then return a.refusal; end if;
    m := factory._admin_computer(a.ctx, factory._uuid(p_body, 'computer_id'), true);
    if m.computer_id is null then return factory._not_found(); end if;
    select x.* into r from factory.releases x where x.release_id = factory._uuid(p_body, 'release_id') and x.tenant_id = m.tenant_id;
    if r.release_id is null then return factory._refusal('not_found', 404, 'no such release'); end if;
    if r.state = 'revoked' then return factory._refusal('release_revoked', 409, 'a revoked release is never adopted'); end if;
    if m.adopted_release_id = r.release_id then return jsonb_build_object('ok', true, 'already', true); end if;
    update factory.computers set adopted_release_id = r.release_id where computer_id = m.computer_id;
    perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'release.adopted', 'computer', m.computer_id::text, 'ok', null,
                           jsonb_build_object('computer_id', m.computer_id, 'release_id', r.release_id, 'from', m.adopted_release_id));
    return jsonb_build_object('ok', true, 'adopted_release_id', r.release_id);
  end $$;

reset role;
