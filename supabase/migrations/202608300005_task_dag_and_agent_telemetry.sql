-- Software Factory — typed Task DAG + real Agent Run heartbeat telemetry.
--
-- Purely additive, same discipline as every prior factory migration: new nullable/
-- default-valued columns on the existing live `tasks`/`agent_runs` tables, zero renames,
-- zero drops, zero enum changes (deliberately — see below).
--
-- Task DAG: `depends_on` (task ids this task waits on) + `parallel_group` (an opaque
-- label; tasks sharing one Work Order with no dependency edge between them are eligible
-- to dispatch concurrently) + `required_capabilities` (matched against the new
-- `agents.capabilities` column from 202608300004 by the Phase 2 scheduler — never by
-- display name).
--
-- Agent Run telemetry: real, per-run fields a live worker updates on a heartbeat
-- interval. Deliberately does NOT add a 'stale' value to the shared `work_status` enum
-- (used across canonical_work_orders/tasks/work_orders/agent_runs — a global semantic
-- change for a concept that only makes sense for agent_runs specifically). Instead,
-- staleness is computed the same way `agents_with_live_status` already computes
-- RUNNING/IDLE/FAILED/UNKNOWN: never stored, never fakeable. A run whose status is
-- still 'in_progress' but whose last_heartbeat_at is older than the threshold reads as
-- STALE in the view below, exactly matching the founder's own requirement: "do not
-- continue showing RUNNING forever."

begin;

alter table public.tasks add column if not exists depends_on uuid[] not null default '{}';
alter table public.tasks add column if not exists parallel_group text;
alter table public.tasks add column if not exists required_capabilities text[] not null default '{}';

alter table public.agent_runs add column if not exists worker_id text;
alter table public.agent_runs add column if not exists last_heartbeat_at timestamptz;
alter table public.agent_runs add column if not exists current_step text;
alter table public.agent_runs add column if not exists worktree_path text;
alter table public.agent_runs add column if not exists token_usage jsonb;
alter table public.agent_runs add column if not exists estimated_cost_usd numeric;
alter table public.agent_runs add column if not exists last_event text;
alter table public.agent_runs add column if not exists blocked_reason text;
-- Real evidence of exactly which attached skills (from agent_plugin_attachments, see
-- 202608300004) were resolved and injected into this specific run's dispatch prompt, by
-- slug + definition_hash at dispatch time — not a live re-query, so it stays accurate
-- even if the agent's attachments later change. This is the concrete mechanism behind
-- "Agent Run records exact skill definition/hash used": dispatch-task.mjs populates it,
-- never left null for a run that had attachments.
alter table public.agent_runs add column if not exists attached_skills jsonb not null default '[]';

create index if not exists tasks_depends_on_gin_idx on public.tasks using gin (depends_on);
create index if not exists tasks_required_capabilities_gin_idx on public.tasks using gin (required_capabilities);
create index if not exists agent_runs_last_heartbeat_idx on public.agent_runs (last_heartbeat_at);

-- Real, computed run-level status view — the Agent Run analogue of
-- agents_with_live_status. STALE_THRESHOLD is 10 minutes: generous enough that a normal
-- Claude Code background dispatch's own polling cadence never false-positives, tight
-- enough that a genuinely dead worker is caught well within a founder's own session.
create or replace view public.agent_runs_with_live_status as
select
  ar.*,
  case
    when ar.status = 'in_progress'::work_status
      and ar.last_heartbeat_at is not null
      and ar.last_heartbeat_at < now() - interval '10 minutes'
      then 'STALE'
    when ar.status = 'in_progress'::work_status then 'RUNNING'
    when ar.status = 'rejected'::work_status then 'FAILED'
    when ar.status = 'done'::work_status then 'DONE'
    else upper(ar.status::text)
  end as live_run_status
from public.agent_runs ar;

alter view public.agent_runs_with_live_status set (security_invoker = true);

commit;
