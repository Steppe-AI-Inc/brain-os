-- FACTORY CONTROL PLANE V1 - PART 220: releases, policies, waiting verifications, work (WO-6, WO-8, WO-9, WO-5 dispatch).

set local role factory_owner;

-- ---------------------------------------------------------------------------------------------------
-- RELEASES (contract §2 Release; S-5; CR-003). Publishing, superseding and revoking are FOUNDER-ONLY. The plane records the manifest
-- the founder signed (under C-3 on the live plane); it holds no trust key and adds none to any node: a node's trust set is fixed in
-- the artifact it installed. What reaches a node from here is a revocation, never a key.
-- ---------------------------------------------------------------------------------------------------
create function factory.admin_publish_release(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; rid uuid := gen_random_uuid(); prev factory.releases; ch text := p_body ->> 'channel';
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'publish_release', true);
    if a.refusal is not null then return a.refusal; end if;
    if ch is null or ch not in ('production', 'dev')
       or coalesce(p_body ->> 'version', '') !~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]{1,40})?$'
       or coalesce(p_body ->> 'source_sha', '') !~ '^[0-9a-f]{40}$' or coalesce(p_body ->> 'digest', '') !~ '^[0-9a-f]{64}$'
       or coalesce(p_body ->> 'key_id', '') !~ '^[A-Za-z0-9:_-]{8,80}$' or coalesce(p_body ->> 'signature', '') !~ '^[A-Za-z0-9_-]{86}$'
       or coalesce(p_body ->> 'receipt_sha256', '') !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_body -> 'manifest') <> 'object' then
      return factory._refusal('bad_request', 400, 'a release is {channel, version, source_sha, digest, key_id, signature, receipt_sha256, manifest}');
    end if;
    if exists (select 1 from factory.release_revocations v where v.tenant_id = (a.ctx).tenant_id and v.kind = 'key' and v.key_id = p_body ->> 'key_id') then
      return factory._refusal('key_revoked', 409, 'this release is signed by a revoked key');
    end if;
    if exists (select 1 from factory.releases r where r.tenant_id = (a.ctx).tenant_id and r.channel = ch
                 and (r.version = p_body ->> 'version' or r.digest = p_body ->> 'digest')) then
      return factory._refusal('already_published', 409, 'this version or digest was published before on this channel');
    end if;
    select r.* into prev from factory.releases r where r.tenant_id = (a.ctx).tenant_id and r.channel = ch and r.state = 'published' for update;
    if prev.release_id is not null then
      update factory.releases set state = 'superseded', superseded_at = now(), superseded_by_release_id = rid where release_id = prev.release_id;
    end if;
    insert into factory.releases (release_id, tenant_id, channel, version, source_sha, digest, key_id, signature, receipt_sha256, manifest, published_by)
    values (rid, (a.ctx).tenant_id, ch, p_body ->> 'version', p_body ->> 'source_sha', p_body ->> 'digest', p_body ->> 'key_id',
            p_body ->> 'signature', p_body ->> 'receipt_sha256', p_body -> 'manifest', (a.ctx).actor);
    perform factory._audit((a.ctx).tenant_id, 'admin', (a.ctx).actor::text, 'release.published', 'release', rid::text, 'ok', null,
      jsonb_build_object('channel', ch, 'version', p_body ->> 'version', 'digest', p_body ->> 'digest', 'supersedes', prev.release_id));
    return jsonb_build_object('ok', true, 'release_id', rid, 'supersedes', prev.release_id);
  end $$;

create function factory.admin_revoke_release(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; r factory.releases;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'revoke_release', true);
    if a.refusal is not null then return a.refusal; end if;
    select x.* into r from factory.releases x where x.release_id = factory._uuid(p_body, 'release_id') and x.tenant_id = (a.ctx).tenant_id for update;
    if r.release_id is null then return factory._refusal('not_found', 404, 'no such release'); end if;
    if r.state = 'revoked' then return jsonb_build_object('ok', true, 'already', true); end if;
    update factory.releases set state = 'revoked', revoked_at = now(), revoked_by = (a.ctx).actor, revoke_reason = left(p_body ->> 'reason', 300)
     where release_id = r.release_id;
    insert into factory.release_revocations (tenant_id, kind, release_id, revoked_by, reason)
    values (r.tenant_id, 'release', r.release_id, (a.ctx).actor, left(p_body ->> 'reason', 300));
    perform factory._audit(r.tenant_id, 'admin', (a.ctx).actor::text, 'release.revoked', 'release', r.release_id::text, 'ok', left(p_body ->> 'reason', 300));
    return jsonb_build_object('ok', true, 'release_id', r.release_id, 'state', 'revoked');
  end $$;

create function factory.admin_revoke_key(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; k text := p_body ->> 'key_id';
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'revoke_key', true);
    if a.refusal is not null then return a.refusal; end if;
    if k is null or k !~ '^[A-Za-z0-9:_-]{8,80}$' then return factory._refusal('bad_request', 400, 'key_id is required'); end if;
    if exists (select 1 from factory.release_revocations v where v.tenant_id = (a.ctx).tenant_id and v.kind = 'key' and v.key_id = k) then
      return jsonb_build_object('ok', true, 'already', true);
    end if;
    insert into factory.release_revocations (tenant_id, kind, key_id, revoked_by, reason) values ((a.ctx).tenant_id, 'key', k, (a.ctx).actor, left(p_body ->> 'reason', 300));
    perform factory._audit((a.ctx).tenant_id, 'admin', (a.ctx).actor::text, 'release.key_revoked', 'release_key', k, 'ok', left(p_body ->> 'reason', 300));
    return jsonb_build_object('ok', true, 'key_id', k);
  end $$;

create function factory.admin_list_releases(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare a record; items jsonb; total integer;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'list_releases', false);
    if a.refusal is not null then return a.refusal; end if;
    select count(*) into total from factory.releases r where r.tenant_id = (a.ctx).tenant_id;
    select coalesce(jsonb_agg(to_jsonb(r) - 'manifest' order by r.published_at desc), '[]'::jsonb) into items
      from (select * from factory.releases r where r.tenant_id = (a.ctx).tenant_id order by r.published_at desc limit 100) r;
    return jsonb_build_object('ok', true, 'releases', jsonb_build_object('items', items, 'shown', jsonb_array_length(items), 'total', total,
      'truncated', jsonb_array_length(items) < total, 'order', 'published_at desc'), 'revocations', factory._revocations((a.ctx).tenant_id));
  end $$;

-- ---------------------------------------------------------------------------------------------------
-- POLICIES (S-14): the view, and changes that only make a policy STRICTER. The campaign rows are read-only here during this
-- milestone. The guard (part 080) enforces the same for every API-login writer; this front door names the refusal first.
-- ---------------------------------------------------------------------------------------------------
create function factory.admin_list_policies(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare a record;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'list_policies', false);
    if a.refusal is not null then return a.refusal; end if;
    return jsonb_build_object('ok', true,
      'policies', (select coalesce(jsonb_agg(to_jsonb(p) order by p.scope desc, p.campaign_key), '[]'::jsonb) from factory.verification_policies p where p.tenant_id = (a.ctx).tenant_id),
      'versions', (select coalesce(jsonb_agg(jsonb_build_object('policy_id', v.policy_id, 'version', v.version, 'recorded_at', v.recorded_at,
                     'recorded_by', v.recorded_by) order by v.policy_id, v.version), '[]'::jsonb) from factory.verification_policy_versions v where v.tenant_id = (a.ctx).tenant_id));
  end $$;

create function factory.admin_update_policy(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; p factory.verification_policies; ch jsonb := p_body -> 'changes'; k text;
          b1 boolean; b2 boolean; b3 boolean; b4 boolean; b5 boolean; paths text[];
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'update_policy', false);
    if a.refusal is not null then return a.refusal; end if;
    select x.* into p from factory.verification_policies x where x.policy_id = factory._uuid(p_body, 'policy_id') and x.tenant_id = (a.ctx).tenant_id for update;
    if p.policy_id is null then return factory._refusal('not_found', 404, 'no such policy'); end if;
    if p.frozen then
      perform factory._audit(p.tenant_id, 'admin', (a.ctx).actor::text, 'policy.update', 'policy', p.policy_id::text, 'refused', 'frozen');
      return factory._refusal('policy_frozen', 403, 'the milestone campaign rows cannot be changed through the Admin API (S-14)');
    end if;
    if jsonb_typeof(p_body -> 'expected_version') <> 'number' or (p_body ->> 'expected_version')::integer <> p.version then
      return factory._refusal('stale_state', 409, 'the policy changed since you read it', jsonb_build_object('current_version', p.version));
    end if;
    if ch is null or jsonb_typeof(ch) <> 'object' then return factory._refusal('bad_request', 400, 'changes is an object'); end if;
    for k in select jsonb_object_keys(ch) loop
      if k not in ('require_distinct_run', 'require_distinct_identity', 'require_verifier_authority', 'require_physical_separation',
                   'restrict_bound_computer_authoring', 'director_document_paths') then
        return factory._refusal('bad_request', 400, 'unknown policy field ' || k);
      end if;
    end loop;
    b1 := coalesce((ch ->> 'require_distinct_run')::boolean, p.require_distinct_run);
    b2 := coalesce((ch ->> 'require_distinct_identity')::boolean, p.require_distinct_identity);
    b3 := coalesce((ch ->> 'require_verifier_authority')::boolean, p.require_verifier_authority);
    b4 := coalesce((ch ->> 'require_physical_separation')::boolean, p.require_physical_separation);
    b5 := coalesce((ch ->> 'restrict_bound_computer_authoring')::boolean, p.restrict_bound_computer_authoring);
    paths := case when jsonb_typeof(ch -> 'director_document_paths') = 'array' then array(select x from jsonb_array_elements_text(ch -> 'director_document_paths') x)
                  else p.director_document_paths end;
    if (p.require_distinct_run and not b1) or (p.require_distinct_identity and not b2) or (p.require_verifier_authority and not b3)
       or (p.require_physical_separation and not b4) or (p.restrict_bound_computer_authoring and not b5)
       or not (paths <@ p.director_document_paths) or (b5 and cardinality(paths) = 0) then
      perform factory._audit(p.tenant_id, 'admin', (a.ctx).actor::text, 'policy.update', 'policy', p.policy_id::text, 'refused', 'relaxation');
      return factory._refusal('policy_relaxation_refused', 403, 'a policy can only be made stricter through the Admin API (S-14)');
    end if;
    if (b1, b2, b3, b4, b5, paths) is not distinct from (p.require_distinct_run, p.require_distinct_identity, p.require_verifier_authority,
                                                         p.require_physical_separation, p.restrict_bound_computer_authoring, p.director_document_paths) then
      return jsonb_build_object('ok', true, 'already', true, 'version', p.version);
    end if;
    update factory.verification_policies
       set require_distinct_run = b1, require_distinct_identity = b2, require_verifier_authority = b3, require_physical_separation = b4,
           restrict_bound_computer_authoring = b5, director_document_paths = paths, version = version + 1, updated_at = now(),
           updated_by = 'admin:' || (a.ctx).actor
     where policy_id = p.policy_id;
    perform factory._audit(p.tenant_id, 'admin', (a.ctx).actor::text, 'policy.stricter', 'policy', p.policy_id::text, 'ok', null,
                           jsonb_build_object('from_version', p.version, 'changes', ch));
    return jsonb_build_object('ok', true, 'version', p.version + 1);
  end $$;

-- ---------------------------------------------------------------------------------------------------
-- WAITING VERIFICATIONS: every work order waiting for (or holding) an independent verification, with why no verifier is eligible:
-- each enrolled node's FIRST failing gate for it, computed by the same gates the claim uses. Never self-certified.
-- ---------------------------------------------------------------------------------------------------
create function factory.admin_list_waiting_verifications(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare a record; items jsonb := '[]'::jsonb; w factory.work_orders; v factory.work_orders; n factory.nodes; gates jsonb; oc factory.node_ctx; total integer;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'list_waiting_verifications', false);
    if a.refusal is not null then return a.refusal; end if;
    select count(*) into total from factory.work_orders x where x.tenant_id = (a.ctx).tenant_id
       and x.verification_state in ('WAITING_FOR_INDEPENDENT_VERIFICATION', 'VERIFICATION_CLAIMED');
    for w in select x.* from factory.work_orders x where x.tenant_id = (a.ctx).tenant_id
               and x.verification_state in ('WAITING_FOR_INDEPENDENT_VERIFICATION', 'VERIFICATION_CLAIMED')
             order by x.verification_state_at limit 50 loop
      select x.* into v from factory.work_orders x where x.verifies_work_order_id = w.work_order_id and x.verifies_run_id = w.current_candidate_run_id
       order by x.created_at desc limit 1;
      gates := '[]'::jsonb;
      for n in select y.* from factory.nodes y where y.tenant_id = w.tenant_id and y.principal_id is not null loop
        oc := factory._peek_ctx(n.principal_id);
        gates := gates || jsonb_build_array(jsonb_build_object('node_id', n.node_id,
          'first_failing_gate', case when oc.credential_id is null then factory._gate(1, 'no active credential on an active computer')
                                     else factory._first_failing_gate(oc, v, 'verification', n) end));
      end loop;
      items := items || jsonb_build_array(jsonb_build_object('work_order', factory._work_order_view(w), 'state', w.verification_state,
        'since', w.verification_state_at, 'reason', w.verification_reason, 'verification_work_order_id', v.work_order_id,
        'candidate_run_id', w.current_candidate_run_id,
        'eligible_verifiers', (select count(*) from jsonb_array_elements(gates) g where g -> 'first_failing_gate' = 'null'::jsonb),
        'nodes', gates));
    end loop;
    return jsonb_build_object('ok', true, 'waiting', jsonb_build_object('items', items, 'shown', jsonb_array_length(items), 'total', total,
      'truncated', jsonb_array_length(items) < total, 'order', 'waiting since'));
  end $$;

-- ---------------------------------------------------------------------------------------------------
-- SUBMIT A WORK ORDER (product dispatch through the API; WO-5 "Dispatch"): a new-model work order, holding factory-enrolled-v1, with
-- numeric priority. The scheduler alone decides which node takes it; the admin never assigns one.
-- ---------------------------------------------------------------------------------------------------
create function factory.admin_submit_work_order(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; wid uuid := gen_random_uuid(); caps text[]; surf text[]; deps uuid[]; role text := coalesce(p_body ->> 'requires_security_role', 'generic');
          d uuid; pr integer;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'submit_work_order', role = 'release_broker');
    if a.refusal is not null then return a.refusal; end if;
    if coalesce(length(btrim(p_body ->> 'title')), 0) not between 1 and 500 then return factory._refusal('bad_request', 400, 'title is 1..500 characters'); end if;
    if role not in ('generic', 'verifier', 'release_broker') then return factory._refusal('bad_request', 400, 'requires_security_role is generic, verifier or release_broker'); end if;
    caps := case when jsonb_typeof(p_body -> 'requires_capabilities') = 'array' then array(select x from jsonb_array_elements_text(p_body -> 'requires_capabilities') x) else '{}' end;
    if exists (select 1 from unnest(caps) c where factory._capability_reserved(c) or not factory._capability_name_ok(c)) then
      return factory._refusal('bad_request', 400, 'requires_capabilities: well-formed names; factory-enrolled-v1 is added by the server');
    end if;
    surf := case when jsonb_typeof(p_body -> 'owned_surface') = 'array' then array(select x from jsonb_array_elements_text(p_body -> 'owned_surface') x) else '{}' end;
    if exists (select 1 from unnest(surf) s where s is null or btrim(s) = '' or octet_length(s) > 1000) then return factory._refusal('bad_request', 400, 'owned_surface entries are 1..1000 bytes'); end if;
    if jsonb_typeof(p_body -> 'priority') <> 'number' then return factory._refusal('bad_request', 400, 'priority is a number (larger is more urgent)'); end if;
    pr := (p_body ->> 'priority')::numeric::integer;
    deps := case when jsonb_typeof(p_body -> 'depends_on') = 'array' then array(select x::uuid from jsonb_array_elements_text(p_body -> 'depends_on') x where x ~ '^[0-9a-f-]{36}$') else '{}' end;
    if exists (select 1 from unnest(deps) d2 where not exists (select 1 from factory.work_orders w where w.work_order_id = d2 and w.tenant_id = (a.ctx).tenant_id
                                                               and factory._new_model_capabilities(w.requires_capabilities))) then
      return factory._refusal('bad_request', 400, 'depends_on names new-model work orders of your tenant');
    end if;
    insert into factory.work_orders (work_order_id, tenant_id, title, work_type, status, owned_surface, requires_security_role, requires_capabilities,
                                     priority_num, weight, company_id, campaign_key, requires_verification, min_resources, handoff, queued_at, submitted_by)
    values (wid, (a.ctx).tenant_id, btrim(p_body ->> 'title'), coalesce(nullif(p_body ->> 'work_type', ''), 'software_development'), 'queued', surf, role,
            array['factory-enrolled-v1'] || caps, pr, coalesce(p_body ->> 'weight', 'normal'), factory._uuid(p_body, 'company_id'),
            p_body ->> 'campaign_key', coalesce((p_body ->> 'requires_verification')::boolean, true),
            case when jsonb_typeof(p_body -> 'min_resources') = 'object' then p_body -> 'min_resources' end, left(p_body ->> 'handoff', 20000), now(), (a.ctx).actor);
    foreach d in array deps loop
      insert into factory.work_order_dependencies (work_order_id, depends_on, tenant_id) values (wid, d, (a.ctx).tenant_id);
    end loop;
    perform factory._audit((a.ctx).tenant_id, 'admin', (a.ctx).actor::text, 'work_order.submitted', 'work_order', wid::text, 'ok', null,
                           jsonb_build_object('priority', pr, 'role', role, 'surfaces', to_jsonb(surf), 'campaign_key', p_body ->> 'campaign_key'));
    return jsonb_build_object('ok', true, 'work_order_id', wid);
  end $$;

-- WORK OBSERVATION: new-model work orders and their runs (a CollectionEnvelope; the total from an aggregate count)
create function factory.admin_list_work(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare a record; items jsonb; total integer;
  begin
    select * into a from factory._admin(p_actor, p_live_role, p_body, 'list_work', false);
    if a.refusal is not null then return a.refusal; end if;
    select count(*) into total from factory.work_orders w where w.tenant_id = (a.ctx).tenant_id and factory._new_model_capabilities(w.requires_capabilities);
    select coalesce(jsonb_agg(factory._work_order_view(w) || jsonb_build_object('status', w.status, 'verification_state', w.verification_state,
             'queued_at', w.queued_at, 'completed_at', w.completed_at,
             'runs', (select coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'node_id', r.node_id, 'computer_id', r.computer_id, 'kind', r.run_kind,
                        'status', r.status, 'started_at', r.started_at, 'finished_at', r.finished_at, 'lease_expires_at', r.lease_expires_at,
                        'runtime_version', r.runtime_version, 'termination_reason', r.termination_reason) order by r.started_at), '[]'::jsonb)
                      from factory.agent_runs r where r.work_order_id = w.work_order_id)) order by w.queued_at desc), '[]'::jsonb) into items
      from (select * from factory.work_orders w where w.tenant_id = (a.ctx).tenant_id and factory._new_model_capabilities(w.requires_capabilities)
             order by w.queued_at desc limit 100) w;
    return jsonb_build_object('ok', true, 'work', jsonb_build_object('items', items, 'shown', jsonb_array_length(items), 'total', total,
      'truncated', jsonb_array_length(items) < total, 'order', 'queued_at desc'));
  end $$;

reset role;
