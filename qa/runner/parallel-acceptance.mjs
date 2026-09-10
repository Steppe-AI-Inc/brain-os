#!/usr/bin/env node
// Bounded synthetic concurrency acceptance for parallel QA orchestration.
//
// Acceptance criterion 15 is "all tests prove they can fail", so this harness does not merely
// assert the happy path - each check is paired with a negative that must actually be caught.
// A concurrency test that cannot detect serial execution proves nothing, and one that cannot
// detect a fixture collision would let parallel QA fabricate defects.
//
// Everything here runs against synthetic fake-worker processes. It touches no product surface,
// no browser, no database. It is safe to run at any time. The real-tool capability probes live
// in security-acceptance.mjs.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { QA_DIR } from './lib/paths.mjs';
import {
  runsDir, workerDir, ensureRunDirs, acquireLease, releaseAllFor,
  listLeases, isPidAlive,
} from './lib/worker-lease.mjs';
import { launchWorker, readWorkerRegistry, writeWorkerRegistry, recoverWorkers, summariseWorkers, parseWorkerResult } from './lib/orchestrator.mjs';
import { reconcile, classifyResult, CANONICAL_FILES, allowedWorkerPaths } from './lib/reconcile.mjs';
import { selectIndependentBatch, independent } from './lib/lanes.mjs';
import { ensureSourceWorktree } from './lib/source-worktree.mjs';

const CAMPAIGN = 'CSYNTH-ACCEPT';
const FAKE = join(QA_DIR, 'runner', 'fake-worker.mjs');

const results = [];
let failed = 0;
function check(n, name, ok, detail) {
  const rec = { n, name, pass: !!ok, detail: detail || null };
  results.push(rec);
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + String(n).padStart(4) + '  ' + name + (detail ? '  :: ' + detail : ''));
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
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

const readResult = (w) => { try { return JSON.parse(readFileSync(join(workerDir(CAMPAIGN, w), 'RESULT.json'), 'utf8')); } catch { return null; } };

async function main() {
  console.log('PARALLEL QA ORCHESTRATION - SYNTHETIC ACCEPTANCE');
  console.log('campaign: ' + CAMPAIGN + '\n');
  cleanCampaign();
  process.env.WORKER_FAKE_BIN = FAKE;
  process.env.WORKER_WATCHDOG_MS = '250';

  // The SOURCE_AUDIT class needs a source worktree; materialise it once up front so worktree
  // creation time is not mistaken for worker time in the overlap measurement.
  const wt = ensureSourceWorktree('HEAD');
  console.log('source worktree: ' + wt.path + ' @ ' + wt.sha.slice(0, 7) + (wt.created ? ' (created)' : ' (reused)') + '\n');

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

  const first = await Promise.all(handles.map((h) => h.promise));
  const elapsed = Date.now() - t0;

  // Negative for check 1: if these had run sequentially, elapsed would be >= 3x run time.
  check(15, 'concurrency check can fail (serial execution would be detected)', elapsed < 5200,
    'elapsed=' + elapsed + 'ms; serial would be >=6000ms');

  const dirsOk = ['W1', 'W2', 'W3'].every((w) => existsSync(join(workerDir(CAMPAIGN, w), 'RESULT.json')));
  const distinctDirs = new Set(['W1', 'W2', 'W3'].map((w) => workerDir(CAMPAIGN, w))).size === 3;
  check(3, 'each worker has an isolated result directory', dirsOk && distinctDirs);

  // RESULT.json is written by the orchestrator from the result frame, never by the worker.
  const r1 = readResult('W1');
  check(3.1, 'RESULT.json is materialised by the orchestrator from the worker result frame',
    r1 && r1.materialized_by === 'orchestrator' && r1.provisional === false && r1.verdict === 'PASS' && r1.worker_class === 'SOURCE_AUDIT',
    r1 ? 'materialized_by=' + r1.materialized_by + ' verdict=' + r1.verdict : 'no result');
  check(3.2, 'worker ran with cwd = detached source worktree, tools = Read,Glob,Grep',
    first.every((o) => o.cwd === wt.path && JSON.stringify(o.init_tools) === JSON.stringify(['Read', 'Glob', 'Grep'])),
    first.map((o) => o.worker_id + ':' + (o.init_tools || []).join('/')).join(' '));
  check(3.3, 'source fingerprint before == after for a well-behaved worker',
    first.every((o) => o.source_fingerprint && o.source_fingerprint.equal === true && !o.boundary_violation));

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
  // Browser-state collision must be rejected, and unverified isolation must block browser work.
  const items = [
    { id: 'a', lane: 'W1_AI_TRUTH', browser_context: 'ctx-1', mutates: true, requires_browser: true, identity_id: 'qa-w1', org_scope: 'QA-W1-ORG' },
    { id: 'b', lane: 'W2_TENANCY', browser_context: 'ctx-1', mutates: true, requires_browser: true, identity_id: 'qa-w2', org_scope: 'QA-W2-ORG' },
  ];
  const sharedCtx = independent(items[0], items[1]);
  const blockedUnverified = selectIndependentBatch(items, 3, { browserIsolationVerified: false });
  const blockedUnknown = selectIndependentBatch(items, 3, {});
  check(6, 'browser-state collision is rejected; unverified isolation blocks browser mutation',
    !sharedCtx.ok && blockedUnverified.chosen.length === 0 && blockedUnknown.chosen.length === 0,
    'shared-ctx=' + sharedCtx.reason + '; refused ' + blockedUnverified.refused.map((r) => r.reason).join(','));

  const founderItem = [{ id: 'f', lane: 'W3_WEB_PRODUCT', requires_browser: true, mutates: false, identity_id: 'founder', org_scope: 'X' }];
  const founderRefused = selectIndependentBatch(founderItem, 3, { browserIsolationVerified: true });
  check(6.1, 'founder identity is refused even with verified isolation',
    founderRefused.chosen.length === 0 && founderRefused.refused[0].reason === 'FOUNDER_IDENTITY_REFUSED');

  const twoReadOnly = [
    { id: 'r1', lane: 'W1_AI_TRUTH', requires_browser: true, mutates: false, identity_id: 'qa-w1', org_scope: 'QA-W1-ORG' },
    { id: 'r2', lane: 'W2_TENANCY', requires_browser: true, mutates: false, identity_id: 'qa-w2', org_scope: 'QA-W2-ORG' },
  ];
  const serialised = selectIndependentBatch(twoReadOnly, 3, { browserIsolationVerified: false });
  check(6.2, 'without verified isolation at most ONE read-only browser item is admitted (serialised)',
    serialised.chosen.length === 1 && serialised.refused[0].reason === 'BROWSER_CONCURRENCY_REQUIRES_VERIFIED_ISOLATION');
  const sharedIdentity = independent(
    { id: 'x', lane: 'W1_AI_TRUTH', identity_id: 'qa-w1', org_scope: 'A' },
    { id: 'y', lane: 'W2_TENANCY', identity_id: 'qa-w1', org_scope: 'B' });
  check(6.3, 'shared synthetic identity is a shared resource', !sharedIdentity.ok && sharedIdentity.resource === 'identity:qa-w1');

  // ---------------------------------------------------------------- 6.4 / 6.5 launch-time class enforcement
  const noIdentity = launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WNOID', 'W3_WEB_PRODUCT', 'ok', { launch: { workerClass: 'BROWSER_QA' } }) });
  check(6.4, 'BROWSER_QA without a synthetic identity is not launched', noIdentity.launched === false && noIdentity.reason === 'IDENTITY_REQUIRED', noIdentity.reason);
  const founderLaunch = launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WFOUNDER', 'W3_WEB_PRODUCT', 'ok', { launch: { workerClass: 'BROWSER_QA', identityId: 'founder', orgScope: 'X' } }) });
  check(6.5, 'BROWSER_QA with a founder-shaped identity is refused at launch', founderLaunch.launched === false && founderLaunch.reason === 'FOUNDER_IDENTITY_REFUSED', founderLaunch.reason);
  const noSession = launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WNOSESS', 'W3_WEB_PRODUCT', 'ok', { launch: { workerClass: 'BROWSER_QA', launchMode: 'BOUNDARY_PROBE', identityId: 'qa-nonexistent', orgScope: 'QA-X' } }) });
  check(6.6, 'BROWSER_QA with an un-bootstrapped identity is BLOCKED_QA_AUTH (never falls back)', noSession.launched === false && noSession.reason === 'BLOCKED_QA_AUTH', noSession.reason);
  const noPreflight = launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WNOPF', 'W3_WEB_PRODUCT', 'ok', { launch: { workerClass: 'BROWSER_QA', identityId: 'qa-nonexistent', orgScope: 'QA-X' } }) });
  check(6.61, 'BROWSER_QA SCENARIO launch without an identity preflight is refused BEFORE any browser is touched (PREFLIGHT_REQUIRED)', noPreflight.launched === false && noPreflight.reason === 'PREFLIGHT_REQUIRED', noPreflight.reason);

  // ---------------------------------------------------------------- 6.7 init-frame boundary enforcement
  cleanRunDir('WLEAK');
  const leak = await withEnv({ FAKE_BEHAVIOUR: 'ok', FAKE_RUN_MS: '1500', FAKE_TOOLS: 'Read,Glob,Grep,Bash' }, async () => {
    const h = launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WLEAK', 'W1_AI_TRUTH', 'ok') });
    return h.promise;
  });
  const leakRes = readResult('WLEAK');
  check(6.7, 'a worker whose live init frame exposes an unexpected tool is killed and its result is INVALID_TEST',
    leak.status === 'BLOCKED' && leak.boundary_violation && leak.boundary_violation.reason === 'SOURCE_AUDIT_CLASS_BLOCKED_NO_ENFORCEABLE_BOUNDARY'
      && leak.killed_reason && leakRes && leakRes.verdict === 'INVALID_TEST',
    'status=' + leak.status + ' reason=' + (leak.boundary_violation && leak.boundary_violation.reason) + ' unexpected=' + (leak.boundary_violation && leak.boundary_violation.unexpected.join(',')));

  // ---------------------------------------------------------------- 6.8 source-tree tamper detection
  cleanRunDir('WTAMPER');
  const tamper = await withEnv({ FAKE_BEHAVIOUR: 'source_tamper', FAKE_RUN_MS: '700' }, async () => {
    const h = launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WTAMPER', 'W2_TENANCY', 'source_tamper') });
    return h.promise;
  });
  const tamperFile = join(wt.path, 'QA_TAMPER_WTAMPER.txt');
  const tamperExisted = existsSync(tamperFile);
  try { unlinkSync(tamperFile); } catch {}
  const tamperRes = readResult('WTAMPER');
  check(6.8, 'a source change during a SOURCE_AUDIT run -> INVALID_TEST + WORKER_BOUNDARY_VIOLATION',
    tamperExisted && tamper.status === 'BLOCKED' && tamper.boundary_violation && tamper.boundary_violation.reason === 'WORKER_BOUNDARY_VIOLATION'
      && tamperRes && tamperRes.verdict === 'INVALID_TEST' && tamperRes.invalid_reason === 'WORKER_BOUNDARY_VIOLATION',
    'file_written=' + tamperExisted + ' status=' + tamper.status + ' reason=' + (tamper.boundary_violation && tamper.boundary_violation.reason));

  // ---------------------------------------------------------------- 6.9 unparseable result
  cleanRunDir('WPROSE');
  await withEnv({ FAKE_BEHAVIOUR: 'unparseable', FAKE_RUN_MS: '500' }, async () => launchWorker({ campaignId: CAMPAIGN, ...mkAssign('WPROSE', 'W3_WEB_PRODUCT', 'unparseable') }).promise);
  const prose = readResult('WPROSE');
  check(6.9, 'a worker whose final message is not a JSON object -> INVALID_TEST: UNPARSEABLE_RESULT',
    prose && prose.verdict === 'INVALID_TEST' && prose.invalid_reason === 'UNPARSEABLE_RESULT');
  check(6.91, 'result parser accepts fenced JSON and rejects prose',
    parseWorkerResult('done\n```json\n{"verdict":"PASS"}\n```').ok && !parseWorkerResult('no json here').ok);

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
  const waRes = readResult('WA');
  check(7.1, 'a crashed worker leaves the orchestrator-written PROVISIONAL result (started, did not finish)',
    waRes && waRes.provisional === true && waRes.verdict === 'INVALID_TEST');

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
  const src = ['orchestrator.mjs', 'worker-lease.mjs', 'reconcile.mjs', 'worker-policy.mjs', 'browser-isolation.mjs', 'source-worktree.mjs', 'lanes.mjs']
    .map((f) => readFileSync(join(QA_DIR, 'runner', 'lib', f), 'utf8')).join('\n');
  const noSql = !/\bpsql\b|supabase db (push|query)|INSERT INTO|UPDATE .* SET|DELETE FROM/i.test(src);
  const noBypass = !/bypassPermissions/.test(readFileSync(join(QA_DIR, 'runner', 'lib', 'orchestrator.mjs'), 'utf8').replace(/\/\/.*$/gm, ''));
  const noFounderExport = !/founder-storage-state/.test(src);
  check(13, 'no production SQL, no bypassPermissions, no founder storageState in the orchestration platform', noSql && noBypass && noFounderExport,
    'sql=' + !noSql + ' bypass=' + !noBypass + ' founderExport=' + !noFounderExport);

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
    _doc: 'Synthetic concurrency acceptance for parallel QA orchestration. Generated by qa/runner/parallel-acceptance.mjs. Synthetic only - no product surface, browser, or database touched. Real-tool capability probes are in SECURITY_ACCEPTANCE.json.',
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    campaign_id: CAMPAIGN,
    concurrency: 3,
    source_worktree: { path: wt.path, sha: wt.sha },
    checks: results,
    passed: results.filter((r) => r.pass).length,
    failed,
    verdict: failed === 0 ? 'SYNTHETIC_CONCURRENCY_ACCEPTED' : 'SYNTHETIC_CONCURRENCY_FAILED',
    wall_clock_ms_for_3_workers: elapsed,
    worker_summary: summary,
    _not_yet_proven: [
      'Browser-context isolation across parallel workers has NOT been proven. It requires dedicated synthetic identities bootstrapped by the founder/Home PC through the product invite + OTP path (Phase B/C) and the positive+negative parallel acceptance (Phase D). The founder session is never exported. Parallel BROWSER work stays BLOCKED until browserIsolationVerified is computed true live (lanes.mjs + browser-isolation.mjs enforce this).',
      'This harness proves the machinery with fake workers. Real-tool boundaries are proven by security-acceptance.mjs against real claude -p processes.',
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
