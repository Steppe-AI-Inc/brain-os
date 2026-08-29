-- Fix a real bug in 202608290009_org_effective_active.sql's is_company_effectively_active(),
-- found during mandatory post-deploy verification of that same migration (not a
-- pre-existing data problem - a real implementation defect in the function just shipped).
--
-- Bug: the function required bool_and(c.status = 'active') across the company itself and
-- every ancestor - i.e. it treated ANY status other than the literal string 'active' as
-- "not effectively active," not just 'archived'. Bug 6's actual scope (and this whole
-- feature's own name) is specifically about an ARCHIVED ancestor propagating down - a
-- company legitimately sitting in 'planning' or 'paused' status (both explicitly treated
-- as normal/selectable elsewhere in this exact codebase - see
-- get_effectively_active_companies()'s own `c.status in ('active','planning','paused')`
-- filter, and web/lib/data/companies.ts's pre-existing getCompaniesForSelection()) is not
-- an archived-ancestor case at all and must not be flagged.
--
-- Confirmed live, real production impact (not synthetic): NexPass LLC/FuelMetrix
-- (646c7e8f-ee37-47c0-802a-bfe79b613a92) has ZERO company_relationships rows at all - no
-- parent, no ancestor, fully standalone - yet was flagged as not-effectively-active
-- purely because its own status is 'planning'. Trade-book.ai
-- (a7f63716-da1b-498e-9663-0adb318f4c4c) is business_unit_of SEM LLC (status 'active',
-- not archived) and was flagged for the same reason (Trade-book.ai's own status is
-- 'planning'). Neither company has any archived ancestor; both were false positives.
-- No company records were touched to find or fix this - read-only verification only.
--
-- This had not yet caused a live application-level regression: Workstream 2b/2c (wiring
-- get_effectively_active_companies()/is_company_effectively_active() into
-- getCompaniesForSelection()/buildContext()) has not been done yet as of this migration -
-- caught and fixed before that wiring would have made every 'planning'/'paused' company
-- wrongly disappear from the employer picker and AI context.
--
-- Fix: check status <> 'archived' instead of status = 'active' - matches the actual
-- archive_company()/restore_company() lifecycle vocabulary (only 'archived' is the
-- guarded, reversible state this whole feature is about) and leaves 'planning'/'paused'
-- companies, with or without an archived ancestor above them, correctly classified.
-- get_effectively_active_companies()'s own outer status filter
-- (active/planning/paused) is unchanged - it already excludes 'archived'/'closed' rows
-- from being returned as selectable candidates at all, independent of this function.

create or replace function public.is_company_effectively_active(p_company_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_result boolean;
begin
  -- parent_of reverses direction relative to business_unit_of/brand_of/subsidiary_of/
  -- department_of (same DIRECTION MATTERS rule already documented in the system prompt).
  -- Unchanged from 202608290009 - only the final status check below changes.
  with recursive up(id) as (
    select p_company_id
    union
    select case when r.relationship_type = 'parent_of' then r.company_id else r.related_company_id end
    from public.company_relationships r
    join up on (
      (r.relationship_type = 'parent_of' and r.related_company_id = up.id)
      or (r.relationship_type in ('business_unit_of','brand_of','subsidiary_of','department_of') and r.company_id = up.id)
    )
    where r.state = 'current'
  )
  select coalesce(bool_and(c.status <> 'archived'), true) into v_result
  from public.companies c where c.id in (select id from up);
  return v_result;
end; $$;

-- No change needed to get_effectively_active_companies() or validate_organization_graph()
-- - both already call is_company_effectively_active() by name, so this CREATE OR REPLACE
-- takes effect for both without touching either.
