#!/usr/bin/env node
// V65 REGRESSION ADDITIONS — verifier #68, campaign #128, candidate 223bd24
// (index.ts sha256 fc48aa7053b5da5ebb535917f82f19188e853330998701abcba080fa7890cac8).
//
// THE AXIS OF THIS ROUND IS CLAUSE COUNT AND ORDER, CROSSED WITH THE ENTITY-NOUN VOCABULARY —
// "a mutation clause followed by a report clause, for a thing whose name is not on one particular
// hand-written list". It was DERIVED, not guessed: enumerate every consumer of the entity-noun
// concept, find the one that does NOT derive from the canonical definition, then ask which request
// shapes reach it. Exactly one does — `commandClausesForRead.length > 1`. That is why no committed
// corpus could find it: #67's corpora are all SINGLE-CLAUSE (so STRONG_OBJECT is never reached),
// and the clause-count cases elsewhere all use `task`/`company` (so the drift never shows).
//
// Rows are tagged:
//   CONTRACT  a rule that must hold forever. It holds on 223bd24 and is pinned so it cannot be
//             reverted silently.
//   DEFECT    a finding of this round. It FAILS on 223bd24 and must PASS after the fix.
//
// ANY failure exits non-zero. The source under test comes from SEM_INDEX_SRC when set, otherwise it
// is resolved by walking up from this file, so the suite is correct from ANY cwd.
//
// Everything below executes the REAL windows sliced out of index.ts. Nothing is re-implemented.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

function resolveIndex() {
  if (process.env.SEM_INDEX_SRC) return resolve(process.env.SEM_INDEX_SRC);
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const c = join(d, 'supabase/functions/sem-ai-command/index.ts');
    if (existsSync(c)) return c;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v65: index.ts not found');
}
function resolveRepo() {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v65: repo root not found');
}
const INDEX = resolveIndex();
const ROOT = resolveRepo();
const SRC = readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');
const { stripTS } = await import('file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));

let pass = 0; const contractFails = [], defectFails = [];
const check = (tag, name, cond, detail) => {
  if (cond) { pass++; console.log('OK       [' + tag + '] ' + name); return; }
  (tag === 'CONTRACT' ? contractFails : defectFails).push(name + (detail ? '\n           ' + detail : ''));
  console.log('FAIL     [' + tag + '] ' + name + (detail ? '\n           ' + detail : ''));
};

// ------------------------------------------------------------------ windows (real, sliced)
function sliceBetween(a, b) {
  const i = SRC.indexOf(a); if (i < 0) throw new Error('v65: start marker missing: ' + a);
  const j = SRC.indexOf(b, i); if (j < 0) throw new Error('v65: end marker missing: ' + b);
  return SRC.slice(i, j + b.length);
}
function stmt(name) {
  const at = SRC.indexOf('const ' + name + ' = ');
  if (at < 0) throw new Error('v65: ' + name + ' not found in the source under test');
  let d = 0;
  for (let i = at; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === ';' && d === 0) return stripTS(SRC.slice(at, i + 1));
  }
  throw new Error('v65: ' + name + ' end not found');
}
function declOf(name) {
  const at = SRC.indexOf('const ' + name + ' = ');
  if (at < 0) throw new Error('v65: ' + name + ' not found');
  let d = 0;
  for (let i = at; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === ';' && d === 0) return SRC.slice(at, i + 1);
  }
  throw new Error('v65: ' + name + ' end');
}
const rx = (n) => new Function('return ' + stmt(n).replace(new RegExp('^const ' + n + ' = '), '').replace(/;$/, ''))();

const INTENT_WINDOW = stripTS(sliceBetween('const MUTATION_ARRAY_FIELDS = [',
  'const requestedIntent: MutationIntent | null = requestedIntentPrimary;'));
const intentFn = new Function('command', 'result', 'claimExecutionEvidence', 'commandFallbackResolvedVerb',
  INTENT_WINDOW + '\n; return requestedIntent;');
const intentOf = (c, result = {}, verb = null) => intentFn(c, result, [], verb);

const CFRV = 'const commandFallbackResolvedVerb: string | null =';
const EXEC_SLICE = SRC.slice(SRC.indexOf('const commandMentionsCompany = '),
  SRC.indexOf(': null;', SRC.indexOf(CFRV)) + ': null;'.length);
const execFn = new Function('command', 'result', 'supabase', 'companyNameById', 'lifecycleUnresolvedLines',
  'lifecycleDisambiguation', 'modelIntentNamesFor', 'modelRequestIntent', 'modelRequestIntentEntity',
  'COMPANY_UUID_RE', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN',
  'return (async () => {' + stripTS(EXEC_SLICE)
  + '\n; return { commandFallbackResolvedVerb, archiveCompanyIds, restoreCompanyIds }; })()');
const ROWS = [{ id: 'c1', name: 'ACME', status: 'active' }, { id: 'c2', name: 'Beta', status: 'active' }];
const db = { from() {
  const q = { _p: null };
  q.select = () => q;
  q.in = (_c, ids) => Promise.resolve({ data: ROWS.filter((r) => ids.includes(r.id)) });
  q.ilike = (_c, p) => { q._p = p; return q; };
  q.limit = () => Promise.resolve({ data: ROWS.filter((r) =>
    new RegExp('^' + q._p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('%').join('.*') + '$', 'i').test(r.name)) });
  return q;
} };
async function executorOf(command, result = {}) {
  const mri = result.requestIntent && typeof result.requestIntent === 'object' ? result.requestIntent : null;
  return execFn(command, result, db, new Map(), [], [], () => [], mri,
    mri && typeof mri.entityType === 'string' ? mri.entityType : null,
    rx('COMPANY_UUID_RE'), rx('ARCHIVE_VERB_PATTERN'), rx('RESTORE_VERB_PATTERN'));
}
const RECEIPT_SLICE = sliceBetween("const receiptExempt = model === 'deterministic-confirmation'",
  '          receiptRendered = true;\n        }');
const receiptFn = new Function('model', 'organizationGraphCheck', 'requestedIntent', 'executedVerifiedCount',
  'lifecycleReports', 'hasMutationShapedClaim', 'hasRejectedClaims', 'result', 'claimExecutionEvidence',
  'commandText', 'modelIntent', 'deterministicPrefix', 'envelopeQuestions', 'factLines',
  stripTS(RECEIPT_SLICE) + '\n; return { summary: result.summary, receiptRendered };');
const receiptOf = (o) => receiptFn(o.model ?? 'claude', null, o.requestedIntent ?? null,
  o.executedVerifiedCount ?? 0, [], o.hasMutationShapedClaim ?? false, false, o.result || {},
  o.claimExecutionEvidence ?? [], o.commandText ?? '', o.modelIntent ?? null, '', [], []);
const gatesFn = new Function('hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn',
  'claimsFutureActionWithNoPlan', 'requestedIntent', 'readsAsCompletion', 'result', 'rawClaims',
  'claimExecutionEvidence', 'deterministicPrefix', 'hasRejectedClaims',
  stripTS([declOf('legacyProseFallback'), declOf('hasMutationShapedClaim'),
    declOf('hasConfirmedMutationEvidenceInWindow'), declOf('unaccountedCompletionProse'),
    declOf('structuredProseDrift'), declOf('rewriteFromStructure')].join('\n'))
  + '\n; return { legacyProseFallback, rewriteFromStructure, hasMutationShapedClaim };');

const SUCCESS = /\b(?:done|archived|deleted|removed|restored|renamed|reassigned|approved|rejected|created|updated|assigned|closed|completed|ended|saved|sent|moved|granted)\b/i;
async function fabricationShips(cmd, prose, claims = null) {
  const e = await executorOf(cmd);
  const intent = intentOf(cmd, {}, e.commandFallbackResolvedVerb);
  const result = { summary: prose, claims };
  const g = gatesFn(false, 'claude', false, false, intent, () => true, result,
    Array.isArray(claims) ? claims : null, [], '', false);
  const r = receiptOf({ requestedIntent: intent, commandText: cmd, result: { ...result },
    hasMutationShapedClaim: g.hasMutationShapedClaim });
  const corrected = r.receiptRendered || g.legacyProseFallback || g.rewriteFromStructure;
  return !corrected && SUCCESS.test(r.summary || '');
}

console.log('v68_clause_and_vocabulary_contract — source: ' + INDEX + '\n');

// ==========================================================================================
// 1. DEFECT V68-D1 (P1) — A COMPOUND "MUTATE X, THEN REPORT" COMMAND IS INVISIBLE TO THE
//    REQUEST-INTENT TIER WHENEVER X'S ENTITY NOUN IS NOT ON STRONG_OBJECT'S OWN LIST, SO THE
//    NEVER-SILENT RECEIPT NEVER FIRES AND A FABRICATED COMPLETION SHIPS VERBATIM.
//    (governance/OPERATING_TRUTH_MODEL.md §3 rule 3; §5 row 1.)
//
//    ROOT CAUSE: index.ts `STRONG_OBJECT` is an EIGHTH hand-written spelling of "a kind of thing
//    this product stores" — 25 nouns against the ~80 in ENTITY_NOUN_ALTERNATION — and it does not
//    derive from the one definition. `firstClauseIsMutation` is false for every noun it omits, so
//    `readShaped` becomes true, the lexicon hit is read-vetoed, and requestedIntent is null.
// ==========================================================================================
const OUTSIDE = ['work order', 'business unit', 'chat channel', 'software spec', 'purchase order',
  'product line', 'work item', 'ticket', 'memory', 'note', 'agent', 'connector', 'provider',
  'user', 'account', 'workspace', 'record', 'entry', 'file', 'membership', 'staff', 'owner', 'role'];
const INSIDE = ['task', 'goal', 'project', 'department', 'document', 'company', 'person', 'invoice'];
const TAILS = ['and list them', 'then show me the list', 'and tell me what changed'];
const VERBS = ['archive', 'delete', 'restore'];
const PROSE = (n) => `Done — the ${n} has been archived successfully. Here is the list you asked for: 1. Alpha 2. Beta`;
{
  let shipped = 0, total = 0; const ex = [];
  for (const v of VERBS) for (const t of TAILS) for (const n of OUTSIDE) {
    const cmd = `${v} the ${n} ${t}`;
    total++;
    if (await fabricationShips(cmd, PROSE(n))) { shipped++; if (ex.length < 5) ex.push(cmd); }
  }
  check('DEFECT', 'V68-D1 a compound mutation+report command never ships a fabricated completion, whatever the entity noun',
    shipped === 0, shipped + '/' + total + ' shipped, e.g. ' + ex.join(' | '));
}
{
  let blind = 0, total = 0;
  for (const v of VERBS) for (const t of TAILS) for (const n of OUTSIDE) {
    total++; if (intentOf(`${v} the ${n} ${t}`) === null) blind++;
  }
  check('DEFECT', 'V68-D1b the receipt tier SEES every compound mutation+report request',
    blind === 0, blind + '/' + total + ' had requestedIntent === null');
}
{
  // The control that makes the row above a real measurement rather than a tautology: the SAME
  // grammatical shape, differing only in which noun is used, must behave identically.
  let shipped = 0, total = 0;
  for (const v of VERBS) for (const t of TAILS) for (const n of INSIDE) {
    total++; if (await fabricationShips(`${v} the ${n} ${t}`, PROSE(n))) shipped++;
  }
  check('CONTRACT', 'V68-C1 the control half of the same axis (noun already on the list) ships nothing',
    shipped === 0, shipped + '/' + total + ' shipped');
}

// ==========================================================================================
// 2. DEFECT V68-D2 (P1) — THE ENTITY-NOUN-ANYWHERE WIDENING TURNS TRUTHFUL READS INTO MUTATION
//    REQUESTS, AND THE NEVER-SILENT RECEIPT THEN DESTROYS THE ANSWER.
//    (governance/OPERATING_TRUTH_MODEL.md §3 rule 2 — text shape may never be the sole reason a
//    response is rewritten.)
//
//    ROOT CAUSE: IMPERATIVE_OBJECT gained `\b(?:ENTITY_NOUN_ALTERNATION)\b` with no position rule.
//    An English noun-phrase headline whose head word is also one of the ~120 lexicon verbs almost
//    always contains an entity noun somewhere, so it reads as "an imperative with a referring
//    object". Measured against the #67 parent (916da4e2): truthful reads acquiring mutation intent
//    went 2/40 -> 31/40, and answers destroyed went 1/8 -> 8/8. This is a candidate-INTRODUCED
//    regression, not an inherited one.
// ==========================================================================================
const TRUTHFUL_READS = {
  'Post mortem on the failed order': 'The order failed because the supplier confirmation never arrived.',
  'Move history for the work item': 'That work item moved from Backlog to In Progress on 2 September.',
  'Transfer pricing for the business unit': 'The business unit uses cost-plus transfer pricing at 8%.',
  'End of quarter report for the business unit': 'Revenue was 412M MNT, up 6% on Q2. Headcount held at 34.',
  'Split of revenue by product line': 'Parking 62%, Retail 24%, Services 14%.',
  'Charge summary for the account': 'Three charges totalling 1.2M MNT, all settled.',
  'Lower bound on the budget values': 'The floor is 40M MNT for the quarter.',
  'Merge conflicts in the spec document': 'Two conflicts remain in section 4 of the spec.',
};
{
  let rewritten = 0; const ex = [];
  for (const [cmd, answer] of Object.entries(TRUTHFUL_READS)) {
    const r = receiptOf({ requestedIntent: intentOf(cmd), commandText: cmd, result: { summary: answer, claims: null } });
    if (r.summary !== answer) { rewritten++; if (ex.length < 4) ex.push(cmd); }
  }
  check('DEFECT', 'V68-D2 a truthful READ answer is never replaced by a no-change receipt on text shape alone',
    rewritten === 0, rewritten + '/' + Object.keys(TRUTHFUL_READS).length + ' destroyed, e.g. ' + ex.join(' | '));
}
{
  // V61-D7's pinned pair must keep holding — the widening must not be repaired by re-breaking these.
  const pinned = ['Close call on the Beta deal today', 'Share price fell after the announcement'];
  let bad = 0;
  for (const c of pinned) if (intentOf(c) !== null) bad++;
  check('CONTRACT', 'V68-C2 the V61-D7 pinned statements still carry no mutation intent', bad === 0, bad + ' regressed');
}
{
  // The #67 repair itself must survive any fix to the above: a compound noun phrase still refers.
  const compound = ['archive work order WO-1', 'delete software spec S-1', 'restore purchase approval A-1',
    'archive sales lead L-1', 'delete engineering drawing DR-1', 'archive holding company ACME'];
  let blind = 0; const ex = [];
  for (const c of compound) if (intentOf(c) === null) { blind++; ex.push(c); }
  check('CONTRACT', 'V68-C3 the #67 repair holds — a compound noun phrase still refers to something',
    blind === 0, ex.join(' | '));
}

// ==========================================================================================
// 3. DEFECT V68-D3 (P2, HARNESS) — THE CONCEPT-DUPLICATION RATCHET CANNOT SEE THE CONCEPT #67
//    CONVERGED, WHICH IS WHY THE WHOLE BATTERY IS GREEN WHILE V68-D1 SHIPS.
//    It compares only NAMED alternations, so an inline regex literal carrying a second copy of a
//    vocabulary is invisible to it; and ENTITY_NOUN_ALTERNATION was never added to its list of
//    canonical definitions that must stay single.
// ==========================================================================================
{
  const ratchet = readFileSync(join(ROOT, 'qa/scenarios-runner/concept_duplication_ratchet_contract.mjs'), 'utf8');
  check('DEFECT', 'V68-D3 the ratchet guards ENTITY_NOUN_ALTERNATION as a canonical definition',
    /ENTITY_NOUN_ALTERNATION/.test(ratchet),
    'the concept #67 converged is not in the ratchet, so an eighth spelling cannot be detected');
}
{
  // The structural statement of V68-D1, independent of behaviour: no consumer may carry its own
  // copy of the entity-noun vocabulary. STRONG_OBJECT is the one that still does.
  const so = declOf('STRONG_OBJECT');
  check('DEFECT', 'V68-D3b STRONG_OBJECT derives from the one entity-noun definition rather than re-spelling it',
    /ENTITY_NOUN_ALTERNATION/.test(so),
    'STRONG_OBJECT carries a hand-written noun list: ' + so.replace(/\s+/g, ' ').slice(0, 200));
}

// ==========================================================================================
// 4. DEFECT V68-D4 (P3) — THE RECEIPT NAMES THE FOUNDER'S ENTITY UNGRAMMATICALLY OR WRONGLY.
//    #67 closed V67-D3 by "singularising whatever the one definition matched". Two arms of that
//    are still wrong where the founder can read them.
// ==========================================================================================
{
  const r = receiptOf({ requestedIntent: { verb: 'archive', field: null }, commandText: 'archive the person Bat',
    result: { summary: 'x' } });
  check('DEFECT', 'V68-D4a the receipt says "people", not "persons"',
    !/\bpersons\b/.test(r.summary), r.summary);
}
{
  const r = receiptOf({ requestedIntent: { verb: 'archive', field: null }, commandText: 'archive the purchase order PO-9',
    result: { summary: 'x' } });
  check('DEFECT', 'V68-D4b a purchase order is not reported as a work order',
    !/work order/.test(r.summary), r.summary);
}

// ==========================================================================================
// 5. CONTRACT — the honest-reason selection. Verifier #67 left `hypotheticalRequest never matches`
//    and `negatedRequest never matches` as OPEN, UNKILLED mutants because the battery never
//    observed the receipt's reason. It is observable; these rows kill both mutants and close that
//    residual.
// ==========================================================================================
{
  const cases = [
    ['should we archive ACME', 'hypothetical'], ['can i archive ACME', 'hypothetical'],
    ['shall we archive ACME', 'hypothetical'], ['i want to archive ACME', 'hypothetical'],
    ['we must archive ACME', 'hypothetical'], ['i ought to archive ACME', 'hypothetical'],
    ['if we archive ACME what happens', 'hypothetical'],
    ['do not archive ACME', 'negated'], ["don't archive ACME", 'negated'],
    ['never archive ACME', 'negated'], ['please do not archive ACME', 'negated'],
    ['archive ACME', 'plain'],
  ];
  let bad = 0; const ex = [];
  for (const [cmd, want] of cases) {
    const r = receiptOf({ requestedIntent: { verb: 'archive', field: null }, commandText: cmd, result: { summary: 'x' } });
    const got = /you asked me not to/.test(r.summary) ? 'negated'
      : /read as a hypothetical/.test(r.summary) ? 'hypothetical' : 'plain';
    if (got !== want) { bad++; ex.push(cmd + ' -> ' + got + ' (want ' + want + ')'); }
  }
  check('CONTRACT', 'V68-C4 the receipt picks an honest reason (kills the two mutants #67 left open)',
    bad === 0, ex.join(' | '));
}

// ==========================================================================================
// 6. CONTRACT — provenance and the deferred P1 stay named.
// ==========================================================================================
{
  check('CONTRACT', 'V68-C5 index.ts imports nothing from _shared (the deploy surface is index.ts alone)',
    !/from\s+["'][^"']*_shared/.test(SRC), 'an import from _shared changes the deploy surface');
  const bareLF = (readFileSync(INDEX).toString('binary').match(/(?<!\r)\n/g) || []).length;
  check('CONTRACT', 'V68-C6 index.ts is CRLF-pure (0 bare LF)', bareLF === 0, 'bare LF = ' + bareLF);
}

console.log('\nv68_clause_and_vocabulary_contract: ' + pass + ' passed, '
  + (contractFails.length + defectFails.length) + ' failed'
  + ' (contract ' + contractFails.length + ', defect ' + defectFails.length + ')');
if (contractFails.length || defectFails.length) {
  console.log('\nFAILING:');
  for (const f of [...contractFails, ...defectFails]) console.log('  - ' + f);
  process.exit(1);
}
