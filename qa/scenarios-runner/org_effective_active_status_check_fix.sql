-- Permanent regression for 202608300001_fix_effective_active_status_check.sql — proves
-- the real bug found during post-deploy verification of 202608290009_org_effective_active.sql
-- is fixed, and stays fixed. Distinguishes exactly what the founder asked to keep separate:
-- "archived ancestor" (must be excluded) vs. "any non-'active' status" (must NOT be
-- excluded merely for that reason). Assumes migration DDL through 202608300001 is already
-- applied — this asserts against the REAL LIVE functions, not a copy defined inline.
--
-- Fixtures use real, distinct synthetic companies/relationships, rolled back at the end —
-- no production company record (including Trade-book.ai / NexPass LLC/FuelMetrix,
-- a7f63716-da1b-498e-9663-0adb318f4c4c / 646c7e8f-ee37-47c0-802a-bfe79b613a92) is ever
-- written to by this script; those two are only ever read, to prove the false positive is
-- gone, never mutated.

begin;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

-- Standalone company, no relationships at all, status 'planning' — the exact shape of
-- the real NexPass false positive (STANDALONE_NON_ARCHIVED_COMPANY_NOT_FALSE_POSITIVE).
insert into public.companies (id, name, organization_type, status, created_by_profile_id) values
  ('eeee3001-0000-0000-0000-000000000001', 'OEAFIX Standalone Planning', 'legal_entity', 'planning', 'cbcc41cf-830d-4600-8545-3b9e22c8297f');

-- Company under an ACTIVE parent, own status 'paused' — PAUSED_STATUS_IS_NOT_ARCHIVED.
insert into public.companies (id, name, organization_type, status, created_by_profile_id) values
  ('eeee3001-0000-0000-0000-000000000002', 'OEAFIX Active Parent', 'legal_entity', 'active', 'cbcc41cf-830d-4600-8545-3b9e22c8297f'),
  ('eeee3001-0000-0000-0000-000000000003', 'OEAFIX Paused Child', 'business_unit', 'paused', 'cbcc41cf-830d-4600-8545-3b9e22c8297f');
insert into public.company_relationships (company_id, related_company_id, relationship_type, state, created_by_profile_id) values
  ('eeee3001-0000-0000-0000-000000000003', 'eeee3001-0000-0000-0000-000000000002', 'business_unit_of', 'current', '46bf57d3-33b3-47b4-8302-126726a92775');

-- Three-level chain: Grandchild business_unit_of Child business_unit_of Grandparent —
-- Grandparent starts active, own statuses 'planning' — PLANNING_STATUS_IS_NOT_ARCHIVED,
-- then ARCHIVED_ANCESTOR_MAKES_CHILD_EFFECTIVELY_INACTIVE once Grandparent is archived.
insert into public.companies (id, name, organization_type, status, created_by_profile_id) values
  ('eeee3001-0000-0000-0000-000000000004', 'OEAFIX Grandparent', 'legal_entity', 'active', 'cbcc41cf-830d-4600-8545-3b9e22c8297f'),
  ('eeee3001-0000-0000-0000-000000000005', 'OEAFIX Child', 'business_unit', 'planning', 'cbcc41cf-830d-4600-8545-3b9e22c8297f'),
  ('eeee3001-0000-0000-0000-000000000006', 'OEAFIX Grandchild', 'business_unit', 'planning', 'cbcc41cf-830d-4600-8545-3b9e22c8297f');
insert into public.company_relationships (company_id, related_company_id, relationship_type, state, created_by_profile_id) values
  ('eeee3001-0000-0000-0000-000000000005', 'eeee3001-0000-0000-0000-000000000004', 'business_unit_of', 'current', '46bf57d3-33b3-47b4-8302-126726a92775'),
  ('eeee3001-0000-0000-0000-000000000006', 'eeee3001-0000-0000-0000-000000000005', 'business_unit_of', 'current', '46bf57d3-33b3-47b4-8302-126726a92775');

do $$
begin
  perform set_config('oeaf.standalone_before', public.is_company_effectively_active('eeee3001-0000-0000-0000-000000000001'::uuid)::text, true);
  perform set_config('oeaf.paused_under_active_parent', public.is_company_effectively_active('eeee3001-0000-0000-0000-000000000003'::uuid)::text, true);
  perform set_config('oeaf.grandchild_before_archive', public.is_company_effectively_active('eeee3001-0000-0000-0000-000000000006'::uuid)::text, true);
  perform set_config('oeaf.child_before_archive', public.is_company_effectively_active('eeee3001-0000-0000-0000-000000000005'::uuid)::text, true);
end $$;

-- Archive the grandparent — real archive_company(), not a direct status write (the
-- lifecycle guard trigger would reject a direct write anyway).
select public.archive_company('eeee3001-0000-0000-0000-000000000004'::uuid);

do $$
begin
  perform set_config('oeaf.grandchild_after_archive', public.is_company_effectively_active('eeee3001-0000-0000-0000-000000000006'::uuid)::text, true);
  perform set_config('oeaf.child_after_archive', public.is_company_effectively_active('eeee3001-0000-0000-0000-000000000005'::uuid)::text, true);
  -- The archived company itself must also read as not effectively active.
  perform set_config('oeaf.archived_company_itself', public.is_company_effectively_active('eeee3001-0000-0000-0000-000000000004'::uuid)::text, true);
  -- No mutation side-effect: archiving only ever changes companies.status, per
  -- archive_company()'s own well-established contract — confirm the grandchild/child's
  -- OWN status columns were never touched by the effective-active check itself.
  perform set_config('oeaf.child_own_status_untouched',
    (select status from public.companies where id = 'eeee3001-0000-0000-0000-000000000005'::uuid)::text, true);
  perform set_config('oeaf.grandchild_own_status_untouched',
    (select status from public.companies where id = 'eeee3001-0000-0000-0000-000000000006'::uuid)::text, true);
end $$;

-- Real production companies — read-only, proves the false positive is gone. Never
-- written to anywhere in this script.
do $$
begin
  perform set_config('oeaf.real_tradebook_effective', public.is_company_effectively_active('a7f63716-da1b-498e-9663-0adb318f4c4c'::uuid)::text, true);
  perform set_config('oeaf.real_nexpass_effective', public.is_company_effectively_active('646c7e8f-ee37-47c0-802a-bfe79b613a92'::uuid)::text, true);
  perform set_config('oeaf.real_tradebook_status',
    (select status from public.companies where id = 'a7f63716-da1b-498e-9663-0adb318f4c4c'::uuid)::text, true);
  perform set_config('oeaf.real_nexpass_status',
    (select status from public.companies where id = '646c7e8f-ee37-47c0-802a-bfe79b613a92'::uuid)::text, true);
end $$;

-- Full-graph check no longer flags either real company as an archived-ancestor case.
do $$
declare v_graph jsonb;
begin
  v_graph := public.validate_organization_graph(null);
  perform set_config('oeaf.graph_flags_tradebook',
    (v_graph->'archivedAncestorActive' @> jsonb_build_array(jsonb_build_object('id','a7f63716-da1b-498e-9663-0adb318f4c4c')))::text, true);
  perform set_config('oeaf.graph_flags_nexpass',
    (v_graph->'archivedAncestorActive' @> jsonb_build_array(jsonb_build_object('id','646c7e8f-ee37-47c0-802a-bfe79b613a92')))::text, true);
  -- The synthetic grandchild (still un-restored at this point in the script) IS still
  -- correctly flagged - the graph check itself is not blinded by this fix.
  perform set_config('oeaf.graph_flags_synthetic_grandchild',
    (v_graph->'archivedAncestorActive' @> jsonb_build_array(jsonb_build_object('id','eeee3001-0000-0000-0000-000000000006')))::text, true);
end $$;

reset role;

select json_build_object(
  'PLANNING_STATUS_IS_NOT_ARCHIVED', current_setting('oeaf.standalone_before', true) = 'true'
    and current_setting('oeaf.grandchild_before_archive', true) = 'true'
    and current_setting('oeaf.child_before_archive', true) = 'true',
  'PAUSED_STATUS_IS_NOT_ARCHIVED', current_setting('oeaf.paused_under_active_parent', true) = 'true',
  'STANDALONE_NON_ARCHIVED_COMPANY_NOT_FALSE_POSITIVE', current_setting('oeaf.standalone_before', true) = 'true',
  'ARCHIVED_ANCESTOR_MAKES_CHILD_EFFECTIVELY_INACTIVE',
    current_setting('oeaf.grandchild_after_archive', true) = 'false'
    and current_setting('oeaf.child_after_archive', true) = 'false'
    and current_setting('oeaf.archived_company_itself', true) = 'false',
  'no_mutation_side_effect',
    current_setting('oeaf.child_own_status_untouched', true) = 'planning'
    and current_setting('oeaf.grandchild_own_status_untouched', true) = 'planning',
  'real_tradebook_no_longer_false_positive', current_setting('oeaf.real_tradebook_effective', true) = 'true',
  'real_nexpass_no_longer_false_positive', current_setting('oeaf.real_nexpass_effective', true) = 'true',
  'real_tradebook_status_untouched', current_setting('oeaf.real_tradebook_status', true) = 'planning',
  'real_nexpass_status_untouched', current_setting('oeaf.real_nexpass_status', true) = 'planning',
  'graph_no_longer_flags_real_companies',
    current_setting('oeaf.graph_flags_tradebook', true) = 'false'
    and current_setting('oeaf.graph_flags_nexpass', true) = 'false',
  'graph_still_flags_genuine_archived_ancestor', current_setting('oeaf.graph_flags_synthetic_grandchild', true) = 'true',
  'all_pass', (
    current_setting('oeaf.standalone_before', true) = 'true'
    and current_setting('oeaf.paused_under_active_parent', true) = 'true'
    and current_setting('oeaf.grandchild_before_archive', true) = 'true'
    and current_setting('oeaf.child_before_archive', true) = 'true'
    and current_setting('oeaf.grandchild_after_archive', true) = 'false'
    and current_setting('oeaf.child_after_archive', true) = 'false'
    and current_setting('oeaf.archived_company_itself', true) = 'false'
    and current_setting('oeaf.child_own_status_untouched', true) = 'planning'
    and current_setting('oeaf.grandchild_own_status_untouched', true) = 'planning'
    and current_setting('oeaf.real_tradebook_effective', true) = 'true'
    and current_setting('oeaf.real_nexpass_effective', true) = 'true'
    and current_setting('oeaf.real_tradebook_status', true) = 'planning'
    and current_setting('oeaf.real_nexpass_status', true) = 'planning'
    and current_setting('oeaf.graph_flags_tradebook', true) = 'false'
    and current_setting('oeaf.graph_flags_nexpass', true) = 'false'
    and current_setting('oeaf.graph_flags_synthetic_grandchild', true) = 'true'
  )
) as verdict;

rollback;
