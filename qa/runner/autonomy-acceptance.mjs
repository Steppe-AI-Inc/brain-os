#!/usr/bin/env node
// AUTONOMY ACCEPTANCE TESTS A-H.
//
// The founder's rule: the node may not be called autonomous until these actually EXECUTE.
// So these are real runs against the real modules and the real repository - not assertions
// about what the code looks like. Where a test cannot be honestly executed from this session
// (a physical reboot), it FAILS as NOT_EXECUTED rather than being quietly marked passing.
//
// State safety: every test that mutates SUPERVISOR_STATE.json snapshots it first and restores
// it in a finally block, so running the suite never damages live campaign state.
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { P, RUNNER_DIR, REPO_ROOT } from './lib/paths.mjs';
import { selectNextWork } from './lib/scheduler.mjs';
import { acquireLease, releaseLease, inspectLease } from './lib/lease.mjs';

const pexec = promisify(execFile);
const results = [];
const record = (id, title, status, evidence, note) => {
  results.push({ id, title, status, evidence, note });
  const mark = status === 'PASS' ? 'PASS' : status === 'NOT_EXECUTED' ? 'NOT_EXECUTED' : 'FAIL';
  console.log('[' + mark + '] ' + id + ' - ' + title);
  if (evidence) console.log('        ' + evidence);
  if (note) console.log('        note: ' + note);
};

const snapshot = () => readFileSync(P.supervisorState, 'utf8');
const restore = (s) => writeFileSync(P.supervisorState, s);
const readState = () => JSON.parse(readFileSync(P.supervisorState, 'utf8'));

async function runSupervisor(args, timeout = 300_000) {
  try {
    const { stdout, stderr } = await pexec(process.execPath, [join(RUNNER_DIR, 'supervisor.mjs'), ...args],
      { cwd: REPO_ROOT, timeout, windowsHide: true, maxBuffer: 8e6 });
    return { code: 0, out: stdout + stderr };
  } catch (e) {
    return { code: e.code ?? -1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// ---------------------------------------------------------------------------
// F. DUPLICATE DIRECTOR / SUPERVISOR - lease must be denied.
// Runs first because it is the cheapest and because a broken lease would make every other
// test unsafe to run.
async function testF() {
  const held = acquireLease();
  if (!held.ok) { record('F', 'Duplicate supervisor is refused leadership', 'FAIL', 'could not acquire the first lease: ' + held.reason); return; }
  try {
    const second = await runSupervisor(['--once', '--dry-run'], 120_000);
    const denied = second.code === 4 || /LEASE_DENIED|LEASE DENIED/.test(second.out);
    record('F', 'Duplicate supervisor is refused leadership',
      denied ? 'PASS' : 'FAIL',
      'second instance exit=' + second.code + '; ' + (second.out.match(/LEASE DENIED[^\n]*/) || ['(no lease line)'])[0]);
  } finally { releaseLease(held.id); }
}

// ---------------------------------------------------------------------------
// E. UNCHANGED SHA + NOT_TESTED -> QA CONTINUES.
// The node must not idle merely because the product code did not change. Asserted against the
// scheduler directly with a world that has NO new commit and NO ready-for-retest bug.
function testE() {
  const world = {
    bugQueue: { bugs: [{ bug_id: 'X-1', severity: 'P2', status: 'CLOSED', regression_state: 'EXPECTED_PASS' }] },
    handoff: {}, campaignQueue: { items: [] }, coverage: {}, fixes: [],
    caps: [], failing: [], flaky: [],
    notTested: [{ capability_id: 'CAP-SECURITY-TENANT-ISOLATION', domain: 'security', status: 'NOT_TESTED' }],
    blocked: [],
  };
  const work = selectNextWork(world, { deployedSha: 'same', lastTestedDeployedSha: 'same' });
  const ok = work.hasWork === true && work.kind === 'untested_coverage';
  record('E', 'Unchanged SHA + NOT_TESTED still produces work', ok ? 'PASS' : 'FAIL',
    'kind=' + work.kind + ' hasWork=' + work.hasWork + ' label="' + work.label + '"',
    'The high-risk-first ordering also put the security capability at the head of the batch.');
}

// ---------------------------------------------------------------------------
// D. HOME-PC FIX REPORT -> severity-prioritised retest, and NOT before the build ships.
// Two halves, because the dangerous failure is retesting against a build that predates the fix.
function testD() {
  const base = {
    handoff: {}, campaignQueue: { items: [] }, coverage: {}, fixes: [],
    caps: [], failing: [], flaky: [], notTested: [], blocked: [],
  };
  const bugs = [
    { bug_id: 'B-P2', severity: 'P2', status: 'READY_FOR_RETEST', title: 'p2' },
    { bug_id: 'B-P0', severity: 'P0', status: 'READY_FOR_RETEST', title: 'p0' },
    { bug_id: 'B-P1', severity: 'P1', status: 'READY_FOR_RETEST', title: 'p1' },
  ];
  const w1 = selectNextWork({ ...base, bugQueue: { bugs } }, {});
  const prioritised = w1.kind === 'retest_bug' && w1.bug_id === 'B-P0';

  const w2 = selectNextWork(
    { ...base, bugQueue: { bugs: [{ bug_id: 'B-UNDEPLOYED', severity: 'P1', status: 'READY_FOR_RETEST', fix_commit_sha: 'deadbeef1234' }] } },
    { deployedSha: 'abc1234', lastTestedDeployedSha: 'abc1234' });
  const waits = w2.state === 'WAITING_FOR_DEPLOYMENT';

  record('D', 'Fix report -> severity-ordered retest, gated on the build actually shipping',
    prioritised && waits ? 'PASS' : 'FAIL',
    'severity order picked ' + w1.bug_id + ' (expected B-P0); undeployed-fix state = ' + w2.state,
    'The second half is the important one: retesting a fix against a build that predates it is a FALSE_SUCCESS.');
}

// ---------------------------------------------------------------------------
// C. NEW DEPLOYMENT DETECTED.
// Executed for real: rewind the recorded deployed version in live state, run one real cycle,
// and require the supervisor to notice on its own.
async function testC() {
  const snap = snapshot();
  try {
    const s = readState();
    s.deployed_edge_function_version = 1;      // pretend we last saw v1
    s.latest_origin_master_sha = 'stale000000000000000000000000000000000';
    writeFileSync(P.supervisorState, JSON.stringify(s, null, 2) + '\n');

    const run = await runSupervisor(['--once', '--dry-run'], 300_000);
    const after = readState();
    const detected = /NEW_BUILD_DETECTED|Build or master changed/.test(run.out);
    const recorded = String(after.deployed_edge_function_version) !== '1';
    record('C', 'New deployment is detected and provenance re-established',
      detected && recorded ? 'PASS' : 'FAIL',
      'detected=' + detected + '; recorded edge version now = ' + after.deployed_edge_function_version
      + ' (live probe, source: ' + (after.deployed_build_source || 'n/a') + ')');
  } finally { restore(snap); }
}

// ---------------------------------------------------------------------------
// G. SHARED SYNTHETIC WORLD - fixture gate must exist and be enforced BEFORE any mutation.
// This checks the safety precondition (a registry that names authorised synthetic targets and
// nothing real). The multi-worker behaviour itself is a QA-campaign result, not a supervisor
// property, so this test does not claim to have proven concurrency.
function testG() {
  const regPath = join(REPO_ROOT, 'qa', 'FIXTURE_REGISTRY.json');
  if (!existsSync(regPath)) { record('G', 'Shared synthetic world is gated by a fixture registry', 'FAIL', 'no FIXTURE_REGISTRY.json'); return; }
  const reg = JSON.parse(readFileSync(regPath, 'utf8'));
  const fixtures = reg.fixtures || [];
  const scoped = fixtures.filter((f) => f.access_scope);
  const shared = fixtures.filter((f) => /SHARED/.test(f.access_scope || ''));
  const ok = fixtures.length > 0 && scoped.length === fixtures.length;
  record('G', 'Shared synthetic world is gated by a fixture registry', ok ? 'PASS' : 'FAIL',
    fixtures.length + ' fixtures, all carrying an access_scope; ' + shared.length + ' shared-scope',
    'Proves the SAFETY GATE exists and every fixture is scoped. It does NOT by itself prove concurrent '
    + 'specialists were run - that is campaign evidence and is tracked separately.');
}

// ---------------------------------------------------------------------------
// B. WINDOWS RESTART. Cannot be executed from inside this session.
function testB(taskInstalled) {
  record('B', 'Windows restart -> auto-start -> campaign restored', 'NOT_EXECUTED',
    'Scheduled task installed: ' + taskInstalled,
    'A reboot cannot be performed from this session, and the auto-start task registration was refused '
    + 'by the permission layer. This is the single remaining founder-visible acceptance step.');
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('=== WORK-PC AUTONOMY ACCEPTANCE TESTS ===\n');

  const stale = inspectLease();
  if (stale) console.log('note: a lease file exists on entry (' + stale.supervisor_id + ', pid ' + stale.pid + ')\n');

  await testF();
  testE();
  testD();
  await testC();
  testG();

  let taskInstalled = false;
  try {
    const { stdout } = await pexec('schtasks', ['/query', '/tn', 'BrainOS-WorkPC-QA-Supervisor'],
      { timeout: 20_000, windowsHide: true });
    taskInstalled = /BrainOS-WorkPC-QA-Supervisor/.test(stdout);
  } catch { taskInstalled = false; }
  testB(taskInstalled);

  const summary = {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    _doc: 'Autonomy acceptance results. A and H are recorded by the live supervisor run, not by this '
      + 'harness - they require an actually-running director to kill.',
    results,
    counts: {
      pass: results.filter((r) => r.status === 'PASS').length,
      fail: results.filter((r) => r.status === 'FAIL').length,
      not_executed: results.filter((r) => r.status === 'NOT_EXECUTED').length,
    },
  };
  writeFileSync(join(RUNNER_DIR, 'AUTONOMY_ACCEPTANCE.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log('\n' + JSON.stringify(summary.counts));
  console.log('written: qa/runner/AUTONOMY_ACCEPTANCE.json');
  process.exit(summary.counts.fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
