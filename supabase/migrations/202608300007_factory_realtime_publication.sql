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

commit;
