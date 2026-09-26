-- FACTORY CONTROL PLANE V1 - PART 110: eligibility and ranking (WO-5; contract P-6, P-7; S-1, S-16).
--
-- HARD GATES, IN EXACTLY THIS ORDER (founder I A.4 §7), for normal scheduling, takeover and verification alike. A refusal names
-- the FIRST gate that fails:
--    1 valid_credential        the node's credential is active, its computer not archived
--    2 tenant                  the work order is in the node's tenant
--    3 company_scope           the envelope's company_ids (when narrowed) hold the work order's company
--    4 authorization           the envelope authorizes this work type, and the node runs a current certified release
--    5 required_role           the work order's required role is one the envelope authorizes
--    6 required_capabilities   every required capability is in the ENVELOPE; detection on the node may only remove one
--    7 independence            the policies: S-16(a) for authoring; the S-13 floor and the campaign's physical separation for
--                              verification
--    8 surface_locks           no live lock (either fleet) on a surface the work order owns
--    9 drain                   the computer is not draining
--   10 health                  a heartbeat within 180 s, and not RECOVERING
--   11 max_concurrency         the envelope's run and heavy limits, and the tenant's plane-wide heavy limit
--   12 minimum_resources       the work order's hard minimum resources against the node's report (narrowing only)
-- THEN RANKING, among nodes that passed every gate, never before: resource fitness, preferred work class, CPU / RAM / disk
-- headroom, current load, recent reliability, locality (then node id, so the order is total). A node defers a work order only
-- while a strictly better-ranked, fresh, AVAILABLE node is eligible for it, and only until 30 s after it became claimable: all
-- ranking together delays eligible work by at most 30 s and never excludes (P-6). Hostname, fingerprint and resource fitness
-- never create authority (S-1): nothing below reads them before the gates, and gate 12 can only exclude.
-- WORK ORDER ORDER for a node: numeric priority (larger first; 2 < 10 < 100, P-7), then queue age.

set local role factory_owner;

create function factory._gate_names() returns text[]
  language sql immutable parallel safe set search_path = ''
  as $$ select array['valid_credential', 'tenant', 'company_scope', 'authorization', 'required_role', 'required_capabilities',
                     'independence', 'surface_locks', 'drain', 'health', 'max_concurrency', 'minimum_resources'] $$;

create function factory._gate(n integer, detail text) returns jsonb
  language sql immutable parallel safe set search_path = ''
  as $$ select jsonb_build_object('gate', n, 'gate_name', (factory._gate_names())[n], 'detail', detail) $$;

-- is a surface held by a LIVE lock of either fleet? (a legacy lock: its own lease; an enrolled lock: its run's lease)
create function factory._surface_held(p_surface text, p_except_run uuid default null) returns boolean
  language sql stable set search_path = ''
  as $$
    select exists (
      select 1 from factory.surface_locks l
       where l.surface = p_surface and (p_except_run is null or l.run_id <> p_except_run)
         and ((l.principal_id is null and l.lease_expires_at > now())
           or (l.principal_id is not null and exists (
                 select 1 from factory.agent_runs r where r.run_id = l.run_id and r.status = 'in_progress' and r.lease_expires_at > now()))))
  $$;

-- a context for ANY enrolled principal, read without locking (used to rank other nodes; the calling node's own context always
-- comes from its locked credential)
create function factory._peek_ctx(p_principal uuid) returns factory.node_ctx
  language sql stable set search_path = ''
  as $$
    select row(c.tenant_id, c.computer_id, c.principal_id, c.credential_id, p.node_id, e.version, e.authorized_roles,
               e.authorized_capabilities, e.allowed_work_types, e.company_ids, e.max_concurrent_runs, e.max_heavy,
               e.preferred_work_class, m.drain_requested_at is not null, m.s16a_bound_at is not null)::factory.node_ctx
      from factory.node_credentials c
      join factory.agent_principals p on p.principal_id = c.principal_id
      join factory.computers m on m.computer_id = c.computer_id
      join factory.authorization_envelopes e on e.computer_id = m.computer_id and e.version = m.current_envelope_version
     where c.principal_id = p_principal and c.status = 'active' and m.archived_at is null
  $$;

-- the authoring set of a work order (S-13): every run that held a lease on it, and every run that wrote a checkpoint the
-- completing run consumed - each with its identity (principal) and computer
create function factory._authoring_set(p_work_order uuid, p_candidate_run uuid default null) returns table (
  run_id uuid, node_id text, principal_id uuid, computer_id uuid, machine_fingerprint text)
  language sql stable set search_path = ''
  as $$
    select r.run_id, r.node_id, r.principal_id, r.computer_id, r.machine_fingerprint
      from factory.agent_runs r
     where r.work_order_id = p_work_order and coalesce(r.run_kind, 'authoring') = 'authoring'
    union
    select w.run_id, w.node_id, w.principal_id, w.computer_id, w.machine_fingerprint
      from factory.agent_runs c
      join factory.checkpoints k on k.checkpoint_id = c.resumed_from_checkpoint_id
      join factory.agent_runs w on w.run_id = k.run_id
     where p_candidate_run is not null and c.run_id = p_candidate_run
  $$;

-- every machine fingerprint the authoring set's computers reported (registration and runs): the campaign compares against all
create function factory._authoring_fingerprints(p_work_order uuid, p_candidate_run uuid) returns text[]
  language sql stable set search_path = ''
  as $$
    select coalesce(array_agg(distinct f), '{}'::text[]) from (
      select a.machine_fingerprint f from factory._authoring_set(p_work_order, p_candidate_run) a where a.machine_fingerprint is not null
      union
      select cf.fingerprint from factory.computer_fingerprints cf
       where cf.computer_id in (select a.computer_id from factory._authoring_set(p_work_order, p_candidate_run) a where a.computer_id is not null)
    ) x
  $$;

create function factory._computer_fingerprints(p_computer uuid, p_reported text) returns text[]
  language sql stable set search_path = ''
  as $$
    select coalesce(array_agg(distinct f), '{}'::text[]) from (
      select cf.fingerprint f from factory.computer_fingerprints cf where cf.computer_id = p_computer
      union select p_reported where p_reported is not null
      union select n.machine_fingerprint from factory.nodes n where n.computer_id = p_computer and n.machine_fingerprint is not null
    ) x
  $$;

-- the policies that apply to a work order: the tenant default, plus its campaign's row (a campaign row can only add)
create function factory._policies_for(p_tenant uuid, p_campaign text) returns setof factory.verification_policies
  language sql stable set search_path = ''
  as $$
    select p.* from factory.verification_policies p
     where p.tenant_id = p_tenant and (p.scope = 'tenant_default' or (p_campaign is not null and p.scope = 'campaign' and p.campaign_key = p_campaign))
  $$;

-- S-16(a): the Director-document paths a bound computer may author within (null = no restriction applies). The restriction is
-- applied to EVERY authoring claim by the bound computer while any campaign row of the tenant carries it: it only ever removes
-- eligibility, and it cannot be evaded by leaving a work order untagged.
create function factory._bound_authoring_paths(p_tenant uuid) returns text[]
  language sql stable set search_path = ''
  as $$
    -- null when no policy restricts; otherwise the paths EVERY restricting policy allows (the stricter reading)
    select case when (select count(*) from factory.verification_policies q
                       where q.tenant_id = p_tenant and q.restrict_bound_computer_authoring) = 0 then null
      else (select coalesce(array_agg(x order by x), '{}'::text[]) from (
              select x from factory.verification_policies q cross join unnest(q.director_document_paths) x
               where q.tenant_id = p_tenant and q.restrict_bound_computer_authoring
               group by x
              having count(*) = (select count(*) from factory.verification_policies q3
                                  where q3.tenant_id = p_tenant and q3.restrict_bound_computer_authoring)) z)
      end
  $$;

create function factory._surfaces_within(p_surfaces text[], p_paths text[]) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$
    select cardinality(coalesce(p_surfaces, '{}'::text[])) > 0
       and not exists (
         select 1 from unnest(p_surfaces) s
          where s is null or s ~ '(^/|\\|(^|/)\.\.?(/|$))'
             or not exists (select 1 from unnest(p_paths) p where left(s, length(p)) = p))
  $$;

-- the node's current release is certified for claiming: the published release of its channel, or the release a Factory admin
-- adopted for its computer; never a revoked one (contract §2 Release; AC-5 (j), (m))
create function factory._release_current(p_ctx factory.node_ctx, p_release uuid) returns boolean
  language sql stable set search_path = ''
  as $$
    select p_release is not null and exists (
      select 1 from factory.releases r
       where r.release_id = p_release and r.tenant_id = p_ctx.tenant_id and r.state <> 'revoked'
         and (r.state = 'published'
              or r.release_id = (select m.adopted_release_id from factory.computers m where m.computer_id = p_ctx.computer_id)))
  $$;

-- THE GATES. p_kind: 'authoring' | 'verification'. p_node: the node's factory.nodes row (its report). Returns null when eligible,
-- else the first failing gate.
create function factory._first_failing_gate(p_ctx factory.node_ctx, p_wo factory.work_orders, p_kind text, p_node factory.nodes)
  returns jsonb
  language plpgsql stable set search_path = ''
  as $$
  declare
    req text[];
    absent jsonb;
    res jsonb := coalesce(p_node.reported_resources, '{}'::jsonb);
    need jsonb := coalesce(p_wo.min_resources, '{}'::jsonb);
    paths text[];
    fps text[];
    mine text[];
    cand uuid;
    phys boolean;
    busy integer;
    heavy_mine integer;
    heavy_plane integer;
    plane_limit integer;
    k text;
  begin
    -- 1 valid credential
    if p_ctx.credential_id is null or not exists (
         select 1 from factory.node_credentials c join factory.computers m on m.computer_id = c.computer_id
          where c.credential_id = p_ctx.credential_id and c.status = 'active' and m.archived_at is null) then
      return factory._gate(1, 'no active credential on an active computer');
    end if;
    -- 2 tenant
    if p_wo.tenant_id is distinct from p_ctx.tenant_id then
      return factory._gate(2, 'the work order belongs to another tenant');
    end if;
    -- 3 company scope
    if p_ctx.company_ids is not null and (p_wo.company_id is null or not (p_wo.company_id = any (p_ctx.company_ids))) then
      return factory._gate(3, 'the envelope is narrowed to other companies');
    end if;
    -- 4 authorization: the work type, and a current certified release
    if p_ctx.allowed_work_types is not null and not (p_wo.work_type = any (p_ctx.allowed_work_types)) then
      return factory._gate(4, 'the envelope does not authorize work type ' || p_wo.work_type);
    end if;
    if not factory._release_current(p_ctx, p_node.release_id) then
      return factory._gate(4, 'the node does not run a current certified release (revoked, superseded without an admin adopt, or unknown)');
    end if;
    -- 5 required role
    if not (p_wo.requires_security_role = any (p_ctx.authorized_roles)) then
      return factory._gate(5, 'the envelope does not authorize role ' || p_wo.requires_security_role);
    end if;
    -- 6 required capabilities: from the ENVELOPE; the reserved capability is held by being enrolled; detection only removes
    req := array(select c from unnest(p_wo.requires_capabilities) c where not factory._capability_reserved(c));
    if exists (select 1 from unnest(req) c where not (c = any (p_ctx.authorized_capabilities))) then
      return factory._gate(6, 'the envelope lacks ' || array_to_string(array(select c from unnest(req) c where not (c = any (p_ctx.authorized_capabilities))), ', '));
    end if;
    absent := case when jsonb_typeof(res -> 'capabilities_absent') = 'array' then res -> 'capabilities_absent' else '[]'::jsonb end;
    if exists (select 1 from unnest(req) c where absent ? c) then
      return factory._gate(6, 'the node detected it lacks ' || array_to_string(array(select c from unnest(req) c where absent ? c), ', '));
    end if;
    -- 7 independence
    if p_kind = 'authoring' then
      paths := factory._bound_authoring_paths(p_ctx.tenant_id);
      if p_ctx.s16a_bound and paths is not null and not factory._surfaces_within(p_wo.owned_surface, paths) then
        return factory._gate(7, 'S-16(a): this computer may author only work whose declared surfaces lie within ' || array_to_string(paths, ' '));
      end if;
    else
      cand := p_wo.verifies_run_id;
      if exists (select 1 from factory._authoring_set(p_wo.verifies_work_order_id, cand) a where a.principal_id = p_ctx.principal_id) then
        return factory._gate(7, 'S-13: this identity is in the authoring set');
      end if;
      phys := exists (select 1 from factory._policies_for(p_ctx.tenant_id,
                        (select w.campaign_key from factory.work_orders w where w.work_order_id = p_wo.verifies_work_order_id)) p
                       where p.require_physical_separation);
      if phys then
        if exists (select 1 from factory._authoring_set(p_wo.verifies_work_order_id, cand) a where a.computer_id = p_ctx.computer_id) then
          return factory._gate(7, 'campaign: the same enrolled computer record as an authoring-set member');
        end if;
        fps := factory._authoring_fingerprints(p_wo.verifies_work_order_id, cand);
        mine := factory._computer_fingerprints(p_ctx.computer_id, p_node.machine_fingerprint);
        if fps && mine then
          return factory._gate(7, 'campaign: a machine fingerprint equal to an authoring-set member''s');
        end if;
      end if;
    end if;
    -- 8 surface / conflict locks
    if exists (select 1 from unnest(p_wo.owned_surface) s where factory._surface_held(s)) then
      return factory._gate(8, 'a surface this work order owns is held');
    end if;
    -- 9 drain
    if p_ctx.draining then
      return factory._gate(9, 'this computer is draining');
    end if;
    -- 10 health
    if p_node.last_heartbeat_at is null or p_node.last_heartbeat_at <= now() - interval '180 seconds' then
      return factory._gate(10, 'no heartbeat within 180 s');
    end if;
    if p_node.runtime_phase = 'RECOVERING' then
      return factory._gate(10, 'the node is RECOVERING: reconciliation is not complete');
    end if;
    -- 11 max concurrency (the computer's envelope; the tenant's plane-wide heavy limit, counted over both fleets)
    select count(*) into busy from factory.agent_runs r where r.computer_id = p_ctx.computer_id and r.status = 'in_progress';
    if busy >= p_ctx.max_concurrent_runs then
      return factory._gate(11, format('%s of %s concurrent runs in progress on this computer', busy, p_ctx.max_concurrent_runs));
    end if;
    if p_wo.weight = 'heavy' then
      select count(*) into heavy_mine from factory.agent_runs r join factory.work_orders w on w.work_order_id = r.work_order_id
       where r.status = 'in_progress' and r.computer_id = p_ctx.computer_id and w.weight = 'heavy';
      select count(*) into heavy_plane from factory.agent_runs r join factory.work_orders w on w.work_order_id = r.work_order_id
       where r.status = 'in_progress' and w.weight = 'heavy';
      select t.max_heavy_per_plane into plane_limit from factory.tenants t where t.tenant_id = p_ctx.tenant_id;
      if heavy_mine >= p_ctx.max_heavy then
        return factory._gate(11, format('%s of %s heavy runs on this computer', heavy_mine, p_ctx.max_heavy));
      end if;
      if heavy_plane >= plane_limit then
        return factory._gate(11, format('%s of %s heavy runs on the plane', heavy_plane, plane_limit));
      end if;
    end if;
    -- 12 hard minimum resources (narrowing only): every stated minimum must be met by the node's report
    for k in select jsonb_object_keys(need) loop
      if k not in ('ram_mb', 'disk_mb', 'cpu_cores') then continue; end if;
      if jsonb_typeof(need -> k) <> 'number' then continue; end if;
      if coalesce((res ->> (case k when 'ram_mb' then 'ram_free_mb' when 'disk_mb' then 'disk_free_mb' else 'cpu_cores' end))::numeric, -1)
         < (need ->> k)::numeric then
        return factory._gate(12, format('below the minimum %s = %s', k, need ->> k));
      end if;
    end loop;
    return null;
  end $$;

-- RANK KEY of a node for a work order (larger is better; compared element by element). Only ever computed for a node that
-- passed every gate.
create function factory._rank_key(p_ctx factory.node_ctx, p_wo factory.work_orders, p_node factory.nodes) returns numeric[]
  language sql stable set search_path = ''
  as $$
    with res as (select coalesce(p_node.reported_resources, '{}'::jsonb) r, coalesce(p_wo.min_resources, '{}'::jsonb) n)
    select array[
      -- resource fitness: the tightest headroom ratio over the stated minimums (1 when nothing is stated), capped
      least(10, coalesce((select min(coalesce((r ->> (case k when 'ram_mb' then 'ram_free_mb' when 'disk_mb' then 'disk_free_mb' else 'cpu_cores' end))::numeric, 0)
                                   / nullif((n ->> k)::numeric, 0))
                            from res, jsonb_object_keys(n) k where k in ('ram_mb', 'disk_mb', 'cpu_cores') and jsonb_typeof(n -> k) = 'number'), 1)),
      -- preferred work class
      case when p_ctx.preferred_work_class is not null and p_ctx.preferred_work_class = p_wo.work_type then 1 else 0 end,
      -- CPU, RAM, disk headroom
      coalesce(100 - (select (r ->> 'cpu_pct')::numeric from res), 0),
      coalesce((select (r ->> 'ram_free_mb')::numeric from res), 0),
      coalesce((select (r ->> 'disk_free_mb')::numeric from res), 0),
      -- current load (fewer runs in progress is better)
      - (select count(*) from factory.agent_runs x where x.computer_id = p_ctx.computer_id and x.status = 'in_progress'),
      -- recent reliability: failed share of the last 24 h's finished runs (lower is better)
      - coalesce((select round(1000.0 * count(*) filter (where x.status = 'failed') / nullif(count(*), 0))
                    from factory.agent_runs x where x.computer_id = p_ctx.computer_id and x.status in ('done', 'failed')
                     and x.finished_at > now() - interval '24 hours'), 0),
      -- locality: the node's envelope names the work order's company
      case when p_wo.company_id is not null and p_wo.company_id = any (coalesce(p_ctx.company_ids, '{}'::uuid[])) then 1 else 0 end
    ]::numeric[]
  $$;

-- SHOULD THIS NODE DEFER THIS WORK ORDER? Only while a strictly better-ranked node - enrolled, fresh (heartbeat within 180 s),
-- AVAILABLE, and passing every gate - exists, and only until 30 s after the work order became claimable. The bound is absolute:
-- a work order is never delayed past it, and a node that is ineligible, stale, busy or foreign never causes a deferral.
create function factory._should_defer(p_ctx factory.node_ctx, p_wo factory.work_orders, p_kind text, p_node factory.nodes) returns boolean
  language plpgsql stable set search_path = ''
  as $$
  declare mine numeric[]; o factory.nodes; oc factory.node_ctx; ok numeric[];
  begin
    if p_wo.queued_at is null or p_wo.queued_at <= now() - interval '30 seconds' then return false; end if;
    mine := factory._rank_key(p_ctx, p_wo, p_node);
    for o in select n.* from factory.nodes n
              where n.principal_id is not null and n.principal_id <> p_ctx.principal_id and n.tenant_id = p_ctx.tenant_id
                and n.runtime_phase = 'AVAILABLE' and n.last_heartbeat_at > now() - interval '180 seconds'
                -- recent reliability, for THIS work order: a node whose lease on it lapsed is never waited for
                and not exists (select 1 from factory.agent_runs x where x.work_order_id = p_wo.work_order_id and x.node_id = n.node_id
                                  and x.status = 'queued' and x.updated_at > now() - interval '30 minutes') loop
      oc := factory._peek_ctx(o.principal_id);
      if oc.credential_id is null then continue; end if;
      if factory._first_failing_gate(oc, p_wo, p_kind, o) is not null then continue; end if;
      ok := factory._rank_key(oc, p_wo, o);
      if ok > mine or (ok = mine and o.node_id < p_ctx.node_id) then return true; end if;
    end loop;
    return false;
  end $$;

reset role;
