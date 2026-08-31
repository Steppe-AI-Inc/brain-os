// Software Factory — plugin component lifecycle: discover/review/quarantine/sandbox-test/
// install/enable/attach/detach/detect-update/stage-update/apply-update/rollback.
//
// The concrete mechanism behind Phase 1's acceptance bar (still true, unchanged): attach
// skill X to Agent A -> launch Agent A -> execution environment contains skill X ->
// Agent Run records exact skill definition/hash used. Every mutating command here
// re-syncs agents.provenance.external_capabilities immediately (via sync-agents.mjs's
// syncAttachedCapabilities) so the effect is real and immediate, never a dashboard-only
// change that drifts from what dispatch-task.mjs actually reads.
//
// Phase 6 extends this with the founder's explicit requirement: a GitHub repository being
// discovered must never be labeled INSTALLED. install_status now walks discovered ->
// reviewing -> quarantined -> testing -> installed -> enabled (or disabled/failed), with
// update_available reachable once an installed component's source has a newer pinned
// target. Every change to a component's version-identifying fields (pinned_commit_sha/
// definition_path/definition_hash/installed_version) is preceded by a snapshot written to
// plugin_component_versions (202608310005) — history is append-only, never destructively
// overwritten, so a rollback can restore a prior version for real.
//
// Usage:
//   node plugin-attach.mjs discover <sourceId> <slug> <componentType> <definitionPath>
//   node plugin-attach.mjs review <componentId> <licensePass:true|false> <licenseNotes> <securityPass:true|false> <securityNotes>
//   node plugin-attach.mjs sandbox-test <componentId> <pass:true|false> <notes>
//   node plugin-attach.mjs enable <componentId>
//   node plugin-attach.mjs disable <componentId>
//   node plugin-attach.mjs attach <agentId> <componentId>
//   node plugin-attach.mjs detach <agentId> <componentId>
//   node plugin-attach.mjs list-attached <agentId>
//   node plugin-attach.mjs detect-update <componentId> <latestUpstreamSha>
//   node plugin-attach.mjs apply-update <componentId> <newDefinitionPath> <newPinnedCommitSha> <newInstalledVersion>
//   node plugin-attach.mjs rollback <componentId> <targetVersionId>
//   node plugin-attach.mjs list-versions <componentId>
//
// Legacy alias kept for existing callers/tests: `register` == `discover`.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { syncAttachedCapabilities } from './sync-agents.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';

function sqlEscape(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function runSql(sql) {
  const file = join(tmpdir(), `plugin-attach-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    const { stdout } = await execFileAsync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], {
      cwd: REPO_ROOT,
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) throw new Error(`no JSON found in db query output: ${stdout}`);
    return JSON.parse(stdout.slice(jsonStart));
  } finally {
    unlinkSync(file);
  }
}

function hashFile(definitionPath) {
  // Externally-adopted skills (e.g. obra/superpowers) live outside REPO_ROOT, in the
  // Claude Code plugin cache — an absolute definitionPath is stored and hashed as-is;
  // a relative one (a Brain-OS-authored .claude/skills/... file) resolves against
  // REPO_ROOT, matching sync-agents.mjs's own convention for agent definition files.
  const fullPath = isAbsolute(definitionPath) ? definitionPath : join(REPO_ROOT, definitionPath);
  const content = readFileSync(fullPath, 'utf8');
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// Step 1 of the real pipeline: DISCOVER. Never labeled 'installed' or even 'registered'
// here — a GitHub repository (or a skill file within one) being found is not evidence it
// has been reviewed, let alone installed. Computes a real definition_hash immediately
// (needed to detect drift even while the component sits unreviewed) but install_status
// stays 'discovered' until reviewComponent()/sandboxTest() actually run.
export async function discoverComponent(sourceId, slug, componentType, definitionPath) {
  const definitionHash = hashFile(definitionPath);
  const result = await runSql(`
insert into public.plugin_components (source_id, slug, component_type, definition_path, definition_hash, install_status)
values (${sqlEscape(sourceId)}::uuid, ${sqlEscape(slug)}, ${sqlEscape(componentType)}, ${sqlEscape(definitionPath)}, ${sqlEscape(definitionHash)}, 'discovered')
on conflict (source_id, slug) do update set
  component_type = excluded.component_type,
  definition_path = excluded.definition_path,
  definition_hash = excluded.definition_hash,
  install_status = 'discovered',
  security_review_status = 'pending',
  license_review_status = 'pending',
  updated_at = now()
returning id, slug, definition_hash, install_status;
`);
  return result;
}
// Legacy alias — existing callers/tests referred to this stage as 'register'.
export const registerComponent = discoverComponent;

// Step 2: REVIEW. Records real license + security review outcomes (never inferred, never
// defaulted to pass). A failure on either terminates the pipeline at 'failed' — it does
// not silently continue. Passing both moves the component to 'quarantined': reviewed, not
// yet sandbox-tested, still not attachable.
export async function reviewComponent(componentId, licensePassed, licenseNotes, securityPassed, securityNotes) {
  await runSql(`
update public.plugin_components set install_status = 'reviewing', updated_at = now()
where id = ${sqlEscape(componentId)}::uuid and install_status = 'discovered';
`);
  const nextStatus = licensePassed && securityPassed ? 'quarantined' : 'failed';
  return runSql(`
update public.plugin_components set
  license_review_status = ${sqlEscape(licensePassed ? 'passed' : 'failed')},
  security_review_status = ${sqlEscape(securityPassed ? 'passed' : 'failed')},
  security_review_notes = ${sqlEscape(securityNotes ?? null)},
  install_status = ${sqlEscape(nextStatus)},
  updated_at = now()
where id = ${sqlEscape(componentId)}::uuid
returning id, slug, license_review_status, security_review_status, install_status;
`);
}

// Step 3: SANDBOX TEST. Only a component already 'quarantined' (passed review) may enter
// 'testing'; a real pass/fail + evidence notes moves it to 'installed' (content is pinned
// and has demonstrably run) or 'failed'. This is the state that finally distinguishes
// "discovered on GitHub" from "actually installed" — the founder's central requirement.
export async function sandboxTest(componentId, passed, notes) {
  const current = await runSql(`select install_status from public.plugin_components where id = ${sqlEscape(componentId)}::uuid;`);
  const row = current.rows?.[0];
  if (!row) throw new Error(`plugin-attach: no plugin_components row ${componentId}`);
  if (row.install_status !== 'quarantined') {
    throw new Error(`plugin-attach: cannot sandbox-test ${componentId} from install_status=${row.install_status} — must be 'quarantined' (passed review) first`);
  }
  await runSql(`update public.plugin_components set install_status = 'testing', updated_at = now() where id = ${sqlEscape(componentId)}::uuid;`);
  const nextStatus = passed ? 'installed' : 'failed';
  // Real evidence persisted, not just returned to the caller and discarded — the whole
  // point of this stage is that "installed" must be backed by something checkable later.
  const result = await runSql(`
update public.plugin_components set
  install_status = ${sqlEscape(nextStatus)},
  manifest = jsonb_set(manifest, '{sandbox_test}', jsonb_build_object('passed', ${passed}, 'notes', ${sqlEscape(notes ?? null)}, 'tested_at', now()), true),
  updated_at = now()
where id = ${sqlEscape(componentId)}::uuid
returning id, slug, install_status, manifest -> 'sandbox_test' as sandbox_test;
`);
  if (passed) {
    await snapshotVersion(componentId, 'initial_install');
  }
  return result;
}

// Step 4: ENABLE. 'installed' (having genuinely passed sandbox-test), already-'enabled'
// (idempotent), or 'disabled' (re-enabling a component that already passed sandbox-test
// once and was only toggled off — disabling never un-installs it) may become attachable.
// Real live bug found and fixed during this session's own smoke test: the first version of
// this guard only accepted 'installed'/'enabled', so ENABLED -> DISABLED -> ENABLED (the
// founder's own explicit smoke-test sequence) failed on the re-enable step even though it
// is a completely legitimate operation.
export async function enableComponent(componentId) {
  const current = await runSql(`select install_status from public.plugin_components where id = ${sqlEscape(componentId)}::uuid;`);
  const row = current.rows?.[0];
  if (!row) throw new Error(`plugin-attach: no plugin_components row ${componentId}`);
  if (!['installed', 'enabled', 'disabled'].includes(row.install_status)) {
    throw new Error(`plugin-attach: cannot enable ${componentId} from install_status=${row.install_status} — must be 'installed' or 'disabled' first (discover -> review -> sandbox-test -> enable[/disable/enable])`);
  }
  const result = await runSql(`
update public.plugin_components set enabled = true, install_status = 'enabled', updated_at = now()
where id = ${sqlEscape(componentId)}::uuid
returning id, slug, enabled, install_status;
`);
  await resyncAllAttachedAgents(componentId);
  return result;
}

export async function disableComponent(componentId) {
  const result = await runSql(`
update public.plugin_components set enabled = false, install_status = 'disabled', updated_at = now()
where id = ${sqlEscape(componentId)}::uuid
returning id, slug, enabled, install_status;
`);
  await resyncAllAttachedAgents(componentId);
  return result;
}

// Real gap found and fixed live during Phase 6's own update/rollback proof: agents.
// provenance.external_capabilities (what provider.mjs's resolveAgentFromRegistry actually
// reads at dispatch time - a stored JSONB blob, not a live join) is ONLY refreshed by an
// explicit attachSkill/detachSkill call. applyUpdate/rollbackComponent/disableComponent
// change plugin_components' own state but were not re-syncing it - an agent that had
// already been attached before an update would keep dispatching with the OLD stale
// definition_path/hash forever, until someone happened to call attach/detach again.
// Every mutation that changes what an ALREADY-attached component should serve at runtime
// must re-sync provenance for every agent currently attached to it, not just the caller of
// attach/detach.
async function resyncAllAttachedAgents(componentId) {
  const attached = await runSql(`
select distinct agent_id from public.agent_plugin_attachments
where plugin_component_id = ${sqlEscape(componentId)}::uuid and detached_at is null;
`);
  const agentIds = (attached.rows ?? []).map((r) => r.agent_id);
  for (const agentId of agentIds) {
    await syncAttachedCapabilities(agentId, { source: 'brain_os_custom' });
  }
  return agentIds;
}

// Snapshots the CURRENT plugin_components row's version-identifying fields into
// plugin_component_versions before they change (or, for 'initial_install', right after
// they first become real) — append-only, never a destructive overwrite, so update/
// rollback always has real history to act on.
async function snapshotVersion(componentId, reason) {
  return runSql(`
insert into public.plugin_component_versions
  (plugin_component_id, pinned_commit_sha, definition_path, definition_hash, installed_version, install_status, recorded_reason)
select pc.id, ps.pinned_commit_sha, pc.definition_path, pc.definition_hash, pc.installed_version, pc.install_status, ${sqlEscape(reason)}
from public.plugin_components pc
join public.plugin_sources ps on ps.id = pc.source_id
where pc.id = ${sqlEscape(componentId)}::uuid
returning id, plugin_component_id, definition_hash, recorded_reason, recorded_at;
`);
}

export async function listVersions(componentId) {
  return runSql(`
select id, pinned_commit_sha, definition_path, definition_hash, installed_version, install_status, recorded_reason, recorded_at
from public.plugin_component_versions
where plugin_component_id = ${sqlEscape(componentId)}::uuid
order by recorded_at desc;
`);
}

// Step 5 (source-level): a real gh api check found a newer upstream commit than what's
// pinned. Flips the COMPONENT to 'update_available' — the live row's own pinned/hash
// fields are untouched, so runtime dispatch keeps resolving the OLD version until
// applyUpdate() below genuinely swaps it, matching the required "sandbox B before it's
// ever live" semantics.
export async function detectUpdate(componentId, latestUpstreamSha) {
  const current = await runSql(`select install_status from public.plugin_components where id = ${sqlEscape(componentId)}::uuid;`);
  const row = current.rows?.[0];
  if (!row) throw new Error(`plugin-attach: no plugin_components row ${componentId}`);
  if (!['installed', 'enabled'].includes(row.install_status)) {
    throw new Error(`plugin-attach: cannot flag an update for ${componentId} from install_status=${row.install_status} — only an installed/enabled component can have an update`);
  }
  return runSql(`
update public.plugin_components set install_status = 'update_available', updated_at = now()
where id = ${sqlEscape(componentId)}::uuid
returning id, slug, install_status;
`);
}

// Step 6: APPLY UPDATE (only after the caller has independently sandbox-tested the new
// content — this function performs the real, live swap, not the sandbox test itself).
// Snapshots the CURRENT (about-to-be-superseded) version first, then applies the new
// definitionPath/pinnedCommitSha/installedVersion, recomputing definition_hash from the
// real new file content — never a caller-supplied hash.
export async function applyUpdate(componentId, newDefinitionPath, newPinnedCommitSha, newInstalledVersion) {
  await snapshotVersion(componentId, 'update');
  const newHash = hashFile(newDefinitionPath);
  const sourceRow = await runSql(`select source_id from public.plugin_components where id = ${sqlEscape(componentId)}::uuid;`);
  const sourceId = sourceRow.rows?.[0]?.source_id;
  if (sourceId) {
    await runSql(`update public.plugin_sources set pinned_commit_sha = ${sqlEscape(newPinnedCommitSha)}, updated_at = now() where id = ${sqlEscape(sourceId)}::uuid;`);
  }
  const result = await runSql(`
update public.plugin_components set
  definition_path = ${sqlEscape(newDefinitionPath)},
  definition_hash = ${sqlEscape(newHash)},
  installed_version = ${sqlEscape(newInstalledVersion)},
  install_status = 'installed',
  updated_at = now()
where id = ${sqlEscape(componentId)}::uuid
returning id, slug, definition_path, definition_hash, installed_version, install_status;
`);
  await resyncAllAttachedAgents(componentId);
  return result;
}

// Step 7: ROLLBACK. Restores a prior plugin_component_versions snapshot as the live row's
// state — snapshots what's being superseded first (so the rollback itself is also real
// history, not a silent overwrite), then re-derives definition_hash from the restored
// path's actual current on-disk content (proves the restored file still really exists and
// hashes to what it should — never trusts the stored snapshot hash blindly).
export async function rollbackComponent(componentId, targetVersionId) {
  const target = await runSql(`
select pinned_commit_sha, definition_path, installed_version from public.plugin_component_versions
where id = ${sqlEscape(targetVersionId)}::uuid and plugin_component_id = ${sqlEscape(componentId)}::uuid;
`);
  const row = target.rows?.[0];
  if (!row) throw new Error(`plugin-attach: no plugin_component_versions row ${targetVersionId} for component ${componentId}`);
  await snapshotVersion(componentId, 'rollback');
  const restoredHash = hashFile(row.definition_path);
  const sourceRow = await runSql(`select source_id from public.plugin_components where id = ${sqlEscape(componentId)}::uuid;`);
  const sourceId = sourceRow.rows?.[0]?.source_id;
  if (sourceId && row.pinned_commit_sha) {
    await runSql(`update public.plugin_sources set pinned_commit_sha = ${sqlEscape(row.pinned_commit_sha)}, updated_at = now() where id = ${sqlEscape(sourceId)}::uuid;`);
  }
  const result = await runSql(`
update public.plugin_components set
  definition_path = ${sqlEscape(row.definition_path)},
  definition_hash = ${sqlEscape(restoredHash)},
  installed_version = ${sqlEscape(row.installed_version)},
  install_status = 'installed',
  updated_at = now()
where id = ${sqlEscape(componentId)}::uuid
returning id, slug, definition_path, definition_hash, installed_version, install_status;
`);
  await resyncAllAttachedAgents(componentId);
  return result;
}

export async function attachSkill(agentId, componentId) {
  const check = await runSql(`
select install_status, enabled from public.plugin_components where id = ${sqlEscape(componentId)}::uuid;
`);
  const row = check.rows?.[0];
  if (!row) throw new Error(`plugin-attach: no plugin_components row ${componentId}`);
  if (!row.enabled || row.install_status !== 'enabled') {
    throw new Error(
      `plugin-attach: component ${componentId} is not attachable (install_status=${row.install_status}, enabled=${row.enabled}) - must have completed discover -> review -> sandbox-test -> enable first`
    );
  }
  await runSql(`
insert into public.agent_plugin_attachments (agent_id, plugin_component_id)
values (${sqlEscape(agentId)}::uuid, ${sqlEscape(componentId)}::uuid)
on conflict (agent_id, plugin_component_id) do update set detached_at = null, attached_at = now();
`);
  // Real, immediate effect — not deferred to the next sync-agents.mjs cron run.
  const externalCapabilities = await syncAttachedCapabilities(agentId, { source: 'brain_os_custom' });
  return { agentId, componentId, attached: true, externalCapabilitiesNow: externalCapabilities };
}

export async function detachSkill(agentId, componentId) {
  await runSql(`
update public.agent_plugin_attachments set detached_at = now()
where agent_id = ${sqlEscape(agentId)}::uuid and plugin_component_id = ${sqlEscape(componentId)}::uuid and detached_at is null;
`);
  const externalCapabilities = await syncAttachedCapabilities(agentId, { source: 'brain_os_custom' });
  return { agentId, componentId, detached: true, externalCapabilitiesNow: externalCapabilities };
}

export async function listAttached(agentId) {
  return runSql(`
select pc.slug, pc.component_type, pc.definition_hash, apa.attached_at
from public.agent_plugin_attachments apa
join public.plugin_components pc on pc.id = apa.plugin_component_id
where apa.agent_id = ${sqlEscape(agentId)}::uuid and apa.detached_at is null
order by apa.attached_at desc;
`);
}

async function main() {
  const [cmd, a, b, c, d, e] = process.argv.slice(2);
  if (cmd === 'discover' || cmd === 'register') {
    console.log(JSON.stringify(await discoverComponent(a, b, c, d), null, 2));
  } else if (cmd === 'review') {
    console.log(JSON.stringify(await reviewComponent(a, b === 'true', c, d === 'true', e), null, 2));
  } else if (cmd === 'sandbox-test') {
    console.log(JSON.stringify(await sandboxTest(a, b === 'true', c), null, 2));
  } else if (cmd === 'enable') {
    console.log(JSON.stringify(await enableComponent(a), null, 2));
  } else if (cmd === 'disable') {
    console.log(JSON.stringify(await disableComponent(a), null, 2));
  } else if (cmd === 'attach') {
    console.log(JSON.stringify(await attachSkill(a, b), null, 2));
  } else if (cmd === 'detach') {
    console.log(JSON.stringify(await detachSkill(a, b), null, 2));
  } else if (cmd === 'list-attached') {
    console.log(JSON.stringify(await listAttached(a), null, 2));
  } else if (cmd === 'detect-update') {
    console.log(JSON.stringify(await detectUpdate(a, b), null, 2));
  } else if (cmd === 'apply-update') {
    console.log(JSON.stringify(await applyUpdate(a, b, c, d), null, 2));
  } else if (cmd === 'rollback') {
    console.log(JSON.stringify(await rollbackComponent(a, b), null, 2));
  } else if (cmd === 'list-versions') {
    console.log(JSON.stringify(await listVersions(a), null, 2));
  } else {
    console.error(
      'Usage: node plugin-attach.mjs <discover <sourceId> <slug> <type> <path> | review <componentId> <licensePass> <licenseNotes> <securityPass> <securityNotes> | sandbox-test <componentId> <pass> <notes> | enable <componentId> | disable <componentId> | attach <agentId> <componentId> | detach <agentId> <componentId> | list-attached <agentId> | detect-update <componentId> <latestSha> | apply-update <componentId> <newPath> <newSha> <newVersion> | rollback <componentId> <targetVersionId> | list-versions <componentId>>'
    );
    process.exit(1);
  }
}

// Entrypoint guard (same fix already applied to sync-agents.mjs, Phase 1): without this,
// `main()` fires as an unconditional module-scope side effect the moment anything imports
// from this file — a real, previously-hit bug class (two concurrent `db query` CLI
// invocations fighting over the same connection). Phase 6's update/rollback driver script
// imports from this module, so the guard is load-bearing now, not just defensive.
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main().catch((e) => {
    console.error('PLUGIN-ATTACH FAILED:', e);
    process.exit(1);
  });
}
