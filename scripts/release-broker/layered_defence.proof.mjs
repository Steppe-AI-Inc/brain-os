// LAYERED DEFENCE PROOF for the two pending-set equality guards.
//
// Ordinary mutation testing reported both as "not detected": every fixture that would reach them
// is refused earlier by PENDING_MIGRATION_NOT_IN_MANIFEST. That does NOT make them decoration — it
// makes them the second layer, and a second layer is proven by removing the first.
//
// This script disables the upstream guard in a COPY of plan.mjs (never the shipped file), imports
// the copy, and asserts the incident still refuses. If a future edit makes the equality checks
// vacuous, this fails even though the regression suite stays green.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const SRC = new URL('./plan.mjs', import.meta.url);
const orig = readFileSync(SRC, 'utf8');
const UPSTREAM = 'if (unaccounted.length > 0) {';
if (!orig.includes(UPSTREAM)) { console.log('PROOF STALE: upstream guard anchor not found.'); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), 'layered-'));
const copy = join(dir, 'plan.mjs');
writeFileSync(copy, orig.replace(UPSTREAM, 'if (false) {'));
const { buildApplyPlan, REFUSAL } = await import(pathToFileURL(copy).href);

const REF = 'pvphxgrtdfrudejjhzjk';
const COMMIT = 'e7c943e0000000000000000000000000000000ab';
const H = '0'.repeat(64);
const mk = (v, n) => ({ version: v, filename: v + '_' + n + '.sql', sha256: H });
const A = mk('202609020001', 'a'), B = mk('202609020002', 'b'), C = mk('202609020003', 'c');
const D = mk('202609030001', 'd'), X = mk('202609040001', 'x');
const ALL = [A, B, C, D, X];
// An empty remote history is itself a refusal (REMOTE_HISTORY_UNREADABLE), so the fixture needs a
// real prior migration for the equality guards to be the thing under test.
const PRIOR = mk('202608310004', 'prior');

const base = (over = {}) => ({
  manifest: {
    authorization_id: 'AUTH-1', schema_version: 1, scope: 'supabase_db_migrations',
    target_environment: 'production', project_ref: REF,
    issued_at: '2026-09-08T09:00:00Z', expires_at: '2026-09-09T09:00:00Z',
    requested_by: 'proof', founder_approval_scope: 'A, B, D only.', package_commit: COMMIT,
    approved_migrations: [A, B, D], excluded_migrations: [],
    execution_model: 'ALL_PENDING',
    rollback: { kind: 'forward_fix_only', note: 'n/a' },
    ...(over.manifest || {}),
  },
  appliedVersions: [PRIOR.version],
  migrationFilesAtCheckout: [PRIOR.filename, ...ALL.map((m) => m.filename)],
  fileHashes: Object.fromEntries([PRIOR, ...ALL].map((m) => [m.filename, H])),
  gitDiffClean: Object.fromEntries([PRIOR, ...ALL].map((m) => [m.filename, true])),
  ciConclusion: 'success', ancestorOfMaster: true, workflowProjectRef: REF,
  inputs: { authorization_id: 'AUTH-1', git_commit: COMMIT, confirm_project_ref: REF,
    selective_execution_verified: true },
  now: new Date('2026-09-08T10:00:00Z'),
  ...(({ manifest, ...rest }) => rest)(over),
});

const cases = [
  ['ALL_PENDING_EQUALITY still refuses the incident with the upstream guard removed',
    base(), REFUSAL.ACTUAL_PENDING_SET_NOT_AUTHORIZED],
  ['SELECTIVE_UNION_EQUALITY still refuses an unlisted pending file with the upstream guard removed',
    base({ manifest: { excluded_migrations: [C], execution_model: 'SELECTIVE_CURATION',
      selective_execution: { mechanism: 'curated-migration-directory', verified_by: 'suite',
        excluded_scope: [C.version] } } }),
    REFUSAL.ACTUAL_PENDING_SET_NOT_AUTHORIZED],
];

let ok = true;
for (const [name, facts, expected] of cases) {
  const r = buildApplyPlan(facts);
  const pass = r.decision === 'REFUSE' && r.code === expected;
  if (!pass) ok = false;
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name);
  if (!pass) console.log('        got decision=' + r.decision + ' code=' + r.code);
}
rmSync(dir, { recursive: true, force: true });

// And the control: with BOTH layers intact the shipped file refuses too, so the proof above is not
// an artifact of the copy.
const shipped = await import(pathToFileURL(new URL('./plan.mjs', import.meta.url).pathname.replace(/^\//, 'C:/')).href)
  .catch(() => import('./plan.mjs'));
const ctl = shipped.buildApplyPlan(base());
const ctlOk = ctl.decision === 'REFUSE' && ctl.code === shipped.REFUSAL.PENDING_MIGRATION_NOT_IN_MANIFEST;
console.log((ctlOk ? 'PASS  ' : 'FAIL  ') + 'control: the shipped file refuses the same fixture (code ' + ctl.code + ')');
if (!ctlOk) ok = false;

console.log('');
console.log(ok ? 'LAYERED DEFENCE PROVEN — both equality guards refuse when the layer above them is gone.'
              : 'LAYERED DEFENCE NOT PROVEN — an equality guard is vacuous.');
process.exit(ok ? 0 : 1);
