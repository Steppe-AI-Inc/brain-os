// Software Factory — plugin component lifecycle: register/enable/attach/detach/rollback.
//
// The concrete mechanism behind Phase 1's acceptance bar: attach skill X to Agent A ->
// launch Agent A -> execution environment contains skill X -> Agent Run records exact
// skill definition/hash used. Every mutating command here re-syncs
// agents.provenance.external_capabilities immediately (via sync-agents.mjs's
// syncAttachedCapabilities) so the effect is real and immediate, never a dashboard-only
// change that drifts from what dispatch-task.mjs actually reads.
//
// Usage:
//   node plugin-attach.mjs register <sourceId> <slug> <componentType> <definitionPath>
//   node plugin-attach.mjs enable <componentId>
//   node plugin-attach.mjs attach <agentId> <componentId>
//   node plugin-attach.mjs detach <agentId> <componentId>
//   node plugin-attach.mjs list-attached <agentId>

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
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

// Registers a component as 'discovered' -> 'smoke_tested' -> 'registered', computing a
// real definition_hash from the actual on-disk (or fetched) content — never a caller-
// supplied hash, matching the same anti-drift discipline as agents.definition_hash.
export async function registerComponent(sourceId, slug, componentType, definitionPath) {
  // Externally-adopted skills (e.g. obra/superpowers) live outside REPO_ROOT, in the
  // Claude Code plugin cache — an absolute definitionPath is stored and hashed as-is;
  // a relative one (a Brain-OS-authored .claude/skills/... file) resolves against
  // REPO_ROOT, matching sync-agents.mjs's own convention for agent definition files.
  const fullPath = isAbsolute(definitionPath) ? definitionPath : join(REPO_ROOT, definitionPath);
  const content = readFileSync(fullPath, 'utf8');
  const definitionHash = createHash('sha256').update(content, 'utf8').digest('hex');
  const result = await runSql(`
insert into public.plugin_components (source_id, slug, component_type, definition_path, definition_hash, install_status)
values (${sqlEscape(sourceId)}::uuid, ${sqlEscape(slug)}, ${sqlEscape(componentType)}, ${sqlEscape(definitionPath)}, ${sqlEscape(definitionHash)}, 'registered')
on conflict (source_id, slug) do update set
  component_type = excluded.component_type,
  definition_path = excluded.definition_path,
  definition_hash = excluded.definition_hash,
  install_status = 'registered',
  updated_at = now()
returning id, slug, definition_hash, install_status;
`);
  return result;
}

export async function enableComponent(componentId) {
  return runSql(`
update public.plugin_components set enabled = true, updated_at = now()
where id = ${sqlEscape(componentId)}::uuid
returning id, slug, enabled, install_status;
`);
}

export async function attachSkill(agentId, componentId) {
  const check = await runSql(`
select install_status, enabled from public.plugin_components where id = ${sqlEscape(componentId)}::uuid;
`);
  const row = check.rows?.[0];
  if (!row) throw new Error(`plugin-attach: no plugin_components row ${componentId}`);
  if (!row.enabled || !['registered', 'enabled'].includes(row.install_status)) {
    throw new Error(
      `plugin-attach: component ${componentId} is not attachable (install_status=${row.install_status}, enabled=${row.enabled}) - must be registered/enabled and enabled=true first`
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
  const [cmd, a, b, c, d] = process.argv.slice(2);
  if (cmd === 'register') {
    console.log(JSON.stringify(await registerComponent(a, b, c, d), null, 2));
  } else if (cmd === 'enable') {
    console.log(JSON.stringify(await enableComponent(a), null, 2));
  } else if (cmd === 'attach') {
    console.log(JSON.stringify(await attachSkill(a, b), null, 2));
  } else if (cmd === 'detach') {
    console.log(JSON.stringify(await detachSkill(a, b), null, 2));
  } else if (cmd === 'list-attached') {
    console.log(JSON.stringify(await listAttached(a), null, 2));
  } else {
    console.error(
      'Usage: node plugin-attach.mjs <register <sourceId> <slug> <type> <path> | enable <componentId> | attach <agentId> <componentId> | detach <agentId> <componentId> | list-attached <agentId>>'
    );
    process.exit(1);
  }
}

{
  main().catch((e) => {
    console.error('PLUGIN-ATTACH FAILED:', e);
    process.exit(1);
  });
}
