-- Manager relationships, the missing half (multi-org P2). STATUS: FIX PREPARED /
-- REVIEW REQUIRED — NOT pushed; executing against production requires explicit founder
-- authorization at the `supabase db push` boundary.
--
-- set_person_assignment() COALESCES p_manager_person_id on an existing current
-- assignment, so passing NULL keeps the old manager — set/change works, CLEAR is
-- unrepresentable. The manager set-UI (commit b5ed853) shipped with that limit stated
-- honestly ("can't be cleared from here yet") instead of faking a clear with a raw
-- table write that would bypass this RPC's authority check. This migration makes
-- clearing a first-class, EXPLICIT operation.
--
-- Design: a dedicated `p_clear_manager boolean default false` rather than a "null
-- means clear" re-interpretation — the issue-#5 Class-B lesson: absence must never be
-- an implicit destructive instruction. NULL manager + clear=false keeps (exactly
-- today's semantics, so every existing call site keeps working unchanged); clear=true
-- with a non-null manager id is CONTRADICTORY and raises rather than guessing.
--
-- BODY PROVENANCE (a real near-miss caught during preparation, recorded so review
-- checks it): the function was defined in 202608280011 and REDEFINED in
-- 202608280013 with two load-bearing hardenings — `set search_path = ''` and
-- schema-qualified enum casts. A first draft of this migration copied the OLDER 0011
-- body and would have silently reverted that hardening. This file is based on the
-- 0013 body, and the live production definition was confirmed read-only before
-- writing it (pg_proc.proconfig = search_path="" on 2026-09-02). Reviewer: diff this
-- body against live `pg_get_functiondef` again at review time; the ONLY intended
-- deltas are the new parameter, the contradiction guard, and the two `case when
-- p_clear_manager` expressions.
--
-- The old signature is DROPPED, not overloaded: `create or replace` with an added
-- defaulted parameter creates a second overload and makes every existing fewer-args
-- call ambiguous ("function is not unique"). All known call sites survive the new
-- signature: sem_execute_ai_command (202608280012) passes 11 positional args (the
-- 12th defaults to false); web setPersonManager passes named params via PostgREST.

begin;

drop function if exists public.set_person_assignment(uuid, uuid, uuid, uuid, text, uuid, text, numeric, text, boolean, text);

create function public.set_person_assignment(
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
  p_state text default 'current',
  p_clear_manager boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
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
  -- Contradictory instruction: refusing beats guessing (the coerced-default class).
  if p_clear_manager and p_manager_person_id is not null then
    raise exception 'p_clear_manager=true with a non-null p_manager_person_id is contradictory - pass one or the other';
  end if;

  if p_state = 'current' and p_is_primary then
    select id into v_id from public.person_assignments
      where person_id = p_person_id and state = 'current' and is_primary = true
        and operating_company_id = p_operating_company_id
      limit 1;
    if v_id is not null then
      update public.person_assignments
        set legal_employer_company_id = coalesce(p_legal_employer_company_id, legal_employer_company_id),
            department_id = coalesce(p_department_id, department_id),
            job_title = coalesce(p_job_title, job_title),
            manager_person_id = case when p_clear_manager then null
                                     else coalesce(p_manager_person_id, manager_person_id) end,
            employment_type = coalesce(p_employment_type::public.employment_type, employment_type),
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
    p_job_title,
    case when p_clear_manager then null else p_manager_person_id end,
    coalesce(p_employment_type, 'full_time')::public.employment_type,
    p_allocation_pct, p_responsibilities, p_is_primary, p_state::public.assignment_state, public.current_profile_id()
  )
  returning id into v_id;

  if p_state = 'current' and p_is_primary then
    update public.people set company_id = p_operating_company_id, updated_at = now() where id = p_person_id;
  end if;

  return v_id;
end;
$$;

-- Same grant discipline as before, on the NEW signature; anon deliberately gets
-- nothing (privileged-RPC sweep class, 202608310004).
grant execute on function public.set_person_assignment(uuid, uuid, uuid, uuid, text, uuid, text, numeric, text, boolean, text, boolean) to authenticated;
revoke execute on function public.set_person_assignment(uuid, uuid, uuid, uuid, text, uuid, text, numeric, text, boolean, text, boolean) from anon, public;

commit;

-- ROLLBACK STRATEGY (for the reviewer; not executed by this file): drop the 12-arg
-- version and re-apply the 11-arg body from 202608280013 (the hardened one — NOT
-- 202608280011) with its original grant. No table shape changes; no data written.
