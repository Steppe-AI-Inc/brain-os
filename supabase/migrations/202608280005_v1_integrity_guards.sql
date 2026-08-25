-- SEM Brain v1 — cross-tenant integrity guards
-- RLS controls who may read/write. These triggers additionally prevent validly-authorized
-- users from accidentally linking records across organizations through mismatched UUIDs.
begin;

create or replace function public.assert_company_in_organization(p_company_id uuid, p_organization_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_company_id is null then return; end if;
  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id and c.organization_id = p_organization_id
  ) then
    raise exception 'company does not belong to organization';
  end if;
end;
$$;

create or replace function public.assert_person_in_organization(p_person_id uuid, p_organization_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_person_id is null then return; end if;
  if not exists (
    select 1 from public.people p
    where p.id = p_person_id and p.organization_id = p_organization_id
  ) then
    raise exception 'person does not belong to organization';
  end if;
end;
$$;

create or replace function public.guard_knowledge_pack_tenant()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.assert_company_in_organization(new.company_id, new.organization_id);
  return new;
end;
$$;
drop trigger if exists role_knowledge_pack_tenant_guard on public.role_knowledge_packs;
create trigger role_knowledge_pack_tenant_guard
before insert or update on public.role_knowledge_packs
for each row execute function public.guard_knowledge_pack_tenant();

create or replace function public.guard_certification_tenant()
returns trigger language plpgsql set search_path = public as $$
declare
  pack_org uuid;
begin
  perform public.assert_person_in_organization(new.person_id, new.organization_id);
  select organization_id into pack_org from public.role_knowledge_packs where id = new.knowledge_pack_id;
  if pack_org is distinct from new.organization_id then raise exception 'knowledge pack is outside organization'; end if;
  return new;
end;
$$;
drop trigger if exists role_certification_tenant_guard on public.role_certifications;
create trigger role_certification_tenant_guard
before insert or update on public.role_certifications
for each row execute function public.guard_certification_tenant();

create or replace function public.guard_assistant_policy_tenant()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.assert_person_in_organization(new.person_id, new.organization_id);
  return new;
end;
$$;
drop trigger if exists assistant_policy_tenant_guard on public.assistant_automation_policies;
create trigger assistant_policy_tenant_guard
before insert or update on public.assistant_automation_policies
for each row execute function public.guard_assistant_policy_tenant();

create or replace function public.guard_person_ai_assistant_tenant()
returns trigger language plpgsql set search_path = public as $$
declare
  policy_org uuid;
begin
  perform public.assert_person_in_organization(new.person_id, new.organization_id);
  perform public.assert_company_in_organization(new.company_id, new.organization_id);
  if new.policy_id is not null then
    select organization_id into policy_org from public.assistant_automation_policies where id = new.policy_id;
    if policy_org is distinct from new.organization_id then raise exception 'assistant policy is outside organization'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists person_ai_assistant_tenant_guard on public.person_ai_assistants;
create trigger person_ai_assistant_tenant_guard
before insert or update on public.person_ai_assistants
for each row execute function public.guard_person_ai_assistant_tenant();

create or replace function public.guard_communication_thread_tenant()
returns trigger language plpgsql set search_path = public as $$
declare
  assistant_org uuid;
begin
  perform public.assert_company_in_organization(new.company_id, new.organization_id);
  perform public.assert_person_in_organization(new.assigned_person_id, new.organization_id);
  if new.assistant_id is not null then
    select organization_id into assistant_org from public.person_ai_assistants where id = new.assistant_id;
    if assistant_org is distinct from new.organization_id then raise exception 'assistant is outside organization'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists communication_thread_tenant_guard on public.communication_threads;
create trigger communication_thread_tenant_guard
before insert or update on public.communication_threads
for each row execute function public.guard_communication_thread_tenant();

create or replace function public.guard_usage_tenant()
returns trigger language plpgsql set search_path = public as $$
declare
  account_org uuid;
begin
  select organization_id into account_org from public.billing_accounts where id = new.billing_account_id;
  if account_org is null or account_org is distinct from new.organization_id then
    raise exception 'billing account is outside organization';
  end if;
  return new;
end;
$$;
drop trigger if exists ai_usage_tenant_guard on public.ai_usage_events;
create trigger ai_usage_tenant_guard
before insert or update on public.ai_usage_events
for each row execute function public.guard_usage_tenant();

create or replace function public.guard_ledger_tenant()
returns trigger language plpgsql set search_path = public as $$
declare
  account_org uuid;
begin
  select organization_id into account_org from public.billing_accounts where id = new.billing_account_id;
  if account_org is null or account_org is distinct from new.organization_id then
    raise exception 'ledger billing account is outside organization';
  end if;
  return new;
end;
$$;
drop trigger if exists service_credit_ledger_tenant_guard on public.service_credit_ledger;
create trigger service_credit_ledger_tenant_guard
before insert on public.service_credit_ledger
for each row execute function public.guard_ledger_tenant();

create or replace function public.guard_software_factory_tenant()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.assert_company_in_organization(new.company_id, new.organization_id);
  return new;
end;
$$;
drop trigger if exists software_factory_run_tenant_guard on public.software_factory_runs;
create trigger software_factory_run_tenant_guard
before insert or update on public.software_factory_runs
for each row execute function public.guard_software_factory_tenant();

create or replace function public.guard_kpi_definition_tenant()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.assert_company_in_organization(new.company_id, new.organization_id);
  return new;
end;
$$;
drop trigger if exists kpi_definition_tenant_guard on public.kpi_definitions;
create trigger kpi_definition_tenant_guard
before insert or update on public.kpi_definitions
for each row execute function public.guard_kpi_definition_tenant();

create or replace function public.guard_attendance_tenant()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.assert_company_in_organization(new.company_id, new.organization_id);
  perform public.assert_person_in_organization(new.person_id, new.organization_id);
  return new;
end;
$$;
drop trigger if exists attendance_tenant_guard on public.attendance_records;
create trigger attendance_tenant_guard
before insert or update on public.attendance_records
for each row execute function public.guard_attendance_tenant();

create or replace function public.guard_compensation_tenant()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.assert_company_in_organization(new.company_id, new.organization_id);
  perform public.assert_person_in_organization(new.person_id, new.organization_id);
  return new;
end;
$$;
drop trigger if exists compensation_recommendation_tenant_guard on public.compensation_recommendations;
create trigger compensation_recommendation_tenant_guard
before insert or update on public.compensation_recommendations
for each row execute function public.guard_compensation_tenant();

drop trigger if exists sales_commission_tenant_guard on public.sales_commission_events;
create trigger sales_commission_tenant_guard
before insert or update on public.sales_commission_events
for each row execute function public.guard_compensation_tenant();

commit;
