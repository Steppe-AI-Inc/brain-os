-- Master-prompt spec §25-26, §43: batch employee moves must be idempotent, and every
-- module a person's company shows up in must reflect the current truth. Found two real
-- gaps here while building on the org-graph fix, before either one caused a live
-- incident (unlike the company_relationships duplicate, which was found only after the
-- fact) - checked first this time:
--   1. person_assignments has zero unique constraint - repeating "move Employee A to
--      SEM GRT" would insert a second row every time, the exact bug already found and
--      fixed once for company_relationships.
--   2. Nothing anywhere syncs people.company_id when a person_assignments row is
--      created - person_assignments is the rich employment model, but people.company_id
--      is what the People page and everything else in the app actually reads. This is
--      the identical "wrote to a table nobody reads" defect class as the original
--      company_relationships bug (KNOWN_FAILURE_MODES.md #19), just in the employee-move
--      capability instead of the company-reclassification one.

-- One current PRIMARY assignment at a time per person - a genuine dual-hat role (a
-- second, non-primary assignment) is untouched by this; only the "where does this
-- person currently, primarily work" row is exclusive, matching how set_company_relationship
-- treats one structural parent at a time.
create unique index if not exists person_assignments_current_primary_unique
  on public.person_assignments (person_id)
  where state = 'current' and is_primary = true;

create or replace function public.set_person_assignment(
  p_person_id uuid,
  p_operating_company_id uuid,
  p_legal_employer_company_id uuid default null,
  p_department_id uuid default null,
  p_job_title text default null,
  p_manager_person_id uuid default null,
  p_employment_type text default 'full_time',
  p_allocation_pct numeric default 100,
  p_responsibilities text default null,
  p_is_primary boolean default true,
  p_state text default 'current'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.is_founder_or_admin() or public.is_company_manager(p_operating_company_id)) then
    raise exception 'Only the founder, an admin, or a manager of the target company can assign this person';
  end if;
  if p_state not in ('current', 'planned', 'historical') then
    raise exception 'Unknown state %', p_state;
  end if;

  if p_state = 'current' and p_is_primary then
    -- Already there: true no-op (matches set_company_relationship's idempotency
    -- semantics) - refresh any changed non-key fields in place rather than closing out
    -- and reopening an identical assignment on every repeat of the same command.
    select id into v_id from public.person_assignments
      where person_id = p_person_id and state = 'current' and is_primary = true
        and operating_company_id = p_operating_company_id
      limit 1;
    if v_id is not null then
      update public.person_assignments
        set legal_employer_company_id = coalesce(p_legal_employer_company_id, legal_employer_company_id),
            department_id = coalesce(p_department_id, department_id),
            job_title = coalesce(p_job_title, job_title),
            manager_person_id = coalesce(p_manager_person_id, manager_person_id),
            employment_type = coalesce(p_employment_type::employment_type, employment_type),
            allocation_pct = coalesce(p_allocation_pct, allocation_pct),
            responsibilities = coalesce(p_responsibilities, responsibilities),
            updated_at = now()
        where id = v_id;
      update public.people set company_id = p_operating_company_id, updated_at = now() where id = p_person_id;
      return v_id;
    end if;

    update public.person_assignments
      set state = 'historical', end_date = coalesce(end_date, current_date), updated_at = now()
      where person_id = p_person_id and state = 'current' and is_primary = true;
  end if;

  insert into public.person_assignments (
    person_id, operating_company_id, legal_employer_company_id, department_id,
    job_title, manager_person_id, employment_type, allocation_pct, responsibilities,
    is_primary, state, created_by_profile_id
  ) values (
    p_person_id, p_operating_company_id, p_legal_employer_company_id, p_department_id,
    p_job_title, p_manager_person_id, coalesce(p_employment_type, 'full_time')::employment_type,
    p_allocation_pct, p_responsibilities, p_is_primary, p_state::assignment_state, public.current_profile_id()
  )
  returning id into v_id;

  -- The actual fix: keep the simple legacy field every other page reads in sync, instead
  -- of leaving that as a second, separate write nothing ever performs.
  if p_state = 'current' and p_is_primary then
    update public.people set company_id = p_operating_company_id, updated_at = now() where id = p_person_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.set_person_assignment(uuid, uuid, uuid, uuid, text, uuid, text, numeric, text, boolean, text) to authenticated;
