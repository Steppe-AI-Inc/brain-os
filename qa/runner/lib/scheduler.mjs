// Work selection. This is the module that makes "Fable exited" stop meaning "QA finished".
//
// The supervisor never asks the founder what to test next. It reads the same authoritative
// repository files a human QA lead would read and applies the standing priority order.
// If it ever returned hasWork:false that would be a claim the QA program is genuinely idle,
// so the function is deliberately conservative: NOT_TESTED capabilities alone are enough to
// keep working, and no product code change is required for QA to have something to do.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { P, RUNNER_DIR } from './paths.mjs';

const readJson = (p, fallback = null) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
};

const SEV_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
const RETEST_STATUSES = new Set(['READY_FOR_RETEST', 'FIX_PUSHED']);

export function readWorld() {
  const bugQueue = readJson(P.bugQueue, { bugs: [] });
  const inventory = readJson(P.capabilities, { capabilities: [] });
  const coverage = readJson(P.coverage, {});
  const handoff = readJson(P.handoff, {});
  const campaignQueue = readJson(join(RUNNER_DIR, 'CAMPAIGN_QUEUE.json'), { items: [] });

  const fixes = [];
  if (existsSync(P.fixesDir)) {
    for (const f of readdirSync(P.fixesDir).filter((n) => n.endsWith('.json'))) {
      const j = readJson(join(P.fixesDir, f));
      if (j) fixes.push({ file: f, ...j });
    }
  }

  const caps = inventory.capabilities || [];
  const byStatus = (s) => caps.filter((c) => (c.status || 'NOT_TESTED') === s);

  return {
    bugQueue, inventory, coverage, handoff, fixes, campaignQueue, caps,
    failing: byStatus('FAIL'),
    flaky: byStatus('FLAKY'),
    notTested: byStatus('NOT_TESTED'),
    blocked: byStatus('BLOCKED'),
  };
}

/**
 * Returns the single next unit of work.
 * `state` is the supervisor state to enter while performing it.
 */
export function selectNextWork(world, ctx = {}) {
  const { bugQueue, handoff, campaignQueue, failing, flaky, notTested } = world;
  const bugs = bugQueue.bugs || [];

  // ---- 1-3. READY_FOR_RETEST bugs, strictly by severity (P0 -> P1 -> P2 -> P3).
  const retestable = bugs
    .filter((b) => RETEST_STATUSES.has(b.status))
    .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));

  if (retestable.length) {
    const b = retestable[0];
    // A fix that is pushed but not yet DEPLOYED must not be retested. A green retest against
    // the old build is a FALSE_SUCCESS - precisely the defect class this node exists to catch.
    const fixSha = b.fix_commit_sha || b.fix_pushed_sha || null;
    const stale = fixSha && ctx.deployedSha && ctx.deployedSha === ctx.lastTestedDeployedSha
      && !String(fixSha).startsWith(String(ctx.deployedSha).slice(0, 7));
    if (stale) {
      return {
        hasWork: true, state: 'WAITING_FOR_DEPLOYMENT', kind: 'await_deploy', priority: b.severity,
        bug_id: b.bug_id,
        label: b.bug_id + ' fix pushed (' + String(fixSha).slice(0, 7) + ') but the deployed SHA has not moved',
        directive: 'Do NOT retest ' + b.bug_id + ' yet. First independently establish the deployed build '
          + '(supabase functions list for Edge Functions, Vercel deployment SHA for web). If the deployed '
          + 'artifact still predates the fix, record WAITING_FOR_DEPLOYMENT in HANDOFF_STATE.json and move to '
          + 'the next item. Retesting a fix against a build that does not contain it produces a FALSE_SUCCESS.',
      };
    }
    return {
      hasWork: true, state: 'RETEST_STARTING', kind: 'retest_bug', priority: b.severity,
      bug_id: b.bug_id,
      label: ('Retest ' + b.bug_id + ' (' + b.severity + ') - ' + (b.title || '')).slice(0, 200),
      directive: 'Retest ' + b.bug_id + ' (' + b.severity + '). A Home-PC "ready_for_retest" flag is an INPUT, '
        + 'not a verdict: only independent Work-PC browser and DB evidence may move it to CLOSED or REOPENED. '
        + 'Re-run its regression and require any EXPECTED_FAIL regression to actually flip to passing - a '
        + 'regression that still fails means the fix is unproven regardless of what the fix report claims. '
        + 'Record the deployed SHA the evidence was gathered against.',
    };
  }

  // ---- 4. Regressions whose expected state should have flipped by now.
  const flippable = bugs.filter((b) => b.regression_state === 'EXPECTED_FAIL' && b.status === 'CLOSED');
  if (flippable.length) {
    return {
      hasWork: true, state: 'QA_STARTING', kind: 'regression_reconcile', priority: 'P2',
      label: 'Reconcile ' + flippable.length + ' regression(s) still EXPECTED_FAIL on a CLOSED bug',
      directive: 'These bugs are CLOSED but their regressions are still marked EXPECTED_FAIL: '
        + flippable.map((b) => b.bug_id).join(', ') + '. Re-run each one. Either it now passes (update '
        + 'regression_state to EXPECTED_PASS) or the closure was premature and the bug must be REOPENED.',
    };
  }

  // ---- 5. Unfinished current campaign (explicit queue).
  const queued = (campaignQueue.items || []).filter((i) => i.status === 'QUEUED' || i.status === 'IN_PROGRESS');
  if (queued.length) {
    queued.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const it = queued[0];
    return {
      hasWork: true, state: 'QA_STARTING', kind: 'campaign_item', priority: it.priority || 'P2',
      item_id: it.id,
      label: (campaignQueue.campaign_id || handoff.campaign_id || 'campaign') + ' - ' + it.title,
      directive: it.directive + '\n\nWhen this item is genuinely finished, set its status to DONE in '
        + 'qa/runner/CAMPAIGN_QUEUE.json (or PARTIAL, with a reason, if only part of it was completed). '
        + 'Do not mark it DONE on partial evidence.',
    };
  }

  // ---- 6. Failing / flaky capabilities that no open bug accounts for.
  const openBugIds = new Set(bugs.filter((b) => b.status !== 'CLOSED').map((b) => b.bug_id));
  const orphanFail = [...failing, ...flaky].filter((c) => !c.bug_id || !openBugIds.has(c.bug_id));
  if (orphanFail.length) {
    return {
      hasWork: true, state: 'QA_STARTING', kind: 'orphan_failure', priority: 'P2',
      label: orphanFail.length + ' FAIL/FLAKY capability(ies) with no open bug tracking them',
      directive: 'These capabilities are FAIL or FLAKY but are not tracked by any open bug: '
        + orphanFail.slice(0, 8).map((c) => c.capability_id).join(', ')
        + '. Either file the missing defect or correct the capability status with evidence. '
        + 'A failure with no bug is how a real defect gets silently lost.',
    };
  }

  // ---- 7-13. Untested coverage. This branch is what guarantees QA does not idle merely
  // because the product code did not change.
  if (notTested.length) {
    const HIGH_RISK = /SECURITY|RLS|ISOLATION|PERMISSION|APPROVAL|SALARY|FINANCE|TENANT|CASCADE/i;
    const ranked = [...notTested].sort((a, b) => {
      const ar = HIGH_RISK.test(a.capability_id + (a.domain || '')) ? 0 : 1;
      const br = HIGH_RISK.test(b.capability_id + (b.domain || '')) ? 0 : 1;
      return ar - br;
    });
    const batch = ranked.slice(0, 6);
    return {
      hasWork: true, state: 'QA_STARTING', kind: 'untested_coverage', priority: 'P2',
      label: notTested.length + ' NOT_TESTED capabilities remain (' + batch[0].capability_id + ' first)',
      directive: 'Execute untested coverage, highest-risk first. Next batch: '
        + batch.map((c) => c.capability_id).join(', ')
        + '. Record real evidence per capability. NOT_TESTED must never be inferred to PASS, and a '
        + 'capability you could not reach is BLOCKED with a blocked_reason - not PASS.',
    };
  }

  // ---- Exploratory. Reached only once the whole inventory has been executed, at which point
  // the charter's standing 25-30% exploratory budget is the remaining work. It is unbounded by
  // design, which is why this function has no "nothing to do" branch.
  return {
    hasWork: true, state: 'QA_STARTING', kind: 'exploratory', priority: 'P3',
    label: 'Exploratory QA (catalogued inventory fully executed)',
    directive: 'Every catalogued capability has been executed. Run exploratory QA per the charter: '
      + 'adversarial personas, relationship/cascade integrity, UI-vs-Brain parity, synthetic world '
      + 'simulations, and failure injection. New capabilities discovered this way must be ADDED to '
      + 'CAPABILITY_INVENTORY.json - growing the inventory is a legitimate and expected result.',
  };
}

export function summarise(world) {
  const openBugs = (world.bugQueue.bugs || []).filter((b) => b.status !== 'CLOSED');
  return {
    open_bugs: openBugs.length,
    open_p0: openBugs.filter((b) => b.severity === 'P0').length,
    open_p1: openBugs.filter((b) => b.severity === 'P1').length,
    ready_for_retest: (world.bugQueue.bugs || []).filter((b) => RETEST_STATUSES.has(b.status)).length,
    capabilities: world.caps.length,
    fail: world.failing.length,
    flaky: world.flaky.length,
    not_tested: world.notTested.length,
    blocked: world.blocked.length,
    coverage_percentage: world.coverage.coverage_percentage ?? null,
    release_state: world.coverage.release_state ?? null,
  };
}
