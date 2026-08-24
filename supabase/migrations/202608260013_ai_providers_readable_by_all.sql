-- ai_providers was gated founder/admin for ALL operations, including SELECT. That means
-- any non-founder/admin user (any real employee signup, e.g. via Google/email OTP) gets
-- zero rows back when checking which model is active -- both the Settings page and the
-- sem-ai-command edge function itself use the caller's own RLS-scoped client to read
-- this, so chat silently falls back to a hardcoded default model for every non-founder
-- user, with no "active" model visibly selected in the UI. Which provider is active is
-- app-wide configuration, not per-user data -- everyone needs to read it for chat to
-- work at all; only changing it should stay founder/admin-only.
drop policy if exists ai_providers_founder_only on public.ai_providers;

create policy ai_providers_select_all
  on public.ai_providers for select
  using (true);

create policy ai_providers_manage_founder_only
  on public.ai_providers for insert
  with check (is_founder_or_admin());

create policy ai_providers_update_founder_only
  on public.ai_providers for update
  using (is_founder_or_admin());

create policy ai_providers_delete_founder_only
  on public.ai_providers for delete
  using (is_founder_or_admin());
