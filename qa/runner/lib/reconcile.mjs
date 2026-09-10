// Result reconciliation - the single-writer boundary of parallel QA.
//
// A worker result is EVIDENCE, never a verdict. This distinction is the whole reason the
// campaign can be parallel at all: if workers wrote canonical status directly, three processes
// would interleave writes to BUG_QUEUE.json and the ledger would become an artifact of timing
// rather than of testing. So workers write only into their own run directory, and exactly one
// process - the Director/Orchestrator - reads those files and decides what is true.
//
// The founder rule that shapes the interesting part: CONFLICTING EVIDENCE IS NOT VOTED ON.
// Two workers disagreeing about the same capability is itself a finding. Majority voting would
// silently discard the disagreement, which is the same class of error as reporting a flaky test
// as passing because it passed twice out of three times.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { P } from './paths.mjs';
import { runsDir, workerDir } from './worker-lease.mjs';

function readWorkerRegistrySafe(campaignId) {
  try { return JSON.parse(readFileSync(join(runsDir(campaignId), 'WORKERS.json'), 'utf8')); } catch { return { workers: {} }; }
}

export const CANONICAL_FILES = [
  'BUG_QUEUE.json', 'HANDOFF_STATE.json', 'CAPABILITY_INVENTORY.json',
  'COVERAGE_LEDGER.json', 'FIXTURE_REGISTRY.json', 'SYNTHETIC_CLONE_MAP.json',
  'WORK_PC_QA_STATUS.md', 'BUILD_UNDER_TEST.json',
];

export const TERMINAL_RESULTS = ['PASS', 'FAIL', 'FLAKY', 'BLOCKED', 'INVALID_TEST'];

// A guard-execution claim (run-guard-from-ref.mjs) is evidence only when it is BOUND: every one
// of these fields present, and PRODUCTION_WEB_PASS asserted only when the source SHA that ran is
// the SHA that is deployed. Founder decision 2026-09-10 (BUG-006 branch).
export const GUARD_BINDING_FIELDS = ['regression_path', 'regression_source_sha', 'worktree_sha', 'deployed_web_sha', 'result', 'provenance_status'];
export const PROVENANCE_STATUSES = ['CANNOT_BIND_TO_DEPLOYED_WEB', 'SOURCE_SHA_DIFFERS_FROM_DEPLOYED_WEB', 'BOUND_TO_DEPLOYED_WEB'];

export function validateGuardExecution(g) {
  if (!g || typeof g !== 'object') return { ok: false, why: 'guard_execution not an object' };
  const missing = GUARD_BINDING_FIELDS.filter((f) => !(f in g) || g[f] === undefined);
  if (missing.length) return { ok: false, why: 'guard_execution missing ' + missing.join(',') };
  if (!PROVENANCE_STATUSES.includes(g.provenance_status)) return { ok: false, why: 'unknown provenance_status ' + g.provenance_status };
  const claim = String(g.claim || '');
  if (/PRODUCTION_WEB_PASS/i.test(claim) && g.provenance_status !== 'BOUND_TO_DEPLOYED_WEB') {
    return { ok: false, why: 'PRODUCTION_WEB_PASS claimed without BOUND_TO_DEPLOYED_WEB' };
  }
  if (g.provenance_status === 'BOUND_TO_DEPLOYED_WEB' && (!g.deployed_web_sha || g.deployed_web_sha === 'UNKNOWN' || !String(g.worktree_sha).startsWith(String(g.deployed_web_sha).slice(0, 7)))) {
    return { ok: false, why: 'BOUND_TO_DEPLOYED_WEB asserted but worktree_sha does not match deployed_web_sha' };
  }
  return { ok: true, why: null };
}

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Collect every worker RESULT.json for a campaign. Missing/!readable files are reported, not skipped silently. */
export function collectResults(campaignId) {
  const base = runsDir(campaignId);
  if (!existsSync(base)) return { results: [], problems: [] };
  const results = [];
  const problems = [];
  for (const entry of readdirSync(base)) {
    if (entry.startsWith('_')) continue;
    const wd = join(base, entry);
    try { if (!statSync(wd).isDirectory()) continue; } catch { continue; }
    const rp = join(wd, 'RESULT.json');
    if (!existsSync(rp)) {
      // "No result" has two very different meanings and the Director must not confuse them:
      // a worker that never did anything, versus one that produced evidence and was cut off
      // (budget, capacity, crash) before it could write its verdict. The first pilot hit the
      // second case three times - all evidence present, all verdicts absent.
      const evDir = join(wd, 'EVIDENCE');
      let evidenceFiles = [];
      try { evidenceFiles = existsSync(evDir) ? readdirSync(evDir).filter((f) => !f.startsWith('.')) : []; } catch {}
      const reg = readWorkerRegistrySafe(campaignId);
      const w = (reg.workers || {})[entry] || {};
      const problem = evidenceFiles.length
        ? (w.capacity_blocked ? 'EVIDENCE_WITHOUT_VERDICT_' + (w.capacity_reason || 'CAPACITY') : 'EVIDENCE_WITHOUT_VERDICT_' + (w.status || 'UNKNOWN'))
        : 'NO_RESULT_FILE';
      problems.push({ worker_id: entry, problem, evidence_files: evidenceFiles, worker_status: w.status || null, cost_usd: w.cost_usd ?? null,
        _director_action: evidenceFiles.length ? 'Evidence exists and is reviewable by the Director; it carries NO verdict until reconciled by hand or the worker is re-run to completion.' : null });
      continue;
    }
    try {
      const r = JSON.parse(readFileSync(rp, 'utf8'));
      if (r.provisional === true) {
        // A provisional result is a heartbeat, not a verdict. It is deliberately excluded from
        // subject grouping so it can never be counted as agreement or disagreement.
        problems.push({ worker_id: entry, problem: 'PROVISIONAL_RESULT_ONLY', scenario_id: r.scenario_id || null,
          _director_action: 'Worker started but did not finalise. Re-run to completion or review EVIDENCE/ by hand.' });
        continue;
      }
      results.push({ ...r, worker_id: r.worker_id || entry, _path: rp });
    } catch (e) {
      problems.push({ worker_id: entry, problem: 'UNREADABLE_RESULT', detail: String(e.message).slice(0, 200) });
    }
  }
  return { results, problems };
}

/**
 * Validate one worker result before it is allowed to influence anything.
 *
 * An unverifiable result is INVALID_TEST, not FAIL. Treating "the worker could not run" as a
 * product failure would put fabricated defects into the queue - the exact outcome this whole
 * campaign exists to prevent.
 */
export function classifyResult(r) {
  if (!r || typeof r !== 'object') return { verdict: 'INVALID_TEST', why: 'not an object' };
  if (!r.scenario_id && !r.capability_id) return { verdict: 'INVALID_TEST', why: 'no scenario_id or capability_id' };
  if (!TERMINAL_RESULTS.includes(r.verdict)) return { verdict: 'INVALID_TEST', why: 'unknown verdict ' + r.verdict };

  if (r.verdict === 'PASS' || r.verdict === 'FAIL') {
    const ev = r.evidence || {};
    const hasEvidence = (Array.isArray(ev.files) && ev.files.length) || ev.observed || ev.db_state || ev.receipt;
    if (!hasEvidence) return { verdict: 'INVALID_TEST', why: 'verdict ' + r.verdict + ' with no evidence payload' };
  }
  if (r.verdict === 'BLOCKED' && !r.blocked_reason) {
    return { verdict: 'INVALID_TEST', why: 'BLOCKED without blocked_reason' };
  }
  if (r.browser_required && r.browser_available === false && r.verdict !== 'BLOCKED') {
    // A UI verdict from a worker that had no browser is the FALSE_SUCCESS this platform exists
    // to prevent. Downgrade rather than trust it.
    return { verdict: 'INVALID_TEST', why: 'UI verdict claimed without a browser' };
  }
  if (r.boundary_violation) return { verdict: 'INVALID_TEST', why: 'WORKER_BOUNDARY_VIOLATION: ' + (r.boundary_violation.reason || 'unspecified') };
  if (r.guard_execution || /PRODUCTION_WEB_PASS|SOURCE_REGRESSION_/i.test(String(r.claim || ''))) {
    const g = validateGuardExecution(r.guard_execution || r);
    if (!g.ok) return { verdict: 'INVALID_TEST', why: g.why };
  }
  return { verdict: r.verdict, why: null };
}

/**
 * Group results by the thing they are about, and surface disagreement instead of resolving it.
 */
export function reconcile(campaignId) {
  const { results, problems } = collectResults(campaignId);
  const classified = results.map((r) => ({ ...r, _classified: classifyResult(r) }));

  const bySubject = new Map();
  for (const r of classified) {
    const key = r.capability_id || r.scenario_id;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(r);
  }

  const accepted = [];
  const conflicts = [];
  for (const [subject, rs] of bySubject) {
    const verdicts = [...new Set(rs.map((r) => r._classified.verdict).filter((v) => v !== 'INVALID_TEST'))];
    if (verdicts.length > 1) {
      conflicts.push({
        subject,
        status: 'CONFLICTING_EVIDENCE',
        verdicts,
        workers: rs.map((r) => ({ worker_id: r.worker_id, verdict: r._classified.verdict, at: r.completed_at || null })),
        resolution: 'DISPATCH_INDEPENDENT_CONTROL',
        _rule: 'Conflicting worker evidence is never majority-voted. The disagreement is itself a finding and requires a fresh independent control run.',
      });
      continue;
    }
    accepted.push({ subject, verdict: verdicts[0] || 'INVALID_TEST', workers: rs.map((r) => r.worker_id), results: rs });
  }

  return { campaign_id: campaignId, reconciled_at: nowIso(), accepted, conflicts, problems, total_results: results.length };
}

/**
 * Prove the single-writer invariant rather than asserting it.
 *
 * Returns any canonical file modified more recently than a worker's own run directory - which
 * would mean a worker wrote outside its sandbox. Used by the acceptance harness; cheap enough
 * to also run at every reconciliation checkpoint.
 */
export function auditSingleWriter(campaignId, sinceMs) {
  const violations = [];
  for (const f of CANONICAL_FILES) {
    const full = join(P.bugQueue, '..', f);
    if (!existsSync(full)) continue;
    try {
      const m = statSync(full).mtimeMs;
      if (sinceMs && m > sinceMs) violations.push({ file: f, mtime_ms: m });
    } catch {}
  }
  return violations;
}

/** Paths a worker is permitted to write. Anything else is a sandbox breach. */
export function allowedWorkerPaths(campaignId, workerId) {
  const wd = workerDir(campaignId, workerId);
  return {
    result: join(wd, 'RESULT.json'),
    checkpoint: join(wd, 'CHECKPOINT.json'),
    evidenceDir: join(wd, 'EVIDENCE'),
    _rule: 'A worker may write ONLY these. Canonical QA files are written exclusively by the Orchestrator/Director.',
  };
}

export function writeReconciliation(campaignId, rec) {
  const path = join(runsDir(campaignId), 'RECONCILIATION.json');
  writeFileSync(path, JSON.stringify(rec, null, 2) + '\n');
  return path;
}
