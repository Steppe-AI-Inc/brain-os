// Phase 8 — Brain Chat -> Factory Director. Real, minimal dispatch loop: finds real
// public.canonical_work_orders rows with status='queued' and no existing agent_runs yet,
// dispatches EACH to the sole top-level orchestrator (brain-os-factory-director) via the
// Phase 6 registry-driven mechanism (startRunByAgentId - a canonical Agent ID only, the
// registry itself resolves the real definition/hash/execution_provider), and persists a
// real agent_runs row + updates the Work Order's status. One orchestrator only, per the
// master plan's own rule - this never dispatches any other agent directly; the Factory
// Director is responsible for its own further decomposition/dispatch.
//
// This is a manually-invoked poll (run once, dispatches whatever is currently queued),
// not a continuously-running daemon - matching the honest architectural note already in
// provider.mjs's header ("invoked by whatever polls factory_work_orders once that table
// exists"). A real always-on scheduled invocation (cron/systemd timer/etc.) is future
// infrastructure work, not built here - see docs/software-factory/PHASE_8_FINDINGS.md.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as provider from './provider.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';

// Real, registered Factory Director agent id (Phase 6 sync, verified live).
const FACTORY_DIRECTOR_AGENT_ID = '33123660-2f38-4290-8de7-35b8f696247a';

async function runSql(sql) {
  const file = join(tmpdir(), `poll-dispatch-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
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

async function findQueuedWorkOrders() {
  const sql = `
select wo.id, wo.title, wo.objective, wo.work_type, wo.company_id, wo.acceptance_criteria
from public.canonical_work_orders wo
where wo.status = 'queued'
  and not exists (select 1 from public.agent_runs ar where ar.canonical_work_order_id = wo.id);
`;
  const result = await runSql(sql);
  return result.rows ?? [];
}

async function main() {
  const queued = await findQueuedWorkOrders();
  console.log(`Found ${queued.length} real queued Work Order(s) with no existing dispatch.`);
  const results = [];
  for (const wo of queued) {
    const task = `You are the sole top-level Software Factory orchestrator, dispatched by Brain OS's own execution Runner for a real, founder-originated canonical Work Order (not a manual test). Real Work Order id: ${wo.id}. Title: "${wo.title}". Objective: ${wo.objective ?? '(none stated)'}. Work type: ${wo.work_type}. Acceptance criteria: ${JSON.stringify(wo.acceptance_criteria ?? [])}.

Per your own agent definition: read the master plan, decompose this Work Order into real Tasks under public.tasks (canonical_work_order_id = ${wo.id}), assign each to the appropriate specialist agent, and dispatch them as genuinely separate claude --agent ... --bg background processes - never in-app subagents. Do not fabricate progress. If this Work Order is too vague to decompose safely, say so explicitly and stop rather than guessing scope.`;

    const { providerRunId } = await provider.startRunByAgentId(FACTORY_DIRECTOR_AGENT_ID, task);
    console.log(`Dispatched Work Order ${wo.id} -> Factory Director, provider_run_id ${providerRunId}`);

    await runSql(`
insert into public.agent_runs (agent_id, canonical_work_order_id, company_id, agent_definition_path, execution_provider, provider_run_id, status, started_at)
values ('${FACTORY_DIRECTOR_AGENT_ID}'::uuid, '${wo.id}'::uuid, ${wo.company_id ? `'${wo.company_id}'::uuid` : 'null'}, '.claude/agents/brain-os-factory-director.md', 'claude_code_background', '${providerRunId}', 'in_progress'::work_status, now());
update public.canonical_work_orders set status = 'in_progress'::work_status, updated_at = now() where id = '${wo.id}'::uuid;
`);
    results.push({ workOrderId: wo.id, providerRunId });
  }
  console.log(JSON.stringify({ dispatched: results }, null, 2));
}

main().catch((e) => {
  console.error('POLL-AND-DISPATCH FAILED:', e);
  process.exit(1);
});
