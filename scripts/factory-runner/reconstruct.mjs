#!/usr/bin/env node
// GITHUB IS THE DURABLE RECOVERY TRUTH.
//
// The control-plane database accelerates orchestration. It is not where the work lives. Losing it must cost
// scheduling state and nothing else — so every work order has to be reconstructible from the repository
// alone, and this file is the proof that it is rather than the claim that it should be.
//
// WHAT THE REPOSITORY ALREADY KNOWS, without any database:
//
//   * the branch, and every commit on it
//   * the base commit it forked from, and the latest commit on it
//   * the candidate bytes and their sha256, from the tree at that commit
//   * the checkpoint and evidence artifacts, because they are committed files
//   * the release manifest and the handoff, likewise
//
// So a work order's durable identity is (branch, base_commit) and everything else is derivable. The control
// plane stores those two so the reconstruction is cheap, and this module can rebuild the rest when the rows
// are gone — including rebuilding the rows themselves.
//
// THE INVARIANT THIS PROTECTS, stated plainly because it is the whole point:
//   Loss of the control DB must NOT destroy the development history.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

/** Every branch that looks like factory work, with what the repository knows about it. */
export function discoverWorkBranches({ repo, prefixes = ['wo/', 'factory/', 'run/', 'verify-'] } = {}) {
  const out = [];
  const refs = git(['for-each-ref', '--format=%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)',
    'refs/heads/'], repo).split('\n').filter(Boolean);
  for (const line of refs) {
    const [name, head, when] = line.split('\t');
    if (!prefixes.some((p) => name.startsWith(p))) continue;
    out.push({ branch: name, latest_commit: head, updated_at: when });
  }
  return out;
}

/**
 * Reconstruct one work order's durable facts from the repository.
 *
 * `base` is the commit the branch forked from. It is computed with merge-base against the trunk rather than
 * read from anywhere, because a value read from the database is exactly what is unavailable in the case
 * this function exists for.
 */
export function reconstructBranch({ repo, branch, trunk = 'p1/execution-truth-governance', deploySurface = null }) {
  const latest = git(['rev-parse', branch], repo);
  let base = null;
  // the trunk as a local branch, else as the remote-tracking ref every ordinary clone has (a fresh clone of one branch has no local
  // trunk branch, and base came back null - verification round 4)
  try { base = git(['merge-base', trunk, branch], repo); } catch { try { base = git(['merge-base', 'origin/' + trunk, branch], repo); } catch { base = null; } }
  const commits = git(['rev-list', '--count', (base ? base + '..' : '') + branch], repo);

  const facts = {
    branch,
    base_commit: base,
    latest_commit: latest,
    commits_ahead: Number(commits) || 0,
    candidate_sha: null,
    checkpoint_artifacts: [],
    release_manifest: null,
    handoff: null,
  };

  // The candidate's identity comes from the BYTES at that commit, never from a blob hash: the blob is
  // stored LF-normalised and the deploy surface is CRLF, so the two disagree by design. This is the same
  // rule the Edge campaign learned the expensive way.
  if (deploySurface) {
    try {
      const bytes = execFileSync('git', ['show', latest + ':' + deploySurface],
        { cwd: repo, maxBuffer: 1 << 28 });
      facts.candidate_sha = createHash('sha256').update(bytes).digest('hex');
      facts.candidate_bytes = bytes.length;
      facts.candidate_sha_note = 'sha256 of the blob as stored (LF); the deploy surface is CRLF on disk and '
        + 'its deploy hash is taken from the working-tree bytes, not from here';
    } catch { /* the surface does not exist on that branch */ }
  }

  const files = git(['ls-tree', '-r', '--name-only', latest], repo).split('\n');
  facts.checkpoint_artifacts = files.filter((f) =>
    /^qa\/verification\/(CHECKPOINT\.md|CURRENT_CAMPAIGN\.json|evidence\/.*\.json)$/.test(f));
  facts.release_manifest = files.find((f) => /^qa\/verification\/release_manifest\.mjs$/.test(f)) || null;
  facts.handoff = files.find((f) => /HANDOFF|MORNING_REPORT/.test(f)) || null;
  return facts;
}

/**
 * Rebuild control-plane rows from the repository. Idempotent: run it against a database that already has
 * them and nothing changes; run it against an empty one and the queue comes back.
 */
export async function reconstructControlPlane({ repo, db, trunk, deploySurface = null, branches = null }) {
  const found = branches || discoverWorkBranches({ repo }).map((b) => b.branch);
  const rebuilt = [];
  for (const branch of found) {
    const f = reconstructBranch({ repo, branch, trunk, deploySurface });
    // A deterministic id from the durable identity, so reconstruction twice produces the same row rather
    // than two rows describing one branch.
    const id = uuidFrom(f.branch + '@' + (f.base_commit || 'root'));
    await db.write(
      `insert into factory.work_orders (work_order_id, title, status, branch, base_commit, latest_commit, candidate_sha)
       values ($1, $2, 'queued', $3, $4, $5, $6)
       on conflict (work_order_id) do update
         set latest_commit = excluded.latest_commit,
             candidate_sha = excluded.candidate_sha,
             updated_at = now()`,
      [id, 'reconstructed: ' + f.branch, f.branch, f.base_commit, f.latest_commit, f.candidate_sha]);
    rebuilt.push({ work_order_id: id, ...f });
  }
  return rebuilt;
}

/** A stable uuid from a string, so the same branch always reconstructs to the same work order id. */
export function uuidFrom(text) {
  const h = createHash('sha256').update(String(text)).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16),
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join('-');
}

if (process.argv[1] && /reconstruct\.mjs$/.test(process.argv[1])) {
  const repo = process.argv[2] || process.cwd();
  if (!existsSync(repo)) { console.log('no such repository: ' + repo); process.exit(2); }
  for (const b of discoverWorkBranches({ repo })) {
    const f = reconstructBranch({ repo, branch: b.branch,
      deploySurface: 'supabase/functions/sem-ai-command/index.ts' });
    console.log(f.branch.padEnd(42) + ' base ' + String(f.base_commit).slice(0, 8)
      + '  head ' + String(f.latest_commit).slice(0, 8)
      + '  +' + f.commits_ahead + ' commits'
      + (f.candidate_sha ? '  candidate ' + f.candidate_sha.slice(0, 12) : ''));
  }
}
