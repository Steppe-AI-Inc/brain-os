-- FACTORY CONTROL PLANE V1 - PART 010: tenants, Factory admins, tenant_id on every 69df2f52 table (contract §1, §5; S-8, S-9).

set local role factory_owner;

-- ---------------------------------------------------------------------------------------------------
-- TENANTS. One row today: the operator tenant (founder decision A.2). `is_operator` marks it, and at most one row carries it.
-- The operator tenant's id is a constant, identical on every plane this migration runs on.
-- ---------------------------------------------------------------------------------------------------
create table factory.tenants (
  tenant_id    uuid primary key,
  name         text not null check (length(btrim(name)) between 1 and 120),
  is_operator  boolean not null default false,
  -- gate 11: heavy work orders in progress across the whole plane (both fleets), server-side. The frozen legacy claim reads its
  -- own FACTORY_HEAVY_PER_PLANE (default 2); an enrolled claim never takes a limit from the claimer.
  max_heavy_per_plane integer not null default 2 check (max_heavy_per_plane between 0 and 64),
  created_at   timestamptz not null default now()
);
create unique index tenants_one_operator on factory.tenants (is_operator) where is_operator;

insert into factory.tenants (tenant_id, name, is_operator)
values ('a1e0f000-0000-4000-8000-000000000001', 'operator', true);

-- ---------------------------------------------------------------------------------------------------
-- FACTORY ADMINS (S-8; CR-001, CR-003 ratified). An admin action needs BOTH the live Brain OS role founder | holding_admin,
-- re-derived from the caller's own token on every call, AND a row here. `tier` founder is required, together with the live role
-- founder, for the founder-only actions (granting release_broker; publishing, superseding or revoking a release).
-- Only the founder's provisioning step writes this table: no front door references it in DML, and the guard in part 080 refuses
-- any write that arrives through an API login.
-- ---------------------------------------------------------------------------------------------------
create table factory.tenant_admins (
  tenant_id     uuid not null references factory.tenants (tenant_id),
  auth_user_id  uuid not null,
  tier          text not null check (tier in ('founder', 'admin')),
  added_at      timestamptz not null default now(),
  note          text check (note is null or length(note) <= 500),
  primary key (tenant_id, auth_user_id)
);

-- The 69df2f52 tables gain a foreign key to tenants below; the migrating login needs REFERENCES for that one step.
grant references on factory.tenants to session_user;

reset role;

-- ---------------------------------------------------------------------------------------------------
-- tenant_id ON EVERY 69df2f52 TABLE. Existing rows are the operator tenant's; a frozen-code node's insert names no tenant and
-- gets the operator tenant by default. No evidence field of BASELINE_69df2f52_EVIDENCE_MANIFEST.json changes: the column is new
-- and outside every hashed field list (P-1).
-- (factory.plane_identity, a legacy provisioning record that exists only on some planes, is deliberately not referenced: S-10.)
-- ---------------------------------------------------------------------------------------------------
alter table factory.nodes                   add column tenant_id uuid not null default 'a1e0f000-0000-4000-8000-000000000001' references factory.tenants (tenant_id);
alter table factory.work_orders             add column tenant_id uuid not null default 'a1e0f000-0000-4000-8000-000000000001' references factory.tenants (tenant_id);
alter table factory.work_order_dependencies add column tenant_id uuid not null default 'a1e0f000-0000-4000-8000-000000000001' references factory.tenants (tenant_id);
alter table factory.agent_runs              add column tenant_id uuid not null default 'a1e0f000-0000-4000-8000-000000000001' references factory.tenants (tenant_id);
alter table factory.surface_locks           add column tenant_id uuid not null default 'a1e0f000-0000-4000-8000-000000000001' references factory.tenants (tenant_id);
alter table factory.checkpoints             add column tenant_id uuid not null default 'a1e0f000-0000-4000-8000-000000000001' references factory.tenants (tenant_id);
alter table factory.founder_notifications   add column tenant_id uuid not null default 'a1e0f000-0000-4000-8000-000000000001' references factory.tenants (tenant_id);
alter table factory.director_lease          add column tenant_id uuid not null default 'a1e0f000-0000-4000-8000-000000000001' references factory.tenants (tenant_id);

set local role factory_owner;
revoke references on factory.tenants from session_user;
reset role;
