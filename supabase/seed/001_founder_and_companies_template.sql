-- SEM Brain founder/company seed template.
-- 1) First create the founder user in Supabase Auth.
-- 2) Copy the auth user UUID.
-- 3) Replace placeholders below and run.

-- Founder profile
insert into public.profiles (auth_user_id, full_name, email, role, active)
values (
  'PASTE-FOUNDER-AUTH-USER-UUID-HERE',
  'Tulga Galbadrakh',
  'PASTE-FOUNDER-EMAIL-HERE',
  'founder',
  true
)
on conflict (auth_user_id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  active = true;

-- Parent holding company
insert into public.companies (name, country, legal_entity_name, status, description, strategic_priority, risk_score)
values (
  'SEM Technologies LLC',
  'USA',
  'SEM Technologies LLC',
  'active',
  'Wyoming parent / holding company for Tulga’s international companies and operating entities.',
  10,
  1
)
on conflict do nothing;

-- Operating entities / product companies
insert into public.companies (name, country, legal_entity_name, status, description, strategic_priority, risk_score)
values
('OpenSpot / Steppe AI', 'USA', 'Steppe AI Inc.', 'active', 'AI-enabled curb access and parking enforcement platform.', 10, 2),
('SEM Global Robotics Technologies', 'Mongolia', 'SEM Global Robotics Technologies LLC', 'active', 'International R&D and engineering operating company.', 9, 2),
('SEM Mongolia Operations', 'Mongolia', 'Systems Engineering Mongolia LLC', 'active', 'Local operations and legacy products.', 8, 2),
('Fuelmetrix', 'Mongolia', 'Fuelmetrix Product Line', 'planning', 'Fuel automation, ANPR and dispenser controller system.', 7, 3),
('Trade-book.ai', 'USA', 'SEM Technologies LLC / Trade-book.ai', 'planning', 'AI-assisted trading education/subscription product line.', 5, 4)
on conflict do nothing;
