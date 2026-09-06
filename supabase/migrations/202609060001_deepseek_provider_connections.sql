-- Additive provider integration. No business data or existing RLS policy changes.
begin;
alter table public.ai_providers drop constraint if exists ai_providers_provider_check;
alter table public.ai_providers add constraint ai_providers_provider_check
  check (provider in ('openai', 'anthropic', 'deepseek'));

-- Atomic switch: failed/not-found/stale targets leave the previous active model
-- intact. Serialize concurrent switches; keep the existing single-active index.
create or replace function public.activate_ai_provider(p_id uuid, p_provider text, p_model text)
returns void language plpgsql security invoker set search_path = '' as $$
declare target public.ai_providers%rowtype;
begin
  if auth.uid() is null or not public.is_founder_or_admin() then
    raise exception 'Founder or holding admin access required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(260906001);
  select * into target from public.ai_providers where id = p_id for update;
  if not found or target.provider is distinct from p_provider or target.model is distinct from p_model then
    raise exception 'Provider changed or does not exist; test it again' using errcode = '22023';
  end if;
  update public.ai_providers set is_active = false where is_active and id <> p_id;
  update public.ai_providers set is_active = true where id = p_id;
  insert into public.audit_logs(actor_profile_id, actor_role, event_type, entity_type, entity_id, message, metadata)
    values(public.current_profile_id(), public.current_role(), 'ai_provider_activated', 'ai_provider', p_id,
      'Active AI provider changed', pg_catalog.jsonb_build_object('provider', p_provider, 'model', p_model));
end;
$$;
revoke all on function public.activate_ai_provider(uuid, text, text) from public, anon;
grant execute on function public.activate_ai_provider(uuid, text, text) to authenticated;
commit;
