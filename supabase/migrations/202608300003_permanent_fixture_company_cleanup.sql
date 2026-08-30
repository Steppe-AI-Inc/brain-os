-- Real incident (2026-08-30, "Fix Multi-Entity Execution, Confirmation Truth, Assignment
-- Context, and Cascade/Postcondition Consistency" campaign, Bugs 1/3/15): a founder asked
-- "delete all data related to test4 company", Brain proposed a confirmation listing test4
-- company + test4 employee + assignments + relationships as things that would be
-- permanently removed, the founder confirmed, and Brain replied "Confirmed — Permanently
-- delete test4 company, test4 employee..." — but a later status check showed test4 company
-- was only archived and test4 employee was still active. Root cause: no AI-reachable
-- permanent-delete-with-cascade capability existed at all. The existing
-- permanentlyDeleteCompany() (web/lib/data/companies.ts) is UI-only and, by design,
-- REFUSES to proceed whenever ANY cascade-dependent or orphan-warn row exists (a
-- deliberately conservative "block, never guess" policy per Master-prompt spec §28) — so
-- even if it had been reachable, "test4 employee" being attached would have made it refuse
-- outright, not delete the person.
--
-- This migration adds a genuinely SEPARATE, narrower capability: permanent deletion of a
-- company AND its directly-attached FIXTURE-NAMED people, gated hard on a naming
-- convention (this codebase already uses 'test*'/'QA-*' prefixes exclusively for disposable
-- regression fixtures throughout qa/scenarios-runner/*, chat testing, and this session's own
-- test3/test4 usage) so a real production company or employee can never be hard-deleted
-- through this path. Everything else this company touches (goals, departments, tasks,
-- projects, financial reports, product lines, inventory, sales leads, proposals, kpi
-- records, salary rules, billing accounts, team access grants) is deliberately NOT
-- auto-deleted — if any of those exist, the function refuses and reports them as blockers,
-- exactly the ordinary permanentlyDeleteCompany()'s own "block, don't guess" policy, since
-- there is no reliable way to tell fixture data from real operational data for those
-- resource types. Company relationships and person_assignments tied to the company ARE
-- removed (they are pure structural links, not data of their own).

-- Extracted from delete_person()'s own dependents check (202608290008) so
-- permanently_delete_fixture_company_graph can dry-run EVERY fixture person's dependents
-- before deleting any of them, keeping the whole graph deletion transactional (Bug 4) -
-- one shared source of truth for "can this person be safely hard-deleted", not two
-- independently-maintained copies that could drift.
create or replace function public.check_person_delete_dependents(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_manager_count int;
  v_projects_count int;
  v_tasks_count int;
  v_leads_count int;
  v_goals_count int;
  v_cwo_count int;
  v_dependents jsonb;
begin
  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('personId',p_person_id,'authorized',false,'dependents','[]'::jsonb);
  end if;

  select count(*) into v_manager_count from public.people where manager_person_id = p_person_id;
  select count(*) into v_projects_count from public.projects where owner_person_id = p_person_id;
  select count(*) into v_tasks_count from public.tasks where owner_person_id = p_person_id;
  select count(*) into v_leads_count from public.sales_leads where owner_person_id = p_person_id;
  select count(*) into v_goals_count from public.goals where owner_person_id = p_person_id;
  select count(*) into v_cwo_count from public.canonical_work_orders where owner_person_id = p_person_id;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_dependents from (
    select 'people.manager_person_id' as "table", v_manager_count as count where v_manager_count > 0
    union all select 'projects.owner_person_id', v_projects_count where v_projects_count > 0
    union all select 'tasks.owner_person_id', v_tasks_count where v_tasks_count > 0
    union all select 'sales_leads.owner_person_id', v_leads_count where v_leads_count > 0
    union all select 'goals.owner_person_id', v_goals_count where v_goals_count > 0
    union all select 'canonical_work_orders.owner_person_id', v_cwo_count where v_cwo_count > 0
  ) x;

  return jsonb_build_object('personId',p_person_id,'authorized',true,'dependents',v_dependents);
end;
$$;

revoke all on function public.check_person_delete_dependents(uuid) from public, anon;
grant execute on function public.check_person_delete_dependents(uuid) to authenticated;

-- delete_person() refactored to call the shared helper above instead of duplicating the
-- dependents-check logic inline - behavior unchanged, same reason/dependents shape.
create or replace function public.delete_person(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
  v_authorized boolean;
  v_check jsonb;
  v_dependents jsonb;
  v_salary_count int;
  v_kpi_count int;
  v_policy_count int;
  v_assignments_count int;
  v_destroyed jsonb;
begin
  select exists(select 1 from public.people where id = p_person_id) into v_exists;
  if not v_exists then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',false,'reason','denied');
  end if;

  v_check := public.check_person_delete_dependents(p_person_id);
  v_dependents := coalesce(v_check->'dependents','[]'::jsonb);

  if jsonb_array_length(v_dependents) > 0 then
    return jsonb_build_object('operation','person.delete','personId',p_person_id,
      'changed',false,'authorized',true,'reason','has_dependents','dependents',v_dependents);
  end if;

  select count(*) into v_salary_count from public.salary_private where person_id = p_person_id;
  select count(*) into v_kpi_count from public.kpi_records where person_id = p_person_id;
  select count(*) into v_policy_count from public.person_ai_policy where person_id = p_person_id;
  select count(*) into v_assignments_count from public.person_assignments where person_id = p_person_id;

  delete from public.people where id = p_person_id;

  v_destroyed := jsonb_build_object(
    'people', 1,
    'salary_private', v_salary_count,
    'kpi_records', v_kpi_count,
    'person_ai_policy', v_policy_count,
    'person_assignments', v_assignments_count
  );

  return jsonb_build_object('operation','person.delete','personId',p_person_id,
    'changed',true,'authorized',true,'reason','deleted','destroyedCounts',v_destroyed);
end;
$$;

revoke all on function public.delete_person(uuid) from public, anon;
grant execute on function public.delete_person(uuid) to authenticated;

create or replace function public.permanently_delete_fixture_company_graph(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company record;
  v_authorized boolean;
  v_non_fixture_people jsonb;
  v_blockers jsonb;
  v_fixture_person_ids uuid[];
  v_person_id uuid;
  v_person_name text;
  v_delete_result jsonb;
  v_people_deleted jsonb := '[]'::jsonb;
  v_people_blocked jsonb := '[]'::jsonb;
  v_relationships_removed int := 0;
  v_assignments_removed int := 0;
  -- Same fixture-naming convention already established and used throughout this project's
  -- own regression fixtures (qa/scenarios-runner/*, this session's test3/test4/QA-* usage).
  v_fixture_pattern text := '^(test|qa-)';
begin
  select id, name, status into v_company from public.companies where id = p_company_id;
  if v_company.id is null then
    return jsonb_build_object('operation','company.permanentFixtureDelete','companyId',p_company_id,
      'changed',false,'authorized',false,'reason','not_found');
  end if;

  v_authorized := public.is_founder_or_admin();
  if not v_authorized then
    return jsonb_build_object('operation','company.permanentFixtureDelete','companyId',p_company_id,
      'changed',false,'authorized',false,'reason','denied');
  end if;

  if v_company.name !~* v_fixture_pattern then
    return jsonb_build_object('operation','company.permanentFixtureDelete','companyId',p_company_id,
      'changed',false,'authorized',true,'reason','not_a_fixture',
      'detail','Company name does not match the fixture naming convention (test*/QA-*) - this path never permanently deletes a real company.');
  end if;

  -- Any person whose CURRENT primary company is this one, but whose own name does not
  -- match the fixture convention, is a hard stop - never silently swept up.
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name)), '[]'::jsonb)
    into v_non_fixture_people
    from public.people
    where company_id = p_company_id and full_name !~* v_fixture_pattern;
  if jsonb_array_length(v_non_fixture_people) > 0 then
    return jsonb_build_object('operation','company.permanentFixtureDelete','companyId',p_company_id,
      'changed',false,'authorized',true,'reason','non_fixture_people_attached',
      'blockers',v_non_fixture_people);
  end if;

  -- Same "block, don't guess" policy as permanentlyDeleteCompany() for every other resource
  -- class this project has no reliable fixture-detection for.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_blockers from (
    select 'goals' as "table", count(*) as count from public.goals where company_id = p_company_id having count(*) > 0
    union all select 'departments', count(*) from public.departments where company_id = p_company_id having count(*) > 0
    union all select 'tasks', count(*) from public.tasks where company_id = p_company_id having count(*) > 0
    union all select 'projects', count(*) from public.projects where company_id = p_company_id having count(*) > 0
    union all select 'financial_reports', count(*) from public.financial_reports where company_id = p_company_id having count(*) > 0
    union all select 'product_lines', count(*) from public.product_lines where company_id = p_company_id having count(*) > 0
    union all select 'inventory_items', count(*) from public.inventory_items where company_id = p_company_id having count(*) > 0
    union all select 'sales_leads', count(*) from public.sales_leads where company_id = p_company_id having count(*) > 0
    union all select 'proposals', count(*) from public.proposals where company_id = p_company_id having count(*) > 0
    union all select 'kpi_records', count(*) from public.kpi_records where company_id = p_company_id having count(*) > 0
    union all select 'salary_rules', count(*) from public.salary_rules where company_id = p_company_id having count(*) > 0
    union all select 'billing_accounts', count(*) from public.billing_accounts where company_id = p_company_id having count(*) > 0
    union all select 'company_memberships', count(*) from public.company_memberships where company_id = p_company_id having count(*) > 0
  ) x;
  if jsonb_array_length(v_blockers) > 0 then
    return jsonb_build_object('operation','company.permanentFixtureDelete','companyId',p_company_id,
      'changed',false,'authorized',true,'reason','has_non_fixture_dependents','blockers',v_blockers);
  end if;

  -- Transactional, not partial (campaign Bug 4: "never company archived / employee
  -- survives active" - the whole graph commits together or nothing does). A dry-run pass
  -- checks every fixture person's delete_person() dependents FIRST, before any DELETE
  -- statement runs, so a blocked person can never leave an earlier person already gone.
  select array_agg(id) into v_fixture_person_ids from public.people where company_id = p_company_id;

  if v_fixture_person_ids is not null then
    foreach v_person_id in array v_fixture_person_ids loop
      select full_name into v_person_name from public.people where id = v_person_id;
      v_delete_result := public.check_person_delete_dependents(v_person_id);
      if jsonb_array_length(coalesce(v_delete_result->'dependents','[]'::jsonb)) > 0 then
        v_people_blocked := v_people_blocked || jsonb_build_object('id',v_person_id,'name',v_person_name,'dependents',v_delete_result->'dependents');
      end if;
    end loop;
  end if;

  if jsonb_array_length(v_people_blocked) > 0 then
    return jsonb_build_object('operation','company.permanentFixtureDelete','companyId',p_company_id,
      'changed',false,'authorized',true,'reason','person_delete_blocked',
      'peopleBlocked',v_people_blocked);
  end if;

  -- Dry-run confirmed clean - now actually delete. Any unexpected failure past this point
  -- (a concurrent row appearing between the check and here) raises and the whole call rolls
  -- back atomically with it, since this all runs inside one function invocation's implicit
  -- transaction - never a partial company-deleted-but-person-survives state.
  if v_fixture_person_ids is not null then
    foreach v_person_id in array v_fixture_person_ids loop
      select full_name into v_person_name from public.people where id = v_person_id;
      v_delete_result := public.delete_person(v_person_id);
      if (v_delete_result->>'changed')::boolean is not true then
        raise exception 'permanently_delete_fixture_company_graph: delete_person unexpectedly failed for % (%) after a clean dry-run: %', v_person_name, v_person_id, v_delete_result->>'reason';
      end if;
      v_people_deleted := v_people_deleted || jsonb_build_object('id',v_person_id,'name',v_person_name);
    end loop;
  end if;

  delete from public.person_assignments
    where legal_employer_company_id = p_company_id or operating_company_id = p_company_id;
  get diagnostics v_assignments_removed = row_count;

  delete from public.company_relationships
    where company_id = p_company_id or related_company_id = p_company_id;
  get diagnostics v_relationships_removed = row_count;

  delete from public.companies where id = p_company_id;

  return jsonb_build_object(
    'operation','company.permanentFixtureDelete','companyId',p_company_id,
    'changed',true,'authorized',true,'reason','deleted',
    'companyDeleted',true,
    'peopleDeleted',v_people_deleted,
    'assignmentsRemoved',v_assignments_removed,
    'relationshipsRemoved',v_relationships_removed
  );
end;
$$;

revoke all on function public.permanently_delete_fixture_company_graph(uuid) from public, anon;
grant execute on function public.permanently_delete_fixture_company_graph(uuid) to authenticated;
