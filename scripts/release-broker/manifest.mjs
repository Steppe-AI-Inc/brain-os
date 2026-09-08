// MANIFEST LOADER + TREE BINDING for the release broker.
//
// plan.mjs is pure: it never touches a file, a socket, or a clock. This module is the thin layer
// that gathers FACTS for it from a checkout — the manifest, the migration files present, their
// LF-normalised hashes — and nothing else. It still touches no credential and no network. Remote
// history, CI conclusion and ancestor-of-master come from the substrate (the workflow), because
// those are the facts a working tree can lie about.
//
// LF-NORMALISED HASHES. index.ts taught this campaign that CRLF is a byte-level fact: a file that is
// byte-identical to a reviewer on Windows hashes differently on a Linux runner. Hashes here strip
// CR before hashing, and the manifest records the same, so the reviewed bytes and the applied bytes
// compare as the same bytes on either platform.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createRequire } from 'node:module';

export const MANIFEST_DIR = 'governance/authorizations';
export const MIGRATION_DIR = 'supabase/migrations';

/** sha256 over bytes with every CR removed. */
export function lfSha256(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const noCr = Buffer.from(buf.filter((b) => b !== 0x0d));
  return createHash('sha256').update(noCr).digest('hex');
}

/** Load and parse a manifest by id from a checkout root. Returns null when absent. */
export async function loadManifest(root, authorizationId) {
  const p = join(root, MANIFEST_DIR, authorizationId + '.yaml');
  if (!existsSync(p)) return null;
  // `yaml` lives in qa/dbtest's dependencies (the repo root has none); resolve it from there.
  const { parse } = createRequire(join(root, 'qa', 'dbtest', 'package.json'))('yaml');
  const m = parse(readFileSync(p, 'utf8'));
  // YAML happily turns a 12-digit version into a number; the broker compares strings.
  for (const k of ['approved_migrations', 'excluded_migrations']) {
    if (Array.isArray(m[k])) for (const e of m[k]) if (e && e.version !== undefined) e.version = String(e.version);
  }
  if (m.selective_execution && Array.isArray(m.selective_execution.excluded_scope)) {
    m.selective_execution.excluded_scope = m.selective_execution.excluded_scope.map(String);
  }
  return m;
}

/** The migration files present at the checkout and their LF-normalised hashes. */
export function treeFacts(root) {
  const dir = join(root, MIGRATION_DIR);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const fileHashes = {};
  for (const f of files) fileHashes[f] = lfSha256(readFileSync(join(dir, f)));
  return { migrationFilesAtCheckout: files, fileHashes };
}

/**
 * Assemble the full fact set for buildApplyPlan. Everything the tree cannot vouch for is REQUIRED
 * from the caller (the substrate) and is never defaulted — a default here would be the workflow
 * quietly asserting something it did not check.
 */
export async function gatherFacts(root, substrate) {
  const required = ['appliedVersions', 'gitDiffClean', 'ciConclusion', 'ancestorOfMaster', 'workflowProjectRef', 'inputs', 'now'];
  for (const k of required) {
    if (!(k in substrate)) throw new Error('gatherFacts: substrate must supply ' + k + ' — it is not derivable from the tree.');
  }
  const manifest = await loadManifest(root, substrate.inputs.authorization_id);
  return { manifest, ...treeFacts(root), ...substrate };
}
