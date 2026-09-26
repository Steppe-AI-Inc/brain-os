-- FACTORY CONTROL PLANE V1 - PART 040: the audit log (contract §9 receipts; S-6 "every attempt is audited"; S-8).
--
-- Append-only: no UPDATE, DELETE or TRUNCATE by anyone, the engine included (guard, part 080). It never holds a secret: no
-- pairing code, pepper, token, private key or credential value - only ids, outcomes and named reasons.

set local role factory_owner;

create table factory.audit_events (
  event_id     bigint generated always as identity primary key,
  tenant_id    uuid not null references factory.tenants (tenant_id),
  at           timestamptz not null default clock_timestamp(),
  -- who acted: a Factory admin (auth user id), a node (principal id), the installer, the server itself, or the founder's
  -- provisioning step
  actor_kind   text not null check (actor_kind in ('admin', 'node', 'installer', 'server', 'founder')),
  actor_id     text check (actor_id is null or length(actor_id) <= 100),
  action       text not null check (action ~ '^[a-z][a-z0-9_.]{1,63}$'),
  target_kind  text check (target_kind is null or target_kind ~ '^[a-z][a-z0-9_]{1,39}$'),
  target_id    text check (target_id is null or length(target_id) <= 100),
  outcome      text not null check (outcome in ('ok', 'already', 'refused', 'failed')),
  reason       text check (reason is null or length(reason) <= 300),
  detail       jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 8192),
  request_id   text check (request_id is null or length(request_id) <= 100)
);
create index audit_events_by_target on factory.audit_events (tenant_id, target_kind, target_id, event_id);
create index audit_events_by_time on factory.audit_events (tenant_id, at);

reset role;
