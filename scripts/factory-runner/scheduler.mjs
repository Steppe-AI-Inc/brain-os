// Software Factory Phase 2 — capability-based scheduler / parallel DAG execution.
//
// Brain OS's Factory Director remains the sole orchestration authority (per the founder's
// own correction to the master plan) - this module is the Director's own dispatch
// mechanism, not a competing orchestrator. It reads real public.tasks/agent_runs state,
// computes which tasks are actually ready to run (every `depends_on` task already done),
// dispatches by matching each task's `required_capabilities` against the real
// `agents.capabilities` column (never by display name), respects a configurable
// concurrency cap, and refreshes `agent_runs.last_heartbeat_at` for every still-alive
// dispatched run on each poll cycle - the concrete mechanism behind
// agent_runs_with_live_status deriving STALE instead of RUNNING forever once a worker
// genuinely dies (a run whose heartbeat this function stops refreshing ages into STALE on
// its own, with zero extra code - the same "never a stored/fakeable flag" design as the
// view itself).
//
// Manually-invoked poll (matches poll-and-dispatch.mjs's own convention) - not a
// continuously-running daemon. Real always-on scheduling is separate infrastructure work.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as provider from './provider.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';
const DEFAULT_MAX_CONCURRENT = 4;

function sqlEscape(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function runSql(sql) {
  const file = join(tmpdir(), `scheduler-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
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

// ============================================================================
// Pure logic - no DB, no network. Unit-testable in isolation
// (scheduler.regression.test.mjs).
// ============================================================================

/**
 * A task is ready when every id in its depends_on array refers to a task whose status is
 * 'done' (archived tasks never satisfy a dependency - an archived task is not "complete
 * work", it's removed work). A task with an empty/null depends_on is always ready. A task
 * depending on a FAILED ('rejected') task is never ready - it stays blocked forever
 * (surfaced to the founder via founder_notifications, not silently retried), matching the
 * plan's explicit retry policy: "security failure -> block release", generalized here to
 * "a rejected dependency blocks its dependents outright".
 * @param {{id:string, depends_on:string[]}} task
 * @param {Map<string,string>} taskStatusById - id -> real current status of every task in the same Work Order
 */
export function isTaskReady(task, taskStatusById) {
  const deps = task.depends_on ?? [];
  if (deps.length === 0) return true;
  return deps.every((depId) => taskStatusById.get(depId) === 'done');
}

/**
 * @param {{id:string, depends_on:string[]}} task
 * @param {Map<string,string>} taskStatusById
 */
export function isTaskPermanentlyBlocked(task, taskStatusById) {
  const deps = task.depends_on ?? [];
  return deps.some((depId) => taskStatusById.get(depId) === 'rejected');
}

/**
 * Real capability-based routing: score = size of the intersection between the task's
 * required_capabilities and the candidate agent's capabilities. Zero-overlap candidates
 * are excluded entirely (never dispatch to an agent with none of the needed
 * capabilities merely because it's idle) - a task with empty required_capabilities
 * matches every active agent equally (score 0, tie-broken by least-loaded below), the
 * concrete mechanism behind "a doc typo only needs Implementation Engineer" without
 * hardcoding that agent's name anywhere in this file.
 * @param {string[]} requiredCapabilities
 * @param {Array<{id:string, capabilities:string[], activeRunCount:number}>} candidateAgents
 * @returns {{id:string, capabilities:string[], activeRunCount:number}|null}
 */
export function selectAgentForTask(requiredCapabilities, candidateAgents) {
  const required = requiredCapabilities ?? [];
  const scored = candidateAgents
    .map((agent) => {
      const overlap = required.filter((c) => (agent.capabilities ?? []).includes(c)).length;
      return { agent, overlap };
    })
    .filter(({ overlap }) => required.length === 0 || overlap > 0);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.overlap - a.overlap || a.agent.activeRunCount - b.agent.activeRunCount);
  return scored[0].agent;
}

/**
 * Given every task in a Work Order (queued candidates AND already-terminal ones, so
 * dependency status can actually be resolved - a real bug this signature fixes: a
 * dependency that already reached 'done' must still be visible to isTaskReady, even
 * though it's no longer itself a dispatch candidate) and how many dispatch slots remain
 * (concurrency cap minus currently-running count), returns the tasks to dispatch THIS
 * cycle: every ready, not-yet-dispatched task, independent tasks included together (no
 * artificial serialization when there's no real dependency edge), capped at the slot
 * count - earliest-created tasks first when more are ready than there is room for.
 * @param {Array<{id:string, status:string, depends_on:string[], created_at:string}>} allTasks - every task in the Work Order, any status
 * @param {number} availableSlots
 */
export function selectTasksToDispatch(allTasks, availableSlots) {
  if (availableSlots <= 0) return [];
  const statusById = new Map(allTasks.map((t) => [t.id, t.status]));
  const ready = allTasks
    .filter((t) => t.status === 'queued')
    .filter((t) => isTaskReady(t, statusById))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return ready.slice(0, availableSlots);
}

// ============================================================================
// Live orchestration - drives the pure functions above against real DB state.
// ============================================================================

export async function refreshHeartbeats() {
  const result = await runSql(`
select id, provider_run_id from public.agent_runs where status = 'in_progress'::work_status and provider_run_id is not null;
`);
  const runs = result.rows ?? [];
  const refreshed = [];
  const wentStale = [];
  for (const run of runs) {
    const live = await provider.getRunStatus(run.provider_run_id);
    if (live) {
      await runSql(`update public.agent_runs set last_heartbeat_at = now() where id = ${sqlEscape(run.id)}::uuid;`);
      refreshed.push(run.id);
    } else {
      // Session no longer known to `claude agents` at all - do NOT refresh the
      // heartbeat. agent_runs_with_live_status will correctly age this into STALE on
      // its own once 10 minutes pass with no refresh - never forced to STALE/FAILED
      // here directly, since a session can legitimately be mid-restart.
      wentStale.push(run.id);
    }
  }
  return { refreshed, wentStale };
}

export async function dispatchReadyTasks(workOrderId, maxConcurrent = DEFAULT_MAX_CONCURRENT) {
  // Fetches EVERY task in the Work Order, terminal or not - selectTasksToDispatch needs
  // a complete depends_on status map (a dependency that already reached 'done' must
  // still resolve correctly), not just the still-open candidates. See scheduler.mjs's
  // own header comment on selectTasksToDispatch for the real bug this fixed live.
  const tasksResult = await runSql(`
select id, title, status, depends_on, required_capabilities, company_id, created_at
from public.tasks where canonical_work_order_id = ${sqlEscape(workOrderId)}::uuid;
`);
  const tasks = tasksResult.rows ?? [];

  const runningResult = await runSql(`
select count(*) as n from public.agent_runs where status = 'in_progress'::work_status;
`);
  const currentlyRunning = Number(runningResult.rows?.[0]?.n ?? 0);
  const availableSlots = Math.max(0, maxConcurrent - currentlyRunning);

  const toDispatch = selectTasksToDispatch(tasks, availableSlots);
  if (toDispatch.length === 0) return { dispatched: [], reason: availableSlots === 0 ? 'concurrency_cap_reached' : 'no_ready_tasks' };

  const agentsResult = await runSql(`
select a.id, a.name, a.capabilities,
  (select count(*) from public.agent_runs ar where ar.agent_id = a.id and ar.status = 'in_progress'::work_status) as active_run_count
from public.agents a
where a.active = true and a.has_production_authority = true and a.execution_provider is not null;
`);
  const candidateAgents = (agentsResult.rows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    capabilities: a.capabilities ?? [],
    activeRunCount: Number(a.active_run_count ?? 0),
  }));

  const results = [];
  for (const task of toDispatch) {
    const agent = selectAgentForTask(task.required_capabilities, candidateAgents);
    if (!agent) {
      results.push({ taskId: task.id, dispatched: false, reason: 'no_matching_capability_agent' });
      continue;
    }
    const { providerRunId, attachedSkills } = await provider.startRunByAgentId(
      agent.id,
      `Real Software Factory task "${task.title}" (id ${task.id}), dispatched by the capability-based scheduler under Work Order ${workOrderId}. You were selected because your registered capabilities matched this task's required_capabilities (${JSON.stringify(task.required_capabilities)}). Do the real work this task describes; do not fabricate progress.`
    );
    await runSql(`
insert into public.agent_runs (agent_id, task_id, canonical_work_order_id, company_id, agent_definition_path, execution_provider, provider_run_id, status, started_at, last_heartbeat_at, attached_skills)
select ${sqlEscape(agent.id)}::uuid, ${sqlEscape(task.id)}::uuid, ${sqlEscape(workOrderId)}::uuid, ${sqlEscape(task.company_id)}::uuid, a.definition_path, 'claude_code_background', ${sqlEscape(providerRunId)}, 'in_progress'::work_status, now(), now(), ${sqlEscape(JSON.stringify(attachedSkills ?? []))}::jsonb
from public.agents a where a.id = ${sqlEscape(agent.id)}::uuid;
update public.tasks set status = 'in_progress'::work_status, owner_type='agent', owner_agent_id = ${sqlEscape(agent.id)}::uuid, updated_at = now() where id = ${sqlEscape(task.id)}::uuid;
`);
    // Loop-local slot accounting so a burst of ready tasks in one cycle still respects
    // the cap even though currentlyRunning was only read once at the top.
    candidateAgents.find((a) => a.id === agent.id).activeRunCount += 1;
    results.push({ taskId: task.id, taskTitle: task.title, dispatched: true, agentId: agent.id, agentName: agent.name, providerRunId });
  }
  return { dispatched: results, availableSlotsThisCycle: availableSlots };
}

async function main() {
  const [workOrderId, maxConcurrentArg] = process.argv.slice(2);
  if (!workOrderId) {
    console.error('Usage: node scheduler.mjs <workOrderId> [maxConcurrent]');
    process.exit(1);
  }
  const heartbeats = await refreshHeartbeats();
  console.log(`Heartbeats refreshed: ${heartbeats.refreshed.length}, went stale (no live session found): ${heartbeats.wentStale.length}`);
  const dispatch = await dispatchReadyTasks(workOrderId, maxConcurrentArg ? Number(maxConcurrentArg) : undefined);
  console.log(JSON.stringify({ heartbeats, dispatch }, null, 2));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main().catch((e) => {
    console.error('SCHEDULER FAILED:', e);
    process.exit(1);
  });
}
