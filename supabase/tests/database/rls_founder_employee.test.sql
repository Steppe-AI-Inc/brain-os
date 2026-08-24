begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, auth, extensions;

select plan(19);

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

insert into public.boards (
  id, company_id, name, created_by_profile_id
) values (
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Phase 0 Work Board',
  '30000000-0000-0000-0000-000000000001'
);

insert into public.board_columns (
  id, board_id, name, canonical_status, position
) values
  (
    '61000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'Backlog',
    'queued',
    0
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    'In progress',
    'in_progress',
    1000
  );

insert into public.board_items (
  id, board_id, column_id, task_id, position, added_by_profile_id
) values
  (
    '62000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    1000,
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '62000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    2000,
    '30000000-0000-0000-0000-000000000001'
  );

insert into public.chat_threads (
  id, created_by_profile_id, title
) values (
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Founder private conversation'
);

insert into public.chat_messages (
  id, thread_id, author_profile_id, role, content
) values (
  '71000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'user',
  'Founder-only command'
);

-- Isolate RLS behavior from Supabase platform bootstrap grants. The repository migration
-- chain does not currently declare base-table API grants; the drift report tracks that
-- separately. These test-only grants are transactional and disappear at rollback.
grant select on public.tasks, public.people, public.company_sensitive to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(public.current_role()::text, 'founder', 'founder JWT resolves to founder profile');
select is((select count(*)::int from public.tasks), 2, 'founder sees all company tasks');
select is((select count(*)::int from public.company_sensitive), 1, 'founder sees sensitive company data');
select is((select count(*)::int from public.boards), 1, 'founder sees the company work board');
select is((select count(*)::int from public.board_items), 2, 'founder sees all cards on the board');
select is((select count(*)::int from public.chat_threads), 1, 'founder sees their private chat thread');
select is((select count(*)::int from public.chat_messages), 1, 'founder sees messages in their thread');

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(public.current_role()::text, 'employee', 'employee JWT resolves to employee profile');
select is((select count(*)::int from public.tasks), 1, 'employee sees only their own task');
select is((select count(*)::int from public.company_sensitive), 0, 'employee cannot see sensitive company data');
select is((select count(*)::int from public.boards), 1, 'employee can discover their company work board');
select is((select count(*)::int from public.board_items), 1, 'employee sees only the card for their task');
select is((select count(*)::int from public.chat_threads), 0, 'employee cannot see founder chat threads');
select is((select count(*)::int from public.chat_messages), 0, 'employee cannot see founder chat messages');
select lives_ok(
  $move$ select public.move_board_item(
    '62000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000002'
  ) $move$,
  'employee can move their own card'
);
select is(
  (select status::text from public.tasks where id = '50000000-0000-0000-0000-000000000001'),
  'in_progress',
  'moving a card updates the canonical task status'
);
select is(
  (
    select count(*)::int
    from public.audit_logs
    where event_type = 'board_item_moved'
      and actor_profile_id = '30000000-0000-0000-0000-000000000002'
  ),
  1,
  'moving a card creates an audit event for the authenticated employee'
);

insert into public.chat_threads (id, title)
values (
  '70000000-0000-0000-0000-000000000002',
  'Employee private conversation'
);

insert into public.chat_messages (id, thread_id, role, content)
values (
  '71000000-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000002',
  'user',
  'Employee command'
);

select is((select count(*)::int from public.chat_threads), 1, 'employee can create and see their own chat thread');
select is((select count(*)::int from public.chat_messages), 1, 'employee can create and see messages in their own thread');

select * from finish();
rollback;
