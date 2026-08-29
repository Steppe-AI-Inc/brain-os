-- Factory Agent Registry — Phase 6 of the Software Factory master plan.
--
-- Purely additive, same discipline as 202608290002: new nullable columns on the
-- EXISTING, live public.agents table (already RLS-restricted to founder/admin for all
-- writes via agents_write_admin — confirmed live, no new RLS policy needed for the
-- security requirement that ordinary users cannot change execution/security
-- configuration), plus one real view for computed (never stored/fakeable) run status.
-- Zero renames, zero drops. The 9 pre-existing seed rows (AI Chief of Staff, AI Sales
-- Manager, etc.) are untouched — these new columns are null for them; only the 7 real
-- Software Factory agents get them populated, by the sync script, not by this migration.
--
-- Stable identity: `agents.name` (already the literal `--agent <name>` CLI dispatch
-- identifier, e.g. 'brain-os-implementation-engineer') is the canonical slug — a new
-- UNIQUE constraint makes this an enforced guarantee, not just a convention. A separate,
-- mutable `display_name` is added specifically so identity never depends on what a human
-- later wants to call the agent in a UI.

begin;

alter table public.agents add column display_name text;
alter table public.agents add column category text check (category in (
  'SOFTWARE_FACTORY','SECURITY','INTEGRATION','VERIFICATION','RELEASE'
));
alter table public.agents add column definition_path text;
alter table public.agents add column definition_hash text;
alter table public.agents add column execution_provider text check (execution_provider is null or execution_provider in (
  'claude_code_background','claude_code_local'
));
alter table public.agents add column permission_mode text;
-- Explicit, auditable, stored (not derived-at-query-time) security-relevant flag: does
-- this agent have real write/execution authority (permissionMode: auto + write tools) or
-- is it design-only / read-only (brain-os-product-architect, brain-os-release-operator)?
-- The Runner (§D below, application code) must refuse to dispatch any agent where this
-- is not true, regardless of what a caller claims.
alter table public.agents add column has_production_authority boolean not null default false;
-- Mandatory per governance: never let a third-party-sourced capability be represented as
-- internally authored. Structure: {"source": "brain_os_custom"} for fully custom agents,
-- or {"source": "brain_os_custom", "external_capabilities": [{"skill": "...", "origin":
-- "obra/superpowers", "pinned_ref": "..."}]} when a real, installed/proven external
-- capability is actually wired in (see docs/software-factory/THIRD_PARTY_COMPONENTS.md
-- for what's actually installed vs. merely audited-and-deferred).
alter table public.agents add column provenance jsonb;

alter table public.agents add constraint agents_name_unique unique (name);

-- Real, computed-from-actual-execution-state status — never a stored column that could
-- silently go stale or be set to a fake "RUNNING"/"online" value. RUNNING only if a real
-- agent_runs row is actually queued/in_progress right now; FAILED only if the most recent
-- real run's status is 'rejected'; UNKNOWN only when the agent has no execution_provider
-- at all (a design-only agent the Runner was never going to dispatch in the first place -
-- e.g. brain-os-product-architect); IDLE otherwise (agent is real and dispatchable, no
-- active run, last run - if any - didn't fail).
create or replace view public.agents_with_live_status as
select
  a.*,
  case
    when a.execution_provider is null then 'UNKNOWN'
    when exists (
      select 1 from public.agent_runs ar
      where ar.agent_id = a.id and ar.status in ('queued'::work_status,'in_progress'::work_status)
    ) then 'RUNNING'
    when (
      select ar.status from public.agent_runs ar
      where ar.agent_id = a.id order by ar.created_at desc limit 1
    ) = 'rejected'::work_status then 'FAILED'
    else 'IDLE'
  end as live_status,
  (select ar.id from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_id,
  (select ar.created_at from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_at,
  (select ar.status from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_status,
  (select ar.summary from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_summary,
  (select ar.head_commit from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_head_commit,
  (select ar.provider_run_id from public.agent_runs ar where ar.agent_id = a.id order by ar.created_at desc limit 1) as last_run_provider_run_id
from public.agents a;

-- security_invoker=true so this view evaluates RLS as the calling user (agents_select_
-- authenticated / agent_runs' own select policy), same pattern as public.safe_companies.
alter view public.agents_with_live_status set (security_invoker = true);

commit;
