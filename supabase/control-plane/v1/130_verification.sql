-- FACTORY CONTROL PLANE V1 - PART 130: the verification claim and certification (WO-9; contract §1 Verification record, §2
-- Verification; S-13, S-16(b); CR-002 ratified).
--
-- THE MODEL. A done run of a work order W that requires verification makes it the CURRENT CANDIDATE and queues one verification
-- work order V (part 120). An eligible verifier claims V (the 12 gates, with gate 7 = the S-13 floor and the campaign's physical
-- separation against W's AUTHORING SET); W becomes VERIFICATION_CLAIMED. The certifying run then records PASS or FAIL:
--   PASS -> VERIFIED -> COMPLETE (W done; its dependents released)        FAIL -> VERIFICATION_FAILED (W back to the queue for a
--   repair: a NEW authoring run, never an automatic re-verification of the same candidate; its dependents stay blocked).
-- THE FLOOR, enforced HERE whatever the policy rows say (a policy can only add): the certifying run is not in the authoring set;
-- the certifying identity (principal) is none of the authoring identities; the certifier holds verifier authority in its CURRENT
-- envelope; the certification names W and the exact candidate provenance, and that candidate is still W's current one.
-- A hostname, a fingerprint or a machine is never enough on its own; a second run of an authoring identity can never certify.

set local role factory_owner;

create function factory.node_verification_claim(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; r jsonb; w factory.work_orders; cand factory.agent_runs;
  begin
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
    select * into a from factory._node_session(p_token_hash, false, 'verification_claim');
    if a.refusal is not null then return a.refusal; end if;
    r := factory._claim(a.ctx, p_body, 'verification');
    if coalesce(r -> 'claimed', 'null'::jsonb) = 'null'::jsonb then return r; end if;
    select x.* into w from factory.work_orders x where x.work_order_id = (r -> 'claimed' -> 'work_order' ->> 'verifies_work_order_id')::uuid;
    select x.* into cand from factory.agent_runs x where x.run_id = w.current_candidate_run_id;
    return jsonb_set(r, '{claimed,verifies}', jsonb_build_object(
      'work_order', factory._work_order_view(w),
      'candidate', jsonb_build_object('run_id', cand.run_id, 'head_commit', cand.head_commit, 'candidate_tree', cand.candidate_tree,
                                      'summary', cand.summary, 'finished_at', cand.finished_at)));
  end $$;

create function factory.node_certify(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare
    a record; ctx factory.node_ctx; me factory.nodes;
    vr factory.agent_runs; v factory.work_orders; w factory.work_orders; cand factory.agent_runs;
    verdict text := p_body ->> 'verdict';
    why text;
    aset jsonb;
    pols jsonb;
    phys boolean;
    mine text[];
    cert uuid := gen_random_uuid();
  begin
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
    select * into a from factory._node_session(p_token_hash, false, 'certify');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    if verdict is null or verdict not in ('PASS', 'FAIL') then
      return factory._refusal('bad_request', 400, 'verdict is PASS or FAIL');
    end if;
    select x.* into vr from factory.agent_runs x
     where x.run_id = case when p_body ->> 'run_id' ~ '^[0-9a-f-]{36}$' then (p_body ->> 'run_id')::uuid end for update;
    if vr.run_id is null or vr.node_id is distinct from ctx.node_id or vr.status <> 'in_progress' or vr.run_kind <> 'verification' then
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.certify', 'run', p_body ->> 'run_id', 'refused', 'superseded');
      return factory._refusal('superseded', 409, 'this verification run no longer holds its verification work: nothing certified');
    end if;
    select x.* into v from factory.work_orders x where x.work_order_id = vr.work_order_id for update;
    select x.* into w from factory.work_orders x where x.work_order_id = v.verifies_work_order_id for update;
    select x.* into cand from factory.agent_runs x where x.run_id = v.verifies_run_id;
    select n.* into me from factory.nodes n where n.node_id = ctx.node_id;

    -- THE FLOOR (S-13), whatever the policy rows say
    if w.current_candidate_run_id is distinct from v.verifies_run_id or w.verification_state <> 'VERIFICATION_CLAIMED' then
      why := 'provenance_not_current: this candidate is not the work order''s current candidate (a new authoring run voided it)';
    elsif (p_body ->> 'work_order_id') is distinct from w.work_order_id::text
       or (p_body ->> 'candidate_run_id') is distinct from cand.run_id::text
       or (p_body ->> 'candidate_tree') is distinct from cand.candidate_tree
       or ((p_body ->> 'candidate_commit') is not null and (p_body ->> 'candidate_commit') is distinct from cand.head_commit) then
      why := 'provenance_mismatch: the certification must name this work order and exactly its current candidate (run, content digest, commit)';
    elsif exists (select 1 from factory._authoring_set(w.work_order_id, cand.run_id) s where s.run_id = vr.run_id) then
      why := 'run_in_authoring_set: the certifying run is in the authoring set';
    elsif exists (select 1 from factory._authoring_set(w.work_order_id, cand.run_id) s where s.principal_id = ctx.principal_id) then
      why := 'identity_in_authoring_set: the certifying identity authored this candidate (a second run of an authoring identity never certifies)';
    elsif not ('verifier' = any (ctx.authorized_roles)) then
      why := 'no_verifier_authority: the certifier''s CURRENT envelope does not authorize the verifier role';
    end if;
    -- THE POLICIES (they can only add)
    select coalesce(jsonb_agg(jsonb_build_object('policy_id', p.policy_id, 'version', p.version, 'scope', p.scope,
                                                 'campaign_key', p.campaign_key) order by p.scope desc), '[]'::jsonb),
           coalesce(bool_or(p.require_physical_separation), false)
      into pols, phys
      from factory._policies_for(w.tenant_id, w.campaign_key) p;
    mine := factory._computer_fingerprints(ctx.computer_id, me.machine_fingerprint);
    if why is null and phys then
      if exists (select 1 from factory._authoring_set(w.work_order_id, cand.run_id) s where s.computer_id = ctx.computer_id) then
        why := 'campaign_same_computer: the certifier is the same enrolled computer record as an authoring-set member';
      elsif factory._authoring_fingerprints(w.work_order_id, cand.run_id) && mine then
        why := 'campaign_same_fingerprint: a machine fingerprint the certifier reported equals one an authoring-set member reported';
      end if;
    end if;
    if why is not null then
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.certify', 'work_order', w.work_order_id::text,
                             'refused', why, jsonb_build_object('run_id', vr.run_id, 'verdict', verdict));
      return factory._refusal('certification_refused', 403, why, jsonb_build_object('reason', split_part(why, ':', 1)));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('run_id', s.run_id, 'node_id', s.node_id, 'principal_id', s.principal_id,
                                                 'computer_id', s.computer_id, 'machine_fingerprint', s.machine_fingerprint) order by s.run_id), '[]'::jsonb)
      into aset from factory._authoring_set(w.work_order_id, cand.run_id) s;
    insert into factory.certifications (certification_id, tenant_id, work_order_id, verification_work_order_id, candidate_run_id,
      candidate_commit, candidate_tree, certifying_run_id, certifying_node_id, certifying_principal_id, certifying_computer_id,
      certifying_credential_id, certifier_envelope_version, certifier_fingerprints, verdict, reason, policies, authoring_set)
    values (cert, w.tenant_id, w.work_order_id, v.work_order_id, cand.run_id, cand.head_commit, cand.candidate_tree, vr.run_id,
      ctx.node_id, ctx.principal_id, ctx.computer_id, ctx.credential_id, ctx.envelope_version, mine, verdict,
      left(p_body ->> 'reason', 2000), pols, aset);
    update factory.agent_runs
       set status = 'done', termination_reason = 'certified_' || lower(verdict), summary = coalesce(left(p_body ->> 'reason', 4000), summary),
           finished_at = now(), lease_expires_at = null, updated_at = now()
     where run_id = vr.run_id;
    delete from factory.surface_locks where run_id = vr.run_id;
    update factory.work_orders set status = 'done', completed_at = now(), updated_at = now() where work_order_id = v.work_order_id;
    if verdict = 'PASS' then
      -- VERIFIED -> COMPLETE: every required verification (one per candidate) is VERIFIED; the server moves it, never a node's claim
      update factory.work_orders
         set verification_state = 'COMPLETE', verification_state_at = now(), status = 'done', completed_at = now(), updated_at = now(),
             verification_reason = 'VERIFIED by certification ' || cert
       where work_order_id = w.work_order_id;
    else
      -- VERIFICATION_FAILED: never COMPLETE, dependents stay blocked; the work order returns to the queue for a repair (a new
      -- authoring run) with no founder keystroke, and this candidate is never re-verified
      update factory.work_orders
         set verification_state = 'VERIFICATION_FAILED', verification_state_at = now(), status = 'queued', queued_at = now(),
             updated_at = now(), verification_reason = 'FAILED by certification ' || cert
       where work_order_id = w.work_order_id;
    end if;
    perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.certify', 'work_order', w.work_order_id::text, 'ok',
                           verdict, jsonb_build_object('certification_id', cert, 'candidate_run_id', cand.run_id));
    return jsonb_build_object('ok', true, 'certification_id', cert, 'verdict', verdict, 'server_time', now(),
      'work_order_state', case when verdict = 'PASS' then 'COMPLETE' else 'VERIFICATION_FAILED' end);
  end $$;

reset role;
