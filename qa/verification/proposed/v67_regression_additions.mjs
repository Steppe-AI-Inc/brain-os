#!/usr/bin/env node
// V65 REGRESSION ADDITIONS — verifier #67, campaign #127, candidate 8d157bf
// (index.ts sha256 916da4e27b1c976ca806365d58605b22377d1b6b1540cb705a5e76fba36bb610).
//
// THE AXIS OF THIS ROUND IS THE ENTITY TYPE / MUTATION FIELD — "which kind of thing is being changed,
// and which model field drives it". Frames were verifier #65's axis; object SHAPES were #66's. Every
// committed corpus varies one of those two and holds the entity constant: it says "archive ACME",
// "archive task QA-1", "archive company ACME". The head noun is always either a proper noun or a bare
// entity noun, which is exactly where the object test already works.
//
// Rows are tagged:
//   CONTRACT  a rule that must hold forever. It holds on candidate 8d157bf and is pinned so it cannot be
//             reverted silently.
//   DEFECT    a finding of this round. It FAILS on 8d157bf and must PASS after the fix.
//
// ANY failure exits non-zero. The source under test comes from SEM_INDEX_SRC when set, otherwise it is
// resolved by walking up from this file, so the suite is correct from ANY cwd.
//
// Everything below executes the REAL windows sliced out of index.ts. Nothing is re-implemented. The
// tier-boundary value commandFallbackResolvedVerb is COMPUTED by production's own declaration, never
// supplied by this harness — a value a harness supplies is a value it cannot vouch for.
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
  + '\n; return { commandFallbackAllowed, commandFallbackResolvedVerb, archiveCompanyIds, restoreCompanyIds }; })()');
const ROWS = [{ id: 'c1', name: 'ACME', status: 'active' }, { id: 'c2', name: 'Beta', status: 'active' },
  { id: 'c3', name: 'History Media', status: 'active' }, { id: 'c4', name: 'Chat Holdings', status: 'active' },
  { id: 'c5', name: 'Memory Works', status: 'archived' }, { id: 'c6', name: 'Context Labs', status: 'active' }];
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
const gatesFn = new Function('hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn',
  'claimsFutureActionWithNoPlan', 'requestedIntent', 'readsAsCompletion', 'result', 'rawClaims',
  'claimExecutionEvidence', 'deterministicPrefix', 'hasRejectedClaims',
  stripTS([declOf('legacyProseFallback'), declOf('hasMutationShapedClaim'),
    declOf('hasConfirmedMutationEvidenceInWindow'), declOf('unaccountedCompletionProse'),
    declOf('structuredProseDrift'), declOf('rewriteFromStructure')].join('\n'))
  + '\n; return { legacyProseFallback, rewriteFromStructure, hasMutationShapedClaim };');

const SUCCESS = /\b(?:done|archived|deleted|removed|restored|renamed|reassigned|approved|rejected|created|updated|assigned|closed|completed|ended|saved|sent|moved|granted)\b/i;
/** True when a fabricated completion reaches the founder uncorrected on a mutation-intent turn. */
async function fabricationShips(cmd, prose, claims = null) {
  const e = await executorOf(cmd);
  const intent = intentOf(cmd, {}, e.commandFallbackResolvedVerb);
  const result = { summary: prose, claims };
  const g = gatesFn(false, 'claude', false, false, intent, () => true, result,
    Array.isArray(claims) ? claims : null, [], '', false);
  const r = receiptOf({ requestedIntent: intent, commandText: cmd, result: { ...result },
    hasMutationShapedClaim: g.hasMutationShapedClaim });
  const corrected = r.receiptRendered || g.legacyProseFallback || g.rewriteFromStructure;
  return { ships: !corrected && SUCCESS.test(r.summary || ''), intent, summary: r.summary };
}

console.log('v65_regression_additions — source: ' + INDEX + '\n');

// ==========================================================================================
// 1. DEFECT V65-D1 (P1) — AN ENTITY REFERRED TO BY A COMPOUND NOUN PHRASE IS INVISIBLE TO THE
//    REQUEST-INTENT TIER, SO THE NEVER-SILENT RECEIPT NEVER FIRES AND A FABRICATED COMPLETION
//    SHIPS VERBATIM (governance/OPERATING_TRUTH_MODEL.md §3 rule 3, §5 row 1).
//
//    ROOT CAUSE: IMPERATIVE_OBJECT decides "does this object refer to something?" with a regex whose
//    every alternative is ^-anchored, so only the FIRST token of the object is ever inspected. A
//    referring token in any later position — the identifier in "work order WO-1", the head noun in
//    "software spec S-1" — cannot be seen. ACME matches ^[A-Z]... and QA-1 matches ^\S*[-_]?\d, which
//    is why every committed corpus passes: the referring token is always first.
// ==========================================================================================
const COMPOUND = [
  ['work order WO-1', 'order WO-1'], ['software spec S-1', 'spec S-1'],
  ['engineering drawing DR-1', 'drawing DR-1'], ['purchase approval A-1', 'approval A-1'],
  ['sales lead L-1', 'lead L-1'], ['onboarding document D-1', 'document D-1'],
  ['engineering task T-1', 'task T-1'], ['quarterly goal G-1', 'goal G-1'],
  ['pricing proposal PR-1', 'proposal PR-1'], ['ai provider AP-1', 'provider AP-1'],
  ['mcp connector MC-1', 'connector MC-1'], ['holding company ACME', 'company ACME'],
];
const D1_VERBS = ['archive', 'delete', 'remove', 'restore', 'approve', 'reject', 'close', 'cancel', 'reassign', 'rename'];
{
  let bad = 0, ctrlBad = 0, total = 0; const ex = [];
  for (const [compound, control] of COMPOUND) for (const v of D1_VERBS) {
    total++;
    const prose = 'Done — ' + compound + ' has been ' + (v === 'rename' ? 'renamed' : v + 'd') + '.';
    const a = await fabricationShips(v + ' ' + compound, prose);
    if (a.ships) { bad++; if (ex.length < 6) ex.push(v + ' ' + compound); }
    const b = await fabricationShips(v + ' ' + control, prose);
    if (b.ships) ctrlBad++;
  }
  check('DEFECT', 'V65-D1 a compound entity reference is a mutation request the receipt tier can see',
    bad === 0, bad + ' of ' + total + ' fabricated completions ship uncorrected, e.g. ' + JSON.stringify(ex));
  check('CONTRACT', 'the head-noun control still arms the receipt (the ONLY variable is the modifier)',
    ctrlBad === 0, ctrlBad + ' of ' + total + ' control cases ship — the control must stay at 0 for the '
    + 'DEFECT row above to mean anything');
}
{
  // The root cause, pinned directly: the object test must be able to see a referring token that is not
  // the first token. Structural, so it cannot be satisfied by enumerating twelve more head nouns.
  const objWin = stripTS(SRC.slice(SRC.indexOf('const IMPERATIVE_OBJECT = '),
    SRC.indexOf(';', SRC.indexOf('const objectRefers = ')) + 1));
  const o = new Function(objWin + '\n; return objectRefers;')();
  const LATER_TOKEN = ['work order WO-1', 'software spec S-1', 'purchase approval A-1',
    'sales lead L-1', 'pricing proposal PR-1', 'quarterly goal G-1'];
  const missed = LATER_TOKEN.filter((r) => !o(r));
  check('DEFECT', 'V65-D1 root cause: a referring token is recognised wherever it sits, not only first',
    missed.length === 0, 'objectRefers() refuses ' + JSON.stringify(missed)
    + ' — every alternative of IMPERATIVE_OBJECT is ^-anchored, so only token 0 is inspected');
  // Both halves: the guard V61-D7 added must survive any widening.
  const STILL_REFUSED = ['policy needs a review', 'price fell after the announcement',
    'costs are rising', 'schedule was changed by the client'];
  const wrongly = STILL_REFUSED.filter((r) => o(r));
  check('CONTRACT', 'V61-D7 still holds: a statement about the world is still not an imperative object',
    wrongly.length === 0, 'objectRefers() now accepts ' + JSON.stringify(wrongly));
}

// ==========================================================================================
// 2. DEFECT V65-D2 (P1) — THE READ-IDIOM CLAUSE SWALLOWS A REAL ENTITY WHOSE NAME BEGINS WITH AN
//    IDIOM NOUN. Same shape as ledger #146: a trailing \b that does not express the boundary the
//    rule means. "delete the chat channel C-1" targets a REAL, deletable row (deleteChannelIds /
//    pendingDeleteChannelIds, which even forces an approval) and is read as "delete the chat".
// ==========================================================================================
{
  const IDIOM = ['memory', 'context', 'conversation', 'history', 'chat'];
  const HEADS = ['channel C-1', 'channels', 'document D-1', 'record R-1', 'thread T-1'];
  const VERBS = ['archive', 'delete', 'remove', 'restore', 'clear', 'reset'];
  let blind = 0, total = 0, terminalWrong = 0, terminalTotal = 0; const ex = [];
  for (const v of VERBS) for (const n of IDIOM) {
    // (a) TERMINAL — the genuine idiom. intent null is CORRECT and must be preserved.
    for (const det of ['my ', 'the ', 'our ', '']) {
      terminalTotal++;
      if (intentOf(v + ' ' + det + n, {}, null) !== null) terminalWrong++;
    }
    // (b) MODIFIER of a real entity — a mutation request.
    for (const h of HEADS) {
      total++;
      const cmd = v + ' the ' + n + ' ' + h;
      if (intentOf(cmd, {}, null) === null) { blind++; if (ex.length < 6) ex.push(cmd); }
    }
  }
  check('DEFECT', 'V65-D2 an idiom noun MODIFYING a real entity is still a mutation request',
    blind === 0, blind + ' of ' + total + ' derive null intent, e.g. ' + JSON.stringify(ex));
  check('CONTRACT', 'the genuine terminal idiom is still read as a read ("clear my memory")',
    terminalWrong === 0, terminalWrong + ' of ' + terminalTotal + ' terminal idioms now arm the receipt — '
    + 'the fix must not turn "reset the conversation" into a mutation request');
}

// ==========================================================================================
// 3. DEFECT V65-D3 (P2) — THE RECEIPT NAMES THE WRONG ENTITY TYPE. V58-D2 fixed this for task and
//    goal; commandEntityNoun still enumerates six nouns, so every other entity falls through to the
//    literal 'company' and the receipt states that the COMPANIES were searched when they were not
//    (OPERATING_TRUTH_MODEL §4.2: the receipt describes the operation, not the wish).
// ==========================================================================================
{
  const CASES = [['archive approval A-1', 'approval'], ['archive document D-1', 'document'],
    ['archive lead L-1', 'lead'], ['archive channel C-1', 'channel'], ['archive proposal PR-1', 'proposal'],
    ['archive order WO-1', 'work order'], ['archive invoice I-1', 'invoice'], ['archive contract CT-1', 'contract']];
  const wrong = [];
  for (const [cmd, expected] of CASES) {
    const r = receiptOf({ requestedIntent: intentOf(cmd, {}, null), commandText: cmd, result: {} });
    const m = /which (\w+(?: \w+)?) you meant/.exec(r.summary || '');
    if (!m || m[1] !== expected) wrong.push(cmd + ' -> "' + (m ? m[1] : '(none)') + '"');
  }
  check('DEFECT', 'V65-D3 the receipt names the entity type the founder actually asked about',
    wrong.length === 0, wrong.length + ' of ' + CASES.length + ': ' + JSON.stringify(wrong));
  const OK6 = [['archive task T-1', 'task'], ['archive goal G-1', 'goal'], ['archive project P-1', 'project'],
    ['archive department Sales', 'department'], ['archive company ACME', 'company'], ['restore employee Bob', 'person']];
  const regressed = OK6.filter(([cmd, exp]) => {
    const r = receiptOf({ requestedIntent: intentOf(cmd, {}, null), commandText: cmd, result: {} });
    const m = /which (\w+) you meant/.exec(r.summary || '');
    return !m || m[1] !== exp;
  }).map(([c]) => c);
  check('CONTRACT', 'V58-D2 still holds for the six nouns it closed', regressed.length === 0, JSON.stringify(regressed));
}

// ==========================================================================================
// 4. DEFECT V65-D4 (P2) — MOVING THE MODAL INTERROGATIVES TO DELIBERATIVE COSTS A FALSE RECEIPT,
//    NOT "ONE EXTRA TURN". REQUEST_FRAME_DELIBERATIVE names 22 frames; the receipt's own
//    hypotheticalRequest test names 3 of them, so the other 19 fall through to
//    "I could not resolve which company you meant (searched the active and archived companies you can
//    access)" for a company that resolves perfectly well. Two spellings of "the founder was weighing,
//    not instructing" — the class ledger #146 exists to stop.
// ==========================================================================================
{
  const DELIB = SRC.slice(SRC.indexOf('const REQUEST_FRAME_DELIBERATIVE = '),
    SRC.indexOf(';', SRC.indexOf('const REQUEST_FRAME_ALTERNATION_INTENT')))
    .match(/"([^"]*)"/g).map((s) => s.slice(1, -1)).join('|').split('|')
    .map((s) => s.replace(/\(\?:[^)]*\)\?/g, '').replace(/\(\?:([^|)]*)\|[^)]*\)/g, '$1').trim())
    .filter((s) => s && !/[()\\[\]{}*+?^$]/.test(s));
  const falseReason = [], executedAnyway = [];
  for (const f of DELIB) {
    const cmd = f + ' archive ACME';
    const e = await executorOf(cmd);
    if ((e.archiveCompanyIds || []).length + (e.restoreCompanyIds || []).length > 0) executedAnyway.push(f);
    const intent = intentOf(cmd, {}, e.commandFallbackResolvedVerb);
    if (intent === null) { falseReason.push(f + ' [BLIND]'); continue; }
    const r = receiptOf({ requestedIntent: intent, commandText: cmd, result: {} });
    // ACME resolves; "could not resolve which company you meant" is a false statement about the database.
    if (/could not resolve which \w+ you meant/.test(r.summary || '')) falseReason.push(f);
  }
  check('CONTRACT', 'a DELIBERATIVE frame never reaches the executor', executedAnyway.length === 0,
    JSON.stringify(executedAnyway));
  check('CONTRACT', 'a DELIBERATIVE frame always arms the receipt (EXECUTOR ⊆ INTENT holds either way)',
    !falseReason.some((f) => f.endsWith('[BLIND]')), JSON.stringify(falseReason.filter((f) => f.endsWith('[BLIND]'))));
  check('DEFECT', 'V65-D4 a deliberative frame gets an HONEST reason, not "could not resolve"',
    falseReason.length === 0,
    falseReason.length + ' of ' + DELIB.length + ' deliberative frames claim the company could not be '
    + 'resolved when it resolves: ' + JSON.stringify(falseReason.slice(0, 8))
    + ' — REQUEST_FRAME_DELIBERATIVE and the receipt\'s hypotheticalRequest test are two spellings of one concept');
}

// ==========================================================================================
// 5. CONTRACT — EXECUTOR ⊆ INTENT ON THE ENTITY-TYPE / FIELD AXIS. This is the #66 closure measured
//    on an axis it was not built against, and it HOLDS. Pinned so the outcome-consuming branch cannot
//    be removed on the grounds that the frames and objects are covered.
// ==========================================================================================
{
  const NAME_COLLIDES = ['archive History Media', 'delete History Media', 'archive Chat Holdings',
    'restore Memory Works', 'remove Context Labs', 'archive the company History Media'];
  const violations = [];
  for (const cmd of NAME_COLLIDES) {
    const e = await executorOf(cmd);
    const executed = (e.archiveCompanyIds || []).length + (e.restoreCompanyIds || []).length;
    const intent = intentOf(cmd, {}, e.commandFallbackResolvedVerb);
    if (executed > 0 && intent === null) violations.push(cmd);
  }
  check('CONTRACT', 'a company whose NAME collides with a read idiom still arms the receipt when it is archived',
    violations.length === 0, JSON.stringify(violations)
    + ' — the read veto fires on the NAME, and only the executor-outcome branch rescues it');
  // The sweep, not the six strings.
  const VERBS = ['archive', 'delete', 'remove', 'restore', 'unarchive', 'reactivate'];
  const FRAMES = ['', 'please ', 'go ahead and ', 'just ', 'first, '];
  const OBJ = ['ACME', 'the company ACME', 'the business unit Beta', '"ACME"', 'History Media',
    'Chat Holdings', 'Memory Works', 'Context Labs'];
  const TAIL = ['', ' then tell me what is left', ', then update me', ' and list the rest'];
  let bad = 0, n = 0; const ex = [];
  for (const v of VERBS) for (const f of FRAMES) for (const o of OBJ) for (const t of TAIL) {
    const cmd = f + v + ' ' + o + t; n++;
    const e = await executorOf(cmd);
    const executed = (e.archiveCompanyIds || []).length + (e.restoreCompanyIds || []).length;
    if (executed > 0 && intentOf(cmd, {}, e.commandFallbackResolvedVerb) === null) {
      bad++; if (ex.length < 5) ex.push(cmd);
    }
  }
  check('CONTRACT', 'EXECUTOR ⊆ INTENT across the verb x frame x object-name sweep (' + n + ' cases)',
    bad === 0, bad + ' violations, e.g. ' + JSON.stringify(ex));
}

// ==========================================================================================
// 6. CONTRACT — EVERY MODEL FIELD THAT DRIVES A REAL WRITE IS VISIBLE TO THE INTENT TIER.
//    'approvals' and 'memoryCandidates' drive real inserts through sem_execute_ai_command
//    (p_approvals / p_memory_candidates) and are NOT in MUTATION_ARRAY_FIELDS. This row records the
//    classification so the omission is a decision rather than an oversight, and fails if a THIRD
//    write-driving field is added without one.
// ==========================================================================================
{
  const MUT = SRC.match(/const MUTATION_ARRAY_FIELDS = \[([^\]]*)\]/)[1]
    .split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const OTHER = SRC.match(/const OTHER_MUTATION_FIELDS = \[([^\]]*)\]/)[1]
    .split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  check('CONTRACT', 'OTHER_MUTATION_FIELDS is a strict subset of MUTATION_ARRAY_FIELDS',
    OTHER.every((f) => MUT.includes(f)), JSON.stringify(OTHER.filter((f) => !MUT.includes(f))));
  check('CONTRACT', 'the two lists differ by exactly the company-lifecycle fields, nothing else',
    JSON.stringify(MUT.filter((f) => !OTHER.includes(f)).sort())
      === JSON.stringify(['archiveCompanyIds', 'archiveCompanyNames', 'restoreCompanyIds', 'restoreCompanyNames'].sort()),
    JSON.stringify(MUT.filter((f) => !OTHER.includes(f))));
  // Every write-driving field, derived from the RPC call site rather than from a list kept here.
  const rpcArgs = SRC.slice(SRC.indexOf("supabase.rpc('sem_execute_ai_command'"),
    SRC.indexOf('});', SRC.indexOf("supabase.rpc('sem_execute_ai_command'")));
  const KNOWN_BLIND = ['approvals', 'memoryCandidates'];
  const blind = [];
  for (const f of ['tasks', 'approvals', 'memoryCandidates', 'createCompanies', 'createPeople',
    'createProjects', 'createGoals', 'createCompanyRelationships', 'createPersonAssignments', 'deleteTaskIds']) {
    if (!MUT.includes(f) && intentOf('the quarterly figures look fine to me', { [f]: [{ id: 'x', fact: 'f', title: 't' }] }) === null) blind.push(f);
  }
  check('CONTRACT', 'no NEW model field drives a write while the intent tier is blind to it',
    JSON.stringify(blind.sort()) === JSON.stringify(KNOWN_BLIND.sort()),
    'blind now: ' + JSON.stringify(blind) + '; registered: ' + JSON.stringify(KNOWN_BLIND)
    + ' — approvals and memoryCandidates are DECLARED as intentionally excluded (a memory saved as a side '
    + 'effect of a read turn must not convert a truthful read answer into a no-change receipt); a THIRD '
    + 'name here is an oversight, not a decision');
  check('CONTRACT', 'the persist RPC really is the write path these fields reach',
    /p_approvals/.test(rpcArgs) && /p_memory_candidates/.test(rpcArgs));
}

// ==========================================================================================
// 7. CONTRACT — THE TIER BOUNDARY IS COMPUTED ONCE, READ ONCE, AND NOTHING RE-DERIVES IT.
// ==========================================================================================
{
  const code = SRC.split('\n').map((l) => l.replace(/\/\/.*$/, ''));
  const occ = code.map((l, i) => ({ l, i })).filter(({ l }) => /(?<![\w$.])commandFallbackResolvedVerb(?![\w$])/.test(l));
  check('CONTRACT', 'commandFallbackResolvedVerb is declared exactly once',
    occ.filter(({ l }) => /const commandFallbackResolvedVerb/.test(l)).length === 1);
  check('CONTRACT', 'it is never re-assigned', occ.every(({ l }) =>
    !/commandFallbackResolvedVerb\s*=[^=]/.test(l) || /const commandFallbackResolvedVerb/.test(l)));
  check('CONTRACT', 'nothing outside its own declaration re-tests the executor outputs it summarises',
    code.filter((l) => /archiveCompanyIds\.length\s*>\s*0|restoreCompanyIds\.length\s*>\s*0/.test(l)).length === 1,
    'a second place asking "did the executor resolve anything?" is the second spelling that always drifts');
  // TDZ: the declaration sits above the read, at the same block depth, and the block never closes between.
  const decl = occ.find(({ l }) => /const commandFallbackResolvedVerb/.test(l)).i;
  const read = occ.filter(({ i }) => i > decl).map(({ i }) => i)[0];
  let d = 0; for (let i = 0; i < decl; i++) for (const ch of code[i]) { if (ch === '{') d++; else if (ch === '}') d--; }
  let cur = d, min = d;
  for (let i = decl; i < read; i++) for (const ch of code[i]) { if (ch === '{') cur++; else if (ch === '}') { cur--; if (cur < min) min = cur; } }
  check('CONTRACT', 'no TDZ: the declaration cannot be skipped on any path that reaches the read',
    read > decl && min >= d, 'decl line ' + (decl + 1) + ' depth ' + d + ', read line ' + (read + 1) + ', min depth between ' + min);
}

// ==========================================================================================
// 8. CONTRACT — the deploy surface is index.ts alone, and it is CRLF-pure.
// ==========================================================================================
{
  const raw = readFileSync(INDEX).toString('latin1');
  check('CONTRACT', 'index.ts imports nothing from _shared (deploy surface is index.ts alone)',
    !/from\s+['"][^'"]*_shared/.test(SRC));
  check('CONTRACT', 'index.ts is CRLF-pure (0 bare LF)', (raw.match(/(?<!\r)\n/g) || []).length === 0,
    'bare LF = ' + (raw.match(/(?<!\r)\n/g) || []).length);
}

console.log('\nv65_regression_additions: ' + pass + ' passed, '
  + (contractFails.length + defectFails.length) + ' failed'
  + '  (CONTRACT failures: ' + contractFails.length + ', DEFECT failures: ' + defectFails.length + ')');
if (contractFails.length) { console.log('\nCONTRACT FAILURES:'); for (const f of contractFails) console.log('  - ' + f); }
if (defectFails.length) { console.log('\nDEFECT FAILURES (this round\'s findings — they must pass after the fix):'); for (const f of defectFails) console.log('  - ' + f); }
process.exit(contractFails.length + defectFails.length ? 1 : 0);
