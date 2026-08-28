-- Root cause of the founder's real defect (People page showing CLIX GPS/Tradebook as
-- top-level companies, SEM GRT ownership not reflected anywhere): NOT a stale-name-copy
-- bug - verified live that people.company_id -> companies.name is a real FK join with
-- zero caching issue (renamed a throwaway test company, hard-loaded /people in a fresh
-- tab, new name appeared instantly). The real defects, all confirmed directly against
-- production data:
--   1. `company_relationships` (built 202608260006, already wired into sem-ai-command
--      and sem_execute_ai_command) has no organization_type distinction and no way to
--      express "business unit" separately from "owns" - so "CLIX GPS is a business unit
--      of SEM LLC" had nowhere real to go. Confirmed: zero company_relationships rows
--      exist for CLIX GPS or Tradebook at all, despite the founder's explicit command -
--      the AI claimed it was done with no underlying mechanism, the same "claimed
--      success, no real mechanism" class as the original approvals-execution gap.
--   2. No idempotency: "SEM LLC parent_of SEM Global Robotics Technologies LLC" exists
--      as two separate 'current' rows (2026-08-24, ownership_pct null; 2026-08-28,
--      ownership_pct 100) - a repeated founder command created a duplicate instead of
--      updating in place.
--   3. Most severe: zero UI anywhere (grepped web/ - only generated types reference
--      these tables) ever reads company_relationships or person_assignments. Even the
--      one relationship that DID get persisted correctly (SEM GRT ownership) was never
--      visible anywhere in the product, so from the founder's side it looked identical
--      to a total no-op.
-- This migration fixes 1 and 2 (schema) and cleans up the live duplicate found in 2.
-- Fix 3 (surfacing the graph in the Companies page) is a web/ change, not a migration.

alter type public.company_relationship_type add value if not exists 'business_unit_of';
alter type public.company_relationship_type add value if not exists 'brand_of';
alter type public.company_relationship_type add value if not exists 'subsidiary_of';
alter type public.company_relationship_type add value if not exists 'department_of';

alter table public.companies
  add column if not exists organization_type text not null default 'legal_entity'
  check (organization_type in ('legal_entity', 'holding_company', 'subsidiary', 'business_unit', 'brand', 'department', 'country_operation'));

-- Data cleanup, must run before the unique index below: the live duplicate found above.
-- Keep the complete row (has the real ownership_pct), mark the incomplete 2026-08-24
-- duplicate historical rather than deleting it - it's real history (an earlier,
-- incomplete attempt at the same command), not garbage.
update public.company_relationships
  set state = 'historical'
  where id = '0e6ef1fc-0607-4162-916d-ef46b9024915' and state = 'current';

-- One 'current' relationship of a given type between the same pair at a time - this is
-- what makes "move CLIX GPS under SEM LLC" idempotent on repeat instead of piling up
-- duplicates, the exact bug found live on the SEM GRT rows above.
create unique index if not exists company_relationships_current_unique
  on public.company_relationships (company_id, related_company_id, relationship_type)
  where state = 'current' and related_company_id is not null;

-- Enforces the two invariants the founder's spec calls out explicitly: no ownership
-- cycles (A owns B, B owns A), and total active ownership of any one company not
-- exceeding 100%. Only applies to state='current' rows - 'planned'/'historical' rows are
-- intentionally exempt (a plan or a past structure isn't live reality yet/anymore).
create or replace function public.check_company_relationship_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cyclic boolean;
begin
  if new.state = 'current' and new.related_company_id is not null then
    if new.relationship_type = 'owned_by_percentage' and new.ownership_pct is not null then
      if (
        select coalesce(sum(ownership_pct), 0)
        from public.company_relationships
        where company_id = new.company_id
          and relationship_type = 'owned_by_percentage'
          and state = 'current'
          and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) + new.ownership_pct > 100 then
        raise exception 'Total current ownership of company % would exceed 100%%', new.company_id;
      end if;
    end if;

    if new.relationship_type in ('parent_of', 'business_unit_of', 'brand_of', 'subsidiary_of', 'department_of') then
      with recursive ancestors as (
        select company_id as id from public.company_relationships
        where related_company_id = new.company_id
          and state = 'current'
          and relationship_type in ('parent_of', 'business_unit_of', 'brand_of', 'subsidiary_of', 'department_of')
        union
        select r.company_id from public.company_relationships r
        join ancestors a on r.related_company_id = a.id
        where r.state = 'current'
          and r.relationship_type in ('parent_of', 'business_unit_of', 'brand_of', 'subsidiary_of', 'department_of')
      )
      select exists(select 1 from ancestors where id = new.related_company_id) into cyclic;
      if cyclic or new.company_id = new.related_company_id then
        raise exception 'This relationship would create a cycle in the organization hierarchy';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists company_relationships_integrity on public.company_relationships;
create trigger company_relationships_integrity
  before insert or update on public.company_relationships
  for each row execute function public.check_company_relationship_integrity();

-- Idempotent structural-move RPC: ending any other 'current' non-ownership relationship
-- for the same company before inserting/reactivating the requested one means a repeated
-- "move X under Y" is a no-op the second time, not a duplicate.
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
  values (p_company_id, p_related_company_id, p_relationship_type, p_ownership_pct, p_state, public.current_profile_id())
  on conflict (company_id, related_company_id, relationship_type) where state = 'current' and related_company_id is not null
  do update set ownership_pct = coalesce(excluded.ownership_pct, public.company_relationships.ownership_pct)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.set_company_relationship(uuid, uuid, public.company_relationship_type, numeric, text) to authenticated;
