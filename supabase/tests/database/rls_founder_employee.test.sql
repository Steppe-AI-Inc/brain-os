begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, auth, extensions;

select plan(6);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'phase0-founder@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'phase0-employee@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.companies (id, name)
values ('20000000-0000-0000-0000-000000000001', 'Phase 0 Test Company');

insert into public.profiles (id, auth_user_id, full_name, email, role)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Phase 0 Founder',
    'phase0-founder@example.test',
    'founder'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'Phase 0 Employee',
    'phase0-employee@example.test',
    'employee'
  );

insert into public.company_memberships (company_id, profile_id, role_in_company)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    'employee'
  );

insert into public.people (id, profile_id, company_id, full_name)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  'Phase 0 Employee'
);

insert into public.company_sensitive (company_id, cash_balance, ownership_notes)
values (
  '20000000-0000-0000-0000-000000000001',
  1000000,
  'Founder-only test data'
);

insert into public.tasks (
  id,
  company_id,
  title,
  owner_person_id,
  created_by_profile_id
) values
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Employee task',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Founder-only task',
    null,
    '30000000-0000-0000-0000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(public.current_role()::text, 'founder', 'founder JWT resolves to founder profile');
select is((select count(*)::int from public.tasks), 2, 'founder sees all company tasks');
select is((select count(*)::int from public.company_sensitive), 1, 'founder sees sensitive company data');

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(public.current_role()::text, 'employee', 'employee JWT resolves to employee profile');
select is((select count(*)::int from public.tasks), 1, 'employee sees only their own task');
select is((select count(*)::int from public.company_sensitive), 0, 'employee cannot see sensitive company data');

select * from finish();
rollback;
