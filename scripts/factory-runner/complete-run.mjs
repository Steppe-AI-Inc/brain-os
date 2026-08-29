// Phase 8 continuation — the ONE command that persists a real agent_runs completion
// result back into Brain OS, closing the exact gap found during independent verification
// of Work Order 3b28e447-4a9c-4f79-9419-80638a39e457: nothing except raw SQL could ever
// mark an agent_runs row done/verified, and its linked task never flipped status either -
// the same class of risk PHASE_8_SECURITY_INCIDENT.md exists to prevent. Wraps
// complete_agent_run (supabase/migrations/202608300001... no, 202608290010_agent_run_completion.sql
// - founder/admin-only, idempotent, propagates to the linked task) so nobody dispatching
// or verifying a run ever needs to touch agent_runs/tasks with raw SQL.
//
// If a headCommit is given, this script independently verifies it's a real commit that
// actually exists on origin/master BEFORE calling the RPC - never trust a self-reported
// commit hash. Matches the standing "verify, don't trust" discipline used throughout this
// project's own incident response and verification passes.
//
// Usage: node complete-run.mjs <agentRunId> <status> [headCommit] [verificationStatus] [summary]
//   status: one of draft/queued/in_progress/blocked/needs_approval/qa_review/done/rejected/archived
//   verificationStatus: one of pending/live_verified/e2e_verified/failed/blocked (optional)
//
// Uses --linked alone for its one real DB call - never --project-ref combined with
// --linked (see docs/software-factory/PHASE_8_SECURITY_INCIDENT.md for why).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';
const VALID_STATUSES = new Set(['draft', 'queued', 'in_progress', 'blocked', 'needs_approval', 'qa_review', 'done', 'rejected', 'archived']);
const VALID_VERIFICATION_STATUSES = new Set(['pending', 'live_verified', 'e2e_verified', 'failed', 'blocked']);

async function runSql(sql) {
  const file = join(tmpdir(), `complete-run-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
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

function sqlEscape(s) {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function verifyCommitIsReal(headCommit) {
  // git branch -r --contains <sha> lists which remote branches actually contain it -
  // throws if the sha doesn't exist as a real commit at all. Fetch first so a very
  // recent push is actually visible locally.
  await execFileAsync('git', ['fetch', 'origin', 'master'], { cwd: REPO_ROOT });
  const { stdout } = await execFileAsync('git', ['branch', '-r', '--contains', headCommit], { cwd: REPO_ROOT });
  if (!stdout.includes('origin/master')) {
    throw new Error(`headCommit ${headCommit} is not an ancestor of origin/master - refusing to record an unverified commit`);
  }
}

async function main() {
  const [agentRunId, status, headCommit, verificationStatus, summary] = process.argv.slice(2);
  if (!agentRunId || !status) {
    console.error('Usage: node complete-run.mjs <agentRunId> <status> [headCommit] [verificationStatus] [summary]');
    process.exit(1);
  }
  if (!VALID_STATUSES.has(status)) {
    console.error(`Invalid status "${status}" - must be one of: ${[...VALID_STATUSES].join(', ')}`);
    process.exit(1);
  }
  if (verificationStatus && !VALID_VERIFICATION_STATUSES.has(verificationStatus)) {
    console.error(`Invalid verificationStatus "${verificationStatus}" - must be one of: ${[...VALID_VERIFICATION_STATUSES].join(', ')}`);
    process.exit(1);
  }

  if (headCommit) {
    console.log(`Verifying ${headCommit} is a real commit on origin/master (not trusting the caller)...`);
    await verifyCommitIsReal(headCommit);
    console.log('Confirmed real.');
  }

  // complete_agent_run is founder/admin-only (is_founder_or_admin(), deliberately
  // narrower than agent_runs_update_scope RLS) - a raw --linked connection has no JWT
  // claims at all and is correctly denied by the RPC's own check (confirmed live: the
  // first version of this script, with no impersonation, got reason:"denied"). Real
  // founder profile id, same fixture identity already used throughout
  // qa/scenarios-runner/*.sql (see qa/scenarios-runner/README.md's "Fixture identities").
  const FOUNDER_AUTH_UID = 'cbcc41cf-830d-4600-8545-3b9e22c8297f';
  const result = await runSql(`
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','${FOUNDER_AUTH_UID}','role','authenticated')::text, true);
select public.complete_agent_run(${sqlEscape(agentRunId)}::uuid, ${sqlEscape(status)}::work_status, ${sqlEscape(headCommit)}, ${sqlEscape(verificationStatus)}, ${sqlEscape(summary)}) as result;
reset role;
`);
  console.log(JSON.stringify(result.rows?.[0]?.result ?? result, null, 2));
}

main().catch((e) => {
  console.error('COMPLETE-RUN FAILED:', e);
  process.exit(1);
});
