// Permanent regressions for Factory provider-capacity recovery (2026-09-03).
//
// Real incident, three occurrences: an Agent Run's CLI process exited 0 whose only
// output was "You've hit your session limit". Classification alone was not enough —
// nothing relaunched the run, because the only candidate relauncher was the session
// whose quota had died. These tests pin the whole recovery contract:
//
//   EXIT_ZERO_PLUS_SESSION_LIMIT_IS_BLOCKED
//   PROVIDER_CAPACITY_BLOCKED_HAS_RETRY_AFTER
//   PROCESS_DEATH_DOES_NOT_END_WORK_ORDER
//   SUPERVISOR_RESTARTS_ELIGIBLE_BLOCKED_RUN
//   RESTART_LOADS_DURABLE_CHECKPOINT
//   RESTART_PRESERVES_EXACT_SOURCE_SHA
//   COMPLETED_VERIFIER_SCENARIOS_ARE_NOT_DUPLICATED
//   TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN
//   SOURCE_SHA_CHANGE_INVALIDATES_PARTIAL_CERTIFICATION
//   AUTHORIZATION_STATE_SURVIVES_RESTART_WITH_EXACT_SCOPE
//
// Pure-function tests (no DB, no spawn) plus source-level assertions for the two
// invariants that live in SQL. Runnable with plain node --test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { classifyProviderOutput, PROVIDER_CAPACITY_BLOCKED } from './provider.mjs';
import { computeRetryAfter, isRetryEligible, planResume, buildResumePrompt, MAX_ATTEMPTS } from './supervisor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_RAW = readFileSync(resolve(here, '../../supabase/migrations/202609030001_agent_run_capacity_retry.sql'), 'utf8');
// D63 class (found by mutation-testing THIS file): a '-- FOR UPDATE SKIP LOCKED is the
// whole point' comment satisfied the live-code assertion, so deleting the real clause
// went undetected. Assert against comment-stripped SQL only.
const MIGRATION = MIGRATION_RAW
  .split(String.fromCharCode(10))
  .filter((l) => !/^\s*--/.test(l))
  .join(String.fromCharCode(10));
const SUPERVISOR_SRC = readFileSync(resolve(here, 'supervisor.mjs'), 'utf8');

const blockedRun = (over = {}) => ({
  id: 'run-1',
  status: 'blocked',
  blocked_reason: `${PROVIDER_CAPACITY_BLOCKED}: retryable provider quota (retry_after from provider_stated_reset)`,
  retry_after: new Date(Date.now() - 60_000).toISOString(),
  claimed_by: null,
  attempt_count: 1,
  source_sha: 'sha-under-test',
  branch: 'pending/x',
  worktree: null,
  checkpoint_location: 'qa/verification/CURRENT_CAMPAIGN.json',
  last_completed_scenario: '1_execute_full_battery',
  remaining_scenarios: ['2_mutation', '3_attacks'],
  verification_campaign_id: 'verify-abc-final',
  ...over,
});

// ---- EXIT_ZERO_PLUS_SESSION_LIMIT_IS_BLOCKED --------------------------------------
test('EXIT_ZERO_PLUS_SESSION_LIMIT_IS_BLOCKED: the live text classifies, and nothing about exit 0 makes it a success', () => {
  const live = "You've hit your session limit · resets 3:40am (Asia/Ulaanbaatar)";
  const c = classifyProviderOutput(live);
  assert.ok(c, 'the exact observed output must classify');
  assert.equal(c.classification, PROVIDER_CAPACITY_BLOCKED);
  // And the run built from it is eligible for RETRY, i.e. modelled as blocked-retryable,
  // never terminal.
  assert.equal(isRetryEligible(blockedRun()), true);
});

// ---- PROVIDER_CAPACITY_BLOCKED_HAS_RETRY_AFTER ------------------------------------
test('PROVIDER_CAPACITY_BLOCKED_HAS_RETRY_AFTER: the provider-stated reset time wins', () => {
  const now = new Date('2026-09-03T01:00:00');
  const { retryAfter, source } = computeRetryAfter("You've hit your session limit · resets 3:40am (Asia/Ulaanbaatar)", 1, now);
  assert.equal(source, 'provider_stated_reset');
  assert.equal(retryAfter.getHours(), 3);
  assert.equal(retryAfter.getMinutes(), 40);
  assert.ok(retryAfter.getTime() > now.getTime(), 'retry must be in the future');
});

test('PROVIDER_CAPACITY_BLOCKED_HAS_RETRY_AFTER: a reset time already past today rolls to tomorrow', () => {
  const now = new Date('2026-09-03T05:00:00');
  const { retryAfter } = computeRetryAfter('resets 3:40am', 1, now);
  assert.ok(retryAfter.getTime() > now.getTime());
  assert.equal(retryAfter.getDate(), now.getDate() + 1);
});

test('PROVIDER_CAPACITY_BLOCKED_HAS_RETRY_AFTER: no stated time -> BOUNDED backoff, never immediate, never unbounded', () => {
  const now = new Date('2026-09-03T01:00:00');
  const first = computeRetryAfter('quota exceeded', 1, now);
  const later = computeRetryAfter('quota exceeded', 5, now);
  assert.equal(first.source, 'bounded_backoff');
  assert.ok(first.retryAfter.getTime() - now.getTime() >= 15 * 60_000, 'never an immediate retry loop');
  assert.ok(later.retryAfter.getTime() > first.retryAfter.getTime(), 'backoff grows with attempts');
  const beyond = computeRetryAfter('quota exceeded', 99, now);
  assert.ok(beyond.retryAfter.getTime() - now.getTime() <= 24 * 60 * 60_000, 'backoff stays bounded');
});

// ---- PROCESS_DEATH_DOES_NOT_END_WORK_ORDER ----------------------------------------
test('PROCESS_DEATH_DOES_NOT_END_WORK_ORDER: retry ownership lives outside the Claude session', () => {
  // The supervisor's claim path must not depend on the blocked session existing: it
  // reads durable state and spawns a NEW session.
  assert.match(SUPERVISOR_SRC, /claim_blocked_run_for_retry/);
  assert.match(SUPERVISOR_SRC, /'--bg', prompt/);
  assert.ok(!/provider_run_id/.test(SUPERVISOR_SRC),
    'the supervisor must never require the dead run\'s provider session id to recover it');
});

// ---- SUPERVISOR_RESTARTS_ELIGIBLE_BLOCKED_RUN / eligibility discipline -------------
test('SUPERVISOR_RESTARTS_ELIGIBLE_BLOCKED_RUN: only genuinely eligible runs restart', () => {
  const now = new Date();
  assert.equal(isRetryEligible(blockedRun(), now), true);
  assert.equal(isRetryEligible(blockedRun({ retry_after: new Date(Date.now() + 3600_000).toISOString() }), now), false,
    'a run whose window has not arrived must not restart');
  assert.equal(isRetryEligible(blockedRun({ claimed_by: 'supervisor-other' }), now), false,
    'an already-claimed run must not restart again');
  assert.equal(isRetryEligible(blockedRun({ status: 'in_progress' }), now), false);
  assert.equal(isRetryEligible(blockedRun({ blocked_reason: 'agent crashed: TypeError' }), now), false,
    'an unclassified failure must NOT be auto-restarted — that would loop on a real bug');
  assert.equal(isRetryEligible(blockedRun({ attempt_count: MAX_ATTEMPTS }), now), false,
    'attempts are bounded');
  assert.equal(isRetryEligible(null, now), false);
});

// ---- RESTART_LOADS_DURABLE_CHECKPOINT ---------------------------------------------
test('RESTART_LOADS_DURABLE_CHECKPOINT: the resume prompt carries campaign, checkpoint, sha, branch', () => {
  const run = blockedRun({ attempt_count: 2 });
  const prompt = buildResumePrompt(run, planResume(run, 'sha-under-test'));
  assert.match(prompt, /verify-abc-final/);
  assert.match(prompt, /qa\/verification\/CURRENT_CAMPAIGN\.json/);
  assert.match(prompt, /sha-under-test/);
  assert.match(prompt, /pending\/x/);
  assert.match(prompt, /not a failure and not a pass/i,
    'the restarted session must be told the prior attempt was blocked, not failed or passed');
});

// ---- RESTART_PRESERVES_EXACT_SOURCE_SHA + COMPLETED_VERIFIER_SCENARIOS_ARE_NOT_DUPLICATED
test('COMPLETED_VERIFIER_SCENARIOS_ARE_NOT_DUPLICATED: same sha resumes at the first unfinished scenario', () => {
  const run = blockedRun();
  const plan = planResume(run, 'sha-under-test');
  assert.equal(plan.reuseCompletedScenarios, true);
  assert.equal(plan.startFrom, '2_mutation');
  assert.equal(plan.invalidatedCertification, false);
  assert.match(buildResumePrompt(run, plan), /Do NOT re-run scenarios already recorded complete/);
});

// ---- SOURCE_SHA_CHANGE_INVALIDATES_PARTIAL_CERTIFICATION ---------------------------
test('SOURCE_SHA_CHANGE_INVALIDATES_PARTIAL_CERTIFICATION: moved source discards prior evidence', () => {
  const run = blockedRun();
  const plan = planResume(run, 'sha-DIFFERENT');
  assert.equal(plan.reuseCompletedScenarios, false);
  assert.equal(plan.startFrom, 'scenario_1');
  assert.equal(plan.invalidatedCertification, true);
  assert.match(buildResumePrompt(run, plan), /CERTIFICATION INVALIDATED/);
});

test('SOURCE_SHA_CHANGE_INVALIDATES_PARTIAL_CERTIFICATION: an unrecorded sha is treated as a mismatch (fail closed)', () => {
  assert.equal(planResume(blockedRun({ source_sha: null }), 'sha-under-test').reuseCompletedScenarios, false);
  assert.equal(planResume(blockedRun(), null).reuseCompletedScenarios, false);
});

// ---- TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN ------------------------------------
test('TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN: the claim is atomic in SQL', () => {
  assert.match(MIGRATION, /for update skip locked/i,
    'row-level claim must use FOR UPDATE SKIP LOCKED — two supervisors take different rows or none');
  assert.match(MIGRATION, /and ar\.claimed_by is null/i);
  assert.match(MIGRATION, /set status = 'in_progress'::public\.work_status,\s*\n\s*claimed_by = p_claimed_by/i,
    'claiming must flip status and stamp the claimant in the same transaction');
});

test('TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN: status never goes BLOCKED -> COMPLETED on restart', () => {
  assert.ok(!/'done'::public\.work_status/.test(MIGRATION),
    'the claim function must never mark a blocked run done — it restarts it');
  assert.match(MIGRATION, /resumed_after_provider_capacity_block/);
});

// ---- AUTHORIZATION_STATE_SURVIVES_RESTART_WITH_EXACT_SCOPE ------------------------
test('AUTHORIZATION_STATE_SURVIVES_RESTART_WITH_EXACT_SCOPE: restarting is founder/admin authority and grants nothing new', () => {
  assert.match(MIGRATION, /if not public\.is_founder_or_admin\(\) then/,
    'claiming a production Agent Run for restart is real factory authority');
  assert.match(MIGRATION, /revoke execute on function public\.claim_blocked_run_for_retry\(text\) from anon, public;/);
  assert.match(MIGRATION, /security definer[\s\S]*set search_path = ''/i);
  // The resume prompt must not carry or imply any deployment authorization.
  const prompt = buildResumePrompt(blockedRun(), planResume(blockedRun(), 'sha-under-test'));
  assert.ok(!/ALLOW_FUNCTIONS_DEPLOY/.test(prompt) && !/db push/i.test(prompt),
    'a restart must never smuggle a production authorization into the new session');
});

// ---- No silent provider/model substitution ----------------------------------------
test('NO_SILENT_PROVIDER_FALLBACK: requested and actual provider/model are separate durable columns', () => {
  for (const col of ['requested_provider', 'requested_model', 'actual_provider', 'actual_model', 'fallback_reason']) {
    assert.ok(MIGRATION.includes(`add column if not exists ${col} `),
      `${col} must be ADDED by this migration (not merely referenced elsewhere) so a provider/model substitution is always visible, never implied`);
  }
  assert.match(SUPERVISOR_SRC, /never silently substitutes/);
});
