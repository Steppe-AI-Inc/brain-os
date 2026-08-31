// Software Factory Phase 6 — real executor for plugin_operation_requests (the queue
// behind the console's Sandbox Test / Review / Deploy Update / Rollback buttons).
//
// Matches poll-and-dispatch.mjs's own established convention: a hosted web request
// writes state, an always-on local Runner process is the only thing that actually
// touches the filesystem and executes plugin-attach.mjs's real functions - never a
// reimplementation, never a shortcut around ALLOWED_DEFINITION_ROOTS.
//
// Usage: node poll-plugin-operations.mjs [--once]   (default: loop forever, 15s interval)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { reviewComponent, sandboxTest, applyUpdate, rollbackComponent } from './plugin-attach.mjs';

const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';
const execFileAsync = promisify(execFile);

function sqlEscape(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function runSql(sql) {
  const file = join(tmpdir(), `poll-plugin-ops-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
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

async function fetchPending() {
  const result = await runSql(`
select id, plugin_component_id, agent_id, operation, params
from public.plugin_operation_requests
where status = 'pending'
order by requested_at asc
limit 5;
`);
  return result.rows ?? [];
}

async function markRunning(id) {
  await runSql(`update public.plugin_operation_requests set status = 'running', started_at = now() where id = ${sqlEscape(id)}::uuid;`);
}

async function markDone(id, result) {
  await runSql(`
update public.plugin_operation_requests set status = 'done', result = ${sqlEscape(JSON.stringify(result))}::jsonb, completed_at = now()
where id = ${sqlEscape(id)}::uuid;
`);
}

async function markFailed(id, error) {
  await runSql(`
update public.plugin_operation_requests set status = 'failed', error = ${sqlEscape(String(error?.message ?? error))}, completed_at = now()
where id = ${sqlEscape(id)}::uuid;
`);
}

// Real, automated sandbox-test check (no human notes possible from a queued web
// request) - content readable, hash matches what discover/apply-update already
// recorded. This is the same class of check performed manually for every component
// proven this session, codified so a UI-triggered request has a real, deterministic
// pass/fail rather than a rubber-stamp.
async function runAutomatedSandboxTest(componentId) {
  const row = await runSql(`select definition_path, definition_hash from public.plugin_components where id = ${sqlEscape(componentId)}::uuid;`);
  const { definition_path, definition_hash } = row.rows?.[0] ?? {};
  if (!definition_path) throw new Error(`no plugin_components row ${componentId}`);
  const { hashFile } = await import('./plugin-attach.mjs');
  const liveHash = hashFile(definition_path);
  const passed = liveHash === definition_hash;
  return sandboxTest(componentId, passed, passed
    ? `Automated console sandbox test: content readable, live hash matches recorded definition_hash (${liveHash.slice(0, 12)}...).`
    : `Automated console sandbox test FAILED: live hash ${liveHash} does not match recorded definition_hash ${definition_hash} - content drifted since discover/apply-update.`);
}

async function processOne(req) {
  await markRunning(req.id);
  try {
    let result;
    if (req.operation === 'sandbox_test') {
      result = await runAutomatedSandboxTest(req.plugin_component_id);
    } else if (req.operation === 'review') {
      const p = req.params ?? {};
      result = await reviewComponent(req.plugin_component_id, !!p.licensePassed, p.licenseNotes ?? null, !!p.securityPassed, p.securityNotes ?? null);
    } else if (req.operation === 'apply_update') {
      const p = req.params ?? {};
      result = await applyUpdate(req.plugin_component_id, p.newDefinitionPath, p.newPinnedCommitSha, p.newInstalledVersion ?? null);
    } else if (req.operation === 'rollback') {
      const p = req.params ?? {};
      result = await rollbackComponent(req.plugin_component_id, p.targetVersionId);
    } else {
      throw new Error(`unknown operation "${req.operation}"`);
    }
    await markDone(req.id, result);
    console.log(`[poll-plugin-operations] ${req.id} (${req.operation}) DONE`);
  } catch (e) {
    await markFailed(req.id, e);
    console.error(`[poll-plugin-operations] ${req.id} (${req.operation}) FAILED:`, e.message ?? e);
  }
}

async function pollOnce() {
  const pending = await fetchPending();
  for (const req of pending) {
    await processOne(req);
  }
  return pending.length;
}

async function main() {
  const once = process.argv.includes('--once');
  if (once) {
    const n = await pollOnce();
    console.log(`[poll-plugin-operations] processed ${n} request(s), exiting (--once).`);
    return;
  }
  console.log('[poll-plugin-operations] polling every 15s. Ctrl+C to stop.');
  for (;;) {
    await pollOnce();
    await new Promise((r) => setTimeout(r, 15000));
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main().catch((e) => {
    console.error('POLL-PLUGIN-OPERATIONS FAILED:', e);
    process.exit(1);
  });
}
