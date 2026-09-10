// Source-only materialisation for SOURCE_AUDIT workers and the allowlisted guard executor.
//
// qa/runner/.auth, browser profiles, the supervisor lock, logs and untracked .env files all live
// INSIDE the operational repository tree. A worker whose cwd is that tree can reach them with an
// absolute path even when its file tools are "confined to the working directory" - confinement
// includes the whole cwd. So read-only workers never get the operational tree as cwd at all.
//
// They get a DETACHED GIT WORKTREE outside the repository, checked out from an exact commit. A
// worktree contains tracked content only: no auth material, no profiles, no credential stores,
// no machine-global config. That is verified by scanning after creation, not assumed.
//
// git is run HERE, by the orchestrator process - never by the worker, which has no shell. The
// worker receives commit/ref/changed-file metadata as immutable prompt input.
//
// The only git-worktree verb ever used is `add` (the one allow-listed in .claude/settings.json).
// Worktrees are never removed or pruned by this module.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from './paths.mjs';

export const SOURCE_WT_ROOT = process.env.QA_SOURCE_WT_ROOT
  || join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'brain-os-qa', 'source-wt');

function git(args, cwd = REPO_ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 }).trim();
}

export function resolveSha(ref) { return git(['rev-parse', '--verify', ref + '^{commit}']); }

/** Existing worktrees as { path, head, detached }. */
export function listWorktrees() {
  const out = git(['worktree', 'list', '--porcelain']);
  const wts = [];
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) { cur = { path: resolve(line.slice(9)), head: null, detached: false }; wts.push(cur); }
    else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (cur && line === 'detached') cur.detached = true;
  }
  return wts;
}

// Paths that must NEVER exist inside a source worktree. If any does, the worktree is not
// source-only and must not be handed to a worker.
const FORBIDDEN_IN_WORKTREE = [
  'qa/runner/.auth', 'qa/runner/.director-profile', 'qa/runner/logs', 'qa/runner/.supervisor.lock',
  '.env', '.env.local', 'web/.env', 'web/.env.local', 'web/.env.production',
  '.vercel', 'supabase/.temp', 'node_modules',
];

function findBrowserProfiles(root, depth = 0, hits = []) {
  if (depth > 6) return hits;
  let entries = [];
  try { entries = readdirSync(root); } catch { return hits; }
  for (const e of entries) {
    if (e === '.git' || e === 'node_modules') continue;
    const p = join(root, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (e === '.browser-profile' || e === '.director-profile' || e === '.auth') hits.push(p);
    else findBrowserProfiles(p, depth + 1, hits);
  }
  return hits;
}

/** Prove the worktree is source-only. Returns { ok, violations[] }. */
export function scanSourceWorktree(wtPath) {
  const violations = [];
  for (const rel of FORBIDDEN_IN_WORKTREE) if (existsSync(join(wtPath, rel))) violations.push(rel);
  for (const p of findBrowserProfiles(wtPath)) violations.push(p.replace(wtPath, '').replace(/\\/g, '/'));
  // Untracked files of any kind mean it is no longer a pure checkout.
  const untracked = git(['status', '--porcelain', '--untracked-files=all'], wtPath);
  if (untracked) violations.push('UNTRACKED_OR_MODIFIED_FILES_PRESENT: ' + untracked.split(/\r?\n/).length);
  return { ok: violations.length === 0, violations };
}

/**
 * Ensure a detached worktree exists at exactly `sha`, outside the repository, and is source-only.
 * Reuses an existing worktree at that commit; otherwise `git worktree add --detach`.
 */
export function ensureSourceWorktree(ref, { root = SOURCE_WT_ROOT } = {}) {
  const sha = resolveSha(ref);
  const existing = listWorktrees().find((w) => w.head === sha && w.path !== resolve(REPO_ROOT));
  let path, created = false;
  if (existing) path = existing.path;
  else {
    mkdirSync(root, { recursive: true });
    path = join(root, sha.slice(0, 7));
    if (!existsSync(path)) { git(['worktree', 'add', '--detach', path, sha]); created = true; }
  }
  const scan = scanSourceWorktree(path);
  if (!scan.ok) {
    const err = new Error('SOURCE_WORKTREE_NOT_CLEAN: ' + scan.violations.join(', '));
    err.violations = scan.violations; err.path = path;
    throw err;
  }
  return { path, sha, ref, created, scan };
}

/**
 * Fingerprint = HEAD + full porcelain status. A clean detached checkout has an empty status, so
 * ANY write inside the worktree (tracked edit, new file, deletion) changes the fingerprint.
 * Cheap, exact, and it does not require hashing every file.
 */
export function worktreeFingerprint(wtPath) {
  const head = git(['rev-parse', 'HEAD'], wtPath);
  const status = git(['status', '--porcelain', '--untracked-files=all'], wtPath);
  return { head, status, dirty: status.length > 0, taken_at: new Date().toISOString() };
}

export function fingerprintsEqual(a, b) {
  return !!a && !!b && a.head === b.head && a.status === b.status;
}

/** Git facts the orchestrator hands to a worker so the worker never needs a shell. */
export function gitContext(wtPath, { baseRef = null } = {}) {
  const head = git(['rev-parse', 'HEAD'], wtPath);
  const shortHead = head.slice(0, 7);
  const ctx = { head, short_head: shortHead, worktree: wtPath, computed_at: new Date().toISOString(), computed_by: 'orchestrator' };
  if (baseRef) {
    try {
      const base = git(['rev-parse', '--verify', baseRef + '^{commit}'], wtPath);
      ctx.base = base;
      ctx.changed_files = git(['diff', '--name-only', base, head], wtPath).split(/\r?\n/).filter(Boolean);
      ctx.diff_stat = git(['diff', '--shortstat', base, head], wtPath);
    } catch (e) { ctx.diff_error = String(e.message).slice(0, 200); }
  }
  return ctx;
}

export function blobSha(ref, path) { return git(['rev-parse', ref + ':' + path]); }
