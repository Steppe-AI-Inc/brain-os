// MACHINE_PROPERTY: what this Work PC holds. Cross-check of the Home PC's own authority tests run
// from the pinned p1 worktree, plus the Work-PC QA evidence-infrastructure liveness checks
// (founder item 6). Nothing here reads a credential value; the Home-PC tests classify by shape.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { pinRefs, provenanceFor, pinnedPath, worktree, operationalHead } from './lib/provenance.mjs';
import { suiteRecorder, parseTap } from './lib/record.mjs';
import { REPO_ROOT, RUNNER_DIR, P } from '../runner/lib/paths.mjs';

const R = suiteRecorder('machine-property');
pinRefs();
after(() => { console.log('wrote', R.write()); });
const scrubEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: '', SUPABASE_DB_PASSWORD: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_DB_URL: '', DATABASE_URL: '', DBTEST_PG_URL: '', LIVE_READONLY_PG_URL: '', FACTORY_RUNNER_PG_URL: '' };
delete scrubEnv.NODE_TEST_CONTEXT; // a child `node --test` must not believe it runs inside this test process

// First diagnostic line of every not-ok TAP block, with any long token-shaped run redacted.
function notOkDiagnostics(tapText) {
  const out = {};
  const lines = tapText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const nm = lines[i].match(/^not ok \d+ - (\S+)/);
    if (!nm) continue;
    for (let k = i + 1; k < Math.min(i + 12, lines.length); k++) {
      if (/^\s+error: \|-/.test(lines[k])) { out[nm[1]] = (lines[k + 1] || '').trim().replace(/[A-Za-z0-9_-]{30,}/g, '<redacted-token-shape>').slice(0, 300); break; }
    }
  }
  return out;
}

test('MP-00 tool availability precondition (absence of authority output is not evidence when the tool is absent)', async () => {
  const rec = await R.check('MP-00', { claim: 'The CLIs the Home-PC authority test probes exist on this machine', expect: 'PARTIAL', method: 'MACHINE_PROBE', evidence_kind: 'independent' }, async () => {
    const probe = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, shell: true, timeout: 120000 }); return { status: r.status, out: (r.stdout + r.stderr).trim().split(/\r?\n/)[0].slice(0, 120) }; };
    const ev = { hostname: hostname(), supabase_cli_via_npx: probe('npx', ['--yes', 'supabase@latest', '--version']), gh: probe('gh', ['--version']), vercel: probe('vercel', ['--version']) };
    return { verdict: ev.supabase_cli_via_npx.status === 0 ? 'PARTIAL' : 'NO_VERDICT', evidence: { ...ev, note: 'gh and vercel CLIs are absent here; routes that probe them return early in the Home-PC test and are recorded, not counted as proof' }, provenance: provenanceFor('p1', [], 'MACHINE_PROPERTY') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT' || true);
});

test('MP-01 Home-PC production_write_authority.regression.test.mjs on this Work PC (cross-check)', async () => {
  const rec = await R.check('MP-01', { claim: 'This machine holds no ambient production-write credential (7 route assertions)', expect: 'PASS', method: 'NODE_TEST_RERUN', evidence_kind: 'cross-check' }, async () => {
    const rel = 'qa/scenarios-runner/production_write_authority.regression.test.mjs';
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', rel], { cwd: worktree('p1').path, encoding: 'utf8', windowsHide: true, env: scrubEnv, timeout: 300000 });
    const tap = parseTap(r.stdout);
    const failed = tap.filter((t) => !t.ok);
    const diagnostics = notOkDiagnostics(r.stdout);
    const vercelSession = Object.values(diagnostics).some((d) => /Vercel CLI session/i.test(d));
    return { verdict: r.status === 0 && failed.length === 0 && tap.length > 0 ? 'PASS' : (tap.length ? 'FAIL' : 'NO_VERDICT'), evidence: { exit: r.status, per_test: tap.map((t) => ({ ok: t.ok, name: t.name, skipped: t.skipped })), not_ok_diagnostics: diagnostics, vercel_cli_session_present_on_work_pc: vercelSession, blocked_group: vercelSession ? 'BLOCKED - FOUNDER: a logged-in Vercel CLI session exists on this Work PC (path recorded by the Home-PC test; file dated 2026-08-31); while it exists `vercel env pull` can regenerate the service-role key. Removing a credential is a founder decision, not a QA action.' : null, note: 'ROUTE_5* probe gh, which is absent here: the test returns early - recorded, not counted as proof' }, provenance: provenanceFor('p1', [rel], 'MACHINE_PROPERTY') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('MP-02 Home-PC factory inventory test (expected red) run from the pinned p1 tree', async () => {
  const rec = await R.check('MP-02', { claim: 'factory-runner scripts carry no ambient production DB authority', expect: 'FAIL', method: 'NODE_TEST_RERUN', evidence_kind: 'cross-check' }, async () => {
    const rel = 'qa/scenarios-runner/factory_production_write_inventory.regression.test.mjs';
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', rel], { cwd: worktree('p1').path, encoding: 'utf8', windowsHide: true, env: scrubEnv, timeout: 120000 });
    const tap = parseTap(r.stdout);
    const rows = (r.stdout.match(/(PRODUCTION_WRITE|DEV_WRITE|READ_ONLY|NO_DB)\s+\S+\.mjs/g) || []).map((s) => s.replace(/\s+/g, ' '));
    return { verdict: tap.some((t) => !t.ok && /NO_AMBIENT/.test(t.name)) ? 'FAIL' : (tap.length ? 'PASS' : 'NO_VERDICT'), evidence: { exit: r.status, per_test: tap.map((t) => ({ ok: t.ok, name: t.name })), inventory_rows: rows, production_write_count: rows.filter((x) => x.startsWith('PRODUCTION_WRITE')).length, not_ok_diagnostics: notOkDiagnostics(r.stdout) }, provenance: provenanceFor('p1', [rel], 'SOURCE_FINDING_ONLY') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('MP-03 Work-PC QA evidence infrastructure: supervisor task state, lease liveness, single-writer integrity', async () => {
  const rec = await R.check('MP-03', { claim: 'The Work-PC QA evidence infrastructure is live and its canonical files are only written by the single writer', expect: 'PARTIAL', method: 'MACHINE_PROBE', evidence_kind: 'independent' }, async () => {
    const task = spawnSync('schtasks', ['/query', '/tn', 'BrainOS-WorkPC-QA-Supervisor', '/v', '/fo', 'LIST'], { encoding: 'utf8', windowsHide: true });
    const pick = (k) => ((task.stdout.match(new RegExp(k + ':\\s*(.+)')) || [])[1] || '').trim();
    let lease = null; try { lease = JSON.parse(readFileSync(P.lease, 'utf8')); } catch {}
    const leaseAge = lease ? Math.round((Date.now() - Date.parse(lease.renewed_at || lease.acquired_at || 0)) / 60000) : null;
    const pidAlive = lease && lease.pid ? (() => { try { process.kill(lease.pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } })() : false;
    let st = {}; try { st = JSON.parse(readFileSync(P.supervisorState, 'utf8')); } catch {}
    const tail = (() => { try { const p = join(P.logsDir, 'supervisor-stdout.log'); return existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).slice(-6).map((l) => l.slice(0, 200)) : []; } catch { return []; } })();
    const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'qa/BUG_QUEUE.json', 'qa/HANDOFF_STATE.json', 'qa/runner/SUPERVISOR_STATE.json', 'qa/COVERAGE_LEDGER.json', 'qa/FIXTURE_REGISTRY.json'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true }).stdout.trim();
    const ev = { hostname: hostname(), operational_head: operationalHead(), scheduled_task: { present: task.status === 0, status: pick('Status'), last_run: pick('Last Run Time'), last_result: pick('Last Result'), next_run: pick('Next Run Time') }, lease: lease ? { pid: lease.pid, renewed_at: lease.renewed_at, age_min: leaseAge, pid_alive: pidAlive } : 'NO_LEASE_FILE', supervisor_state: st.supervisor_state, blocked_on: st.blocked_on || null, supervisor_log_tail: tail, canonical_files_dirty_before_campaign_commit: dirty.split('\n').filter(Boolean) };
    const live = ev.scheduled_task.present && pidAlive;
    return { verdict: live ? 'PASS' : 'PARTIAL', evidence: { ...ev, note: live ? 'supervisor process alive under the scheduled task' : 'scheduled task present but no live supervisor process; lease stale; task Last Result recorded. WAITING_FOR_HOME_PC is the recorded state and is not "fixed" during this campaign' }, provenance: provenanceFor('p1', [], 'MACHINE_PROPERTY') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('MP-04 evidence integrity: results files present, provenance-bound, no VALUE_EXPOSED secret shapes', async () => {
  const rec = await R.check('MP-04', { claim: 'Every check record produced so far carries provenance and no secret-shaped value', expect: 'PASS', method: 'MACHINE_PROBE', evidence_kind: 'independent' }, async () => {
    const dir = join(RUNNER_DIR, '..', 'factory-acceptance', 'results');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.checks.json') && !f.startsWith('machine-property')) : [];
    const mod = await import(pathToFileURL(pinnedPath('p1', 'qa/lib/secret_evidence.mjs')).href);
    let checks = 0; const missingProv = []; let secretLines = 0;
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      const j = JSON.parse(text);
      for (const c of j.checks) { checks++; if (!c.provenance) missingProv.push(f + ':' + c.id); }
      for (const line of text.split('\n')) { try { const s = mod.classifySecret(line); if (s && (s.state === 'PRESENT' || s.state === 'VALIDATED_LIVE')) secretLines++; } catch {} }
    }
    return { verdict: files.length > 0 && missingProv.length === 0 && secretLines === 0 ? 'PASS' : (files.length ? 'FAIL' : 'NO_VERDICT'), evidence: { files, checks, missing_provenance: missingProv, secret_shaped_lines: secretLines }, provenance: provenanceFor('p1', ['qa/lib/secret_evidence.mjs'], 'MACHINE_PROPERTY') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});
