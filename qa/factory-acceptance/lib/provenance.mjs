// Provenance for every Factory V1 finding. Nothing in this campaign is said about "the code"
// in the abstract: each finding names the ref, the commit, the file and the blob it was read
// from, and states that it cannot be bound to the deployed web build (WEB_SHA is UNKNOWN).
//
// Founder correction 2026-09-14 #1: a violation present on both origin/master and
// origin/p1/control-plane-phase0 is recorded TWICE, once per ref, each with its own blob SHA. A
// summary sentence never says "only on master" when the evidence says both.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensureSourceWorktree, blobSha, scanSourceWorktree } from '../../runner/lib/source-worktree.mjs';
import { REPO_ROOT } from '../../runner/lib/paths.mjs';
import { PROVENANCE_STATUSES } from '../../runner/lib/reconcile.mjs';

export const REFS = Object.freeze({
  master: 'origin/master',
  p1: 'origin/p1/control-plane-phase0',
});
// The commits this campaign was planned against. Origin moving is a PIN_DRIFT, never a silent
// re-target: the founder approved verification of these commits, not of whatever is newest.
export const EXPECTED_SHA = Object.freeze({
  master: '55a159172a9bbc9b69cde4d2f832418573a4b0b9',
  p1: 'dcc0d9c554e8ddbba27b9aabfdc6be94a81c2baf',
});

// Founder correction #6 - five distinct evidence levels. PGlite is LOCAL_DB_CONTRACT and is
// never promoted; a two-connection race on the embedded server is REAL_POSTGRES_LOCAL and is
// never promoted to CROSS_NODE_REAL, which stays BLOCKED until a shared non-production
// PostgreSQL exists between the Home PC and the Work PC.
export const FINDING_CLASSES = Object.freeze([
  'SOURCE_FINDING_ONLY', 'LOCAL_DB_CONTRACT', 'REAL_POSTGRES_LOCAL', 'MACHINE_PROPERTY', 'CROSS_NODE_REAL',
]);

const pinned = {};

/** Pin both refs to scanned, source-only worktrees. Throws PIN_DRIFT if origin moved. */
export function pinRefs() {
  for (const [key, ref] of Object.entries(REFS)) {
    if (pinned[key]) continue;
    const wt = ensureSourceWorktree(ref);
    if (!wt.sha.startsWith(EXPECTED_SHA[key])) {
      const err = new Error('PIN_DRIFT: ' + ref + ' resolves to ' + wt.sha + ', campaign was approved for ' + EXPECTED_SHA[key]);
      err.code = 'PIN_DRIFT'; throw err;
    }
    pinned[key] = { ref, sha: wt.sha, path: wt.path, scan: wt.scan };
  }
  return { ...pinned };
}

export function worktree(refKey) {
  if (!pinned[refKey]) pinRefs();
  return pinned[refKey];
}

/** Read a file from the pinned worktree (never from the operational repository). */
export function readPinned(refKey, relPath) {
  const wt = worktree(refKey);
  return readFileSync(join(wt.path, relPath), 'utf8');
}

export function pinnedPath(refKey, relPath) { return join(worktree(refKey).path, relPath); }
export function pinnedExists(refKey, relPath) { return existsSync(pinnedPath(refKey, relPath)); }

export function blobShaAt(refKey, relPath) {
  try { return blobSha(worktree(refKey).sha, relPath); } catch { return null; }
}

/**
 * The provenance block attached to a finding.
 * @param {string} refKey  'master' | 'p1'
 * @param {string[]} files  repo-relative paths the finding was read from
 * @param {string} findingClass one of FINDING_CLASSES
 */
export function provenanceFor(refKey, files = [], findingClass = 'SOURCE_FINDING_ONLY', extra = {}) {
  if (!FINDING_CLASSES.includes(findingClass)) throw new Error('unknown finding_class ' + findingClass);
  if (!PROVENANCE_STATUSES.includes('CANNOT_BIND_TO_DEPLOYED_WEB')) throw new Error('reconcile vocabulary drifted');
  const wt = worktree(refKey);
  const blob_shas = {};
  for (const f of files) blob_shas[f] = blobShaAt(refKey, f);
  return {
    finding_class: findingClass,
    source_ref: wt.ref,
    source_sha: wt.sha,
    blob_shas,
    worktree_path: wt.path,
    deployed_web_sha: 'UNKNOWN',
    production_binding: 'CANNOT_BIND_TO_DEPLOYED_WEB',
    ...extra,
  };
}

/** Line numbers (1-based) in a pinned file whose text matches `re`. Structural anchors for findings. */
export function anchorsIn(refKey, relPath, re) {
  const lines = readPinned(refKey, relPath).split(/\r?\n/);
  const out = [];
  lines.forEach((l, i) => { if (re.test(l)) out.push({ line: i + 1, text: l.trim().slice(0, 200) }); });
  return out;
}

/** Same blob on both refs? Then a finding recorded on one is byte-identical on the other. */
export function sameBlobOnBothRefs(relPath) {
  const a = blobShaAt('master', relPath), b = blobShaAt('p1', relPath);
  return { master: a, p1: b, identical: !!a && a === b };
}

export function operationalHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true }).trim();
}

export function rescanAll() {
  const out = {};
  for (const [k, wt] of Object.entries(pinned)) out[k] = scanSourceWorktree(wt.path);
  return out;
}
