// Parallel QA orchestration: one Director/Orchestrator, N isolated worker processes.
//
// The workers are INDEPENDENT TOP-LEVEL PROCESSES, not nested conversational subagents. That is
// a correctness requirement, not a style preference: a nested agent dies with its parent and
// shares its context, so a supervisor restart could not reconstruct it and a parent stall would
// silently stall every worker. Real PIDs are what make crash isolation and restart recovery
// provable rather than claimed.
//
// Worker output is EVIDENCE. Nothing here writes canonical QA state - see reconcile.mjs.
//
// Security model (founder decisions 2026-09-10, worker-policy.mjs):
//   - Every worker is launched under a CLASS POLICY that removes capability at the CLI boundary:
//     BROWSER_QA has no built-in tools and only reviewed high-level Playwright MCP tools;
//     SOURCE_AUDIT has only Read/Glob/Grep, from a source-only worktree, with no MCP at all.
//   - bypassPermissions is never used for a worker. --restricted refuses it anyway.
//   - The live init frame is checked against the policy; a worker whose tool set differs is
//     killed before it does anything. That check is the enforcement.
//   - Workers write NOTHING. RESULT.json, CHECKPOINT.json and the evidence transcript are
//     materialised by this process from the worker's stream-json output.
//   - SOURCE_AUDIT: the worktree fingerprint before spawn must equal the one after exit.
//   - Child environments pass through capability-gate.mjs (defense in depth).
import { spawn } from 'node:child_process';
import { createWriteStream, writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { P } from './paths.mjs';
import { resolveClaudeBin, MODEL_ALIAS, killTree } from './director.mjs';
import {
  ensureRunDirs, runsDir, isPidAlive,
  acquireLeaseSet, releaseAllFor, renewLeasesFor, reapDeadLeases, listLeases,
} from './worker-lease.mjs';
import { LANES } from './lanes.mjs';
import { policyFor, policyArgs, policyHash, checkInitFrame } from './worker-policy.mjs';
import { ensureSourceWorktree, worktreeFingerprint, fingerprintsEqual, gitContext } from './source-worktree.mjs';
import { writeSidecarConfig, assertSyntheticIdentity } from './browser-isolation.mjs';
import { gatedEnv } from './capability-gate.mjs';
import { preflightAuthorises, readPreflight, runIdentityPreflight, PREFLIGHT_SUFFIX } from './identity-preflight.mjs';

// Launch modes. SCENARIO carries mutation authority (authorized fixtures) and therefore requires a
// fresh AUTH_OK identity preflight for BROWSER_QA (A8). PREFLIGHT and BOUNDARY_PROBE are
// observation-only launches: they never receive authorized fixtures.
export const LAUNCH_MODES = Object.freeze(['SCENARIO', 'PREFLIGHT', 'BOUNDARY_PROBE']);

export const WORKER_STATES = [
  'QUEUED', 'STARTING', 'RUNNING', 'CHECKPOINTING',
  'PASS', 'FAIL', 'FLAKY', 'BLOCKED', 'CRASHED', 'CAPACITY_BLOCKED', 'COMPLETE',
];

export const WORK_PC_SQL_PROHIBITION =
  'NO PRODUCTION SQL FROM WORK PC. This is absolute and enforced by tool absence: you have no shell, '
  + 'no database client and no network primitive. If a task appears to need SQL, record BLOCKED with '
  + 'blocked_reason PRODUCTION_SQL_PROHIBITED_ON_WORK_PC so the Director hands it to the Home PC.';

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

function notLaunched(campaignId, workerId, lane, reason, extra = {}) {
  const rec = updateWorker(campaignId, workerId, {
    worker_id: workerId, lane, status: 'BLOCKED', blocked_reason: reason, pid: null, started_at: null, ...extra,
  });
  return { launched: false, reason: reason.split(':')[0], worker: rec, promise: Promise.resolve(rec) };
}

/**
 * Pull the worker's final structured result out of the stream-json `result` text. The model has
 * no Write tool, so its last message IS the result. Accepts a bare JSON object, or one wrapped in
 * a ```json fence, or the last {...} block in the text. Anything else is UNPARSEABLE_RESULT.
 */
export function parseWorkerResult(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, why: 'EMPTY_RESULT' };
  const candidates = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/g);
  if (fence) for (const f of fence) candidates.push(f.replace(/```(?:json)?/, '').replace(/```$/, ''));
  candidates.push(text);
  const last = text.lastIndexOf('}');
  const first = text.indexOf('{');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const o = JSON.parse(c.trim());
      if (o && typeof o === 'object' && !Array.isArray(o)) return { ok: true, value: o };
    } catch {}
  }
  return { ok: false, why: 'UNPARSEABLE_RESULT' };
}

/**
 * Launch one worker as a real OS process.
 *
 * Fixture leases are acquired BEFORE spawn. A worker that cannot get exclusive ownership of what
 * it would mutate is not started at all - starting it and hoping would be how two workers end up
 * editing one fixture and producing a fabricated defect. Identity and org scope are leased the
 * same way: two browser workers can never share a synthetic account or a synthetic tenant.
 */
export function launchWorker({
  campaignId,
  workerId,
  lane,
  directive,
  workerClass = 'SOURCE_AUDIT',
  identityId = null,
  orgScope = null,
  sourceRef = 'HEAD',
  baseRef = null,
  assignedCapabilities = [],
  assignedScenarios = [],
  fixtureNamespace,
  authorizedFixtureIds = [],
  leaseKeys = [],
  browserContextId = null,
  maxBudgetUsd = 6,
  model = process.env.QA_WORKER_MODEL || MODEL_ALIAS,
  launchMode = 'SCENARIO',
  preflight = null,
  hangMs = 10 * 60_000,
  hardCapMs = 45 * 60_000,
  onStarted = () => {},
  onEvent = () => {},
}) {
  let policy;
  try { policy = policyFor(workerClass); }
  catch (e) { return notLaunched(campaignId, workerId, lane, e.message); }
  if (!LAUNCH_MODES.includes(launchMode)) return notLaunched(campaignId, workerId, lane, 'UNKNOWN_LAUNCH_MODE: ' + launchMode);
  // Observation-only launches carry no mutation authority whatever the caller passed.
  if (launchMode !== 'SCENARIO') authorizedFixtureIds = [];

  const wd = ensureRunDirs(campaignId, workerId);
  const sessionId = randomUUID();

  const keys = leaseKeys.length ? leaseKeys : authorizedFixtureIds.map((f) => 'fixture:' + f);
  if (browserContextId) keys.push('browser:' + browserContextId);
  if (policy.requiresIdentity) {
    if (!identityId) return notLaunched(campaignId, workerId, lane, 'IDENTITY_REQUIRED: BROWSER_QA needs a dedicated synthetic identity');
    if (!orgScope) return notLaunched(campaignId, workerId, lane, 'ORG_SCOPE_REQUIRED: BROWSER_QA needs its own synthetic org scope');
    // Founder-shaped or malformed identities are refused before any gate, lease or browser is touched.
    try { assertSyntheticIdentity(identityId); } catch (e) { return notLaunched(campaignId, workerId, lane, (e.code || 'INVALID_IDENTITY') + ': ' + e.message); }
    keys.push('identity:' + identityId, 'org:' + orgScope);
    // A8: a SCENARIO launch needs a fresh AUTH_OK preflight bound to this campaign/worker/identity/org.
    // storageState existence is not authentication proof; the record comes from a real UI observation.
    if (launchMode === 'SCENARIO') {
      const rec = preflight || readPreflight(campaignId, workerId);
      const auth = preflightAuthorises(rec, { campaignId, workerId, identityId, orgScope });
      if (!auth.ok) return notLaunched(campaignId, workerId, lane, auth.reason + ': identity preflight did not authorise a scenario launch for ' + identityId + '/' + orgScope, { launch_mode: launchMode, preflight_classification: rec && rec.classification || null });
    }
  }

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

  // ---- Class-specific preparation. Failures here are BLOCKED launches, never degraded ones.
  let cwd, mcpArgs = [], sidecar = null, worktree = null, fpBefore = null, gitCtx = null;
  try {
    if (policy.class === 'BROWSER_QA') {
      // The preflight worker and its scenario worker never coexist; suffix keeps run dirs apart.
      if (launchMode === 'PREFLIGHT' && !workerId.endsWith(PREFLIGHT_SUFFIX)) throw Object.assign(new Error('PREFLIGHT_WORKER_ID_SUFFIX_REQUIRED'), { code: 'PREFLIGHT_WORKER_ID_SUFFIX_REQUIRED' });
      sidecar = writeSidecarConfig(campaignId, workerId, { identityId });
      cwd = wd;
      mcpArgs = ['--mcp-config', sidecar.path];
    } else {
      worktree = ensureSourceWorktree(sourceRef);
      cwd = worktree.path;
      fpBefore = worktreeFingerprint(worktree.path);
      if (fpBefore.dirty) throw Object.assign(new Error('SOURCE_WORKTREE_NOT_CLEAN: dirty before launch'), { code: 'SOURCE_WORKTREE_NOT_CLEAN' });
      gitCtx = gitContext(worktree.path, { baseRef });
    }
  } catch (e) {
    releaseAllFor(campaignId, workerId);
    return notLaunched(campaignId, workerId, lane, (e.code || 'LAUNCH_PREP_FAILED') + ': ' + e.message.slice(0, 300));
  }

  const bin = resolveClaudeBin();
  const logPath = join(wd, 'worker.jsonl');
  const log = createWriteStream(logPath, { flags: 'a' });
  const started = Date.now();
  const resultPath = join(wd, 'RESULT.json');
  const checkpointPath = join(wd, 'CHECKPOINT.json');
  const transcriptPath = join(wd, 'EVIDENCE', 'worker-transcript.md');

  const prompt = buildWorkerPrompt({
    campaignId, workerId, lane, directive, assignedCapabilities, assignedScenarios,
    fixtureNamespace, authorizedFixtureIds, policy, identityId, orgScope, gitCtx, worktree, launchMode,
  });

  // No --permission-mode (bypass is refused under --restricted and never wanted); no --add-dir
  // (a browser worker has no file tool; a source worker is confined to its worktree).
  const args = [
    '-p', prompt,
    '--model', model,
    '--output-format', 'stream-json',
    '--verbose',
    '--session-id', sessionId,
    '--settings', P.guardSettings,
    ...policyArgs(policy),
    ...mcpArgs,
    '--max-budget-usd', String(maxBudgetUsd),
    '--name', 'work-pc-qa-' + workerId,
  ];

  const env = gatedEnv(process.env, {
    CLAUDE_CODE_WORK_PC_SUPERVISED: '1', QA_WORKER_ID: workerId, QA_CAMPAIGN_ID: campaignId,
    QA_WORKER_DIR: wd, QA_WORKER_CLASS: policy.class,
  });

  // The orchestrator - not the worker - writes the provisional result. A budget cut then leaves
  // "started, did not finish" on disk instead of silence, and the worker never needs a Write tool.
  writeFileSync(resultPath, JSON.stringify({
    worker_id: workerId, campaign_id: campaignId, scenario_id: assignedScenarios[0] || null,
    provisional: true, verdict: 'INVALID_TEST', started_at: new Date(started).toISOString(),
    materialized_by: 'orchestrator', worker_class: policy.class,
  }, null, 2) + '\n');
  appendFileSync(transcriptPath, '# Worker ' + workerId + ' transcript (materialised by the orchestrator)\n\n');

  // Same deterministic test seam the single-director launcher uses. Lets the concurrency
  // acceptance prove overlap, crash isolation and restart recovery without spending real runs.
  const fakeBin = process.env.WORKER_FAKE_BIN;
  const child = fakeBin
    ? spawn(process.execPath, [fakeBin, '--worker-id', workerId, '--campaign', campaignId, ...args], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    : spawn(bin, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });

  const outcome = {
    worker_id: workerId, lane, campaign_id: campaignId, worker_class: policy.class, policy_hash: policyHash(policy), launch_mode: launchMode,
    pid: child.pid ?? null, session_id: sessionId, log_path: logPath, cwd,
    result_path: resultPath, checkpoint_path: checkpointPath,
    fixture_namespace: fixtureNamespace, authorized_fixture_ids: authorizedFixtureIds,
    identity_id: identityId, org_scope: orgScope,
    browser_context_id: browserContextId, lease_keys: lease.keys || keys,
    source_worktree: worktree ? worktree.path : null, source_sha: worktree ? worktree.sha : null,
    started_at: new Date(started).toISOString(), heartbeat: nowIso(),
    status: 'STARTING', current_scenario: assignedScenarios[0] || null,
    exit_code: null, killed_reason: null, cost_usd: null,
    browser_available: null, capacity_blocked: false, auth_failure: false,
    init_tools: null, boundary_violation: null, result_text: null, num_tool_calls: 0,
  };

  updateWorker(campaignId, workerId, outcome);
  try { onStarted({ ...outcome }); } catch {}

  let lastOutput = Date.now();
  let stderrTail = '';

  const writeCheckpoint = (progress) => {
    try {
      writeFileSync(checkpointPath, JSON.stringify({
        worker_id: workerId, campaign_id: campaignId, last_scenario: outcome.current_scenario,
        progress, num_tool_calls: outcome.num_tool_calls, at: nowIso(), materialized_by: 'orchestrator',
      }, null, 2) + '\n');
    } catch {}
  };

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
      writeCheckpoint('running');
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
          const tools = (msg.tools || []).map(String);
          outcome.init_tools = tools;
          outcome.browser_available = tools.some((t) => t.startsWith('mcp__playwright__'));
          // ENFORCEMENT POINT. The policy is a claim until the live tool list agrees with it.
          const check = checkInitFrame(policy, tools);
          if (!check.ok) {
            outcome.boundary_violation = { at: 'init', ...check };
            outcome.status = 'BLOCKED';
            updateWorker(campaignId, workerId, { status: 'BLOCKED', blocked_reason: check.reason, init_tools: tools, boundary_violation: outcome.boundary_violation });
            finish(check.reason);
          } else {
            outcome.status = 'RUNNING';
            updateWorker(campaignId, workerId, { status: 'RUNNING', browser_available: outcome.browser_available, init_tools: tools });
          }
        } else if (msg.type === 'assistant') {
          const content = (msg.message && msg.message.content) || [];
          for (const c of content) {
            if (c.type === 'text' && c.text) appendFileSync(transcriptPath, c.text + '\n\n');
            else if (c.type === 'tool_use') {
              outcome.num_tool_calls++;
              appendFileSync(transcriptPath, '> tool_use ' + c.name + '\n\n');
              // Belt and braces: a tool call the policy never allowed is a boundary failure even if
              // the init frame looked right (e.g. a tool registered late).
              if (!policy.allowedTools.includes(c.name)) {
                outcome.boundary_violation = { at: 'tool_use', tool: c.name, reason: 'TOOL_OUTSIDE_POLICY' };
                finish('TOOL_OUTSIDE_POLICY:' + c.name);
              }
            }
          }
        } else if (msg.type === 'result') {
          outcome.cost_usd = msg.total_cost_usd ?? null;
          outcome.result_subtype = msg.subtype || null;
          outcome.num_turns = msg.num_turns ?? null;
          outcome.result_text = typeof msg.result === 'string' ? msg.result : null;
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

      // SOURCE INPUT BEFORE == SOURCE INPUT AFTER. Checked by this process, after the worker is
      // gone, so the worker cannot influence the comparison.
      if (worktree) {
        try {
          const fpAfter = worktreeFingerprint(worktree.path);
          outcome.source_fingerprint = { before: fpBefore, after: fpAfter, equal: fingerprintsEqual(fpBefore, fpAfter) };
          if (!outcome.source_fingerprint.equal) {
            outcome.boundary_violation = { at: 'exit', reason: 'WORKER_BOUNDARY_VIOLATION', detail: 'source worktree changed during run', status_after: fpAfter.status.slice(0, 2000) };
          }
        } catch (e) {
          outcome.boundary_violation = outcome.boundary_violation || { at: 'exit', reason: 'WORKER_BOUNDARY_VIOLATION', detail: 'could not re-fingerprint worktree: ' + e.message };
        }
      }

      // Capacity exhaustion is NOT a crash and NOT a QA failure. Conflating them would let a
      // billing limit masquerade as a product defect, and would take down siblings that are fine.
      if (outcome.boundary_violation) outcome.status = 'BLOCKED';
      else if (outcome.capacity_blocked) outcome.status = 'CAPACITY_BLOCKED';
      else if (outcome.killed_reason) outcome.status = 'CRASHED';
      else if (code === 0) outcome.status = 'COMPLETE';
      else outcome.status = 'CRASHED';

      materializeResult(outcome, { resultPath, policy, assignedScenarios });
      writeCheckpoint(outcome.status === 'COMPLETE' ? 'complete' : outcome.status.toLowerCase());

      releaseAllFor(campaignId, workerId);
      updateWorker(campaignId, workerId, {
        status: outcome.status, exit_code: code, killed_reason: outcome.killed_reason,
        blocked_reason: outcome.boundary_violation ? outcome.boundary_violation.reason : undefined,
        cost_usd: outcome.cost_usd, duration_ms: outcome.duration_ms, pid: null,
        capacity_blocked: outcome.capacity_blocked, capacity_reason: outcome.capacity_reason || null,
        result_subtype: outcome.result_subtype || null, num_turns: outcome.num_turns ?? null,
        auth_failure: outcome.auth_failure, boundary_violation: outcome.boundary_violation,
        init_tools: outcome.init_tools, num_tool_calls: outcome.num_tool_calls,
        source_fingerprint: outcome.source_fingerprint || null,
      });
      resolve(outcome);
    });
  });

  return { launched: true, worker: outcome, promise, pid: child.pid ?? null };
}

/**
 * Turn what the worker said into RESULT.json. Single writer: this process. The provisional file
 * is replaced only when the worker actually finished; a boundary violation becomes INVALID_TEST
 * regardless of what the worker claimed, because a worker outside its boundary is not evidence.
 */
function materializeResult(outcome, { resultPath, policy, assignedScenarios }) {
  const base = {
    worker_id: outcome.worker_id, campaign_id: outcome.campaign_id, worker_class: policy.class,
    scenario_id: assignedScenarios[0] || null, materialized_by: 'orchestrator', materialized_at: nowIso(),
    started_at: outcome.started_at, completed_at: nowIso(), init_tools: outcome.init_tools,
    browser_available: outcome.browser_available, source_sha: outcome.source_sha,
  };
  if (outcome.boundary_violation) {
    writeFileSync(resultPath, JSON.stringify({
      ...base, verdict: 'INVALID_TEST', invalid_reason: outcome.boundary_violation.reason,
      boundary_violation: outcome.boundary_violation, provisional: false,
    }, null, 2) + '\n');
    return;
  }
  if (outcome.result_text === null) return; // cut off before a result frame: provisional stays, and says so
  const parsed = parseWorkerResult(outcome.result_text);
  if (!parsed.ok) {
    writeFileSync(resultPath, JSON.stringify({
      ...base, verdict: 'INVALID_TEST', invalid_reason: parsed.why, result_text_tail: outcome.result_text.slice(-1500), provisional: false,
    }, null, 2) + '\n');
    return;
  }
  const r = parsed.value;
  writeFileSync(resultPath, JSON.stringify({
    ...base, ...r,
    // Identity fields are the orchestrator's, whatever the worker typed.
    worker_id: outcome.worker_id, campaign_id: outcome.campaign_id, worker_class: policy.class,
    materialized_by: 'orchestrator', provisional: false,
    evidence: { ...(r.evidence || {}), files: [...new Set([...(r.evidence && r.evidence.files || []), 'EVIDENCE/worker-transcript.md'])] },
  }, null, 2) + '\n');
}

/**
 * Run one batch concurrently. A single worker failing must never take the batch down, so every
 * worker promise is settled independently.
 */
export async function runBatch(campaignId, assignments, opts = {}) {
  const max = opts.maxWorkers || 3;
  const batch = assignments.slice(0, max);
  // A8 lifecycle: every BROWSER_QA scenario assignment is preflighted (serially, read-only) before
  // its scenario worker is launched. A failed preflight becomes the worker's BLOCKED record; the
  // lane is not started and nothing falls back to another session.
  for (const a of batch) {
    const cls = a.workerClass || 'SOURCE_AUDIT';
    if (cls !== 'BROWSER_QA' || (a.launchMode && a.launchMode !== 'SCENARIO') || a.preflight) continue;
    a.preflight = await runIdentityPreflight({
      campaignId, workerId: a.workerId, lane: a.lane, identityId: a.identityId, orgScope: a.orgScope,
      expectedMarkers: a.expectedMarkers || [], allowedOrgs: a.allowedOrgs || [], launch: launchWorker, model: a.model,
    });
  }
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
      worker_class: w.worker_class || null, identity_id: w.identity_id || null, org_scope: w.org_scope || null,
      current_scenario: w.current_scenario || null, heartbeat: w.heartbeat || null,
      browser_available: w.browser_available ?? null, blocked_reason: w.blocked_reason || null,
      fixture_namespace: w.fixture_namespace || null, cost_usd: w.cost_usd ?? null,
    })),
  };
}

function buildWorkerPrompt({ campaignId, workerId, lane, directive, assignedCapabilities, assignedScenarios, fixtureNamespace, authorizedFixtureIds, policy, identityId, orgScope, gitCtx, worktree, launchMode = 'SCENARIO' }) {
  const laneDef = LANES[lane] || { label: lane, owns: [] };
  const common = [
    'You are QA WORKER ' + workerId + ' (' + laneDef.label + ', class ' + policy.class + ') for SEM Brain OS, launched',
    'programmatically as one of several PARALLEL workers. There is NO conversational history.',
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
    WORK_PC_SQL_PROHIBITION,
    '',
    'HARD RULES FOR A PARALLEL WORKER:',
    '- You are EVIDENCE, not a verdict. You do NOT decide capability or bug status.',
    '- You cannot write files, and you must not try. The Orchestrator materialises your result',
    '  from your FINAL MESSAGE. Your final message must be EXACTLY ONE JSON object and nothing else.',
    '- Do NOT attempt git, shell, network, SQL or any tool you were not given. If you believe a',
    '  tool is missing, that is by design: record BLOCKED with the reason instead.',
    '- Mutate ONLY fixtures in your authorized list. Another worker may own the rest.',
    '- If a fixture you need is not authorized to you, record BLOCKED with a blocked_reason.',
    '',
    'FINAL MESSAGE SHAPE (required, one JSON object):',
    '{ "worker_id": "' + workerId + '", "campaign_id": "' + campaignId + '",',
    '  "scenario_id": "...", "capability_id": "...",',
    '  "verdict": "PASS|FAIL|FLAKY|BLOCKED|INVALID_TEST",',
    '  "blocked_reason": "... (required if BLOCKED)",',
    '  "browser_required": true|false, "browser_available": true|false,',
    '  "evidence": { "observed": "...", "receipt": "...", "files": [] },',
    '  "started_at": "...", "completed_at": "..." }',
    '',
    'A PASS or FAIL with no evidence payload is rejected as INVALID_TEST by the reconciler.',
  ];

  if (policy.class === 'BROWSER_QA') {
    return [
      ...common.slice(0, 2),
      '',
      'YOU ARE A BROWSER WORKER. Your ONLY tools are high-level Playwright UI actions. You have no',
      'file tool, no shell, no JavaScript evaluation, no raw HTTP. Everything you learn comes from',
      'the product UI at https://brain.open-spot.ai, as identity ' + identityId + ' inside org scope',
      orgScope + '. You are NOT the founder. If the browser is logged out, record BLOCKED with',
      'blocked_reason BLOCKED_QA_AUTH - never attempt to log in, never enter credentials.',
      'Navigate ONLY to https://brain.open-spot.ai/... URLs. file:, data:, javascript:, chrome:, about:',
      'and non-product hosts are refused by the guard; do not try them except when a probe asks you to.',
      (launchMode === 'SCENARIO'
        ? 'LAUNCH MODE: SCENARIO (identity preflight AUTH_OK on record).'
        : 'LAUNCH MODE: ' + launchMode + ' - OBSERVATION ONLY. You have NO mutation authority: never submit a form, never create/edit/archive/restore/delete anything.'),
      '- Read every list at "All Organizations" unless the scenario says otherwise, and say which.',
      '- Every claim in your evidence must name the page URL and what was visibly on it.',
      '- Do NOT mutate anything outside your authorized fixture list; the org you can see is yours.',
      '',
      ...common.slice(2),
    ].join('\n');
  }

  // SOURCE_AUDIT: read-only over a detached worktree; git facts supplied, never fetched.
  const w = (worktree && worktree.path || '').replace(/\\/g, '/');
  return [
    ...common.slice(0, 2),
    '',
    'YOU ARE A SOURCE AUDIT WORKER. Your ONLY tools are Read, Glob and Grep, confined to the',
    'detached source worktree that is your working directory: ' + w,
    'It is a pure checkout of commit ' + (gitCtx && gitCtx.head) + '. It contains no runtime state,',
    'no credentials and no other worker\'s files. Do not try to reach anything outside it.',
    'FIRST: read qa/runner/QA_DIRECTOR_BOOT.md (relative to your working directory) for context.',
    '',
    'GIT CONTEXT (computed by the orchestrator; treat as immutable input - you have no git):',
    JSON.stringify(gitCtx || {}, null, 2),
    '',
    ...common.slice(2),
  ].join('\n');
}
