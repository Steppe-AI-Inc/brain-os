-- Software Factory Phase 6 — real plugin/skill lifecycle states + version history.
--
-- Two real gaps closed, both found by direct schema inspection this session (not assumed):
--
-- 1. plugin_components.install_status only allowed
--    discovered/quarantined/smoke_tested/registered/enabled/disabled. There was no
--    'installed' state distinct from 'registered', and no 'failed'/'update_available'
--    state — exactly the founder's flagged risk: a GitHub repository being discovered
--    must never be labeled INSTALLED. registerComponent() (plugin-attach.mjs) jumped
--    straight from nothing to 'registered' with no programmatic license/security gate.
--    Extends the enum so application code can express the full real pipeline: discovered
--    -> reviewing -> quarantined -> testing -> installed -> enabled (or disabled/failed),
--    with update_available as an explicit component-level state alongside the existing
--    plugin_sources.update_available boolean (source-level: "does this source have a
--    newer upstream commit"; component-level: "is this specific installed component
--    currently pinned to a stale version").
--
-- 2. plugin-attach.mjs's registerComponent() used `on conflict (source_id, slug) do
--    update` — a real update/rollback would silently overwrite pinned_commit_sha/
--    definition_hash/installed_version in place, destroying the prior version's
--    provenance. plugin_component_versions is an append-only snapshot table: every time
--    application code is about to change a plugin_components row's version-identifying
--    fields (initial install, update, or rollback), it first inserts a snapshot of the
--    row as it stood before the change. Rollback is then "read the target version's
--    snapshot, apply it back to plugin_components, snapshot what was just superseded" —
--    never a destructive UPDATE that leaves no trace of what was there before.

begin;

-- Data migration for pre-existing rows FIRST — the new constraint below retires
-- 'smoke_tested' and 'registered' in favor of the real installed/enabled distinction, so
-- any existing row using those values must be re-mapped or the ALTER TABLE ADD CONSTRAINT
-- fails outright (found live: the real production 'verification-before-completion' row,
-- install_status='registered', enabled=true, failed this exact constraint on first push
-- attempt — the whole migration is one transaction, so nothing was left partially
-- applied). A 'registered' component already enabled=true has demonstrably been used in
-- real production dispatch (Phase 1's own attach proof) — that is real installed+enabled
-- evidence, not just discovery, so it maps to 'enabled'; 'registered' with enabled=false
-- maps to 'installed' (passed the old pipeline, just never flipped on); 'smoke_tested'
-- (no live rows today, but future-proofed) maps to 'testing', its closest new analog.
update public.plugin_components set install_status = 'enabled' where install_status = 'registered' and enabled = true;
update public.plugin_components set install_status = 'installed' where install_status = 'registered' and enabled = false;
update public.plugin_components set install_status = 'testing' where install_status = 'smoke_tested';

alter table public.plugin_components drop constraint if exists plugin_components_install_status_check;
alter table public.plugin_components add constraint plugin_components_install_status_check
  check (install_status in (
    'discovered','reviewing','quarantined','testing','installed','enabled','disabled',
    'failed','update_available'
  ));

-- Real, recorded security review outcome — distinct from install_status itself, so "did
-- this component pass its security review" is never inferred from how far the pipeline
-- got. 'pending' until application code has actually run the checks described in
-- docs/software-factory/PLUGIN_MANIFEST.md's permission vocabulary.
alter table public.plugin_components add column if not exists security_review_status text
  not null default 'pending' check (security_review_status in ('pending','passed','failed'));
alter table public.plugin_components add column if not exists security_review_notes text;
alter table public.plugin_components add column if not exists license_review_status text
  not null default 'pending' check (license_review_status in ('pending','passed','failed'));

create table if not exists public.plugin_component_versions (
  id uuid primary key default gen_random_uuid(),
  plugin_component_id uuid not null references public.plugin_components(id) on delete cascade,
  -- Snapshot of the version-identifying fields as they stood at recorded_at, before the
  -- change named by recorded_reason was applied.
  pinned_commit_sha text,
  definition_path text,
  definition_hash text,
  installed_version text,
  install_status text,
  recorded_reason text not null check (recorded_reason in ('initial_install','update','rollback')),
  recorded_by_profile_id uuid references public.profiles(id),
  recorded_at timestamptz not null default now()
);

create index if not exists plugin_component_versions_component_idx
  on public.plugin_component_versions (plugin_component_id, recorded_at desc);

alter table public.plugin_component_versions enable row level security;

drop policy if exists "plugin_component_versions_founder_only" on public.plugin_component_versions;
create policy "plugin_component_versions_founder_only" on public.plugin_component_versions for all using (
  public.is_founder_or_admin()
) with check (
  public.is_founder_or_admin()
);

-- Backfill: every pre-existing plugin_components row predates plugin_component_versions
-- and would otherwise start life with zero history, which is exactly the "provenance
-- destroyed" failure mode this table exists to prevent. One 'initial_install' snapshot per
-- existing row, sourced from its current (now-migrated) real values — not synthetic.
insert into public.plugin_component_versions
  (plugin_component_id, pinned_commit_sha, definition_path, definition_hash, installed_version, install_status, recorded_reason)
select pc.id, ps.pinned_commit_sha, pc.definition_path, pc.definition_hash, pc.installed_version, pc.install_status, 'initial_install'
from public.plugin_components pc
join public.plugin_sources ps on ps.id = pc.source_id;

commit;
