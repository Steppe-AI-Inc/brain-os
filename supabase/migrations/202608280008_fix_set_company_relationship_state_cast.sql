-- Real bug found by actually testing the founder's exact live scenario end-to-end
-- (reclassifying CLIX GPS/Tradebook as business units of SEM LLC via chat) right after
-- shipping 202608280006/07: every relationship creation failed with "column state is of
-- type relationship_state but expression is of type text" - p_state is a plain text
-- parameter, and Postgres does not implicitly cast a text VARIABLE to an enum column
-- (only unknown-typed literals get that treatment), so the INSERT's values list needed
-- an explicit cast that was missing. The Edge Function's fact-line grounding correctly
-- caught this ("2 of 2 requested company relationship(s) could not be created") even
-- though the model's own prose claimed the restructuring was complete - exactly the
-- safety net it was built for, working as designed.

create or replace function public.set_company_relationship(
  p_company_id uuid,
  p_related_company_id uuid,
  p_relationship_type public.company_relationship_type,
  p_ownership_pct numeric default null,
  p_state text default 'current'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_founder_or_admin() then
    raise exception 'Only the founder or an admin can restructure the organization graph';
  end if;
  if p_company_id = p_related_company_id then
    raise exception 'A company cannot be related to itself';
  end if;
  if p_state not in ('current', 'planned', 'historical', 'under_restructuring') then
    raise exception 'Unknown state %', p_state;
  end if;

  if p_state = 'current' and p_relationship_type <> 'owned_by_percentage' then
    update public.company_relationships
      set state = 'historical'
      where company_id = p_company_id
        and relationship_type <> 'owned_by_percentage'
        and state = 'current'
        and not (related_company_id = p_related_company_id and relationship_type = p_relationship_type);
  end if;

  insert into public.company_relationships (company_id, related_company_id, relationship_type, ownership_pct, state, created_by_profile_id)
  values (p_company_id, p_related_company_id, p_relationship_type, p_ownership_pct, p_state::relationship_state, public.current_profile_id())
  on conflict (company_id, related_company_id, relationship_type) where state = 'current' and related_company_id is not null
  do update set ownership_pct = coalesce(excluded.ownership_pct, public.company_relationships.ownership_pct)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.set_company_relationship(uuid, uuid, public.company_relationship_type, numeric, text) to authenticated;
