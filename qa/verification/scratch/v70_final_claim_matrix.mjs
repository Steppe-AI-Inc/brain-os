#!/usr/bin/env node
// VERIFIER #70 — STEP 2A: MY OWN never-silent-receipt / final-claim matrix, and CODEX B reproduced.
import { turn, RECEIPT } from './v70_pipeline.mjs';

const SUCCESS_WORDS = /\b(archived|deleted|updated|created|restored|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|moved|granted|confirmed|declined|activated|deactivated)\b/i;

const MUT_COMMANDS = [
  'rename ACME to ACME Robotics', 'approve the purchase approval PA-1', 'delete task QA-1',
  'archive company ACME', 'assign task QA-1 to Bob', 'set the manager of Alice to Bob',
  'restore company Beta', 'yes', 'option 2', 'archive the business unit Beta',
  'delete the department Sales permanently', 'end Bob’s employment', 'invite carol@example.com',
  'reassign project Alpha to the Ops team', 'promote Bob to manager', 'revoke access for Bob',
  'archive work order WO-1', 'restore goal G-1', 'move task QA-1 to project Alpha',
  'create a company called Gamma',
];
const FABRICATIONS = [
  'Done — ACME archived.', 'ACME has been archived.', 'Archived successfully.',
  'I have deleted the task.', 'Confirmed — Archived ACME.', 'Assigned. Bob now owns QA-1.',
];
const CLAIM_VARIANTS = [
  ['claims:null', { claims: null }],
  ['claims:[]', { claims: [] }],
  ['claims:state-only', { claims: [{ type: 'state', text: 'ACME is archived' }] }],
  ['trailing question + pendingAction', { claims: null, questions: ['Should I also archive its projects?'],
    pendingAction: { actionType: 'archive_company', question: 'Archive the projects too?', options: [{ id: 'x', label: 'ACME' }] } }],
];

let n = 0; const shipped = [];
for (const cmd of MUT_COMMANDS) for (const fab of FABRICATIONS) for (const [vn, v] of CLAIM_VARIANTS) {
  const r = turn(cmd, fab, v);
  n++;
  const s = String(r.summary);
  const receipt = RECEIPT.test(s);
  // the fabricated success wording must not survive anywhere in the founder-facing summary
  const stillClaims = SUCCESS_WORDS.test(s.replace(/No change was made —[^]*/, ''));
  if (!receipt || stillClaims) shipped.push({ cmd, fab, vn, s: s.slice(0, 90) });
}
console.log(`A1 FABRICATED COMPLETIONS on mutation-intent requests: ${n} turns, ${shipped.length} SHIPPED`);
for (const x of shipped.slice(0, 15)) console.log(`   SHIPPED [${x.vn}] "${x.cmd}" / "${x.fab}" -> ${x.s}`);

// A2 — READS that must survive VERBATIM
const READS = [
  ['what companies are archived?', 'ACME was archived in June.'],
  ['which tasks are blocked?', 'QA-1 and QA-2 are blocked.'],
  ['who is the manager of Alice?', 'Bob has been her manager since March.'],
  ['remind me what happened to ACME', 'ACME was archived in June and restored in July.'],
  ['what did we do last week?', 'We archived ACME and created two tasks.'],
  ['tell me the status of project Alpha', 'Alpha is active; three tasks were completed.'],
  ['list the people in Sales', 'Bob and Carol are in Sales.'],
  ['summarise the quarter', 'Two companies were archived and one was restored.'],
  ['how many companies are archived?', 'Four companies are archived.'],
  ['is ACME archived?', 'Yes — ACME has been archived since June.'],
  ['explain the archiving policy', 'Archiving a company ends its active work and preserves history.'],
  ['what is the history of Bob’s employment?', 'Bob was hired in 2024 and moved to Ops in 2025.'],
  ['show me the archived work orders', 'WO-1 and WO-2 were archived.'],
  ['describe what changed yesterday', 'Three tasks were completed and one goal was restored.'],
  ['any news on the Beta deal?', 'The Beta deal was approved on Tuesday.'],
  ['why was WO-1 closed?', 'It was closed because every task completed.'],
  ['give me an overview', 'Two projects were created and one was archived last month.'],
  ['walk me through the org', 'ACME owns Beta; Beta was archived in June.'],
  ['status of the onboarding plan', 'The onboarding plan was created in May and approved in June.'],
  ['update me on Sales', 'Sales added two leads and closed one.'],
];
let rn = 0; const rewritten = [];
for (const [cmd, ans] of READS) for (const [vn, v] of CLAIM_VARIANTS.slice(0, 3)) {
  const r = turn(cmd, ans, v); rn++;
  if (String(r.summary) !== ans) rewritten.push({ cmd, vn, got: String(r.summary).slice(0, 90) });
}
console.log(`\nA2 TRUTHFUL READS that must survive verbatim: ${rn} turns, ${rewritten.length} REWRITTEN`);
for (const x of rewritten.slice(0, 15)) console.log(`   REWRITTEN [${x.vn}] "${x.cmd}" -> ${x.got}`);

// A3 — a VERIFIED envelope on the claimed id must RENDER the truthful claim
const EV_OK = (id, op) => [{ operation: op, entity_type: 'company', entity_id: id, postconditionPassed: true, verified: true, error: null, request_id: 'wo-v70' }];
const EV_UNVERIFIED = (id, op) => [{ operation: op, entity_type: 'company', entity_id: id, postconditionPassed: false, verified: false, error: null, request_id: 'wo-v70' }];
const EV_DENIED = (id, op) => [{ operation: op, entity_type: 'company', entity_id: id, postconditionPassed: false, verified: false, error: 'permission denied', request_id: 'wo-v70' }];
let vn2 = 0; const badVerified = [], badUnverified = [];
for (let i = 0; i < 20; i++) {
  const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const r = turn('archive company ACME', 'ACME has been archived.', { evidence: EV_OK(id, 'archive_company'), grounded: true, lifecycleReports: ['ACME: archived'] });
  vn2++;
  if (RECEIPT.test(String(r.summary))) badVerified.push({ i, got: String(r.summary).slice(0, 80) });
  const u = turn('archive company ACME', 'ACME has been archived.', { evidence: EV_UNVERIFIED(id, 'archive_company') });
  const d = turn('archive company ACME', 'ACME has been archived.', { evidence: EV_DENIED(id, 'archive_company') });
  for (const [lbl, x] of [['unverified', u], ['denied', d]]) {
    const s = String(x.summary);
    if (!RECEIPT.test(s)) badUnverified.push({ i, lbl, got: s.slice(0, 80) });
  }
}
console.log(`\nA3 VERIFIED envelope must render the truthful claim: ${vn2} turns, ${badVerified.length} wrongly receipted`);
for (const x of badVerified.slice(0, 5)) console.log(`   WRONGLY RECEIPTED -> ${x.got}`);
console.log(`A4 UNVERIFIED / DENIED envelope must NOT support the claim: ${vn2 * 2} turns, ${badUnverified.length} let the claim through`);
for (const x of badUnverified.slice(0, 5)) console.log(`   CLAIM SURVIVED [${x.lbl}] -> ${x.got}`);

// CODEX B — a READ-ONLY question that carries an imperative, and a historical recount that must SURVIVE.
const B_CASES = [
  ['question in form, imperative in force', 'can you archive ACME?', 'Done — ACME archived.', 'must NOT ship'],
  ['question in form, imperative in force 2', 'could you please delete task QA-1?', 'Deleted.', 'must NOT ship'],
  ['polite lifecycle question', 'would you mind restoring Beta?', 'Restored.', 'must NOT ship'],
  ['deliberative', 'should we archive ACME?', 'ACME has been archived.', 'must NOT ship'],
  ['pure read + fabricated completion in the ANSWER', 'what companies are archived?', 'ACME has been archived.', 'must SURVIVE (a true state answer)'],
  ['historical recount', 'what happened last month?', 'ACME was archived on 3 June and Beta was restored on 9 June.', 'must SURVIVE'],
  ['historical recount + question', 'what happened last month, and what should we do?', 'ACME was archived on 3 June. We should review Beta.', 'must SURVIVE'],
];
console.log('\nCODEX B — reconstruction:');
for (const [n2, cmd, ans, expect] of B_CASES) {
  const r = turn(cmd, ans);
  const receipted = RECEIPT.test(String(r.summary));
  const want = expect.startsWith('must NOT ship');
  const ok = receipted === want;
  console.log(`   ${ok ? 'OK  ' : 'FAIL'} ${n2.padEnd(44)} receipt=${receipted}  (${expect})`);
  if (!ok) console.log(`        -> ${String(r.summary).slice(0, 100)}`);
}
