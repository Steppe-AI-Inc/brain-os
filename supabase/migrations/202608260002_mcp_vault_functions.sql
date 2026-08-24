-- Supabase Vault wrapper functions for MCP connector tokens.
-- PostgREST only exposes the `public` schema by default — vault.create_secret() and
-- vault.decrypted_secrets aren't directly callable from /web's RLS-scoped client, so
-- these SECURITY DEFINER wrappers do the founder/admin check themselves (they don't
-- rely on RLS, since they read/write the `vault` schema, not a table with a policy)
-- and are the only path /web ever uses to touch a connector's real token.

create or replace function public.create_mcp_connector_secret(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if not public.is_founder_or_admin() then
    raise exception 'not authorized';
  end if;
  v_id := vault.create_secret(p_secret, p_name);
  return v_id;
end;
$$;

revoke all on function public.create_mcp_connector_secret(text, text) from public;
grant execute on function public.create_mcp_connector_secret(text, text) to authenticated;

create or replace function public.get_mcp_connector_token(p_connector_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_token text;
begin
  if not public.is_founder_or_admin() then
    raise exception 'not authorized';
  end if;
  select vault_secret_id into v_secret_id from public.mcp_connectors where id = p_connector_id;
  if v_secret_id is null then
    return null;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where id = v_secret_id;
  return v_token;
end;
$$;

revoke all on function public.get_mcp_connector_token(uuid) from public;
grant execute on function public.get_mcp_connector_token(uuid) to authenticated;

create or replace function public.delete_mcp_connector_secret(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if not public.is_founder_or_admin() then
    raise exception 'not authorized';
  end if;
  delete from vault.secrets where id = p_secret_id;
end;
$$;

revoke all on function public.delete_mcp_connector_secret(uuid) from public;
grant execute on function public.delete_mcp_connector_secret(uuid) to authenticated;
