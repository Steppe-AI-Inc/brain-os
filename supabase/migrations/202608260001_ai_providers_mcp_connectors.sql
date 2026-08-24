-- SEM Brain — AI Providers + MCP Connectors + real cost tracking.
-- Lets the founder pick/switch which LLM provider+model powers AI Native Chat, and
-- register remote MCP tool connectors, from a real settings page in /web.
--
-- Deliberate security boundary (founder's explicit choice): ai_providers has NO key
-- column. The real provider API key stays a Supabase Edge Function secret
-- (OPENAI_API_KEY / ANTHROPIC_API_KEY) — see supabase/functions/sem-ai-command/index.ts —
-- never a database row. MCP connector credentials are inherently per-row (unlike a
-- single provider key), so those use Supabase Vault (a maintained platform feature with
-- real KMS-backed encryption), not a hand-rolled pgcrypto passphrase.

do $$ begin
  create extension if not exists supabase_vault cascade;
exception when others then null; end $$;

do $$ begin
  create type mcp_transport as enum ('http','sse');
exception when duplicate_object then null; end $$;

create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai','anthropic')),
  label text not null,
  model text not null,
  is_active boolean not null default false,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
-- At most one active provider at a time — sem-ai-command reads exactly one row.
create unique index if not exists ai_providers_single_active_idx
  on public.ai_providers ((is_active)) where is_active = true;

create table if not exists public.mcp_connectors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  endpoint_url text not null,
  transport mcp_transport not null default 'http',
  -- References vault.secrets(id) (no FK — cross-schema, and Vault manages its own
  -- lifecycle); null when the connector needs no auth token.
  vault_secret_id uuid,
  last_checked_at timestamptz,
  last_status text,
  last_tool_count int,
  enabled boolean not null default true,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.ai_providers enable row level security;
alter table public.mcp_connectors enable row level security;

-- Founder/admin-only for everything, same shape as company_sensitive — this is
-- operator config, not something any company member should see or touch.
drop policy if exists "ai_providers_founder_only" on public.ai_providers;
create policy "ai_providers_founder_only" on public.ai_providers for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

drop policy if exists "mcp_connectors_founder_only" on public.mcp_connectors;
create policy "mcp_connectors_founder_only" on public.mcp_connectors for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);
