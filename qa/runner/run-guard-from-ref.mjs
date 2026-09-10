#!/usr/bin/env node
// Allowlisted guard executor: run a source-level regression guard from a worktree pinned to an
// exact revision, and bind the result to provenance instead of pretending it says something
// about production.
//
// Founder decision 2026-09-10 (BUG-006 branch):
//   - no cherry-pick of implementation-branch files into the QA branch;
//   - execute the guard from a worktree pinned to the exact source rev;
//   - bind evidence to { regression_path, regression_source_sha, worktree_sha, deployed_web_sha,
//     result, provenance_status }; provenance_status = CANNOT_BIND_TO_DEPLOYED_WEB while the
//     deployed web SHA is UNKNOWN. Never claim PRODUCTION_WEB_PASS unless BOUND_TO_DEPLOYED_WEB.
//   - the executor accepts ONLY guards on qa/runner/guard-allowlist.json at a pinned blob SHA.
//     "Safe-looking JS" is not a category this file recognises.
//
// Usage:
//   node qa/runner/run-guard-from-ref.mjs --guard qa/scenarios-runner/company_ref_no_bare_name_join.mjs --ref origin/master [--campaign C002] [--worktree <path>]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { P, RUNNER_DIR } from './lib/paths.mjs';
import { ensureSourceWorktree, resolveSha, blobSha, worktreeFingerprint, scanSourceWorktree } from './lib/source-worktree.mjs';
import { gatedEnv } from './lib/capability-gate.mjs';
import { runsDir } from './lib/worker-lease.mjs';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function loadAllowlist(path = process.env.QA_GUARD_ALLOWLIST || join(RUNNER_DIR, 'guard-allowlist.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function deployedWebSha() {
  try {
    const b = JSON.parse(readFileSync(P.buildUnderTest, 'utf8'));
    const s = b.web_sha && b.web_sha !== 'UNKNOWN' ? b.web_sha : (b.deployed_product_sha || null);
    return s || 'UNKNOWN';
  } catch { return 'UNKNOWN'; }
}

export function provenanceFor(worktreeSha, webSha) {
  if (!webSha || webSha === 'UNKNOWN') return 'CANNOT_BIND_TO_DEPLOYED_WEB';
  return String(worktreeSha).startsWith(String(webSha).slice(0, 7)) ? 'BOUND_TO_DEPLOYED_WEB' : 'SOURCE_SHA_DIFFERS_FROM_DEPLOYED_WEB';
}

/**
 * Execute one allowlisted guard. Returns the record; never throws for a policy refusal - the
 * refusal IS the record (result BLOCKED_*), so a caller cannot mistake "did not run" for "ran".
 */
export function runGuardFromRef({ guard, ref, campaignId = 'C002', worktreePath = null, allowlist = loadAllowlist() }) {
  const rec = {
    schema: 'qa.guard-execution/1',
    regression_path: guard, requested_ref: ref, campaign_id: campaignId,
    regression_source_sha: null, worktree_sha: null, worktree_path: null,
    deployed_web_sha: deployedWebSha(), result: null, provenance_status: null, claim: null,
    allowlist_entry: null, execution_time: null, evidence: null, db_touched: false,
    executor: 'qa/runner/run-guard-from-ref.mjs', executed_at: nowIso(),
  };

  const entry = (allowlist.entries || []).find((e) => e.regression_path === guard);
  if (!entry) { rec.result = 'BLOCKED_GUARD_NOT_ALLOWLISTED'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; rec.why = 'path not on allowlist'; return rec; }
  rec.allowlist_entry = { approved_by: entry.approved_by, approved_at: entry.approved_at, pinned_blob_shas: entry.pinned_blob_shas };

  let sha;
  try { sha = resolveSha(ref); } catch (e) { rec.result = 'BLOCKED_REF_UNRESOLVABLE'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; rec.why = e.message.slice(0, 200); return rec; }
  if (entry.allowed_refs && entry.allowed_refs.length && !entry.allowed_refs.some((r) => r === ref || sha.startsWith(r))) {
    rec.result = 'BLOCKED_GUARD_NOT_ALLOWLISTED'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; rec.why = 'ref ' + ref + ' not in allowed_refs'; return rec;
  }

  let blob;
  try { blob = blobSha(sha, guard); } catch (e) { rec.result = 'BLOCKED_GUARD_ABSENT_AT_REF'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; rec.why = e.message.slice(0, 200); return rec; }
  rec.regression_source_sha = blob;
  if (!(entry.pinned_blob_shas || []).includes(blob)) {
    rec.result = 'BLOCKED_GUARD_NOT_ALLOWLISTED'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED';
    rec.why = 'blob ' + blob.slice(0, 12) + ' at ' + sha.slice(0, 7) + ' is not a pinned blob for this guard'; return rec;
  }

  // Worktree: caller-supplied (must already be at exactly `sha`) or materialised by the helper.
  let wt;
  try {
    if (worktreePath) {
      const fp = worktreeFingerprint(worktreePath);
      if (fp.head !== sha) { rec.result = 'BLOCKED_WORKTREE_NOT_AT_REF'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; rec.why = 'worktree HEAD ' + fp.head.slice(0, 7) + ' != ' + sha.slice(0, 7); return rec; }
      const scan = scanSourceWorktree(worktreePath);
      if (!scan.ok) { rec.result = 'BLOCKED_WORKTREE_NOT_CLEAN'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; rec.why = scan.violations.join(', ').slice(0, 300); return rec; }
      wt = { path: resolve(worktreePath), sha };
    } else {
      wt = ensureSourceWorktree(sha);
    }
  } catch (e) { rec.result = 'BLOCKED_WORKTREE_NOT_CLEAN'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; rec.why = e.message.slice(0, 300); return rec; }
  rec.worktree_sha = wt.sha; rec.worktree_path = wt.path;

  // The guard's own blob is re-checked from the worktree file, so a tampered checkout cannot
  // substitute content the allowlist never saw.
  const onDisk = join(wt.path, guard);
  if (!existsSync(onDisk)) { rec.result = 'BLOCKED_GUARD_ABSENT_AT_REF'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; return rec; }
  const hashCheck = spawnSync('git', ['hash-object', onDisk], { cwd: wt.path, encoding: 'utf8', windowsHide: true });
  const diskBlob = (hashCheck.stdout || '').trim();
  if (diskBlob !== blob) { rec.result = 'BLOCKED_GUARD_CONTENT_MISMATCH'; rec.provenance_status = 'CANNOT_BIND_TO_DEPLOYED_WEB'; rec.claim = 'NOT_EXECUTED'; rec.why = 'on-disk blob ' + diskBlob.slice(0, 12) + ' != ref blob ' + blob.slice(0, 12); return rec; }

  const fpBefore = worktreeFingerprint(wt.path);
  const t0 = Date.now();
  const child = spawnSync(process.execPath, [onDisk], {
    cwd: wt.path, encoding: 'utf8', windowsHide: true, timeout: entry.timeout_ms || 120_000,
    env: gatedEnv(process.env, { QA_GUARD_EXECUTION: '1' }), maxBuffer: 8 * 1024 * 1024,
  });
  rec.execution_time = { started_at: new Date(t0).toISOString(), duration_ms: Date.now() - t0 };
  const fpAfter = worktreeFingerprint(wt.path);
  rec.worktree_unchanged = fpBefore.head === fpAfter.head && fpBefore.status === fpAfter.status;

  rec.exit_code = child.status;
  rec.evidence = { stdout_tail: (child.stdout || '').slice(-3000), stderr_tail: (child.stderr || '').slice(-1500), timed_out: child.error && child.error.code === 'ETIMEDOUT' || false };
  if (child.error && child.error.code === 'ETIMEDOUT') rec.result = 'TIMEOUT';
  else if (!rec.worktree_unchanged) rec.result = 'INVALID_TEST_WORKTREE_MODIFIED';
  else rec.result = child.status === 0 ? 'PASS' : 'FAIL';
  rec.provenance_status = provenanceFor(wt.sha, rec.deployed_web_sha);
  rec.claim = (rec.result === 'PASS' || rec.result === 'FAIL')
    ? 'SOURCE_REGRESSION_' + rec.result + '_AT_SHA_' + wt.sha.slice(0, 7)
    : 'NOT_EXECUTED';
  rec.production_claim = rec.provenance_status === 'BOUND_TO_DEPLOYED_WEB' && rec.result === 'PASS' ? 'PRODUCTION_WEB_PASS' : 'NONE - ' + rec.provenance_status;
  return rec;
}

export function writeGuardRecord(rec) {
  const dir = join(runsDir(rec.campaign_id || 'C002'), '_guards');
  mkdirSync(dir, { recursive: true });
  const name = basename(rec.regression_path || 'guard').replace(/\.[^.]+$/, '') + '-' + nowIso().replace(/[:]/g, '-') + '.json';
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(rec, null, 2) + '\n');
  return path;
}

function main() {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  const guard = get('--guard'), ref = get('--ref');
  if (!guard || !ref) { console.error('usage: run-guard-from-ref.mjs --guard <path> --ref <ref> [--campaign C002] [--worktree <path>]'); process.exit(2); }
  const rec = runGuardFromRef({ guard, ref, campaignId: get('--campaign') || 'C002', worktreePath: get('--worktree') });
  const path = writeGuardRecord(rec);
  console.log(JSON.stringify({ result: rec.result, claim: rec.claim, provenance_status: rec.provenance_status, worktree_sha: rec.worktree_sha, regression_source_sha: rec.regression_source_sha, deployed_web_sha: rec.deployed_web_sha, why: rec.why || null, record: path }, null, 2));
  process.exit(rec.result === 'PASS' ? 0 : rec.result === 'FAIL' ? 1 : 3);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
