// Software Factory Phase 6 — real worker self-registration + heartbeat.
//
// Run this ON the machine being registered (never remotely, never on another
// machine's behalf) so hostname/OS/versions are genuinely this machine's own. A worker
// row only exists here because this script actually ran against production - never a
// placeholder "Main PC"/"Work PC" row created in advance of the machine registering
// itself.
//
// Usage: node register-worker.mjs [workerRole] [maxConcurrency]
//   e.g.: node register-worker.mjs implementation_factory 5

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hostname, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';

function sqlEscape(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function runSql(sql) {
  const file = join(tmpdir(), `register-worker-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
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

async function getClaudeCodeVersion() {
  try {
    const { stdout } = await execFileAsync('claude', ['--version'], {});
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function registerWorker(workerRole, maxConcurrency) {
  const claudeVersion = await getClaudeCodeVersion();
  const result = await runSql(`
insert into public.workers (hostname, display_name, worker_role, os_platform, node_version, claude_code_version, max_concurrency, last_heartbeat_at)
values (${sqlEscape(hostname())}, ${sqlEscape(hostname())}, ${sqlEscape(workerRole ?? null)}, ${sqlEscape(`${platform()} ${release()}`)}, ${sqlEscape(process.version)}, ${sqlEscape(claudeVersion)}, ${maxConcurrency ? Number(maxConcurrency) : 'null'}, now())
on conflict (hostname) do update set
  worker_role = coalesce(excluded.worker_role, public.workers.worker_role),
  os_platform = excluded.os_platform,
  node_version = excluded.node_version,
  claude_code_version = excluded.claude_code_version,
  max_concurrency = coalesce(excluded.max_concurrency, public.workers.max_concurrency),
  last_heartbeat_at = now(),
  updated_at = now()
returning id, hostname, worker_role, last_heartbeat_at;
`);
  return result;
}

// Real, re-hashed comparison against the canonical plugin_components row - never
// inferred from install_status alone. Only records components this worker's own
// plugin-attach.mjs pipeline actually touched (attached at least once) - a worker
// doesn't "have" every component that merely exists in the registry.
export async function recordInstalledComponents(workerId) {
  const attached = await runSql(`
select distinct pc.id, pc.definition_hash, pc.installed_version
from public.agent_plugin_attachments apa
join public.plugin_components pc on pc.id = apa.plugin_component_id
where apa.detached_at is null;
`);
  for (const row of attached.rows ?? []) {
    await runSql(`
insert into public.worker_plugin_installs (worker_id, plugin_component_id, installed_version, installed_definition_hash, configuration_drift, last_checked_at)
values (${sqlEscape(workerId)}::uuid, ${sqlEscape(row.id)}::uuid, ${sqlEscape(row.installed_version)}, ${sqlEscape(row.definition_hash)}, false, now())
on conflict (worker_id, plugin_component_id) do update set
  installed_version = excluded.installed_version,
  configuration_drift = (public.worker_plugin_installs.installed_definition_hash is distinct from excluded.installed_definition_hash),
  last_checked_at = now();
`);
  }
  return attached.rows?.length ?? 0;
}

async function main() {
  const [workerRole, maxConcurrency] = process.argv.slice(2);
  const worker = await registerWorker(workerRole, maxConcurrency);
  const workerId = worker.rows?.[0]?.id;
  const installedCount = workerId ? await recordInstalledComponents(workerId) : 0;
  console.log(JSON.stringify({ worker: worker.rows?.[0], installedComponentsRecorded: installedCount }, null, 2));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main().catch((e) => {
    console.error('REGISTER-WORKER FAILED:', e);
    process.exit(1);
  });
}
