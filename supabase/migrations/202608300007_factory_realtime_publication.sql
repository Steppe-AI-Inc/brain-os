-- Software Factory Phase 3 — real-time Workflow Factory control center.
--
-- Adds the three tables the live console actually needs to watch to
-- `supabase_realtime` (agent_runs/canonical_work_orders/tasks already have RLS —
-- Realtime respects it, this migration only controls which tables CAN be subscribed to,
-- never who can read what). founder_notifications was already added in
-- 202608300006_founder_notifications.sql.
--
-- GATED (a real production migration) despite being a low-risk publication-membership
-- change with no data/security implications of its own — consistent with this session's
-- standing rule that every migration gets explicit founder authorization before push,
-- not just the ones that look risky.

begin;

do $$ begin
  alter publication supabase_realtime add table public.agent_runs;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.canonical_work_orders;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;

-- Bundled into this same pending migration rather than a separate authorization request
-- (both are Phase 3 UI-truthfulness fixes, same review, same risk class): closes a real,
-- disclosed gap from KNOWN_FAILURE_MODES.md #39's page.tsx comment - agents_with_live_status
-- (202608290003) computes RUNNING purely from agent_runs.status, with no heartbeat-age
-- awareness, so a genuinely dead agent still displayed RUNNING on the Software Factory
-- page even after Phase 2's agent_runs_with_live_status view already solved this exact
-- problem at the run level. Same STALE_THRESHOLD (10 minutes) and same "never a
-- stored/fakeable flag" design as that view.
--
-- Real live push failure caught and fixed 2026-08-30: this originally used
-- `create or replace view`, which failed live with "cannot change name of view column
-- ... to capabilities" - `select a.*` expands to include agents.capabilities (added by
-- 202608300004, AFTER this view was first created), shifting every subsequent computed
-- column's position; Postgres only allows CREATE OR REPLACE to APPEND columns, never
-- shift existing ones. No dependents existed (checked via pg_depend before dropping),
-- so DROP + CREATE is safe here - but this is now a standing gap: any future
-- `alter table agents add column` before `live_status` in select order will break a
-- naive `create or replace view` on this view again. A `select a.id, a.name, ...`
-- explicit column list would be immune to this class of break; left as `a.*` here only
-- to stay a minimal diff from the pre-existing view - worth revisiting if this recurs.
drop view public.agents_with_live_status;
create view public.agents_with_live_status as
select
  a.*,
  case
    when a.execution_provider is null then 'UNKNOWN'
    when exists (
      select 1 from public.agent_runs ar
      where ar.agent_id = a.id and ar.status in ('queued'::work_status,'in_progress'::work_status)
        and (ar.last_heartbeat_at is null or ar.last_heartbeat_at >= now() - interval '10 minutes')
    ) then 'RUNNING'
    when exists (
      select 1 from public.agent_runs ar
      where ar.agent_id = a.id and ar.status = 'in_progress'::work_status
        and ar.last_heartbeat_at < now() - interval '10 minutes'
    ) then 'STALE'
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

alter view public.agents_with_live_status set (security_invoker = true);

commit;
