-- Org effective-active propagation — permanent regression for Bug 6 (quiet-wiggling-
-- biscuit plan, Workstream 2a: migration 202608290009_org_effective_active.sql). Proves,
-- against real fixture companies/relationships in a rolled-back transaction, against the
-- already-deployed is_company_effectively_active()/get_effectively_active_companies()/
-- validate_organization_graph() (not redefined here, same convention as
-- organization_graph_integrity.sql):
--   1. a 2-level business_unit_of chain (Grandchild business_unit_of Child business_unit_of
--      Parent) is effectively active while every ancestor is active
--   2. archiving the top-level Parent (via the already-deployed archive_company()) makes
--      BOTH descendants read effectively-inactive even though their OWN companies.status
--      column still literally says 'active' - ARCHIVED_ORG_NOT_ACTIVE_EMPLOYER: a person
--      whose people.company_id points at the archived-ancestor Child must not be readable
--      as having an active employer via this function
--   3. get_effectively_active_companies() (the drop-in replacement for
--      web/lib/data/companies.ts's row-status-only filter) excludes both descendants
--      despite their own status being 'active' - ARCHIVED_ORG_EXCLUDED_FROM_ACTIVE_SELECTORS
--   4. validate_organization_graph()'s new archivedAncestorActive check flags both
--      still-'active'-status descendants (containment-checked, not exact-length - an
--      unscoped call legitimately also surfaces real pre-existing production companies
--      with the same defect, confirmed live: 2 real rows appeared alongside the 2
--      fixture ones the one time this was run - that's correct behavior, not test
--      noise), and correctly does NOT flag the now-'archived' Parent itself
--   5. restoring the Parent makes all three effectively-active again and
--      archivedAncestorActive returns to empty for this scope
--   6. the SAME defect, proven on the OTHER relationship direction: parent_of (company_id
--      = parent/owner, related_company_id = child/owned - the reverse of business_unit_of)
--      also correctly propagates - this is the actual DIRECTION MATTERS correctness proof,
--      not just the business_unit_of chain
--   7. an unrelated standalone company with zero company_relationships rows is always
--      effectively active on its own status alone (the CTE's base case, not a special case)

begin;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

-- ================== FIXTURES ==================

insert into public.companies (id, name, organization_type, status) values
  ('bbbb1001-0000-0000-0000-000000000001','SC-OEA Parent','legal_entity','active'),
  ('bbbb1001-0000-0000-0000-000000000002','SC-OEA Child','business_unit','active'),
  ('bbbb1001-0000-0000-0000-000000000003','SC-OEA Grandchild','department','active'),
  ('bbbb1001-0000-0000-0000-000000000004','SC-OEA Owner Legal','legal_entity','active'),
  ('bbbb1001-0000-0000-0000-000000000005','SC-OEA Sub Legal','legal_entity','active'),
  ('bbbb1001-0000-0000-0000-000000000006','SC-OEA Standalone','legal_entity','active');

-- Child business_unit_of Parent, Grandchild department_of Child.
select public.set_company_relationship(
  'bbbb1001-0000-0000-0000-000000000002'::uuid, 'bbbb1001-0000-0000-0000-000000000001'::uuid,
  'business_unit_of'::public.company_relationship_type, null, 'current');
select public.set_company_relationship(
  'bbbb1001-0000-0000-0000-000000000003'::uuid, 'bbbb1001-0000-0000-0000-000000000002'::uuid,
  'department_of'::public.company_relationship_type, null, 'current');

-- Owner Legal parent_of Sub Legal (100% ownership) - the reverse-direction relationship
-- type, exactly the "SEM LLC parent_of SEM GRT" convention documented in the
-- sem-ai-command system prompt.
select public.set_company_relationship(
  'bbbb1001-0000-0000-0000-000000000004'::uuid, 'bbbb1001-0000-0000-0000-000000000005'::uuid,
  'parent_of'::public.company_relationship_type, 100, 'current');

-- A person whose raw employer id is the Child business unit - never auto-updated by
-- archiving, per design (people.company_id stays inspectable).
insert into public.people (id, company_id, full_name, active) values
  ('bbbb1002-0000-0000-0000-000000000001','bbbb1001-0000-0000-0000-000000000002','SC-OEA Employee', true);

-- ================== BASELINE (everything active) ==================

select set_config('sc_oea.baseline_child_active', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_oea.baseline_grandchild_active', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000003'))::text, true);
select set_config('sc_oea.standalone_active_no_relationships', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000006'))::text, true);

-- ================== ARCHIVE PARENT ==================

select set_config('sc_oea.archive_parent', (public.archive_company('bbbb1001-0000-0000-0000-000000000001'))::text, true);

select set_config('sc_oea.parent_effective_after_archive', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000001'))::text, true);
select set_config('sc_oea.child_effective_after_archive', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_oea.grandchild_effective_after_archive', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000003'))::text, true);

-- Child's own status column is untouched (archiving a parent does not cascade a status
-- write onto children - confirms the bug's own premise, not just the fix).
select set_config('sc_oea.child_own_status_untouched', (select (status = 'active')::text from public.companies where id='bbbb1001-0000-0000-0000-000000000002'), true);

select set_config('sc_oea.child_in_selector', (exists(select 1 from public.get_effectively_active_companies() where id='bbbb1001-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_oea.grandchild_in_selector', (exists(select 1 from public.get_effectively_active_companies() where id='bbbb1001-0000-0000-0000-000000000003'))::text, true);
select set_config('sc_oea.standalone_in_selector', (exists(select 1 from public.get_effectively_active_companies() where id='bbbb1001-0000-0000-0000-000000000006'))::text, true);

-- ARCHIVED_ORG_NOT_ACTIVE_EMPLOYER: the employee's raw company_id (Child) reads
-- effectively inactive even though people.company_id itself was never touched.
select set_config('sc_oea.employee_company_id_unchanged', (select (company_id = 'bbbb1001-0000-0000-0000-000000000002')::text from public.people where id='bbbb1002-0000-0000-0000-000000000001'), true);
select set_config('sc_oea.employee_employer_effectively_active', (select public.is_company_effectively_active(company_id)::text from public.people where id='bbbb1002-0000-0000-0000-000000000001'), true);

select set_config('sc_oea.graph_check', (public.validate_organization_graph())::text, true);

-- parent_of direction: archiving the OWNER also propagates down through the reverse
-- relationship-direction encoding.
select set_config('sc_oea.owner_effective', (public.archive_company('bbbb1001-0000-0000-0000-000000000004'))::text, true);
select set_config('sc_oea.sub_effective_after_owner_archived', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000005'))::text, true);

-- ================== RESTORE PARENT ==================

select set_config('sc_oea.restore_parent', (public.restore_company('bbbb1001-0000-0000-0000-000000000001'))::text, true);
select set_config('sc_oea.child_effective_after_restore', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_oea.grandchild_effective_after_restore', (public.is_company_effectively_active('bbbb1001-0000-0000-0000-000000000003'))::text, true);
select set_config('sc_oea.graph_check_after_restore', (public.validate_organization_graph('bbbb1001-0000-0000-0000-000000000002'::uuid))::text, true);

reset role;

select json_build_object(
  'scenario', 'ORG-EFFECTIVE-ACTIVE',
  'classification', 'FIXED (quiet-wiggling-biscuit plan Bug 6 — see migration 202608290009)',
  'baseline_child_active', current_setting('sc_oea.baseline_child_active', true) = 'true',
  'baseline_grandchild_active', current_setting('sc_oea.baseline_grandchild_active', true) = 'true',
  'standalone_active_no_relationships', current_setting('sc_oea.standalone_active_no_relationships', true) = 'true',
  'archive_parent', current_setting('sc_oea.archive_parent', true)::jsonb,
  'parent_effective_after_archive', current_setting('sc_oea.parent_effective_after_archive', true) = 'false',
  'child_effective_after_archive', current_setting('sc_oea.child_effective_after_archive', true) = 'false',
  'grandchild_effective_after_archive', current_setting('sc_oea.grandchild_effective_after_archive', true) = 'false',
  'child_own_status_untouched', current_setting('sc_oea.child_own_status_untouched', true) = 'true',
  'child_in_selector', current_setting('sc_oea.child_in_selector', true) = 'false',
  'grandchild_in_selector', current_setting('sc_oea.grandchild_in_selector', true) = 'false',
  'standalone_in_selector', current_setting('sc_oea.standalone_in_selector', true) = 'true',
  'employee_company_id_unchanged', current_setting('sc_oea.employee_company_id_unchanged', true) = 'true',
  'employee_employer_effectively_active', current_setting('sc_oea.employee_employer_effectively_active', true) = 'false',
  'graph_check_archived_ancestor_active_ids',
    (current_setting('sc_oea.graph_check', true)::jsonb->'archivedAncestorActive'),
  'sub_effective_after_owner_archived', current_setting('sc_oea.sub_effective_after_owner_archived', true) = 'false',
  'restore_parent', current_setting('sc_oea.restore_parent', true)::jsonb,
  'child_effective_after_restore', current_setting('sc_oea.child_effective_after_restore', true) = 'true',
  'grandchild_effective_after_restore', current_setting('sc_oea.grandchild_effective_after_restore', true) = 'true',
  'graph_check_after_restore_clean_for_child',
    (jsonb_array_length((current_setting('sc_oea.graph_check_after_restore', true)::jsonb)->'archivedAncestorActive') = 0),
  'all_pass', (
        current_setting('sc_oea.baseline_child_active', true) = 'true'
    and current_setting('sc_oea.baseline_grandchild_active', true) = 'true'
    and current_setting('sc_oea.standalone_active_no_relationships', true) = 'true'
    and (current_setting('sc_oea.archive_parent', true)::jsonb->>'changed') = 'true'
    and current_setting('sc_oea.parent_effective_after_archive', true) = 'false'
    and current_setting('sc_oea.child_effective_after_archive', true) = 'false'
    and current_setting('sc_oea.grandchild_effective_after_archive', true) = 'false'
    and current_setting('sc_oea.child_own_status_untouched', true) = 'true'
    and current_setting('sc_oea.child_in_selector', true) = 'false'
    and current_setting('sc_oea.grandchild_in_selector', true) = 'false'
    and current_setting('sc_oea.standalone_in_selector', true) = 'true'
    and current_setting('sc_oea.employee_company_id_unchanged', true) = 'true'
    and current_setting('sc_oea.employee_employer_effectively_active', true) = 'false'
    -- Deliberately containment checks, not an exact array length: this call is
    -- unscoped (p_company_id null, "all companies"), so real pre-existing production
    -- companies with the same defect legitimately appear in the same array too - that's
    -- correct behavior, not test noise (confirmed live: 2 real companies flagged
    -- alongside the 2 fixture ones the one time this was run). Only assert our fixtures
    -- are present, and that the now-archived Parent itself is correctly ABSENT (its own
    -- status no longer qualifies it for this check at all).
    and (current_setting('sc_oea.graph_check', true)::jsonb->'archivedAncestorActive') @> '[{"id":"bbbb1001-0000-0000-0000-000000000002"}]'::jsonb
    and (current_setting('sc_oea.graph_check', true)::jsonb->'archivedAncestorActive') @> '[{"id":"bbbb1001-0000-0000-0000-000000000003"}]'::jsonb
    and not (current_setting('sc_oea.graph_check', true)::jsonb->'archivedAncestorActive') @> '[{"id":"bbbb1001-0000-0000-0000-000000000001"}]'::jsonb
    and current_setting('sc_oea.sub_effective_after_owner_archived', true) = 'false'
    and (current_setting('sc_oea.restore_parent', true)::jsonb->>'changed') = 'true'
    and current_setting('sc_oea.child_effective_after_restore', true) = 'true'
    and current_setting('sc_oea.grandchild_effective_after_restore', true) = 'true'
    and jsonb_array_length((current_setting('sc_oea.graph_check_after_restore', true)::jsonb)->'archivedAncestorActive') = 0
  )
) as verdict;

rollback;
