// complete_work_order() (supabase/migrations/202608300002_complete_work_order.sql) now exists as the Work-Order-level completion counterpart to complete_agent_run(), and is now live in production.
// Phase 8 — the ONE command brain-os-factory-director needs to decompose a Work Order
// into real Tasks and dispatch real specialist agents. Deliberately narrow: wraps
// create_factory_task (RPC, company-consistency enforced server-side) and
// startRunByAgentId (registry-driven dispatch, provider.mjs) so the Director never needs
// to write raw SQL itself - the exact class of risk that caused this session's own
// security incident (docs/software-factory/PHASE_8_SECURITY_INCIDENT.md).
//
// Usage: node dispatch-task.mjs <workOrderId> <agentName> "<taskTitle>" "<taskPrompt>"
//
// Uses --linked alone for its one real DB call (create_factory_task via RPC, not raw
// SQL) - never --project-ref combined with --linked, per the binding rule this incident
// established.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as provider from './provider.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';

async function runSql(sql) {
  const file = join(tmpdir(), `dispatch-task-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    // --linked ALONE - never combined with --project-ref (see
    // docs/software-factory/PHASE_8_SECURITY_INCIDENT.md for why).
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

function sqlEscape(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function resolveAgentIdByName(name) {
  const result = await runSql(`select id from public.agents where name = ${sqlEscape(name)};`);
  const id = result.rows?.[0]?.id;
  if (!id) throw new Error(`dispatch-task: no registered agent named "${name}"`);
  return id;
}

async function createTask(workOrderId, title) {
  const result = await runSql(`select public.create_factory_task(${sqlEscape(workOrderId)}::uuid, ${sqlEscape(title)}) as id;`);
  const id = result.rows?.[0]?.id;
  if (!id) throw new Error(`dispatch-task: create_factory_task did not return an id (workOrderId=${workOrderId})`);
  return id;
}

async function main() {
  const [workOrderId, agentName, taskTitle, taskPrompt] = process.argv.slice(2);
  if (!workOrderId || !agentName || !taskTitle || !taskPrompt) {
    console.error('Usage: node dispatch-task.mjs <workOrderId> <agentName> "<taskTitle>" "<taskPrompt>"');
    process.exit(1);
  }

  console.log(`Creating real task "${taskTitle}" under Work Order ${workOrderId}...`);
  const taskId = await createTask(workOrderId, taskTitle);
  console.log(`Real task id: ${taskId}`);

  console.log(`Resolving agent "${agentName}" from the registry...`);
  const agentId = await resolveAgentIdByName(agentName);
  console.log(`Registry agent id: ${agentId}`);

  console.log(`Dispatching (registry-driven, no name/path passed to the underlying claude CLI directly)...`);
  const { providerRunId, attachedSkills } = await provider.startRunByAgentId(agentId, taskPrompt);
  console.log(`Real provider_run_id: ${providerRunId}`);
  if (attachedSkills?.length) {
    console.log(`Attached skills injected into this run: ${attachedSkills.map((s) => s.skill).join(', ')}`);
  }

  await runSql(`
insert into public.agent_runs (agent_id, task_id, canonical_work_order_id, agent_definition_path, execution_provider, provider_run_id, status, started_at, last_heartbeat_at, attached_skills)
select a.id, ${sqlEscape(taskId)}::uuid, ${sqlEscape(workOrderId)}::uuid, a.definition_path, 'claude_code_background', ${sqlEscape(providerRunId)}, 'in_progress'::work_status, now(), now(), ${sqlEscape(JSON.stringify(attachedSkills ?? []))}::jsonb
from public.agents a where a.id = ${sqlEscape(agentId)}::uuid;
`);

  console.log(JSON.stringify({ workOrderId, taskId, agentId, agentName, providerRunId, attachedSkills }, null, 2));
}

main().catch((e) => {
  console.error('DISPATCH-TASK FAILED:', e);
  process.exit(1);
});
