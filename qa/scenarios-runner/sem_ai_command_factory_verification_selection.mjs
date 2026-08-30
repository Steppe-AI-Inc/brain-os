// Permanent regression for qa/KNOWN_FAILURE_MODES.md #31 — sem-ai-command's
// factoryWorkOrders context builder (supabase/functions/sem-ai-command/index.ts, the
// `factoryWorkOrders = (factoryWorkOrdersRaw.data || []).map(...)` block) picked the
// wrong agent_runs row for verification reporting: the single most-recently-created run,
// which can be a Verifier's own commit-less bootstrap run created AFTER the real
// implementation commit. A fresh Brain Chat conversation would then correctly say a Work
// Order was "Completed" but incorrectly add "independent verification has not yet
// confirmed it" for a Work Order that genuinely was verified and completed for real
// (Work Order 5c33d4f3-a7ba-4a56-a406-a1ad1c4ef389, real commit
// 2116c712855cdbf448be9a579fdb8590fe41770b, real independent Verifier PASS).
//
// This is a pure JS/TS aggregation-logic bug, not a SQL/RLS invariant — the fixture data
// below is a byte-for-byte copy of the mapping logic actually shipped in
// supabase/functions/sem-ai-command/index.ts (kept in sync manually; a future edit to
// that block should be mirrored here, matching how supabase/schema-v0.7-production-core.sql
// mirrors migration DDL). Run with: node qa/scenarios-runner/sem_ai_command_factory_verification_selection.mjs
//
// Named regressions this file proves:
//   BRAIN_CHAT_COMPLETED_WORK_ORDER_REPORTS_VERIFIED
//   BRAIN_CHAT_VERIFICATION_SELECTS_CORRECT_AGENT_RUN
//   BRAIN_CHAT_MULTI_RUN_WORK_ORDER_REPORTS_VERIFICATION_TRUTH
// BRAIN_CHAT_UNRELATED_VERIFIER_ROW_CANNOT_OVERRIDE_WORK_ORDER_TRUTH is proved structurally
// (see the comment below `newLogic`'s `runs` derivation) plus empirically, live, in
// qa/KNOWN_FAILURE_MODES.md #31's post-deploy verification record (the underlying query,
// `canonical_work_orders.select(...,agent_runs(...))`, is a PostgREST embedded-resource
// join scoped by canonical_work_order_id — a different Work Order's agent_runs can never
// appear in this function's `runs` array in the first place, so this file's job is only to
// prove the SELECTION among a Work Order's own real rows is correct, which the scenarios
// below do).
// BRAIN_CHAT_FRESH_CONTEXT_MATCHES_COMPLETE_WORK_ORDER_STATE requires a real browser +
// real fresh Brain Chat conversation + real complete_work_order() state — an inherently
// live, not unit-testable, check — see qa/KNOWN_FAILURE_MODES.md #31's post-deploy Test A/D
// record for that evidence instead.

// ---- byte-for-byte copy of the shipped logic (supabase/functions/sem-ai-command/index.ts) ----
function newLogic(w) {
  const runs = Array.isArray(w.agent_runs) ? w.agent_runs : [];
  const lastRun = runs.length
    ? runs.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
    : null;
  const commitRuns = runs.filter((r) => r.head_commit);
  const isVerifiedRun = (r) =>
    r.status === 'done' && (r.verification_status === 'live_verified' || r.verification_status === 'e2e_verified');
  const allCommitsVerified = w.status === 'done'
    ? true
    : commitRuns.length > 0 && commitRuns.every(isVerifiedRun);
  const verifiedCommitRuns = commitRuns.filter(isVerifiedRun);
  const latestVerifiedRun = verifiedCommitRuns.length
    ? verifiedCommitRuns.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
    : null;
  const latestCommitRun = commitRuns.length
    ? commitRuns.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
    : null;
  const verificationRun = latestVerifiedRun ?? latestCommitRun ?? lastRun;
  return {
    lastRunStatus: lastRun?.status ?? null,
    commitBearingRunCount: commitRuns.length,
    allCommitsVerified,
    lastRunVerificationStatus: verificationRun?.verification_status ?? null,
    lastRunHeadCommit: verificationRun?.head_commit ?? null,
  };
}

let failed = false;
function assert(cond, name, detail) {
  if (!cond) { failed = true; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`PASS ${name}`);
}

// ============ BRAIN_CHAT_COMPLETED_WORK_ORDER_REPORTS_VERIFIED ============
// The real, live Work Order this bug was found on: status=done, one commit-bearing run
// verified on its own row, one commit-less Verifier bootstrap run created LATER.
const realWO = {
  id: '5c33d4f3-a7ba-4a56-a406-a1ad1c4ef389',
  status: 'done',
  agent_runs: [
    { status: 'done', verification_status: 'live_verified', head_commit: '2116c712855cdbf448be9a579fdb8590fe41770b', created_at: '2026-08-30T04:15:00.000Z' },
    { status: 'done', verification_status: null, head_commit: null, created_at: '2026-08-30T04:17:00.000Z' },
  ],
};
{
  const r = newLogic(realWO);
  assert(r.allCommitsVerified === true, 'BRAIN_CHAT_COMPLETED_WORK_ORDER_REPORTS_VERIFIED (allCommitsVerified)', JSON.stringify(r));
  assert(r.lastRunVerificationStatus === 'live_verified', 'BRAIN_CHAT_COMPLETED_WORK_ORDER_REPORTS_VERIFIED (lastRunVerificationStatus)', JSON.stringify(r));
}

// ============ BRAIN_CHAT_VERIFICATION_SELECTS_CORRECT_AGENT_RUN ============
// Same fixture proves selection: the commit-bearing row is picked, not the later-created,
// commit-less row that the OLD (buggy) "most-recently-created" logic would have picked.
{
  const r = newLogic(realWO);
  assert(r.lastRunHeadCommit === '2116c712855cdbf448be9a579fdb8590fe41770b', 'BRAIN_CHAT_VERIFICATION_SELECTS_CORRECT_AGENT_RUN', JSON.stringify(r));
}

// ============ BRAIN_CHAT_MULTI_RUN_WORK_ORDER_REPORTS_VERIFICATION_TRUTH ============
// Two commit-bearing runs, one verified one not (not yet done) - must NOT report verified.
const partialWO = {
  id: 'fixture-partial', status: 'in_progress',
  agent_runs: [
    { status: 'done', verification_status: 'live_verified', head_commit: 'verifiedcommit1', created_at: '2026-08-30T06:00:00.000Z' },
    { status: 'done', verification_status: null, head_commit: 'unverifiedcommit2', created_at: '2026-08-30T06:05:00.000Z' },
  ],
};
{
  const r = newLogic(partialWO);
  assert(r.allCommitsVerified === false, 'BRAIN_CHAT_MULTI_RUN_WORK_ORDER_REPORTS_VERIFICATION_TRUTH (partial -> false)', JSON.stringify(r));
}
// Two commit-bearing runs, BOTH verified - must report verified.
const bothVerifiedWO = {
  id: 'fixture-both-verified', status: 'in_progress',
  agent_runs: [
    { status: 'done', verification_status: 'live_verified', head_commit: 'verifiedcommit1', created_at: '2026-08-30T06:00:00.000Z' },
    { status: 'done', verification_status: 'e2e_verified', head_commit: 'verifiedcommit2', created_at: '2026-08-30T06:05:00.000Z' },
  ],
};
{
  const r = newLogic(bothVerifiedWO);
  assert(r.allCommitsVerified === true, 'BRAIN_CHAT_MULTI_RUN_WORK_ORDER_REPORTS_VERIFICATION_TRUTH (both verified -> true)', JSON.stringify(r));
}

// ============ Test B fixture: genuinely unverified, not done - must not claim verified ============
const unverifiedWO = {
  id: 'fixture-unverified', status: 'in_progress',
  agent_runs: [{ status: 'done', verification_status: null, head_commit: 'abc1234deadbeef', created_at: '2026-08-30T05:00:00.000Z' }],
};
{
  const r = newLogic(unverifiedWO);
  assert(r.allCommitsVerified === false, 'Test B fixture: unverified commit correctly not reported as verified', JSON.stringify(r));
}

// ============ Zero-run sanity ============
{
  const r = newLogic({ id: 'fixture-empty', status: 'in_progress', agent_runs: [] });
  assert(r.allCommitsVerified === false && r.commitBearingRunCount === 0, 'Zero runs: correctly reports unverified/zero, never falsely true');
}

console.log(failed ? '\nSOME REGRESSIONS FAILED' : '\nALL REGRESSIONS PASSED');
process.exit(failed ? 1 : 0);
