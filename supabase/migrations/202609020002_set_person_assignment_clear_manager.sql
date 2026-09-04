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
-- BODY PROVENANCE — CORRECTED at DB review round 2 (finding R-B1). The earlier version
-- of this header was WRONG, and the way it was wrong is the point:
--
--   It said the function was defined in 202608280011, redefined in 202608280013, and
--   that this file was based on the 0013 body. It was. But `set_person_assignment` was
--   redefined a THIRD time, in 202608290008 (person lifecycle / end employment), one
--   full migration AFTER 0013 — and THAT is the live definition. Basing this file on
--   0013 silently DELETED the cross-company department guard 202608290008 added.
--
--   The pre-write verification step named in the old header is what let this through.
--   It checked ONE ATTRIBUTE — `pg_proc.proconfig = search_path=""` — and inferred the
--   whole body from it. Both 0013 and 202608290008 set `search_path = ''`, so proconfig
--   is INCAPABLE of distinguishing them. The proxy could not detect the exact drift it
--   was chosen to detect. That is the same failure shape as the 0011-vs-0013 near-miss
--   the old header narrated catching, one migration further along.
--
-- This file is now based on the 202608290008 body. The cross-company department guard
-- is restored verbatim below. The ONLY intended deltas from 202608290008 are the new
-- `p_clear_manager` parameter, the contradiction guard, and the two `case when
-- p_clear_manager` expressions.
--
-- REVIEWER, do not repeat the mistake: verify by diffing this body against the FULL
-- live `pg_get_functiondef('public.set_person_assignment'::regproc)` output. Do not
-- verify by checking proconfig, the migration filename, or any other single attribute.
-- Only a full-body diff can catch a redefinition in a migration you did not think to
-- look at.
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
  v_current_company uuid;
begin
  -- ROUND 3 / B-2 (R-B2, HIGH). Round 2 classified this as "inherited, not introduced" and
  -- declined to close it here; the round-3 reviewer reproduced it against THIS file, which
  -- re-creates the function that carries it, so it is closed here. Authority was tested
  -- against the TARGET company only, and the historicise statement below filtered on the
  -- person with no company predicate at all — a manager of any company could end a person's
  -- employment in a company they have no authority over. A manager must now hold authority
  -- over BOTH the target company and the person's current company; founder/admin unchanged.
  -- The ancestor's guard is kept VERBATIM (function_redefinition_preserves_ancestor_guards
  -- identifies a guard by its message); the cross-company rule is a SECOND guard.
  if not (public.is_founder_or_admin() or public.is_company_manager(p_operating_company_id)) then
    raise exception 'Only the founder, an admin, or a manager of the target company can assign this person';
  end if;
  select p.company_id into v_current_company from public.people p where p.id = p_person_id;
  if not (public.is_founder_or_admin()
          or v_current_company is null
          or v_current_company = p_operating_company_id
          or public.is_company_manager(v_current_company)) then
    raise exception 'set_person_assignment: person % is currently employed by company %, which the caller does not manage (cross-company employment change rejected)', p_person_id, v_current_company
      using errcode = '42501';
  end if;
  if p_state not in ('current', 'planned', 'historical') then
    raise exception 'Unknown state %', p_state;
  end if;
  -- RESTORED VERBATIM from 202608290008 (DB review round 2, R-B1). Basing this file on
  -- 202608280013 dropped this guard. The independent BEFORE INSERT OR UPDATE trigger
  -- `person_assignments_enforce_department_company` still rejects the same reference, so
  -- no cross-company hole was ever open — but 202608290008's own comment calls this check
  -- "not instead of the trigger", and losing it drops defense-in-depth from two layers to
  -- one and degrades a specific error message to a generic one.
  if p_department_id is not null and not exists (
    select 1 from public.departments d where d.id = p_department_id and d.company_id = p_operating_company_id
  ) then
    raise exception 'set_person_assignment: department % does not belong to company % (cross-company department reference rejected)', p_department_id, p_operating_company_id
      using errcode = '23514';
  end if;

  -- ROUND 3 / B-1 (P2): p_manager_person_id had NO company guard while p_department_id had
  -- two. The manager must belong to the target company — by their canonical company or by a
  -- current assignment there — or the reference is cross-company and is rejected, symmetric
  -- with the department guard above and with migration C's agreement triggers.
  if p_manager_person_id is not null and not exists (
    select 1 from public.people mp
     where mp.id = p_manager_person_id
       and (mp.company_id = p_operating_company_id
            or exists (select 1 from public.person_assignments ma
                        where ma.person_id = mp.id and ma.state = 'current'
                          and ma.operating_company_id = p_operating_company_id))
  ) then
    raise exception 'set_person_assignment: manager % does not belong to company % (cross-company manager reference rejected)', p_manager_person_id, p_operating_company_id
      using errcode = '23514';
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
      where person_id = p_person_id and state = 'current' and is_primary = true
        -- ROUND 3 / B-2: only assignments the caller has authority over can be ended by this
        -- call. The authority check above makes this redundant for a consistent person row;
        -- it is the guard that holds when people.company_id and the assignments disagree.
        and (public.is_founder_or_admin() or public.is_company_manager(operating_company_id));
  end if;

  insert into public.person_assignments (
    person_id, operating_company_id, legal_employer_company_id, department_id,
    job_title, manager_person_id, employment_type, allocation_pct, responsibilities,
    is_primary, state, created_by_profile_id
  ) values (
    p_person_id, p_operating_company_id, p_legal_employer_company_id, p_department_id,
    p_job_title,
    -- R-B5: this expression is provably EQUIVALENT to plain `p_manager_person_id` today
    -- — the contradiction guard above rejects clear=true with a non-null manager id, so
    -- when clear=true the value is already null. Stated explicitly so no future reader
    -- mistakes it for the load-bearing clear (the UPDATE path is where clearing happens).
    -- Kept, not deleted, so the INSERT path stays correct if that guard is ever relaxed.
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

-- ROLLBACK STRATEGY (for the reviewer; not executed by this file) — CORRECTED at DB
-- review round 2 (R-B1): drop the 12-arg version and re-apply the 11-arg body from
-- 202608290008, which is the LIVE definition. The previous text named 202608280013, and
-- rolling back to 0013 would have re-introduced exactly the defect this round found:
-- it would drop the cross-company department guard a second time, this time under the
-- banner of restoring safety. NOT 202608280013, and NOT 202608280011.
--
-- No table shape changes; no data written. Verify the rollback the same way as the
-- forward migration: full `pg_get_functiondef` diff, never a single attribute.
