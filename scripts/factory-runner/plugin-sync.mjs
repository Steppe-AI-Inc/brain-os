// Software Factory — Plugin/GitHub Control Center sync.
//
// Real GitHub sync via the existing `gh` CLI (already used throughout this project's own
// tooling — never scraping HTML pages, matching the founder's explicit instruction).
// Discovers/refreshes metadata for a plugin_sources row: latest upstream commit SHA,
// license, whether an update is available relative to pinned_commit_sha. Deliberately
// does NOT execute any repository code — this script only ever reads GitHub API
// metadata, never clones+runs anything. The install pipeline's later stages (static
// security inspection, sandbox smoke test) are separate, deliberately gated steps, not
// folded into this script.
//
// Usage:
//   node plugin-sync.mjs discover <owner> <repo>          — register a new source, unreviewed
//   node plugin-sync.mjs check-updates [sourceId]          — refresh latest_upstream_sha /
//                                                             update_available for one or all sources

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';

function sqlEscape(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function runSql(sql) {
  const file = join(tmpdir(), `plugin-sync-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    // --linked ALONE — never combined with --project-ref (see
    // docs/software-factory/PHASE_8_SECURITY_INCIDENT.md).
    const { stdout } = await execFileAsync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], {
      cwd: REPO_ROOT,
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) throw new Error(`no JSON found in db query output: ${stdout}`);
    return JSON.parse(stdout.slice(jsonStart));
  } finally {
    unlinkSync(file);
  }
}

// Real GitHub API read via `gh api` — never HTML scraping, never a bare `git clone` of
// untrusted code. Returns null fields gracefully rather than throwing, since a
// discovered-but-unreviewed source may legitimately have an unreadable LICENSE file.
export async function fetchRepoMetadata(owner, repo) {
  const { stdout: repoJson } = await execFileAsync('gh', [
    'api', `repos/${owner}/${repo}`,
  ]);
  const repoMeta = JSON.parse(repoJson);

  const { stdout: branchJson } = await execFileAsync('gh', [
    'api', `repos/${owner}/${repo}/commits/${repoMeta.default_branch}`,
  ]);
  const headCommit = JSON.parse(branchJson);

  let license = repoMeta.license?.spdx_id ?? null;
  // GitHub's license-detection field is sometimes wrong/absent (a real, documented finding
  // from this session's own audit — Chatwoot and BMAD-METHOD both showed this). Read the
  // actual LICENSE file content when the API's own field looks unreliable ("NOASSERTION"
  // or missing) rather than trusting the summary field alone.
  if (!license || license === 'NOASSERTION') {
    try {
      const { stdout: licenseJson } = await execFileAsync('gh', [
        'api', `repos/${owner}/${repo}/license`,
      ]);
      const licenseMeta = JSON.parse(licenseJson);
      license = licenseMeta.license?.spdx_id ?? license;
    } catch {
      // No LICENSE file detected at all — leave as whatever the repo API reported
      // (possibly null), never fabricate a value.
    }
  }

  return {
    repositoryUrl: repoMeta.html_url,
    defaultBranch: repoMeta.default_branch,
    latestUpstreamSha: headCommit.sha,
    license,
    stars: repoMeta.stargazers_count,
    pushedAt: repoMeta.pushed_at,
  };
}

export async function discoverSource(owner, repo) {
  const meta = await fetchRepoMetadata(owner, repo);
  const sql = `
insert into public.plugin_sources (github_owner, github_repo, repository_url, default_branch, license, trust_status, last_checked_at, latest_upstream_sha, update_available)
values (${sqlEscape(owner)}, ${sqlEscape(repo)}, ${sqlEscape(meta.repositoryUrl)}, ${sqlEscape(meta.defaultBranch)}, ${sqlEscape(meta.license)}, 'unreviewed', now(), ${sqlEscape(meta.latestUpstreamSha)}, false)
on conflict (github_owner, github_repo) do update set
  repository_url = excluded.repository_url,
  default_branch = excluded.default_branch,
  license = excluded.license,
  last_checked_at = now(),
  latest_upstream_sha = excluded.latest_upstream_sha,
  updated_at = now()
returning id, github_owner, github_repo, trust_status, license, latest_upstream_sha;
`;
  return runSql(sql);
}

export async function checkUpdates(sourceId) {
  const where = sourceId ? `where id = ${sqlEscape(sourceId)}::uuid` : '';
  const result = await runSql(`select id, github_owner, github_repo, pinned_commit_sha from public.plugin_sources ${where};`);
  const rows = result.rows ?? [];
  const updates = [];
  for (const row of rows) {
    const meta = await fetchRepoMetadata(row.github_owner, row.github_repo);
    const updateAvailable = !!row.pinned_commit_sha && row.pinned_commit_sha !== meta.latestUpstreamSha;
    await runSql(`
update public.plugin_sources set
  latest_upstream_sha = ${sqlEscape(meta.latestUpstreamSha)},
  update_available = ${updateAvailable},
  last_checked_at = now(),
  updated_at = now()
where id = ${sqlEscape(row.id)}::uuid;
`);
    updates.push({ id: row.id, repo: `${row.github_owner}/${row.github_repo}`, updateAvailable, latestUpstreamSha: meta.latestUpstreamSha });
  }
  return updates;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'discover') {
    if (!a || !b) { console.error('Usage: node plugin-sync.mjs discover <owner> <repo>'); process.exit(1); }
    console.log(JSON.stringify(await discoverSource(a, b), null, 2));
  } else if (cmd === 'check-updates') {
    console.log(JSON.stringify(await checkUpdates(a), null, 2));
  } else {
    console.error('Usage: node plugin-sync.mjs <discover <owner> <repo> | check-updates [sourceId]>');
    process.exit(1);
  }
}

{
  main().catch((e) => {
    console.error('PLUGIN-SYNC FAILED:', e);
    process.exit(1);
  });
}
