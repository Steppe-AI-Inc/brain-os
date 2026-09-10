// Parallel QA orchestration: one Director/Orchestrator, N isolated worker processes.
//
// The workers are INDEPENDENT TOP-LEVEL PROCESSES, not nested conversational subagents. That is
// a correctness requirement, not a style preference: a nested agent dies with its parent and
// shares its context, so a supervisor restart could not reconstruct it and a parent stall would
// silently stall every worker. Real PIDs are what make crash isolation and restart recovery
// provable rather than claimed.
//
// Worker output is EVIDENCE. Nothing here writes canonical QA state - see reconcile.mjs.
import { spawn } from 'node:child_process';
import { createWriteStream, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { P, REPO_ROOT, DIRECTOR_CWD } from './paths.mjs';
import { resolveClaudeBin, MODEL_ALIAS, killTree } from './director.mjs';
import {
  ensureRunDirs, workerDir, runsDir, isPidAlive,
  acquireLeaseSet, releaseAllFor, renewLeasesFor, reapDeadLeases, listLeases,
} from './worker-lease.mjs';
import { LANES } from './lanes.mjs';

export const WORKER_STATES = [
  'QUEUED', 'STARTING', 'RUNNING', 'CHECKPOINTING',
  'PASS', 'FAIL', 'FLAKY', 'BLOCKED', 'CRASHED', 'CAPACITY_BLOCKED', 'COMPLETE',
];

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const CAPACITY_RE = /(session limit|usage limit|rate.?limit|credit balance is too low|quota|overloaded_error|529)/i;
const AUTH_RE = /(invalid api key|authentication_error|please run \/login|oauth token (has )?expired|401 unauthorized)/i;

export function workerRegistryPath(campaignId) { return join(runsDir(campaignId), 'WORKERS.json'); }

export function readWorkerRegistry(campaignId) {
  const p = workerRegistryPath(campaignId);
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { campaign_id: campaignId, workers: {} }; }
}

export function writeWorkerRegistry(campaignId, reg) {
  mkdirSync(runsDir(campaignId), { recursive: true });
  writeFileSync(workerRegistryPath(campaignId), JSON.stringify(reg, null, 2) + '\n');
}

function updateWorker(campaignId, workerId, patch) {
  const reg = readWorkerRegistry(campaignId);
  reg.workers[workerId] = { ...(reg.workers[workerId] || {}), ...patch, updated_at: nowIso() };
  writeWorkerRegistry(campaignId, reg);
  return reg.workers[workerId];
}

/**
 * Launch one worker as a real OS process.
 *
 * Fixture leases are acquired BEFORE spawn. A worker that cannot get exclusive ownership of what
 * it would mutate is not started at all - starting it and hoping would be how two workers end up
 * editing one fixture and producing a fabricated defect.
 */
export function launchWorker({
  campaignId,
  workerId,
  lane,
  directive,
  assignedCapabilities = [],
  assignedScenarios = [],
  fixtureNamespace,
  authorizedFixtureIds = [],
  leaseKeys = [],
  browserContextId = null,
  maxBudgetUsd = 6,
  hangMs = 10 * 60_000,
  hardCapMs = 45 * 60_000,
  onStarted = () => {},
  onEvent = () => {},
}) {
  const wd = ensureRunDirs(campaignId, workerId);
  const sessionId = randomUUID();

  const keys = leaseKeys.length ? leaseKeys : authorizedFixtureIds.map((f) => 'fixture:' + f);
  if (browserContextId) keys.push('browser:' + browserContextId);

  const lease = keys.length
    ? acquireLeaseSet(campaignId, keys, { workerId, pid: process.pid, kind: 'worker-resource' })
    : { ok: true, keys: [] };

  if (!lease.ok) {
    const rec = updateWorker(campaignId, workerId, {
      worker_id: workerId, lane, status: 'BLOCKED',
      blocked_reason: 'FIXTURE_COLLISION: ' + lease.conflictKey + ' held by ' + (lease.heldBy && lease.heldBy.worker_id),
      pid: null, started_at: null,
    });
    return { launched: false, reason: 'FIXTURE_COLLISION', conflict: lease, worker: rec, promise: Promise.resolve(rec) };
  }

  const bin = resolveClaudeBin();
  const logPath = join(wd, 'worker.jsonl');
  const log = createWriteStream(logPath, { flags: 'a' });
  const started = Date.now();

  const prompt = buildWorkerPrompt({
    campaignId, workerId, lane, directive, assignedCapabilities, assignedScenarios,
    fixtureNamespace, authorizedFixtureIds, wd,
  });

  const args = [
    '-p', prompt,
    '--model', MODEL_ALIAS,
    '--output-format', 'stream-json',
    '--verbose',
    '--session-id', sessionId,
    '--permission-mode', 'bypassPermissions',
    '--settings', P.guardSettings,
    '--mcp-config', P.mcpConfig,
    '--add-dir', REPO_ROOT,
    '--max-budget-usd', String(maxBudgetUsd),
    '--name', 'work-pc-qa-' + workerId,
  ];

  // Same deterministic test seam the single-director launcher uses. Lets the concurrency
  // acceptance prove overlap, crash isolation and restart recovery without spending real runs.
  const fakeBin = process.env.WORKER_FAKE_BIN;
  const child = fakeBin
    ? spawn(process.execPath, [fakeBin, '--worker-id', workerId, '--campaign', campaignId, ...args], {
        cwd: DIRECTOR_CWD, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CLAUDE_CODE_WORK_PC_SUPERVISED: '1', QA_WORKER_ID: workerId, QA_CAMPAIGN_ID: campaignId, QA_WORKER_DIR: wd },
      })
    : spawn(bin, args, {
        cwd: DIRECTOR_CWD, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CLAUDE_CODE_WORK_PC_SUPERVISED: '1', QA_WORKER_ID: workerId, QA_CAMPAIGN_ID: campaignId, QA_WORKER_DIR: wd },
      });

  const outcome = {
    worker_id: workerId, lane, campaign_id: campaignId,
    pid: child.pid ?? null, session_id: sessionId, log_path: logPath,
    result_path: join(wd, 'RESULT.json'), checkpoint_path: join(wd, 'CHECKPOINT.json'),
    fixture_namespace: fixtureNamespace, authorized_fixture_ids: authorizedFixtureIds,
    browser_context_id: browserContextId, lease_keys: lease.keys || keys,
    started_at: new Date(started).toISOString(), heartbeat: nowIso(),
    status: 'STARTING', current_scenario: assignedScenarios[0] || null,
    exit_code: null, killed_reason: null, cost_usd: null,
    browser_available: null, capacity_blocked: false, auth_failure: false,
  };

  updateWorker(campaignId, workerId, outcome);
  try { onStarted({ ...outcome }); } catch {}

  let lastOutput = Date.now();
  let stderrTail = '';

  const promise = new Promise((resolve) => {
    const finish = (reason) => {
      if (outcome.killed_reason || outcome.exit_code !== null) return;
      outcome.killed_reason = reason;
      killTree(child.pid);
    };

    const watchdogMs = Math.max(200, Number(process.env.WORKER_WATCHDOG_MS) || 15_000);
    const watchdog = setInterval(() => {
      const idle = Date.now() - lastOutput;
      outcome.heartbeat = nowIso();
      renewLeasesFor(campaignId, workerId);
      updateWorker(campaignId, workerId, { heartbeat: outcome.heartbeat, idle_ms: idle, status: outcome.status });
      if (idle > hangMs) finish('HUNG_NO_OUTPUT_' + Math.round(idle / 1000) + 'S');
      else if (Date.now() - started > hardCapMs) finish('HARD_RUNTIME_CAP');
    }, watchdogMs);

    let buf = '';
    child.stdout.on('data', (chunk) => {
      lastOutput = Date.now();
      log.write(chunk);
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'system' && msg.subtype === 'init') {
          outcome.browser_available = (msg.tools || []).some((t) => String(t).startsWith('mcp__playwright__'));
          outcome.status = 'RUNNING';
          updateWorker(campaignId, workerId, { status: 'RUNNING', browser_available: outcome.browser_available });
        } else if (msg.type === 'result') {
          outcome.cost_usd = msg.total_cost_usd ?? null;
          outcome.result_subtype = msg.subtype || null;
          outcome.num_turns = msg.num_turns ?? null;
          if (msg.api_error_status === 401 || msg.api_error_status === 403) outcome.auth_failure = true;
          // Running out of the budget the orchestrator itself granted is a RESOURCE limit, not a
          // fault. The first real pilot (2026-09-10) classified three budget-capped workers as
          // CRASHED, which would have read as three runtime failures when all three had produced
          // their evidence and were cut off mid-write. Same family as a provider capacity block.
          if (msg.subtype === 'error_max_budget_usd') { outcome.capacity_blocked = true; outcome.capacity_reason = 'BUDGET_EXHAUSTED'; }
          else if (/rate.?limit|overloaded|usage limit|session limit/i.test(String(msg.result || ''))) { outcome.capacity_blocked = true; outcome.capacity_reason = 'PROVIDER_CAPACITY'; }
        }
        try { onEvent(msg, outcome); } catch {}
      }
    });

    child.stderr.on('data', (chunk) => {
      lastOutput = Date.now();
      const s = chunk.toString('utf8');
      stderrTail = (stderrTail + s).slice(-4000);
      log.write('#stderr ' + s);
      if (CAPACITY_RE.test(s)) outcome.capacity_blocked = true;
      if (AUTH_RE.test(s)) outcome.auth_failure = true;
    });

    child.on('error', (err) => {
      clearInterval(watchdog); log.end();
      outcome.exit_code = -1; outcome.status = 'CRASHED';
      outcome.error = 'spawn failed: ' + err.message;
      releaseAllFor(campaignId, workerId);
      updateWorker(campaignId, workerId, { status: 'CRASHED', exit_code: -1, error: outcome.error, pid: null });
      resolve(outcome);
    });

    child.on('close', (code) => {
      clearInterval(watchdog); log.end();
      outcome.exit_code = code;
      outcome.duration_ms = Date.now() - started;
      outcome.stderr_tail = stderrTail.slice(-1200) || null;
      if (CAPACITY_RE.test(stderrTail)) outcome.capacity_blocked = true;

      // Capacity exhaustion is NOT a crash and NOT a QA failure. Conflating them would let a
      // billing limit masquerade as a product defect, and would take down siblings that are fine.
      if (outcome.capacity_blocked) outcome.status = 'CAPACITY_BLOCKED';
      else if (outcome.killed_reason) outcome.status = 'CRASHED';
      else if (code === 0) outcome.status = 'COMPLETE';
      else outcome.status = 'CRASHED';

      releaseAllFor(campaignId, workerId);
      updateWorker(campaignId, workerId, {
        status: outcome.status, exit_code: code, killed_reason: outcome.killed_reason,
        cost_usd: outcome.cost_usd, duration_ms: outcome.duration_ms, pid: null,
        capacity_blocked: outcome.capacity_blocked, capacity_reason: outcome.capacity_reason || null,
        result_subtype: outcome.result_subtype || null, num_turns: outcome.num_turns ?? null,
        auth_failure: outcome.auth_failure,
      });
      resolve(outcome);
    });
  });

  return { launched: true, worker: outcome, promise, pid: child.pid ?? null };
}

/**
 * Run one batch concurrently. A single worker failing must never take the batch down, so every
 * worker promise is settled independently.
 */
export async function runBatch(campaignId, assignments, opts = {}) {
  const max = opts.maxWorkers || 3;
  const batch = assignments.slice(0, max);
  const handles = batch.map((a) => launchWorker({ campaignId, ...a, ...(opts.launchOverrides || {}) }));
  const settled = await Promise.allSettled(handles.map((h) => h.promise));
  return handles.map((h, i) => ({
    worker_id: h.worker.worker_id,
    launched: h.launched,
    pid: h.pid,
    outcome: settled[i].status === 'fulfilled' ? settled[i].value : { status: 'CRASHED', error: String(settled[i].reason) },
  }));
}

/**
 * Rebuild worker truth after a supervisor restart.
 *
 * A RUNNING status in the registry is a claim from before the crash. Trusting it would leave
 * phantom workers occupying concurrency slots and holding fixture leases forever, so every
 * claim is re-checked against a real PID probe.
 */
export function recoverWorkers(campaignId) {
  const reg = readWorkerRegistry(campaignId);
  const recovered = [];
  for (const [id, w] of Object.entries(reg.workers || {})) {
    const claimed = w.status;
    const alive = isPidAlive(w.pid);
    if (['RUNNING', 'STARTING', 'CHECKPOINTING'].includes(claimed) && !alive) {
      reg.workers[id] = { ...w, status: 'CRASHED', pid: null, recovered_at: nowIso(),
        recovery_note: 'claimed ' + claimed + ' but PID ' + w.pid + ' is not alive; treated as crashed' };
      releaseAllFor(campaignId, id);
      recovered.push({ worker_id: id, was: claimed, now: 'CRASHED', pid_alive: false });
    } else if (alive && ['RUNNING', 'STARTING'].includes(claimed)) {
      recovered.push({ worker_id: id, was: claimed, now: claimed, pid_alive: true, note: 'still running - adopted' });
    }
  }
  writeWorkerRegistry(campaignId, reg);
  const reaped = reapDeadLeases(campaignId);
  return { recovered, reaped, leases: listLeases(campaignId) };
}

export function summariseWorkers(campaignId) {
  const reg = readWorkerRegistry(campaignId);
  const ws = Object.values(reg.workers || {});
  return {
    active_worker_count: ws.filter((w) => ['RUNNING', 'STARTING', 'CHECKPOINTING'].includes(w.status)).length,
    workers: ws.map((w) => ({
      worker_id: w.worker_id, pid: w.pid, lane: w.lane, state: w.status,
      current_scenario: w.current_scenario || null, heartbeat: w.heartbeat || null,
      browser_available: w.browser_available ?? null,
      fixture_namespace: w.fixture_namespace || null, cost_usd: w.cost_usd ?? null,
    })),
  };
}

function buildWorkerPrompt({ campaignId, workerId, lane, directive, assignedCapabilities, assignedScenarios, fixtureNamespace, authorizedFixtureIds, wd }) {
  const laneDef = LANES[lane] || { label: lane, owns: [] };
  const w = wd.replace(/\\/g, '/');
  return [
    'You are QA WORKER ' + workerId + ' (' + laneDef.label + ') for SEM Brain OS, launched',
    'programmatically as one of several PARALLEL workers. There is NO conversational history.',
    '',
    'FIRST: read ' + REPO_ROOT.replace(/\\/g, '/') + '/qa/runner/QA_DIRECTOR_BOOT.md for context.',
    '',
    'YOUR LANE: ' + laneDef.label,
    'You own ONLY: ' + (laneDef.owns || []).join(', '),
    'Do not test outside your lane. Another worker owns it right now.',
    '',
    'ASSIGNED CAPABILITIES: ' + (assignedCapabilities.join(', ') || '(none)'),
    'ASSIGNED SCENARIOS: ' + (assignedScenarios.join(', ') || '(none)'),
    'FIXTURE NAMESPACE: ' + fixtureNamespace,
    'AUTHORIZED FIXTURES (the ONLY ones you may mutate): ' + (authorizedFixtureIds.join(', ') || '(none - read-only run)'),
    '',
    'DIRECTIVE:',
    directive,
    '',
    'HARD RULES FOR A PARALLEL WORKER:',
    '- You are EVIDENCE, not a verdict. You do NOT decide capability or bug status.',
    '- You may write ONLY these paths:',
    '    ' + w + '/RESULT.json',
    '    ' + w + '/CHECKPOINT.json',
    '    ' + w + '/EVIDENCE/**',
    '- You MUST NOT edit qa/BUG_QUEUE.json, qa/HANDOFF_STATE.json, qa/CAPABILITY_INVENTORY.json,',
    '  qa/COVERAGE_LEDGER.json, qa/FIXTURE_REGISTRY.json, qa/SYNTHETIC_CLONE_MAP.json,',
    '  qa/WORK_PC_QA_STATUS.md or qa/BUILD_UNDER_TEST.json. The Orchestrator is the single writer.',
    '  Editing them corrupts a parallel campaign - report findings in RESULT.json instead.',
    '- Do NOT git commit or git push. The Orchestrator publishes evidence.',
    '- Mutate ONLY fixtures in your authorized list. Another worker may own the rest.',
    '- If a fixture you need is not authorized to you, record BLOCKED with a blocked_reason.',
    '- If the browser (mcp__playwright__*) is unavailable, do NOT report UI results at all.',
    '  Record browser_available:false and BLOCKED. A UI verdict with no browser is a fabrication.',
    '- Write CHECKPOINT.json as you go so a restart can resume you.',
    '- YOUR VERY FIRST ACTION: write a PROVISIONAL RESULT.json containing',
    '    { "worker_id": "' + workerId + '", "campaign_id": "' + campaignId + '", "scenario_id": "<your scenario>",',
    '      "provisional": true, "verdict": "INVALID_TEST", "started_at": "<now>" }',
    '  then overwrite it with the real result at the end. If your budget is exhausted mid-run,',
    '  the provisional file tells the Director you STARTED and did not finish - which is the',
    '  truth - instead of leaving no trace. The Director never counts a provisional result as a',
    '  verdict.',
    '- Budget discipline: write EVIDENCE files incrementally, not only at the end. Evidence that',
    '  exists when the budget runs out is still evidence; a conclusion held in memory is lost.',
    '',
    'RESULT.json SHAPE (required):',
    '{ "worker_id": "' + workerId + '", "campaign_id": "' + campaignId + '",',
    '  "scenario_id": "...", "capability_id": "...",',
    '  "verdict": "PASS|FAIL|FLAKY|BLOCKED|INVALID_TEST",',
    '  "blocked_reason": "... (required if BLOCKED)",',
    '  "browser_required": true|false, "browser_available": true|false,',
    '  "evidence": { "observed": "...", "db_state": "...", "files": ["EVIDENCE/..."] },',
    '  "started_at": "...", "completed_at": "..." }',
    '',
    'A PASS or FAIL with no evidence payload is rejected as INVALID_TEST by the reconciler.',
  ].join('\n');
}
