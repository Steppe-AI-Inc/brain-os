#!/usr/bin/env node
// QA Orchestrator entry point - the single writer, running N workers in parallel.
//
// Usage:
//   node qa/runner/orchestrate.mjs status                 show live worker table
//   node qa/runner/orchestrate.mjs recover  <campaign>    rebuild worker truth after a restart
//   node qa/runner/orchestrate.mjs reconcile <campaign>   read worker evidence, decide verdicts
//   node qa/runner/orchestrate.mjs run <campaign> <plan.json>   run one batch
//
// The Orchestrator is the ONLY process permitted to write canonical QA files. Workers write
// evidence into their own run directory and nothing else. That boundary is what makes the
// campaign parallelisable without making the ledger a function of timing.
//
// Plan items carry `worker_class` (BROWSER_QA | SOURCE_AUDIT, default SOURCE_AUDIT), and for
// BROWSER_QA a dedicated synthetic `identity_id` and `org_scope`. Browser concurrency is admitted
// only when browserIsolationVerified is computed true LIVE (qa/runner/lib/browser-isolation.mjs).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { P } from './lib/paths.mjs';
import { runBatch, recoverWorkers, summariseWorkers } from './lib/orchestrator.mjs';
import { reconcile, writeReconciliation } from './lib/reconcile.mjs';
import { selectIndependentBatch, LANES } from './lib/lanes.mjs';
import { schedulingContext, isolationStatusSummary } from './lib/browser-isolation.mjs';
import { runsDir, listLeases } from './lib/worker-lease.mjs';
import { WORK_PC_SQL_BLOCKED_REASON } from './lib/scheduler.mjs';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const MAX_WORKERS = Number(process.env.QA_MAX_WORKERS || 3);

function readSupervisorState() {
  try { return JSON.parse(readFileSync(P.supervisorState, 'utf8')); } catch { return {}; }
}

/** Publish worker observability into SUPERVISOR_STATE. Orchestrator-only write. */
export function publishState(campaignId, isolation = null) {
  const st = readSupervisorState();
  const sum = summariseWorkers(campaignId);
  const iso = isolation || isolationStatusSummary();
  st.qa_orchestrator_pid = process.pid;
  st.active_worker_count = sum.active_worker_count;
  st.max_worker_count = MAX_WORKERS;
  st.workers = sum.workers;
  st.browser_isolation_verified = iso.verified === true;
  st.browser_isolation_reason = iso.reason;
  st.production_sql = WORK_PC_SQL_BLOCKED_REASON;
  st.last_heartbeat = nowIso();
  writeFileSync(P.supervisorState, JSON.stringify(st, null, 2) + '\n');
  return st;
}

function renderStatus(campaignId) {
  const sum = summariseWorkers(campaignId);
  const iso = isolationStatusSummary();
  const lines = [];
  lines.push('QA ORCHESTRATOR    ' + (process.pid ? 'ONLINE' : 'OFFLINE'));
  lines.push('WORKERS             ' + sum.active_worker_count + ' / ' + MAX_WORKERS);
  lines.push('');
  for (const w of sum.workers) {
    const lane = LANES[w.lane] ? LANES[w.lane].label : (w.lane || '-');
    lines.push(
      (w.worker_id || '?').padEnd(4) + ' ' +
      String(lane).padEnd(18) + ' ' +
      String(w.worker_class || '-').padEnd(13) +
      String(w.state || '-').padEnd(16) +
      (w.pid ? ' pid=' + w.pid : '') +
      (w.identity_id ? '  id=' + w.identity_id : '') +
      (w.current_scenario ? '  ' + w.current_scenario : '') +
      (w.blocked_reason ? '  [' + String(w.blocked_reason).slice(0, 60) + ']' : ''));
  }
  if (!sum.workers.length) lines.push('(no workers registered for ' + campaignId + ')');
  lines.push('');
  lines.push('BROWSER ISOLATION   NOT VERIFIED (computed per batch) - ' + iso.reason);
  lines.push('                    parallel browser work BLOCKED; SOURCE_AUDIT work proceeds');
  lines.push('PRODUCTION SQL      ' + WORK_PC_SQL_BLOCKED_REASON);
  const leases = listLeases(campaignId).filter((l) => l.live);
  lines.push('LIVE LEASES         ' + leases.length + (leases.length ? '  ' + leases.map((l) => l.key + '@' + l.worker_id).join(', ') : ''));
  return lines.join('\n');
}

async function cmdRun(campaignId, planPath) {
  if (!existsSync(planPath)) { console.error('plan not found: ' + planPath); process.exit(2); }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const items = (plan.items || []).map((it) => ({ ...it, campaign_id: campaignId }));
  const ctx = schedulingContext(items);
  console.log('browser isolation: ' + (ctx.browserIsolationVerified ? 'VERIFIED (live binding matches proof)' : 'NOT VERIFIED - ' + ctx.browserIsolation.reason));

  const { chosen, refused } = selectIndependentBatch(items, MAX_WORKERS, ctx);
  console.log('scheduling: ' + chosen.length + ' chosen, ' + refused.length + ' refused');
  for (const r of refused) console.log('  REFUSED ' + r.item + ' :: ' + r.reason + (r.resource ? ' (' + r.resource + ')' : ''));
  if (!chosen.length) {
    console.log('nothing independently schedulable; not faking concurrency.');
    publishState(campaignId, ctx.browserIsolation);
    return;
  }

  mkdirSync(runsDir(campaignId), { recursive: true });
  const assignments = chosen.map((item) => ({
    workerId: item.worker_id,
    lane: item.lane,
    workerClass: item.worker_class || (item.requires_browser ? 'BROWSER_QA' : 'SOURCE_AUDIT'),
    identityId: item.identity_id || null,
    orgScope: item.org_scope || null,
    expectedMarkers: item.expected_markers || [],
    allowedOrgs: item.allowed_orgs || [],
    launchMode: item.launch_mode || 'SCENARIO',
    sourceRef: item.source_ref || 'HEAD',
    baseRef: item.base_ref || null,
    directive: item.directive,
    assignedCapabilities: item.capabilities || [],
    assignedScenarios: item.scenarios || [item.scenario_id].filter(Boolean),
    fixtureNamespace: item.fixture_namespace || ('campaign/' + campaignId + '/' + item.worker_id),
    authorizedFixtureIds: item.fixtures || [],
    browserContextId: item.browser_context || null,
    maxBudgetUsd: item.max_budget_usd || 6,
  }));

  publishState(campaignId, ctx.browserIsolation);
  const out = await runBatch(campaignId, assignments, { maxWorkers: MAX_WORKERS });
  for (const o of out) {
    console.log(o.worker_id + ' -> ' + (o.outcome && o.outcome.status) + (o.pid ? ' (pid ' + o.pid + ')' : '') + (o.launched ? '' : ' [NOT LAUNCHED: ' + (o.outcome && o.outcome.blocked_reason) + ']'));
  }

  const rec = reconcile(campaignId);
  const path = writeReconciliation(campaignId, rec);
  console.log('reconciled -> ' + path);
  console.log('  accepted: ' + rec.accepted.length + '  conflicts: ' + rec.conflicts.length + '  problems: ' + rec.problems.length);
  for (const c of rec.conflicts) console.log('  CONFLICTING_EVIDENCE ' + c.subject + ' :: ' + c.verdicts.join(' vs ') + ' -> ' + c.resolution);
  publishState(campaignId, ctx.browserIsolation);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const campaign = a || readSupervisorState().campaign_id || 'C002';

  if (cmd === 'status') { console.log(renderStatus(campaign)); return; }

  if (cmd === 'recover') {
    const r = recoverWorkers(campaign);
    console.log('recovered ' + r.recovered.length + ' worker(s), reaped ' + r.reaped.length + ' dead lease(s)');
    for (const x of r.recovered) console.log('  ' + x.worker_id + ': ' + x.was + ' -> ' + x.now + ' (pid_alive=' + x.pid_alive + ')');
    for (const x of r.reaped) console.log('  reaped lease ' + x.key + ' from ' + x.worker_id);
    publishState(campaign);
    console.log('\n' + renderStatus(campaign));
    return;
  }

  if (cmd === 'reconcile') {
    const rec = reconcile(campaign);
    const path = writeReconciliation(campaign, rec);
    console.log(JSON.stringify({ accepted: rec.accepted.length, conflicts: rec.conflicts.length, problems: rec.problems.length, path }, null, 2));
    for (const c of rec.conflicts) console.log('CONFLICTING_EVIDENCE ' + c.subject + ' :: ' + c.verdicts.join(' vs '));
    return;
  }

  if (cmd === 'run') { await cmdRun(campaign, b); return; }

  console.log('usage: orchestrate.mjs status|recover <campaign>|reconcile <campaign>|run <campaign> <plan.json>');
}

main().catch((e) => { console.error(e); process.exit(1); });
