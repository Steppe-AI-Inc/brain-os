-- Software Factory Phase 6 — real worker/machine registry, so Brain OS can show which
-- physical machines exist, what's installed on each, and whether each is actually
-- healthy — never a fake "Main PC / Work PC" placeholder row. A machine only appears
-- here once it has genuinely run scripts/factory-runner/register-worker.mjs against
-- production; "future cloud workers" stays an empty result set until one actually
-- registers, not a mocked row.

begin;

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  hostname text not null unique,
  display_name text,
  -- What this machine actually does in the factory, not aspirational. Free text kept
  -- deliberately loose (e.g. 'implementation_factory', 'qa_playwright_node') rather than
  -- a fixed enum - the roster of real worker roles is still forming.
  worker_role text,
  os_platform text,
  node_version text,
  claude_code_version text,
  max_concurrency integer,
  last_heartbeat_at timestamptz,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Real, per-worker record of what's actually installed there (mirrors agent_plugin_
-- attachments' own shape: a join with real install metadata, never a jsonb blob that
-- can silently drift from the canonical plugin_components row it describes).
create table if not exists public.worker_plugin_installs (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  plugin_component_id uuid not null references public.plugin_components(id) on delete cascade,
  installed_version text,
  installed_definition_hash text,
  installed_at timestamptz not null default now(),
  -- Populated by a real re-hash comparison against the canonical plugin_components row
  -- at heartbeat/registration time - true means this worker's on-disk copy has drifted
  -- from what the registry currently expects, never inferred from install_status alone.
  configuration_drift boolean not null default false,
  last_checked_at timestamptz,
  unique (worker_id, plugin_component_id)
);

create index if not exists worker_plugin_installs_worker_idx on public.worker_plugin_installs (worker_id);

alter table public.workers enable row level security;
alter table public.worker_plugin_installs enable row level security;

drop policy if exists "workers_founder_only" on public.workers;
create policy "workers_founder_only" on public.workers for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

drop policy if exists "worker_plugin_installs_founder_only" on public.worker_plugin_installs;
create policy "worker_plugin_installs_founder_only" on public.worker_plugin_installs for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

-- Real heartbeat-derived health, matching agents_with_live_status's own established
-- pattern exactly (never a stored, fakeable status column). 10-minute threshold, same
-- as every other liveness check in this codebase.
-- security_invoker = true is load-bearing, not decoration: this repo has a real,
-- previously-found live security gap (qa/REGRESSION_CATALOG.md's RLS-policy-drift
-- section, safe_companies/safe_proposals) where a view created without it silently ran
-- as its owner (bypassing the base table's RLS) despite the base table itself being
-- correctly locked down. Never omit this on a new view over an RLS-protected table.
create or replace view public.workers_with_live_status
with (security_invoker = true) as
select
  w.*,
  case
    when w.last_heartbeat_at is null then 'UNKNOWN'
    when w.last_heartbeat_at > now() - interval '10 minutes' then 'HEALTHY'
    when w.last_heartbeat_at > now() - interval '30 minutes' then 'DEGRADED'
    else 'DOWN'
  end as live_status
from public.workers w;

grant select on public.workers_with_live_status to authenticated;

commit;
