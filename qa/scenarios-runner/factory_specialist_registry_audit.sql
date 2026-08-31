-- Read-only audit: every intended Factory role's real registration state, per the
-- founder's explicit Phase 5 requirement. Not a pass/fail test - a reporting query.

select
  a.name,
  a.display_name,
  a.active,
  a.execution_provider,
  a.has_production_authority,
  a.capabilities,
  jsonb_array_length(coalesce(a.provenance -> 'external_capabilities', '[]'::jsonb)) as attached_skill_count,
  ls.live_status,
  ls.last_run_id,
  ls.last_run_at,
  ls.last_run_status
from public.agents_with_live_status ls
join public.agents a on a.id = ls.id
where a.category is not null
order by a.category, a.name;
