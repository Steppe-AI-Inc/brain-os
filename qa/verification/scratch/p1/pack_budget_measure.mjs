// Sizes the context-pack additions that pushed the request over the 12,000-token preflight cap
// (incident 2026-09-08). Uses the SAME estimator as production: JSON.stringify(x).length / 4, and row
// shapes taken from the live workspace (20 companies / 9 archived, 25 tasks, 20 people, 24 collections).
const est = (x) => Math.ceil(JSON.stringify(x).length / 4);

const company = { id: 'aaaaaaaa-1111-1111-1111-111111111111', name: 'SEM Global Robotics Technologies LLC', status: 'active', organization_type: 'legal_entity', strategic_priority: 9, risk_score: 2, effectivelyActive: true };
const archivedCompany = { id: 'bbbbbbbb-2222-2222-2222-222222222222', name: 'QA-LIFECYCLE-BU', status: 'archived', organization_type: 'legal_entity', updated_at: '2026-08-31T10:11:12.000Z', effectivelyActive: false };
const archivedTask = { id: 'cccccccc-3333-3333-3333-333333333333', company_id: 'aaaaaaaa-1111-1111-1111-111111111111', title: 'QA-SWARM-TASK-001 verify archived task restore path' };
const histOld = { turn: 12, command: 'Rename the project "IQParking & OpenSpot Hardware Operations" to QA-C002-D3.', summary: 'Done. Project renamed to QA-C002-D3. What would you like to rename next?' };
const histNew = { ...histOld, verified: false, executedOperationCount: 0, rejectedClaimCount: 0 };

// The collections map exactly as v93 builds it (24 entries; several carry a prose `scope`).
const SCOPES = [
  'active (non-archived), newest first, plus any company named in this command', 'archived, newest first',
  null, 'in-flight statuses, plus any task named in this command', 'top-8 semantic retrieval', 'active', 'active', null,
  'pending', 'plus any person named in this command', 'plus any goal named in this command', null, null, 'newest first',
  'newest turns in this channel', 'newest 10', 'not archived', null, null, null, null, null, null, 'archived, newest first',
];
const collections = {};
SCOPES.forEach((scope, i) => { collections['collection' + i] = { shown: 12, total: 20, truncated: true, ...(scope ? { scope } : {}) }; });
const collectionsNoScope = {};
SCOPES.forEach((_, i) => { collectionsNoScope['collection' + i] = { shown: 12, total: 20, truncated: true }; });

const rows = (n, r) => Array.from({ length: n }, () => r);
const added = {
  'archivedCompanies (12 rows, v93)': est(rows(12, archivedCompany)),
  'archivedCompanies (6 rows, proposed)': est(rows(6, archivedCompany)),
  'archivedTasks (15 rows, v93)': est(rows(15, archivedTask)),
  'archivedTasks (8 rows, proposed)': est(rows(8, archivedTask)),
  'collections map with scope prose (v93)': est(collections),
  'collections map without scope prose (proposed)': est(collectionsNoScope),
  'history: 3 extra fields x 8 turns': est(rows(8, histNew)) - est(rows(8, histOld)),
};
for (const [k, v] of Object.entries(added)) console.log(String(v).padStart(6), 'tokens  ', k);

const v93 = added['archivedCompanies (12 rows, v93)'] + added['archivedTasks (15 rows, v93)'] + added['collections map with scope prose (v93)'] + added['history: 3 extra fields x 8 turns'];
const fixed = added['archivedCompanies (6 rows, proposed)'] + added['archivedTasks (8 rows, proposed)'] + added['collections map without scope prose (proposed)'] + added['history: 3 extra fields x 8 turns'];
console.log('\nv93 total added over v92 :', v93, 'tokens');
console.log('proposed total added     :', fixed, 'tokens   (saving', v93 - fixed, ')');
console.log('observed overage at the cap: 340 tokens (tokenEstimate 12340, hardMax 12000)');
console.log(fixed < 340 ? 'PROPOSED FITS: the addition is smaller than the observed overage — the failing request lands under the cap.'
  : 'PROPOSED DOES NOT FIT: trim further.');
