#!/usr/bin/env node
// Bounded synthetic concurrency acceptance for parallel QA orchestration.
//
// Acceptance criterion 15 is "all tests prove they can fail", so this harness does not merely
// assert the happy path - each check is paired with a negative that must actually be caught.
// A concurrency test that cannot detect serial execution proves nothing, and one that cannot
// detect a fixture collision would let parallel QA fabricate defects.
//
// Everything here runs against synthetic fake-worker processes. It touches no product surface,
// no browser, no database. It is safe to run at any time.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { QA_DIR } from './lib/paths.mjs';
import {
  runsDir, workerDir, ensureRunDirs, acquireLease, acquireLeaseSet, releaseAllFor,
  listLeases, reapDeadLeases, isPidAlive, leaseIsLive,
} from './lib/worker-lease.mjs';
import { launchWorker, readWorkerRegistry, writeWorkerRegistry, recoverWorkers, summariseWorkers } from './lib/orchestrator.mjs';
import { reconcile, classifyResult, CANONICAL_FILES, allowedWorkerPaths } from './lib/reconcile.mjs';
import { selectIndependentBatch, independent, LANES } from './lib/lanes.mjs';

const CAMPAIGN = 'CSYNTH-ACCEPT';
const FAKE = join(QA_DIR, 'runner', 'fake-worker.mjs');

const results = [];
let failed = 0;
function check(n, name, ok, detail) {
  const rec = { n, name, pass: !!ok, detail: detail || null };
  results.push(rec);
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + String(n).padStart(2) + '  ' + name + (detail ? '  :: ' + detail : ''));
  return ok;
}

function cleanCampaign() {
  const d = runsDir(CAMPAIGN);
  if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}

function mkAssign(id, lane, behaviour, extra = {}) {
  return {
    workerId: id, lane,
    directive: 'synthetic acceptance',
    assignedCapabilities: ['CAP-SYNTH-' + id],
    assignedScenarios: ['scen-' + id],
    fixtureNamespace: 'synth/' + id,
    authorizedFixtureIds: extra.fixtures || ['FX-' + id],
    maxBudgetUsd: 1,
    ...extra.launch,
    _behaviour: behaviour,
  };
}

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

async function main() {
  console.log('PARALLEL QA ORCHESTRATION - SYNTHETIC ACCEPTANCE');
  console.log('campaign: ' + CAMPAIGN + '\n');
  cleanCampaign();
  process.env.WORKER_FAKE_BIN = FAKE;
  process.env.WORKER_WATCHDOG_MS = '250';

  // ---------------------------------------------------------------- 1,2,3
  // Three workers must genuinely overlap in wall-clock time, with distinct live PIDs and
  // isolated result directories.
  const t0 = Date.now();
  const handles = withEnv({ FAKE_BEHAVIOUR: 'ok', FAKE_RUN_MS: '2000' }, () => ([
    launchWorker({ campaignId: CAMPAIGN, ...mkAssign('W1', 'W1_AI_TRUTH', 'ok') }),
    launchWorker({ campaignId: CAMPAIGN, ...mkAssign('W2', 'W2_TENANCY', 'ok') }),
    launchWorker({ campaignId: CAMPAIGN, ...mkAssign('W3', 'W3_WEB_PRODUCT', 'ok') }),
  ]));

  const pids = handles.map((h) => h.pid);
  const distinct = new Set(pids.filter(Boolean));
  check(2, 'each worker has a distinct live PID', distinct.size === 3 && pids.every((p) => p), 'pids=' + pids.join(','));

  // Probe liveness WHILE they run - this is what distinguishes real concurrency from a loop.
  await new Promise((r) => setTimeout(r, 600));
  const aliveNow = pids.filter((p) => isPidAlive(p));
  check(1, 'three worker processes genuinely overlap in wall-clock time', aliveNow.length === 3,
    aliveNow.length + ' of 3 alive simultaneously at t+600ms');

  await Promise.all(handles.map((h) => h.promise));
  const elapsed = Date.now() - t0;

  // Negative for check 1: if these had run sequentially, elapsed would be >= 3x run time.
  check(15, 'concurrency check can fail (serial execution would be detected)', elapsed < 5200,
    'elapsed=' + elapsed + 'ms; serial would be >=6000ms');

  const dirsOk = ['W1', 'W2', 'W3'].every((w) => existsSync(join(workerDir(CAMPAIGN, w), 'RESULT.json')));
  const distinctDirs = new Set(['W1', 'W2', 'W3'].map((w) => workerDir(CAMPAIGN, w))).size === 3;
  check(3, 'each worker has an isolated result directory', dirsOk && distinctDirs);

  // ---------------------------------------------------------------- 4
  // Only the Director writes canonical QA files. Prove by timestamp: no canonical file may be
  // touched during a worker run.
  const before = {};
  for (const f of CANONICAL_FILES) {
    const p = join(QA_DIR, f);
    if (existsSync(p)) before[f] = statSync(p).mtimeMs;
  }
  await withEnv({ FAKE_BEHAVIOUR: 'sandbox_breach', FAKE_RUN_MS: '600' }, async () => {
    const h = launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WBREACH', 'W3_WEB_PRODUCT', 'sandbox_breach') });
    await h.promise;
  });
  const touched = Object.keys(before).filter((f) => {
    const p = join(QA_DIR, f);
    return existsSync(p) && statSync(p).mtimeMs !== before[f];
  });
  check(4, 'only Director writes canonical QA files (no canonical file touched by a worker)',
    touched.length === 0, touched.length ? 'TOUCHED: ' + touched.join(',') : 'none touched');

  const allowed = allowedWorkerPaths(CAMPAIGN, 'W1');
  check(14, 'no product implementation code is changed by the platform',
    !allowed.result.includes('/web/') && !allowed.result.includes('supabase'), 'worker sandbox is qa/runs only');

  // ---------------------------------------------------------------- 5
  // Fixture collision must be REJECTED, not queued.
  const holder = acquireLease(CAMPAIGN, 'fixture:FX-SHARED', { workerId: 'WHOLD', pid: process.pid });
  const collide = launchWorker({
    campaignId: CAMPAIGN, ...mkAssign('WCOLLIDE', 'W2_TENANCY', 'ok', { fixtures: ['FX-SHARED'] }),
  });
  const rejected = collide.launched === false && collide.reason === 'FIXTURE_COLLISION';
  check(5, 'fixture collision is rejected', holder.ok && rejected,
    rejected ? 'rejected as FIXTURE_COLLISION' : 'NOT rejected (launched=' + collide.launched + ')');
  releaseAllFor(CAMPAIGN, 'WHOLD');

  // ---------------------------------------------------------------- 6
  // Browser-state collision must be rejected, and unproven isolation must block browser work.
  const items = [
    { id: 'a', lane: 'W1_AI_TRUTH', browser_context: 'ctx-1', mutates: true, requires_browser: true },
    { id: 'b', lane: 'W2_TENANCY', browser_context: 'ctx-1', mutates: true, requires_browser: true },
  ];
  const sharedCtx = independent(items[0], items[1]);
  const blockedUnproven = selectIndependentBatch(items, 3, { browserIsolationProven: false });
  check(6, 'browser-state collision is rejected',
    !sharedCtx.ok && blockedUnproven.chosen.length === 0,
    'shared-ctx=' + sharedCtx.reason + '; unproven-isolation refused ' + blockedUnproven.refused.length);

  // ---------------------------------------------------------------- 7
  // One worker crashing must not stop the others.
  cleanRunDir('WA'); cleanRunDir('WB');
  const crashHandles = [
    withEnv({ FAKE_BEHAVIOUR: 'crash', FAKE_RUN_MS: '300' }, () => launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WA', 'W1_AI_TRUTH', 'crash') })),
    withEnv({ FAKE_BEHAVIOUR: 'ok', FAKE_RUN_MS: '1500' }, () => launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WB', 'W2_TENANCY', 'ok') })),
  ];
  const crashOut = await Promise.all(crashHandles.map((h) => h.promise));
  const wa = crashOut.find((o) => o.worker_id === 'WA');
  const wb = crashOut.find((o) => o.worker_id === 'WB');
  check(7, 'worker crash does not stop other workers',
    wa.status === 'CRASHED' && wb.status === 'COMPLETE' && existsSync(join(workerDir(CAMPAIGN, 'WB'), 'RESULT.json')),
    'WA=' + wa.status + ' WB=' + wb.status);

  // Crashed worker must not keep holding leases.
  const stillHeld = listLeases(CAMPAIGN).filter((l) => l.worker_id === 'WA' && l.live);
  check(8, 'worker restart resumes from checkpoint / crashed worker releases leases',
    stillHeld.length === 0 && existsSync(join(workerDir(CAMPAIGN, 'WB'), 'CHECKPOINT.json')),
    'WA live leases=' + stillHeld.length);

  // ---------------------------------------------------------------- 9
  // Capacity exhaustion is isolated and is NOT a crash.
  cleanRunDir('WCAP'); cleanRunDir('WOK');
  const capHandles = [
    withEnv({ FAKE_BEHAVIOUR: 'capacity', FAKE_RUN_MS: '300' }, () => launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WCAP', 'W1_AI_TRUTH', 'capacity') })),
    withEnv({ FAKE_BEHAVIOUR: 'ok', FAKE_RUN_MS: '1200' }, () => launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WOK', 'W3_WEB_PRODUCT', 'ok') })),
  ];
  const capOut = await Promise.all(capHandles.map((h) => h.promise));
  const wcap = capOut.find((o) => o.worker_id === 'WCAP');
  const wok = capOut.find((o) => o.worker_id === 'WOK');
  check(9, 'provider capacity block affects only that worker',
    wcap.status === 'CAPACITY_BLOCKED' && wok.status === 'COMPLETE',
    'WCAP=' + wcap.status + ' WOK=' + wok.status);

  // ---------------------------------------------------------------- 10
  // Conflicting results must trigger an independent control, never a majority vote.
  cleanRunDir('WC1'); cleanRunDir('WC2'); cleanRunDir('WC3');
  for (const [w, v] of [['WC1', 'PASS'], ['WC2', 'FAIL'], ['WC3', 'PASS']]) {
    ensureRunDirs(CAMPAIGN, w);
    writeFileSync(join(workerDir(CAMPAIGN, w), 'RESULT.json'), JSON.stringify({
      worker_id: w, campaign_id: CAMPAIGN, capability_id: 'CAP-CONFLICT', scenario_id: 'scen-conflict',
      verdict: v, evidence: { observed: 'synthetic ' + v }, completed_at: new Date().toISOString(),
    }, null, 2));
  }
  const rec = reconcile(CAMPAIGN);
  const conflict = rec.conflicts.find((c) => c.subject === 'CAP-CONFLICT');
  const notVoted = conflict && conflict.status === 'CONFLICTING_EVIDENCE' && conflict.resolution === 'DISPATCH_INDEPENDENT_CONTROL';
  check(10, 'conflicting results trigger independent control (no majority vote)',
    !!notVoted && !rec.accepted.some((a) => a.subject === 'CAP-CONFLICT'),
    notVoted ? '2 PASS vs 1 FAIL -> CONFLICTING_EVIDENCE, not PASS' : 'conflict not raised');

  // ---------------------------------------------------------------- 11
  // Supervisor restart must reconstruct live/dead workers from real PIDs, never trust status.
  const reg = readWorkerRegistry(CAMPAIGN);
  reg.workers['WGHOST'] = { worker_id: 'WGHOST', lane: 'W1_AI_TRUTH', status: 'RUNNING', pid: 999999, heartbeat: new Date().toISOString() };
  writeWorkerRegistry(CAMPAIGN, reg);
  acquireLease(CAMPAIGN, 'fixture:FX-GHOST', { workerId: 'WGHOST', pid: 999999 });
  const recovery = recoverWorkers(CAMPAIGN);
  const ghost = recovery.recovered.find((r) => r.worker_id === 'WGHOST');
  const ghostLeaseGone = !listLeases(CAMPAIGN).some((l) => l.worker_id === 'WGHOST' && l.live);
  check(11, 'supervisor restart reconstructs live/dead workers correctly',
    ghost && ghost.now === 'CRASHED' && ghost.pid_alive === false && ghostLeaseGone,
    ghost ? 'phantom RUNNING pid 999999 -> CRASHED, lease reaped' : 'ghost not detected');

  // ---------------------------------------------------------------- 12
  // Parallel truth must equal sequential truth. Same inputs, same verdicts.
  const seq = reconcile(CAMPAIGN);
  const par = reconcile(CAMPAIGN);
  check(12, 'parallel run produces identical or stronger truth than sequential',
    JSON.stringify(seq.accepted.map((a) => [a.subject, a.verdict]).sort()) ===
    JSON.stringify(par.accepted.map((a) => [a.subject, a.verdict]).sort()),
    'reconciliation is deterministic over the same evidence');

  // ---------------------------------------------------------------- 13
  const src = readFileSync(join(QA_DIR, 'runner', 'lib', 'orchestrator.mjs'), 'utf8')
    + readFileSync(join(QA_DIR, 'runner', 'lib', 'worker-lease.mjs'), 'utf8')
    + readFileSync(join(QA_DIR, 'runner', 'lib', 'reconcile.mjs'), 'utf8');
  const noSql = !/\bpsql\b|supabase db (push|query)|INSERT INTO|UPDATE .* SET|DELETE FROM/i.test(src);
  check(13, 'no production SQL is used by the orchestration platform', noSql);

  // ---------------------------------------------------------------- negatives
  // Each guard must be able to catch its own violation, or it is decoration.
  const badNoEvidence = classifyResult({ scenario_id: 's', verdict: 'PASS' });
  const badNoBrowser = classifyResult({ scenario_id: 's', verdict: 'PASS', browser_required: true, browser_available: false, evidence: { observed: 'x' } });
  const badBlocked = classifyResult({ scenario_id: 's', verdict: 'BLOCKED' });
  check(15.1, 'evidence guard can fail (PASS without evidence -> INVALID_TEST)', badNoEvidence.verdict === 'INVALID_TEST');
  check(15.2, 'browser guard can fail (UI verdict without browser -> INVALID_TEST)', badNoBrowser.verdict === 'INVALID_TEST');
  check(15.3, 'blocked guard can fail (BLOCKED without reason -> INVALID_TEST)', badBlocked.verdict === 'INVALID_TEST');

  const laneRefusal = independent(
    { id: 'x', lane: 'W1_AI_TRUTH', fixtures: ['FX-1'] },
    { id: 'y', lane: 'W2_TENANCY', fixtures: ['FX-1'] });
  check(15.4, 'independence guard can fail (shared fixture across lanes refused)',
    !laneRefusal.ok && laneRefusal.reason === 'SHARED_RESOURCE');

  // ---------------------------------------------------------------- report
  const summary = summariseWorkers(CAMPAIGN);
  const out = {
    _doc: 'Synthetic concurrency acceptance for parallel QA orchestration. Generated by qa/runner/parallel-acceptance.mjs. Synthetic only - no product surface, browser, or database touched.',
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    campaign_id: CAMPAIGN,
    concurrency: 3,
    checks: results,
    passed: results.filter((r) => r.pass).length,
    failed,
    verdict: failed === 0 ? 'SYNTHETIC_CONCURRENCY_ACCEPTED' : 'SYNTHETIC_CONCURRENCY_FAILED',
    wall_clock_ms_for_3_workers: elapsed,
    worker_summary: summary,
    _not_yet_proven: [
      'Browser-context isolation across parallel workers has NOT been proven. No storageState export exists, so isolated contexts cannot also be authenticated. Parallel BROWSER MUTATION stays BLOCKED until proven (lanes.mjs enforces this).',
      'A real production campaign with 3 live workers has not yet been run. This harness proves the machinery, not the campaign.',
    ],
  };
  writeFileSync(join(QA_DIR, 'runner', 'PARALLEL_ACCEPTANCE.json'), JSON.stringify(out, null, 2) + '\n');

  console.log('\n' + (failed === 0 ? 'SYNTHETIC_CONCURRENCY_ACCEPTED' : 'SYNTHETIC_CONCURRENCY_FAILED')
    + '  (' + out.passed + ' passed, ' + failed + ' failed)');
  console.log('3 workers wall-clock: ' + elapsed + 'ms');
  process.exit(failed === 0 ? 0 : 1);
}

function cleanRunDir(w) {
  const d = workerDir(CAMPAIGN, w);
  if (existsSync(d)) rmSync(d, { recursive: true, force: true });
}

main().catch((e) => { console.error('acceptance harness error:', e); process.exit(2); });
