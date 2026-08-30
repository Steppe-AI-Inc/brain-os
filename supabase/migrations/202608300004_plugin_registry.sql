-- Software Factory — Plugin/GitHub Control Center registry.
--
-- Real, connected-to-execution registry for external components (agents, skills, MCP
-- servers, execution providers) — not cosmetic metadata. Modeled directly on the proven
-- `mcp_connectors` shape (202608260001) rather than inventing a new pattern: same
-- founder/admin-only RLS, same "connector row + real sync state" structure.
--
-- Two tables, purely additive:
--   plugin_sources     — one row per external repo/source (GitHub today).
--   plugin_components  — one row per installable unit within a source (an agent
--                         definition, a skill file, an MCP server config, etc.).
-- Attachment to a Brain OS agent is a real many-to-many join
-- (agent_plugin_attachments), NOT a copy into agents.provenance — sync-agents.mjs reads
-- this join table and writes the resolved summary into agents.provenance.
-- external_capabilities at sync time (see script change, not this migration), so the
-- existing, already-designed provenance shape stays the single source callers read at
-- dispatch time, while this table is the durable, editable source of truth for what's
-- attached.
--
-- Governance: nothing here lets a plugin bypass Brain OS RLS/approval/production
-- authority. plugin_components.install_status starts 'discovered' and can only reach
-- 'registered'/'enabled' after passing the pipeline stages recorded in this same row;
-- application code (not this migration) enforces the stage order. A component
-- requesting a sensitive permission never gets has_production_authority on the agent
-- side without the same founder/admin approval every other agent registration requires.

begin;

create table if not exists public.plugin_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'github' check (source_type in ('github')),
  github_owner text not null,
  github_repo text not null,
  repository_url text not null,
  default_branch text not null default 'main',
  pinned_ref text,
  pinned_commit_sha text,
  license text,
  -- unreviewed: just discovered, nothing inspected yet.
  -- quarantined: failed or pending static/security inspection, cannot be attached.
  -- approved: passed the full install pipeline at least once.
  -- rejected: explicitly refused (bad license, failed security review, etc.).
  trust_status text not null default 'unreviewed' check (trust_status in (
    'unreviewed','quarantined','approved','rejected'
  )),
  last_checked_at timestamptz,
  latest_upstream_sha text,
  update_available boolean not null default false,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (github_owner, github_repo)
);

create table if not exists public.plugin_components (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.plugin_sources(id) on delete cascade,
  slug text not null,
  component_type text not null check (component_type in (
    'agent','skill','plugin','mcp_server','execution_provider','workflow','testing_tool','library','template'
  )),
  display_name text,
  -- Parsed brain-plugin.yaml/json shape (name/version/entrypoint/skills/capabilities/
  -- tools/supported_agents/required_permissions/execution_provider_compatibility/
  -- dependencies/health_check/license) — see docs/software-factory/PLUGIN_MANIFEST.md.
  manifest jsonb not null default '{}'::jsonb,
  installed_version text,
  definition_path text,
  definition_hash text,
  capability_metadata jsonb not null default '{}'::jsonb,
  -- Least-privilege permission set requested, e.g.
  -- ["READ_REPOSITORY","RUN_TESTS","CREATE_WORKTREE"]. Never a default of "all".
  permission_profile jsonb not null default '[]'::jsonb,
  -- Pipeline stages, strictly ordered by application code (this column just records the
  -- furthest stage reached): discovered -> quarantined -> smoke_tested -> registered ->
  -- enabled (or disabled). A component can only ever be attached to an agent
  -- (agent_plugin_attachments) once install_status is 'registered' or 'enabled'.
  install_status text not null default 'discovered' check (install_status in (
    'discovered','quarantined','smoke_tested','registered','enabled','disabled'
  )),
  -- Sensitive permissions (WRITE_REPOSITORY / DATABASE_WRITE / DEPLOY_PRODUCTION) require
  -- an explicit founder/admin approval before install_status can reach 'registered' —
  -- recorded here, enforced by application code, never inferred.
  requires_approval boolean not null default false,
  approved_by_profile_id uuid references public.profiles(id),
  approved_at timestamptz,
  enabled boolean not null default false,
  last_health_check_at timestamptz,
  last_health_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, slug)
);

create table if not exists public.agent_plugin_attachments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  plugin_component_id uuid not null references public.plugin_components(id) on delete cascade,
  attached_at timestamptz not null default now(),
  attached_by_profile_id uuid references public.profiles(id),
  detached_at timestamptz,
  unique (agent_id, plugin_component_id)
);

-- Real capability metadata for routing (Phase 2's scheduler dispatches by this, never by
-- display name). Nullable, populated by sync-agents.mjs from each agent's own frontmatter
-- or an explicit capabilities list — not inferred from prose at dispatch time.
alter table public.agents add column if not exists capabilities text[] not null default '{}';

create index if not exists plugin_components_source_idx on public.plugin_components (source_id);
create index if not exists plugin_components_type_idx on public.plugin_components (component_type);
create index if not exists agent_plugin_attachments_agent_idx on public.agent_plugin_attachments (agent_id);
create index if not exists agent_plugin_attachments_component_idx on public.agent_plugin_attachments (plugin_component_id);
create index if not exists agents_capabilities_gin_idx on public.agents using gin (capabilities);

alter table public.plugin_sources enable row level security;
alter table public.plugin_components enable row level security;
alter table public.agent_plugin_attachments enable row level security;

-- Founder/admin-only for everything, identical shape to mcp_connectors_founder_only —
-- this is operator/security config, not something any company member should see or touch.
drop policy if exists "plugin_sources_founder_only" on public.plugin_sources;
create policy "plugin_sources_founder_only" on public.plugin_sources for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

drop policy if exists "plugin_components_founder_only" on public.plugin_components;
create policy "plugin_components_founder_only" on public.plugin_components for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

drop policy if exists "agent_plugin_attachments_founder_only" on public.agent_plugin_attachments;
create policy "agent_plugin_attachments_founder_only" on public.agent_plugin_attachments for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

commit;
