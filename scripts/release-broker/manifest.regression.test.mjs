// THE REAL MANIFEST THROUGH THE REAL BROKER against the real tree.
//
// plan.regression.test.mjs proves the core with synthetic fixtures. This suite proves that the
// shipped manifest, the shipped loader, and the migration files actually in supabase/migrations
// line up — hashes, versions, filenames — under four substrate states. Nothing here connects to
// anything; the substrate facts are supplied by hand and labelled as such.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatherFacts, treeFacts } from './manifest.mjs';
import { buildApplyPlan, REFUSAL } from './plan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID = 'AUTH-2026-09-ABD-001';
const COMMIT = 'f6fa26a457378e188d2bbd1ca3604a4b384a308d';
const REF = 'pvphxgrtdfrudejjhzjk';
const FIVE = ['202609020001', '202609020002', '202609020003', '202609030001', '202609040001'];

const tree = treeFacts(ROOT);
const clean = Object.fromEntries(tree.migrationFilesAtCheckout.map((f) => [f, true]));
const prior = tree.migrationFilesAtCheckout.map((f) => f.slice(0, 12)).filter((v) => !FIVE.includes(v));

const facts = (applied, verified) => gatherFacts(ROOT, {
  appliedVersions: applied, gitDiffClean: clean, ciConclusion: 'success', ancestorOfMaster: true,
  workflowProjectRef: REF,
  inputs: { authorization_id: ID, git_commit: COMMIT, confirm_project_ref: REF, selective_execution_verified: verified },
  now: new Date('2026-09-08T00:00:00Z'),
});

test('the manifest loads and its hashes equal the LF-normalised bytes in supabase/migrations', async () => {
  const f = await facts(prior, true);
  assert.ok(f.manifest, 'manifest not found');
  for (const m of [...f.manifest.approved_migrations, ...f.manifest.excluded_migrations]) {
    assert.equal(f.fileHashes[m.filename], m.sha256, 'hash drift for ' + m.filename);
  }
});

test('PRODUCTION AS IT IS TODAY (all five applied) -> REFUSE; the approved-already-applied guard fires first', async () => {
  const r = buildApplyPlan(await facts([...prior, ...FIVE], true));
  assert.equal(r.decision, 'REFUSE');
  // Both guards are true of production today. The core checks approved versions before excluded
  // ones, so the first complaint is that A is already applied; either code is a correct refusal.
  assert.ok([REFUSAL.APPROVED_ALREADY_APPLIED, REFUSAL.EXCLUDED_ALREADY_APPLIED].includes(r.code), r.code);
});

test('THE RECONCILIATION GATE: only the excluded pair applied (A/B/D not) -> REFUSE EXCLUDED_ALREADY_APPLIED', async () => {
  // The sharper shape: nothing authorized has landed, but the two exclusions have. The broker must
  // refuse to release on top of an unreconciled history, whatever the manifest says.
  const r = buildApplyPlan(await facts([...prior, '202609020003', '202609040001'], true));
  assert.equal(r.decision, 'REFUSE');
  assert.equal(r.code, REFUSAL.EXCLUDED_ALREADY_APPLIED);
});

test('THE STATE THE AUTHORIZATION WAS WRITTEN AGAINST, curation verified -> APPLY exactly A/B/D', async () => {
  const r = buildApplyPlan(await facts(prior, true));
  assert.equal(r.decision, 'APPLY', r.code + ': ' + r.reason);
  assert.deepEqual(r.applySet, ['202609020001', '202609020002', '202609030001']);
  assert.ok(r.curatedDelete.some((f) => f.startsWith('202609020003_')));
  assert.ok(r.curatedDelete.some((f) => f.startsWith('202609040001_')));
});

test('same state, but the substrate did not verify the curation mechanism -> REFUSE', async () => {
  const r = buildApplyPlan(await facts(prior, false));
  assert.equal(r.code, REFUSAL.SELECTIVE_EXECUTION_UNVERIFIED);
});

test('one byte of D differs from what was reviewed -> REFUSE FILE_HASH_MISMATCH', async () => {
  const f = await facts(prior, true);
  f.fileHashes['202609030001_agent_run_capacity_retry.sql'] = '0'.repeat(64);
  assert.equal(buildApplyPlan(f).code, REFUSAL.FILE_HASH_MISMATCH);
});

test('a manifest id that does not exist -> REFUSE MANIFEST_MISSING, never a default', async () => {
  const f = await facts(prior, true);
  f.manifest = await (await import('./manifest.mjs')).loadManifest(ROOT, 'AUTH-DOES-NOT-EXIST');
  assert.equal(f.manifest, null);
  assert.equal(buildApplyPlan(f).code, REFUSAL.MANIFEST_MISSING);
});
