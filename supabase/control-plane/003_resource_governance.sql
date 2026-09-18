-- FACTORY CONTROL PLANE — 003 RESOURCE GOVERNANCE (Factory V1 milestone 5).
--
-- A work order carries a WEIGHT, and a node carries how many heavy ones it may run at once. The claim enforces both:
-- a heavy work order is claimable only while this node holds fewer heavy runs than its max_heavy and the plane as a
-- whole holds fewer than the plane-wide limit (FACTORY_HEAVY_PER_PLANE, read by the claim). Light and normal work is
-- not counted. Idempotent, like 001 and 002; applied by qa/factory/shared_local_pg.mjs on start and by
-- provision-control-plane.mjs' successors.
alter table factory.work_orders
  add column if not exists weight text not null default 'normal'
  check (weight in ('light','normal','heavy'));

alter table factory.nodes
  add column if not exists max_heavy integer not null default 1
  check (max_heavy >= 0);

-- The claim counts heavy runs in progress per node and per plane; this index keeps that count cheap.
create index if not exists agent_runs_in_progress_by_node_idx
  on factory.agent_runs (node_id) where status = 'in_progress';
