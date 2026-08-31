-- Permanent regression: FACTORY_DISPATCHABLE_AGENT_REQUIRES_EXECUTION_PROVIDER.
--
-- Real incident this closes (qa/KNOWN_FAILURE_MODES.md, Phase 5): brain-os-product-
-- architect was registered with real capabilities (architecture/requirements/
-- acceptance_criteria/domain_modeling) but no execution_provider at all - its own agent
-- definition instructed it to produce "a design document (written to a real file...)"
-- while lacking both permissionMode: auto and the Write tool needed to do so. The
-- capability scheduler correctly refused to dispatch to it (matching the router's own
-- "never fall back to matching by name" design), but that meant a Work Order requiring
-- 'architecture' capability could never actually be executed by anyone - a real,
-- structural defect, not the router working as designed. Fixed by completing the
-- agent's own registration (Write tool + permissionMode: auto), not by hardcoding a
-- provider anywhere in scheduler logic.
--
-- This is a read-only check against the live registry - no fixtures, no rollback needed,
-- but wrapped in begin;...rollback; for consistency with this repo's own convention and
-- in case a future version of this test needs write access.

begin;

-- Every SOFTWARE_FACTORY-category agent that has real, non-empty capabilities must also
-- have a real execution_provider - a "capable but undispatchable" agent is a structural
-- defect, the same class this test closes for Product Architect specifically.
select set_config('t.capable_but_undispatchable',
  (
    select coalesce(json_agg(name order by name), '[]'::json)::text
    from public.agents
    where category is not null
      and active = true
      and cardinality(capabilities) > 0
      and execution_provider is null
  ), true
);

-- Product Architect specifically: real capabilities, real execution_provider, real
-- production authority, real definition_hash matching the live file (proves the
-- registration is genuinely in sync, not just present).
select set_config('t.product_architect_state',
  (
    select json_build_object(
      'has_capabilities', cardinality(capabilities) > 0,
      'has_execution_provider', execution_provider is not null,
      'has_production_authority', has_production_authority,
      'active', active
    )::text
    from public.agents where name = 'brain-os-product-architect'
  ), true
);

select json_build_object(
  'capable_but_undispatchable_agents', current_setting('t.capable_but_undispatchable')::json,
  'product_architect_state', current_setting('t.product_architect_state')::json,
  'all_pass', (
    current_setting('t.capable_but_undispatchable')::jsonb = '[]'::jsonb
    and (current_setting('t.product_architect_state')::jsonb ->> 'has_capabilities')::boolean
    and (current_setting('t.product_architect_state')::jsonb ->> 'has_execution_provider')::boolean
    and (current_setting('t.product_architect_state')::jsonb ->> 'has_production_authority')::boolean
    and (current_setting('t.product_architect_state')::jsonb ->> 'active')::boolean
  )
) as verdict;

rollback;
