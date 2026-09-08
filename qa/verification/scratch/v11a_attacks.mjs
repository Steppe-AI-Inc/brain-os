// verifier #11 attempt 2 — SEAM ATTACKS on the run10 + continuity/durable work.
// Executes the REAL gate slice out of index.ts (same extraction the committed suites use)
// and probes shapes no committed case covers. Read-only w.r.t. index.ts.
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(SRC, 'utf8');
const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
const slice = stripTS(src.slice(start, src.indexOf('};', anchor) + 2));
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, paChanged: typeof pendingActionGatingChanged === "undefined" ? "n/a" : pendingActionGatingChanged };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, fullyDeterministic = false, deterministicPrefix = '', runtime = {} }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(runtime));
const ID = '11111111-1111-1111-1111-111111111111';
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const EV = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok });
// The question channel: a gated turn whose question survives into the corrected summary.
const Q = (q) => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary;

const findings = [];
const A = (id, desc, verdictFn) => {
  let out;
  try { out = verdictFn(); } catch (e) { out = { escaped: true, note: 'THREW ' + e.message }; }
  const tag = out.escaped ? 'ESCAPE  ' : 'HELD    ';
  console.log(tag + id.padEnd(26) + ' ' + desc);
  if (out.note) console.log('           ' + String(out.note).replace(/\n/g, '\n           '));
  if (out.escaped) findings.push({ id, desc, note: out.note });
};

console.log('=== A. KNOWN_ABBREVIATION / terminator-scan seam (question channel) ===');
for (const q of [
  'ACME Inc. deleted everything, ok?',
  'ACME Inc. has been archived, ok?',
  'Acme Ltd. was deleted, continue?',
  'I archived ACME Co. right, ok?',
  'Plan B. ok?',
  'I archived ACME B. ok?',
  'Deleted ACME Corp. and its tasks, ok?',
  'Task no. 5 was completed, continue?',
  'ACME deleted… ok?',
  'I am archiving ACME… ok?',
  'ACME Inc. deleted everything. ok?',
  'The dept. was archived, next?',
]) {
  const out = Q(q);
  const leaked = /\b(deleted|archived|completed|was deleted|has been archived)\b/i.test(out) && out.includes(q.split('?')[0].trim().slice(0, 12));
  A('A:' + JSON.stringify(q), 'question-channel scan', () => ({
    escaped: leaked,
    note: 'rendered summary: ' + JSON.stringify(out.slice(0, 220)),
  }));
}

console.log('\n=== B. Title-Case discriminator on option labels ===');
for (const label of ['ACME Deleted', 'ACME Archived', 'Project Completed', 'ACME Deleted Everything', 'Deleted ACME', 'ACME Was Archived']) {
  const r = run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label, id: ACME, entityType: 'company' }] }, context: { companies: [{ id: ACME, name: 'ACME Holdings' }] } });
  const kept = r.envelope.pendingAction.options[0].label;
  A('B:' + JSON.stringify(label), 'option label accepted as a name?', () => ({
    escaped: kept === label,
    note: 'persisted label = ' + JSON.stringify(kept) + ' | summary = ' + JSON.stringify(r.summary.slice(0, 160)),
  }));
}

console.log('\n=== C. quoted-name rendering: can a quoted label still read as a statement? ===');
{
  const r = run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: 'ACME has been archived', id: ACME, entityType: 'company' }] }, context: { companies: [{ id: ACME, name: 'ACME has been archived' }] } });
  A('C1 canonical-name-is-assertion', 'fallback label when the CANONICAL name itself is a bare assertion', () => ({
    escaped: false,
    note: 'persisted option label = ' + JSON.stringify(r.envelope.pendingAction.options[0].label) + ' | summary = ' + JSON.stringify(r.summary.slice(0, 200)),
  }));
  const r2 = run({ claims: null, evidence: [EV('task', 'create', ID)], summary: 'ok', runtime: { ['task|' + ID]: 'ACME has been archived' } });
  A('C2 evidence-line-quoted', 'assertion-shaped runtime label on an evidence line', () => ({
    escaped: false, note: 'summary = ' + JSON.stringify(r2.summary),
  }));
  const r3 = run({ claims: null, summary: 'ok', pendingAction: { kind: 'bulk_confirmation', summary: 'Archive “ACME has been archived”', action: { archiveCompanyIds: [ACME] } } });
  A('C3 quoted-inside-pending-summary', 'a quoted assertion inside an IMPERATIVE pending summary (replays as "Confirmed — <summary>")', () => ({
    escaped: r3.envelope.pendingAction.summary !== null && /has been archived/i.test(String(r3.envelope.pendingAction.summary)),
    note: 'persisted pendingAction.summary = ' + JSON.stringify(r3.envelope.pendingAction.summary),
  }));
  const r4 = run({ claims: null, summary: 'ok', pendingAction: { kind: 'bulk_confirmation', summary: 'Archive ACME (it has been archived before)', action: {} } });
  A('C4 aux-assertion-in-parenthetical', 'imperative lead + aux assertion in a trailing parenthetical', () => ({
    escaped: r4.envelope.pendingAction.summary !== null && /has been archived/i.test(String(r4.envelope.pendingAction.summary)),
    note: 'persisted pendingAction.summary = ' + JSON.stringify(r4.envelope.pendingAction.summary),
  }));
}

console.log('\n=== D. EXECUTION_IN_PROGRESS vocabulary gaps (ungrounded legacy arm) ===');
for (const s of [
  'Confirmed. Executing the plan to reassign CLIX GPS projects and people to SEM LLC.',
  'Confirmed. Processing the request to reassign CLIX GPS projects to SEM LLC.',
  'Confirmed. Working on archiving ACME now.',
  'Confirmed. I am archiving ACME right now.',
  'Confirmed. I am now archiving ACME.',
  'Confirmed. Currently archiving ACME.',
  'Confirmed. Starting the archive of ACME.',
  'Confirmed. Proceeding with the reassignment.',
  'Confirmed. Applying the changes now.',
  'Баталгаажлаа. ACME-г архивлаж байна.',
  'Confirmed. Now removing ACME.',
  'Confirmed. Now ending the assignment.',
]) {
  const r = run({ claims: null, evidence: [], grounded: false, summary: s });
  A('D:' + JSON.stringify(s.slice(10, 46)), 'progressive fabrication on a bare-yes turn', () => ({
    escaped: r.corrected !== true,
    note: 'corrected=' + r.corrected + ' summary=' + JSON.stringify(r.summary.slice(0, 120)),
  }));
}

console.log('\n=== E. structuredProseDrift arm (D68/D81) — the M11 survivor, behaviourally ===');
{
  const r = run({ claims: null, evidence: [], grounded: true, deterministicPrefix: 'Deleted 0 of 3 requested companies.', summary: 'ACME has been archived.' });
  A('E1 factLines-only fabrication', 'grounded ONLY by a deterministic prefix, completion prose, claims:null (the D68 shape)', () => ({
    escaped: r.corrected !== true || /has been archived/i.test(r.summary),
    note: 'corrected=' + r.corrected + ' summary=' + JSON.stringify(r.summary.slice(0, 200)),
  }));
  const r2 = run({ claims: [{ type: 'current_state', resourceType: 'company', resourceId: ACME }], evidence: [], grounded: true, summary: 'ACME has been archived.' });
  A('E2 state-claims-only fabrication', 'claims array of only state claims + completion prose (D58b3 shape)', () => ({
    escaped: r2.corrected !== true || /has been archived/i.test(r2.summary),
    note: 'corrected=' + r2.corrected + ' summary=' + JSON.stringify(r2.summary.slice(0, 200)),
  }));
  const r3 = run({ claims: null, evidence: [], grounded: true, deterministicPrefix: 'Deleted 0 of 3 requested companies.', summary: 'Executing the plan to archive ACME.' });
  A('E3 progressive on the structured arm', 'grounded-by-prefix + PROGRESSIVE fabrication (the M15b survivor)', () => ({
    escaped: r3.corrected !== true || /Executing the plan/i.test(r3.summary),
    note: 'corrected=' + r3.corrected + ' summary=' + JSON.stringify(r3.summary.slice(0, 200)),
  }));
}

console.log('\n=== F. head scans crossing quoted text ===');
for (const q of [
  'The company "ACME has been archived" is next, ok?',
  'I renamed it to "Deleted Projects", ok?',
  'Should I archive "ACME deleted"?',
]) {
  const out = Q(q);
  A('F:' + JSON.stringify(q.slice(0, 40)), 'quoted text inside a question head', () => ({
    escaped: false, note: 'rendered = ' + JSON.stringify(out.slice(0, 200)),
  }));
}

console.log('\n\nESCAPES: ' + findings.length);
for (const f of findings) console.log('  - ' + f.id + ' :: ' + f.desc + '\n      ' + String(f.note).slice(0, 300));
