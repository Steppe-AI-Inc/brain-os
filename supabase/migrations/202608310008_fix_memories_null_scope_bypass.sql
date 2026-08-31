-- SECURITY FIX — BUG-004 (P1, Work-PC QA campaign C001, qa/bugs/BUG-004.md).
--
-- memories_select_scope / memories_write_scope both treated `company_id IS NULL` as an
-- unconditional bypass, at every sensitivity tier, on both read and write. Combined with
-- public self-signup (any new auth user gets a real, active role='employee' profile via
-- handle_new_auth_user(), no invitation/allow-list), this meant any self-registered
-- stranger could write arbitrary "facts" into the company's shared memory substrate —
-- and memories are retrieved into sem-ai-command's context pack, so an unauthenticated
-- attacker could poison Brain Chat's own AI context. Independently reproduced live this
-- session (self-cleaning transaction, qa/scenarios-runner/
-- memories_null_company_scope_not_a_bypass.sql): stranger_can_write_unscoped_memory=true
-- before this fix. 0 confidential+company_id-IS-NULL rows exist today, so no confidential
-- data was actually exposed — but the read-side bypass was structurally present at every
-- tier, not just the write side that was actually exploited.
--
-- Fix: remove the blanket `company_id IS NULL` branch from every tier of both policies.
-- "Global/company-agnostic memory" is not deleted as a concept — it now requires the
-- SAME explicit privileged authority every other cross-company operation in this schema
-- already requires: is_founder_or_admin() (already the first OR-branch in both policies,
-- unaffected by this change). A company_manager's own branch is also tightened to
-- require company_id is not null - is_company_manager(company_id) already evaluates
-- false for a NULL argument (same null-safety pattern as has_company_access), so this is
-- explicit-and-defensive rather than a behavior change on that branch, but the guard is
-- added for clarity since it's the exact condition this whole bug was about.
--
-- Regression: qa/scenarios-runner/memories_null_company_scope_not_a_bypass.sql
-- (QA-authored, EXPECTED_FAIL until this migration — re-run after push, must flip to
-- all_pass:true).

begin;

drop policy if exists "memories_select_scope" on public.memories;
create policy "memories_select_scope" on public.memories for select using (
  public.is_founder_or_admin()
  or (sensitivity = 'public' and company_id is not null and (public.has_company_access(company_id) or public.is_investor_viewer_of(company_id)))
  or (sensitivity = 'internal' and company_id is not null and public.has_company_access(company_id))
  or (sensitivity = 'confidential' and company_id is not null and (public.is_company_manager(company_id) or public.is_hr_finance()))
);

drop policy if exists "memories_write_scope" on public.memories;
create policy "memories_write_scope" on public.memories for all using (
  public.is_founder_or_admin() or (company_id is not null and public.is_company_manager(company_id))
) with check (
  public.is_founder_or_admin() or (company_id is not null and public.is_company_manager(company_id))
);

-- Related latent issue, flagged by the same QA report, hardened alongside (not
-- separately filed since it shares the same root cause: a new-signup path with no
-- authorization gate). handle_new_auth_user() previously did
-- `on conflict (email) do update set auth_user_id = excluded.auth_user_id`
-- unconditionally - signing up with an email that already exists in profiles rebinds
-- that profile to the NEW auth user, silently transferring account ownership. Not
-- exploitable today (0 profiles have a pre-seeded, unbound email at the time this was
-- found) but becomes live the moment anyone pre-seeds a profile row (e.g. onboarding a
-- hire before they sign up) - at that point, anyone who signs up with that hire's email
-- first hijacks their eventual account. Fixed: only rebind when the existing profile's
-- auth_user_id is genuinely null (the legitimate pre-seed-then-claim case) - an
-- already-bound profile is never silently rebound by a later signup.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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
  on conflict (email) do update set auth_user_id = excluded.auth_user_id
  where public.profiles.auth_user_id is null;
  return new;
end;
$$;

commit;
