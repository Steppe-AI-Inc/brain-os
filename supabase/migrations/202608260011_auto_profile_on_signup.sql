-- New sign-ups (email OTP or Google OAuth) create an auth.users row with no matching
-- public.profiles row — until now, every profile was seeded manually
-- (supabase/seed/001_founder_and_companies_template.sql), so a real self-service signup
-- would leave a person authenticated but invisible to the rest of the app (no name, no
-- role, nothing joinable). This trigger closes that gap: default role is the least-
-- privileged 'employee', so a new signup starts with no company access until the founder
-- or an admin assigns them one — matching how every other "new record" in this app
-- defaults to minimum visibility, not maximum.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'employee',
    true
  )
  on conflict (email) do update set auth_user_id = excluded.auth_user_id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
