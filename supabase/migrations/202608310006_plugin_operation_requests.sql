-- Software Factory Phase 6 — real, non-cosmetic console actions for operations that
-- need local filesystem access (sandbox-test, review, apply-update, rollback).
--
-- provider.mjs's own header comment already establishes why: "this CANNOT run as a
-- Vercel serverless function ... needs a persistent filesystem". Enable/disable/attach/
-- detach are pure DB state transitions (definition_hash/definition_path already
-- computed and stored) and are wired directly as real Next.js server actions against
-- this same schema. But sandbox-test/review/apply-update/rollback need to read real
-- files from REPO_ROOT or the local Claude Code plugin cache (hashFile,
-- assertPathWithinAllowedRoots) — a hosted web request can never do that itself.
--
-- This table is the real queue: the console writes a request row, the existing
-- always-on Runner machine picks it up (scripts/factory-runner/poll-plugin-operations.mjs,
-- matching poll-and-dispatch.mjs's own established polling convention) and executes it
-- via the exact same plugin-attach.mjs functions already proven live this session — never
-- a reimplementation, never a shortcut that skips ALLOWED_DEFINITION_ROOTS validation.

begin;

create table if not exists public.plugin_operation_requests (
  id uuid primary key default gen_random_uuid(),
  plugin_component_id uuid not null references public.plugin_components(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  operation text not null check (operation in ('sandbox_test', 'review', 'apply_update', 'rollback')),
  -- Operation-specific inputs, e.g. {"licensePassed":true,"licenseNotes":"...",
  -- "securityPassed":true,"securityNotes":"..."} for 'review'; {"newDefinitionPath":...,
  -- "newPinnedCommitSha":...,"newInstalledVersion":...} for 'apply_update';
  -- {"targetVersionId":...} for 'rollback'; {} for 'sandbox_test' (automated check only).
  params jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  result jsonb,
  error text,
  requested_by_profile_id uuid references public.profiles(id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists plugin_operation_requests_pending_idx
  on public.plugin_operation_requests (requested_at) where status = 'pending';

alter table public.plugin_operation_requests enable row level security;

-- Founder/admin can INSERT a real request (this is the console action itself) and read
-- everything; only the Runner (service-role, via the CLI's own superuser DB connection,
-- same as every other mutating plugin-attach.mjs call) advances status/result — never a
-- browser-authenticated session, matching the existing plugin_components policy shape.
drop policy if exists "plugin_operation_requests_founder_select" on public.plugin_operation_requests;
create policy "plugin_operation_requests_founder_select" on public.plugin_operation_requests
for select using (public.is_founder_or_admin());

drop policy if exists "plugin_operation_requests_founder_insert" on public.plugin_operation_requests;
create policy "plugin_operation_requests_founder_insert" on public.plugin_operation_requests
for insert with check (public.is_founder_or_admin());

commit;
