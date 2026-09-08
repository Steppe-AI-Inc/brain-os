// Regressions for the release-broker decision core.
//
// These run with `node --test`. No network, no credentials, no CLI, no production access — which is
// the point: a guard that can only be exercised against production is a guard nobody exercises, and
// this campaign has now produced nine separate instances of a measurement that could not fail.
//
// The headline case, BROKER_REFUSES_PENDING_MIGRATION_NOT_NAMED_IN_MANIFEST, is the September 2026
// incident reproduced exactly: A/B/D authorized, C and 202609040001 excluded, `db push` applies
// every pending migration, all five land in production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApplyPlan, reconcileAfterApply, REFUSAL } from './plan.mjs';

// ── the real versions and filenames from the incident ───────────────────────────────────────────
const A = { version: '202609020001', filename: '202609020001_chat_channel_state_durable_conversation.sql', sha256: 'a'.repeat(64) };
const B = { version: '202609020002', filename: '202609020002_set_person_assignment_clear_manager.sql', sha256: 'b'.repeat(64) };
const C = { version: '202609020003', filename: '202609020003_messaging_transport_foundation.sql', sha256: 'c'.repeat(64) };
const D = { version: '202609030001', filename: '202609030001_agent_run_capacity_retry.sql', sha256: 'd'.repeat(64) };
const X = { version: '202609040001', filename: '202609040001_chat_channels_creator_immutable.sql', sha256: 'e'.repeat(64) };

const ALL = [A, B, C, D, X];
const PRIOR = ['202606190001', '202609010001', '202609010002'];
const PRIOR_FILES = PRIOR.map((v) => v + '_prior.sql');
const REF = 'pvphxgrtdfrudejjhzjk';
const COMMIT = 'e7c943e0000000000000000000000000000000ab';

const manifest = (over = {}) => ({
  authorization_id: 'AUTH-2026-09-08-001',
  schema_version: 1,
  scope: 'supabase_db_migrations',
  target_environment: 'production',
  project_ref: REF,
  issued_at: '2026-09-08T09:00:00Z',
  expires_at: '2026-09-09T09:00:00Z',
  requested_by: 'main-pc-session',
  founder_approval_scope: 'A, B and D only. C and 202609040001 are EXCLUDED.',
  package_commit: COMMIT,
  approved_migrations: [A, B, D],
  excluded_migrations: [C, X],
  execution_model: 'SELECTIVE_CURATION',
  selective_execution: {
    mechanism: 'curated-migration-directory',
    verified_by: 'scripts/release-broker/plan.regression.test.mjs::EXCLUDED_MIGRATION_NEVER_ENTERS_THE_CURATED_DIRECTORY',
    excluded_scope: [C.version, X.version],
  },
  rollback: { kind: 'forward_fix_only', note: 'No down migration prepared.' },
  ...over,
});

const facts = (over = {}) => {
  const files = [...PRIOR_FILES, ...ALL.map((m) => m.filename)];
  const hashes = Object.fromEntries(ALL.map((m) => [m.filename, m.sha256]));
  const clean = Object.fromEntries(ALL.map((m) => [m.filename, true]));
  return {
    manifest: manifest(),
    appliedVersions: [...PRIOR],
    migrationFilesAtCheckout: files,
    fileHashes: hashes,
    gitDiffClean: clean,
    ciConclusion: 'success',
    ancestorOfMaster: true,
    workflowProjectRef: REF,
    inputs: { authorization_id: 'AUTH-2026-09-08-001', git_commit: COMMIT, confirm_project_ref: REF,
      selective_execution_verified: true },
    now: new Date('2026-09-08T10:00:00Z'),
    ...over,
  };
};

// ── the happy path, so every refusal below is a real signal and not a suite that always refuses ──
test('the authorized batch applies, and neither excluded migration survives curation', () => {
  const r = buildApplyPlan(facts());
  assert.equal(r.decision, 'APPLY');
  assert.deepEqual(r.applySet, ['202609020001', '202609020002', '202609030001']);
  // The mechanism: the excluded files are DELETED from the curated dir, so the CLI cannot apply
  // them even if the equality check that follows were removed.
  assert.ok(r.curatedDelete.includes(C.filename), 'C must be curated out');
  assert.ok(r.curatedDelete.includes(X.filename), '202609040001 must be curated out');
  assert.ok(r.curatedKeep.includes(A.filename) && r.curatedKeep.includes(D.filename));
  for (const f of PRIOR_FILES) assert.ok(r.curatedKeep.includes(f), 'already-applied files stay');
});

test('EXCLUDED_MIGRATION_NEVER_ENTERS_THE_CURATED_DIRECTORY', () => {
  const r = buildApplyPlan(facts());
  const keptVersions = r.curatedKeep.map((f) => f.slice(0, 12));
  assert.ok(!keptVersions.includes(C.version));
  assert.ok(!keptVersions.includes(X.version));
});

// ── THE INCIDENT ────────────────────────────────────────────────────────────────────────────────
test('BROKER_REFUSES_PENDING_MIGRATION_NOT_NAMED_IN_MANIFEST — the September 2026 incident', () => {
  // The manifest approves A/B/D and says nothing at all about C or 202609040001 — which is exactly
  // the shape the authorization took: three migrations approved, the others simply not mentioned.
  // `db push` then applied all five, because it applies every pending migration.
  const r = buildApplyPlan(facts({
    manifest: manifest({ approved_migrations: [A, B, D], excluded_migrations: [] }),
  }));
  assert.equal(r.decision, 'REFUSE');
  assert.equal(r.code, REFUSAL.PENDING_MIGRATION_NOT_IN_MANIFEST);
  assert.deepEqual(r.unaccounted.sort(), [C.filename, X.filename].sort());
});

// Naming them as excluded is NECESSARY but no longer SUFFICIENT — see the execution-model tests
// below. The manifest must also declare that this is a partial release and say what its scope is.
test('a fully declared and independently verified partial release is authorizable', () => {
  const r = buildApplyPlan(facts());
  assert.equal(r.decision, 'APPLY');
  assert.deepEqual(r.excludedVersions, [C.version, X.version].sort());
  assert.equal(r.executionModel, 'SELECTIVE_CURATION');
  assert.deepEqual(r.pendingVersions, [A, B, C, D, X].map((m) => m.version).sort());
});

// ── ACTUAL_PENDING_SET == AUTHORIZED_PENDING_SET ────────────────────────────────────────────────
// The founder's correction to the first cut of this core: accounting for C and X under
// excluded_migrations let the release proceed with the authorization reading as though the tree
// matched what was approved. It did not. A partial release must be declared, scoped and verified,
// and the default must be equality.

test('BROKER_REFUSES_A_MANIFEST_THAT_DOES_NOT_DECLARE_ITS_EXECUTION_MODEL', () => {
  const m = manifest();
  delete m.execution_model;
  const r = buildApplyPlan(facts({ manifest: m }));
  assert.equal(r.decision, 'REFUSE');
  assert.equal(r.code, REFUSAL.EXECUTION_MODEL_UNDECLARED);
});

test('BROKER_REFUSES_ALL_PENDING_WHEN_THE_TREE_HOLDS_MORE_THAN_WAS_AUTHORIZED', () => {
  // A/B/D authorized, C and X pending and NOT excluded — declared as a full release, which is a
  // lie about the tree. The broker must not narrow the apply set to the intersection.
  const r = buildApplyPlan(facts({
    manifest: manifest({ execution_model: 'ALL_PENDING', excluded_migrations: [],
      selective_execution: undefined }),
  }));
  assert.equal(r.decision, 'REFUSE');
  // The unaccounted check fires first and is the more specific complaint; either refusal is
  // correct, and asserting the disjunction keeps the test honest about the ordering.
  assert.ok([REFUSAL.PENDING_MIGRATION_NOT_IN_MANIFEST, REFUSAL.ACTUAL_PENDING_SET_NOT_AUTHORIZED]
    .includes(r.code), 'unexpected code: ' + r.code);
});

test('BROKER_REFUSES_ALL_PENDING_THAT_ALSO_LISTS_EXCLUSIONS', () => {
  const r = buildApplyPlan(facts({ manifest: manifest({ execution_model: 'ALL_PENDING' }) }));
  assert.equal(r.code, REFUSAL.EXECUTION_MODEL_CONTRADICTS_MANIFEST);
});

test('BROKER_REFUSES_ALL_PENDING_THAT_LEAVES_AUTHORIZED_WORK_UNAPPLIED', () => {
  // The other direction of the equality: authorized work that is not pending. It cannot reach the
  // ACTUAL_PENDING_SET_NOT_AUTHORIZED check, because an approved version is absent from the pending
  // set for only two reasons and both have an earlier, more specific guard — the file is missing at
  // the checkout (FILE_MISSING_AT_CHECKOUT) or it is already applied remotely
  // (APPROVED_ALREADY_APPLIED). Asserting the specific code here would be asserting something the
  // core cannot produce, so this test pins the REFUSAL and names the guard that owns each case.
  const missing = buildApplyPlan(facts({
    manifest: manifest({ execution_model: 'ALL_PENDING', approved_migrations: [A, B, D],
      excluded_migrations: [], selective_execution: undefined }),
    migrationFilesAtCheckout: [...PRIOR_FILES, A.filename, B.filename],
  }));
  assert.equal(missing.decision, 'REFUSE');
  assert.equal(missing.code, REFUSAL.FILE_MISSING_AT_CHECKOUT);

  const alreadyApplied = buildApplyPlan(facts({
    manifest: manifest({ execution_model: 'ALL_PENDING', approved_migrations: [A, B, D],
      excluded_migrations: [], selective_execution: undefined }),
    appliedVersions: [...PRIOR, D.version],
  }));
  assert.equal(alreadyApplied.decision, 'REFUSE');
  assert.equal(alreadyApplied.code, REFUSAL.APPROVED_ALREADY_APPLIED);
});

test('BROKER_REFUSES_SELECTIVE_CURATION_WITH_NO_SELECTIVE_EXECUTION_BLOCK', () => {
  const m = manifest();
  delete m.selective_execution;
  assert.equal(buildApplyPlan(facts({ manifest: m })).code, REFUSAL.SELECTIVE_EXECUTION_UNVERIFIED);
});

test('BROKER_REFUSES_WHEN_THE_DECLARED_SCOPE_DOES_NOT_MATCH_THE_EXCLUSIONS', () => {
  // The declaration says only C is being held back; the manifest actually holds back C and X. The
  // approver reading the declaration would not learn that X is also being skipped.
  const m = manifest();
  m.selective_execution = { ...m.selective_execution, excluded_scope: [C.version] };
  assert.equal(buildApplyPlan(facts({ manifest: m })).code, REFUSAL.SELECTIVE_EXECUTION_SCOPE_MISMATCH);
});

test('BROKER_REFUSES_A_PARTIAL_RELEASE_THE_SUBSTRATE_HAS_NOT_VERIFIED', () => {
  // A manifest may not certify its own selectivity. Only the substrate says whether the curation
  // mechanism was actually proven for this run.
  const r = buildApplyPlan(facts({
    inputs: { authorization_id: 'AUTH-2026-09-08-001', git_commit: COMMIT, confirm_project_ref: REF },
  }));
  assert.equal(r.decision, 'REFUSE');
  assert.equal(r.code, REFUSAL.SELECTIVE_EXECUTION_UNVERIFIED);
});

test('BROKER_REFUSES_A_PARTIAL_RELEASE_THAT_STILL_MISSES_A_PENDING_FILE', () => {
  // Approved ∪ excluded must be the WHOLE pending set even under selective curation.
  const extra = '202609050001_something_nobody_mentioned.sql';
  const r = buildApplyPlan(facts({
    migrationFilesAtCheckout: [...PRIOR_FILES, A.filename, B.filename, C.filename, D.filename,
      X.filename, extra],
  }));
  assert.equal(r.decision, 'REFUSE');
  assert.equal(r.code, REFUSAL.PENDING_MIGRATION_NOT_IN_MANIFEST);
  assert.deepEqual(r.unaccounted, [extra]);
});

// ── the rest of the refusal surface ─────────────────────────────────────────────────────────────
test('BROKER_REFUSES_WHEN_FILE_BYTES_DIFFER_FROM_MANIFEST_HASH', () => {
  const bad = { ...Object.fromEntries(ALL.map((m) => [m.filename, m.sha256])), [D.filename]: 'f'.repeat(64) };
  const r = buildApplyPlan(facts({ fileHashes: bad }));
  assert.equal(r.code, REFUSAL.FILE_HASH_MISMATCH);
  assert.equal(r.filename, D.filename);
});

test('BROKER_REFUSES_WHEN_A_FILE_DIFFERS_FROM_THE_REVIEWED_PACKAGE', () => {
  const clean = { ...Object.fromEntries(ALL.map((m) => [m.filename, true])), [B.filename]: false };
  assert.equal(buildApplyPlan(facts({ gitDiffClean: clean })).code, REFUSAL.FILE_DIFFERS_FROM_PACKAGE_COMMIT);
});

test('BROKER_REFUSES_WHEN_COMMIT_IS_NOT_ANCESTOR_OF_MASTER', () => {
  assert.equal(buildApplyPlan(facts({ ancestorOfMaster: false })).code, REFUSAL.COMMIT_NOT_ANCESTOR_OF_MASTER);
});

test('BROKER_REFUSES_ABBREVIATED_COMMIT', () => {
  const r = buildApplyPlan(facts({ inputs: { authorization_id: 'AUTH-2026-09-08-001', git_commit: 'e7c943e', confirm_project_ref: REF } }));
  assert.equal(r.code, REFUSAL.COMMIT_MALFORMED);
});

test('BROKER_REFUSES_PROJECT_REF_MISMATCH_ACROSS_INPUT_MANIFEST_AND_WORKFLOW_CONSTANT', () => {
  // Each of the three sources disagreeing on its own is enough. No single edit retargets the broker.
  assert.equal(buildApplyPlan(facts({ workflowProjectRef: 'someotherproject' })).code, REFUSAL.PROJECT_REF_MISMATCH);
  assert.equal(buildApplyPlan(facts({ manifest: manifest({ project_ref: 'someotherproject' }) })).code, REFUSAL.PROJECT_REF_MISMATCH);
  const r = buildApplyPlan(facts({ inputs: { authorization_id: 'AUTH-2026-09-08-001', git_commit: COMMIT, confirm_project_ref: 'someotherproject' } }));
  assert.equal(r.code, REFUSAL.PROJECT_REF_MISMATCH);
});

test('BROKER_REFUSES_WHEN_MIGRATION_VALIDATION_NOT_GREEN_FOR_THE_EXACT_COMMIT', () => {
  assert.equal(buildApplyPlan(facts({ ciConclusion: 'failure' })).code, REFUSAL.VALIDATION_NOT_GREEN_FOR_COMMIT);
  assert.equal(buildApplyPlan(facts({ ciConclusion: null })).code, REFUSAL.VALIDATION_NOT_GREEN_FOR_COMMIT);
});

test('BROKER_REFUSES_EXPIRED_OR_FUTURE_DATED_AUTHORIZATION', () => {
  assert.equal(buildApplyPlan(facts({ now: new Date('2026-09-10T00:00:00Z') })).code, REFUSAL.AUTHORIZATION_EXPIRED);
  assert.equal(buildApplyPlan(facts({ now: new Date('2026-09-07T00:00:00Z') })).code, REFUSAL.AUTHORIZATION_NOT_YET_VALID);
});

test('BROKER_REFUSES_MANIFEST_WITHOUT_ROLLBACK_BLOCK', () => {
  const m = manifest(); delete m.rollback;
  assert.equal(buildApplyPlan(facts({ manifest: m })).code, REFUSAL.ROLLBACK_BLOCK_MISSING);
});

test('BROKER_REFUSES_AUTHORIZATION_ID_MISMATCH', () => {
  const r = buildApplyPlan(facts({ inputs: { authorization_id: 'AUTH-OTHER', git_commit: COMMIT, confirm_project_ref: REF } }));
  assert.equal(r.code, REFUSAL.AUTHORIZATION_ID_MISMATCH);
});

test('BROKER_REFUSES_TO_CURATE_BLIND_WHEN_REMOTE_HISTORY_IS_UNREADABLE', () => {
  // The curated set is computed FROM the applied list. An empty list would silently mean
  // "every file is pending", which is the most dangerous possible misreading.
  assert.equal(buildApplyPlan(facts({ appliedVersions: [] })).code, REFUSAL.REMOTE_HISTORY_UNREADABLE);
});

test('BROKER_REFUSES_WHEN_AN_APPROVED_VERSION_IS_ALREADY_APPLIED', () => {
  const r = buildApplyPlan(facts({ appliedVersions: [...PRIOR, A.version] }));
  assert.equal(r.code, REFUSAL.APPROVED_ALREADY_APPLIED);
});

test('BROKER_REFUSES_WHEN_AN_EXCLUDED_VERSION_IS_ALREADY_APPLIED — production today', () => {
  // This is the CURRENT state of production: C and 202609040001 are recorded as applied. The
  // broker must refuse every write until that is reconciled deliberately, so this test doubles as
  // the reconciliation gate.
  const r = buildApplyPlan(facts({ appliedVersions: [...PRIOR, C.version, X.version] }));
  assert.equal(r.code, REFUSAL.EXCLUDED_ALREADY_APPLIED);
});

test('BROKER_REFUSES_A_MANIFEST_THAT_APPROVES_NOTHING', () => {
  const r = buildApplyPlan(facts({ manifest: manifest({ approved_migrations: [], excluded_migrations: [C, X] }) }));
  assert.equal(r.code, REFUSAL.NOTHING_TO_APPLY);
});

test('BROKER_REFUSES_A_FILE_NAMED_IN_THE_MANIFEST_BUT_ABSENT_FROM_THE_COMMIT', () => {
  const files = [...PRIOR_FILES, ...ALL.filter((m) => m !== D).map((m) => m.filename)];
  assert.equal(buildApplyPlan(facts({ migrationFilesAtCheckout: files })).code, REFUSAL.FILE_MISSING_AT_CHECKOUT);
});

test('BROKER_REFUSES_AN_UNSUPPORTED_MANIFEST_SCHEMA', () => {
  assert.equal(buildApplyPlan(facts({ manifest: manifest({ schema_version: 2 }) })).code, REFUSAL.MANIFEST_SCHEMA_UNSUPPORTED);
});

test('BROKER_REFUSES_A_MANIFEST_ENTRY_WITHOUT_A_REAL_HASH', () => {
  const m = manifest({ approved_migrations: [A, B, { ...D, sha256: 'not-a-hash' }] });
  assert.equal(buildApplyPlan(facts({ manifest: m })).code, REFUSAL.MANIFEST_SCHEMA_UNSUPPORTED);
});

// ── post-apply reconciliation ───────────────────────────────────────────────────────────────────
test('reconciliation passes only when history is exactly prior plus the approved set', () => {
  const ok = reconcileAfterApply({
    appliedBefore: PRIOR,
    appliedAfter: [...PRIOR, A.version, B.version, D.version],
    applySet: [A.version, B.version, D.version],
    excludedVersions: [C.version, X.version],
  });
  assert.equal(ok.ok, true);
});

test('RECONCILIATION_FAILS_WHEN_AN_EXCLUDED_MIGRATION_APPEARS — the incident, detected after the fact', () => {
  const r = reconcileAfterApply({
    appliedBefore: PRIOR,
    appliedAfter: [...PRIOR, A.version, B.version, C.version, D.version, X.version],
    applySet: [A.version, B.version, D.version],
    excludedVersions: [C.version, X.version],
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.excludedNowApplied, [C.version, X.version].sort());
  assert.deepEqual(r.unexpected, [C.version, X.version].sort());
  assert.match(r.reason, /Do NOT auto-revert/);
});

test('RECONCILIATION_FAILS_WHEN_AN_APPROVED_MIGRATION_DID_NOT_LAND', () => {
  const r = reconcileAfterApply({
    appliedBefore: PRIOR,
    appliedAfter: [...PRIOR, A.version, B.version],
    applySet: [A.version, B.version, D.version],
    excludedVersions: [],
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [D.version]);
});
