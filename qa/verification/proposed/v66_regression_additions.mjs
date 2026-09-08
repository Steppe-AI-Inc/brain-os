#!/usr/bin/env node
// V66 REGRESSION ADDITIONS — verifier #66, campaign #126, candidate 52d9582
// (index.ts sha256 e3134bc5a31bbc1566c1fb842384418a1cd7081561e133b3e9ee33e17d403aed).
//
// Rows are tagged:
//   CONTRACT  a rule that must hold forever. It holds on this candidate; it is pinned so it cannot
//             be reverted silently. Every CONTRACT row here was proved NON-VACUOUS by a mutation
//             that it catches (the mutants are named in the row's comment).
//   DEFECT    a finding of this round. It FAILS on this candidate and must PASS after the fix.
//
// ANY failure exits non-zero. The source under test comes from SEM_INDEX_SRC when set, otherwise it
// is resolved by walking up from this file, so the suite is correct from ANY cwd.
//
// Everything below executes the REAL windows sliced out of index.ts. Nothing is re-implemented.
// One warning from this round, applied to this file itself: the belt window reads `verifiedClaims`,
// declared above it in production. A harness that wraps the window in try/catch and compares two
// identical ReferenceError strings reports "0 differences" while measuring nothing. Nothing here
// catches; a window that cannot be built throws.
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
  throw new Error('v66: index.ts not found');
}
function resolveRepo() {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v66: repo root not found');
}
const INDEX = resolveIndex();
const ROOT = resolveRepo();
const RAW = readFileSync(INDEX, 'utf8');
const SRC = RAW.replace(/\r\n?/g, '\n');
const { stripTS, withPatternsAboveWindow } = await import(
  'file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));

let pass = 0; const contractFails = [], defectFails = [];
const check = (tag, name, cond, detail) => {
  if (cond) { pass++; console.log('OK       [' + tag + '] ' + name); return; }
  const row = name + (detail ? '\n           ' + detail : '');
  (tag === 'CONTRACT' ? contractFails : defectFails).push(row);
  console.log('FAIL     [' + tag + '] ' + name + (detail ? '\n           ' + detail : ''));
};

// ---------------------------------------------------------------- windows
function sliceBetween(a, b) {
  const i = SRC.indexOf(a); if (i < 0) throw new Error('v66: start marker missing: ' + a);
  const j = SRC.indexOf(b, i); if (j < 0) throw new Error('v66: end marker missing: ' + b);
  return SRC.slice(i, j + b.length);
}
function stmt(name) {
  const at = SRC.indexOf('const ' + name + ' = ');
  if (at < 0) throw new Error('v66: ' + name + ' not found in the source under test');
  let d = 0;
  for (let i = at; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === ';' && d === 0) return stripTS(SRC.slice(at, i + 1));
  }
  throw new Error('v66: ' + name + ' end not found');
}
const INTENT_WINDOW = stripTS(sliceBetween('const MUTATION_ARRAY_FIELDS = [',
  'const requestedIntent: MutationIntent | null = requestedIntentPrimary;'));
// The V66-D6 fix makes the intent tier CONSUME the executor's outcome instead of re-deriving its gate, so
// one value now legitimately crosses the tier boundary and the harness has to supply it. Defaulting it to
// null keeps every existing row measuring exactly what it measured before (no executor resolution); the
// rows that assert the fix pass the resolved verb explicitly.
const intentFn = new Function('command', 'result', 'claimExecutionEvidence', 'commandFallbackResolvedVerb',
  INTENT_WINDOW + '\n; return requestedIntent;');
const intentOf = (c, resolvedVerb = null) => intentFn(c, {}, [], resolvedVerb);

const EXEC_END = "const commandFallbackAllowed = ";
const execFn = new Function('command', 'result',
  ['ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN'].map(stmt).join('\n') + '\n'
  + stripTS(SRC.slice(SRC.indexOf('const commandMentionsCompany = '), SRC.indexOf(';\n', SRC.indexOf(EXEC_END)) + 1))
  + '\n; return { commandFallbackAllowed, commandIsQuestion, commandMentionsCompany };');
const execOf = (c) => execFn(c, {});

const CHAIN_END = "        const headLifecycleAction: string | null = archiveVerbAt < 0 && restoreVerbAt < 0 ? null : restoreVerbAt < 0 ? 'archive' : archiveVerbAt < 0 ? 'restore' : (archiveVerbAt <= restoreVerbAt ? 'archive' : 'restore');";
const chainFn = new Function('command', 'supabase', 'companyNameById', 'lifecycleUnresolvedLines',
  'lifecycleDisambiguation', 'modelIntentNamesFor', 'commandMentionsCompany',
  stmt('COMPANY_UUID_RE') + '\n' + stmt('ARCHIVE_VERB_PATTERN') + '\n' + stmt('RESTORE_VERB_PATTERN') + '\n'
  + stripTS(sliceBetween('        function normaliseName(v: unknown): string', CHAIN_END))
  + '\n; return { resolveCompanyLifecycleTargets, lifecycleCommandName, headLifecycleAction, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN };');

const ROWS = [
  { id: 'c1', name: 'Nomin Holding', status: 'active' }, { id: 'c2', name: 'ACME', status: 'active' },
  { id: 'c3', name: 'Beta', status: 'active' }, { id: 'c4', name: 'Alpha Holdings', status: 'active' },
];
const stub = { from() {
  const q = { _p: null };
  q.select = () => q;
  q.in = (_c, ids) => Promise.resolve({ data: ROWS.filter((r) => ids.includes(r.id)) });
  q.ilike = (_c, p) => { q._p = p; return q; };
  q.limit = () => {
    const re = new RegExp('^' + q._p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('%').join('.*') + '$', 'i');
    return Promise.resolve({ data: ROWS.filter((r) => re.test(r.name)) });
  };
  return q;
} };
async function executorTargets(cmd) {
  const g = execOf(cmd);
  if (!g.commandFallbackAllowed) return { ids: [], disamb: 0, gate: false, action: null };
  const names = new Map(); const un = []; const dis = [];
  const c = chainFn(cmd, stub, names, un, dis, () => [], g.commandMentionsCompany);
  if (!c.headLifecycleAction) return { ids: [], disamb: 0, gate: true, action: null };
  const pat = c.headLifecycleAction === 'archive' ? c.ARCHIVE_VERB_PATTERN : c.RESTORE_VERB_PATTERN;
  const ids = await c.resolveCompanyLifecycleTargets(c.headLifecycleAction, [], [],
    c.lifecycleCommandName(pat));
  return { ids, disamb: dis.length, gate: true, action: c.headLifecycleAction };
}

console.log('v66_regression_additions — source: ' + INDEX + '\n');

// ============================================================================================
// 1. DEFECT V66-D6 (P1) — EXECUTOR ⊆ INTENT MUST HOLD FOR CLAUSE AND OBJECT SHAPES, NOT ONLY
//    FOR REQUEST FRAMES. The raw-command company-lifecycle fallback really archives these rows
//    while requestedIntent is null, so the never-silent receipt cannot see the request
//    (governance/OPERATING_TRUTH_MODEL.md §3 rule 3; founder directive 2026-09-08 §1 and §3).
// ============================================================================================
const D6_CASES = [
  'archive "Nomin Holding" then tell me what is left',
  'archive “Nomin Holding” and tell me what is left',
  "archive 'Nomin Holding', then update me",
  'please archive "Nomin Holding" then tell me what is left',
  'archive "ACME" then list the rest',
  'archive the business unit Beta then tell me what is left',
  'restore the business unit Beta and tell me what is left',
  'archive the business unit Beta, then update me',
];
for (const cmd of D6_CASES) {
  const t = await executorTargets(cmd);
  const i = intentOf(cmd, t.ids.length > 0 ? t.action : null) !== null;
  check('DEFECT', 'V66-D6 the executor archives a row and the receipt tier sees the request: ' + JSON.stringify(cmd),
    !(t.ids.length > 0 && !i),
    'executor resolved ' + JSON.stringify(t.ids) + ' but requestedIntent is ' + (i ? 'set' : 'NULL')
    + ' — a mutation the never-silent receipt cannot see');
}
// controls: the same commands without the quoting / without the "business unit" head must already work
for (const cmd of ['archive Nomin Holding then tell me what is left', 'archive ACME', 'archive "Nomin Holding"']) {
  const t = await executorTargets(cmd);
  const rv = t.ids.length > 0 ? t.action : null;
  check('CONTRACT', 'the working control still resolves AND arms the receipt: ' + JSON.stringify(cmd),
    t.ids.length > 0 && intentOf(cmd, rv) !== null, JSON.stringify(t) + ' intent=' + JSON.stringify(intentOf(cmd, rv)));
}
// the generalised property, swept — the class, not the eight strings
{
  const FR = ['', 'please ', 'could you ', 'go ahead and ', 'just ', 'first, '];
  const VB = ['archive', 'restore', 'delete', 'remove'];
  const OB = ['"Nomin Holding"', '“Nomin Holding”', "'Nomin Holding'", 'the business unit Beta', 'Nomin Holding', 'ACME'];
  const TL = ['', ' then tell me what is left', ' and tell me what is left', ', then update me', ' then list the rest'];
  let bad = 0; const ex = [];
  for (const f of FR) for (const v of VB) for (const o of OB) for (const t of TL) {
    const cmd = f + v + ' ' + o + t;
    const r = await executorTargets(cmd);
    // Wired as production wires it: the intent tier receives the executor's resolved verb.
    if (r.ids.length > 0 && intentOf(cmd, r.action) === null) { bad++; if (ex.length < 5) ex.push(cmd); }
  }
  check('DEFECT', 'V66-D6 class sweep: no command whose lifecycle fallback resolves a row may derive null intent',
    bad === 0, bad + ' of ' + (6 * 4 * 6 * 5) + ' e.g. ' + JSON.stringify(ex));
}

// ============================================================================================
// 2. CONTRACT — REQUEST-FRAME TIERS ARE ONE DEFINITION WITH PER-TIER APPLICABILITY.
//    Structural, not sampled: the executor alternation must be a literal prefix of the intent
//    union, and the question-suppressing group must be built from the ADDRESSED group.
//    Non-vacuous: killed by "REQUEST_FRAME_ALTERNATION_INTENT no longer contains ALTERNATION".
// ============================================================================================
{
  const decl = (n) => { const i = SRC.indexOf('const ' + n + ' = '); return i < 0 ? null : SRC.slice(i, SRC.indexOf('\n', SRC.indexOf(';', i))); };
  const union = decl('REQUEST_FRAME_ALTERNATION_INTENT') || '';
  check('CONTRACT', 'the INTENT tier is formed as the UNION of the executor tier and the deliberative group, in one place',
    /REQUEST_FRAME_ALTERNATION\s*\+\s*"\|"\s*\+\s*REQUEST_FRAME_DELIBERATIVE/.test(union), union);
  const alt = decl('REQUEST_FRAME_ALTERNATION') || '';
  check('CONTRACT', 'the executor tier is built from the ADDRESSED group, never a copy of it',
    /=\s*REQUEST_FRAME_ADDRESSED/.test(alt), alt);
  const qsf = decl('QUESTION_SUPPRESSING_FRAME') || '';
  check('CONTRACT', 'the question-suppressing tier derives from the ADDRESSED group',
    qsf.includes('REQUEST_FRAME_ADDRESSED'), qsf);
  // the executor question gate must CONSULT that definition rather than re-spell it
  const ciq = SRC.split('\n').filter((l) => l.includes('commandIsQuestion') && l.includes('=')).join(' ')
    + ' ' + (SRC.split('\n').find((l) => l.includes('!QUESTION_SUPPRESSING_FRAME')) || '');
  check('CONTRACT', 'V66-D4 the executor question gate consults QUESTION_SUPPRESSING_FRAME (a private re-spelling is the fifth twin)',
    /QUESTION_SUPPRESSING_FRAME/.test(ciq),
    'commandIsQuestion no longer derives from the one definition');
}
// a DELIBERATIVE frame must never reach the executor; every frame must arm the receipt
{
  // The four modal interrogatives that verifier #66 ruled deliberative are in this list now: the
  // rule is FIRST-PERSON MODAL INTERROGATIVES ARE DELIBERATIVE WHATEVER THEIR NUMBER, so 'shall we'
  // and 'shall i' must behave exactly like 'should we' and 'should i'.
  const DELIB = ['should we', 'should i', 'i should', 'could i', 'can i', 'may we', 'may i',
    'can we', 'could we', 'shall we', 'shall i',
    'i want to', 'we want to', 'i need to', "i'd like to", 'we have to', 'we ought to', 'we must', 'i must'];
  let reached = 0, blind = 0; const rEx = [], bEx = [];
  for (const f of DELIB) for (const v of ['archive', 'restore', 'delete']) for (const q of ['', '?']) {
    const cmd = f + ' ' + v + ' ACME' + q;
    if (execOf(cmd).commandFallbackAllowed) { reached++; rEx.push(cmd); }
    if (intentOf(cmd) === null) { blind++; bEx.push(cmd); }
  }
  check('CONTRACT', 'no DELIBERATIVE frame reaches the executor', reached === 0, JSON.stringify(rEx.slice(0, 6)));
  check('CONTRACT', 'every DELIBERATIVE frame arms the receipt', blind === 0, JSON.stringify(bEx.slice(0, 6)));
}

// ============================================================================================
// 3. CONTRACT — the fuzzy raw-command guess ASKS, it never executes (V56-D3). This is the
//    v56_mutation_proof m5 mutant, which survives v56's pinned seven suites; here it is pinned
//    executably against the real resolver.
// ============================================================================================
{
  const names = new Map(); const un = []; const dis = [];
  const c = chainFn('archive Alpha', stub, names, un, dis, () => [], true);
  const ids = await c.resolveCompanyLifecycleTargets('archive', [], [], 'Alpha');
  check('CONTRACT', 'a FUZZY raw-command name asks and never executes ("archive Alpha" must not archive "Alpha Holdings")',
    ids.length === 0 && dis.length === 1, 'resolved ' + JSON.stringify(ids) + ' disambiguations ' + dis.length);
}

// ============================================================================================
// 4. CONTRACT — no SIXTH private re-spelling of the request-frame vocabulary. A class guard,
//    not a substring pin: any regex literal outside the canonical declarations carrying two or
//    more canonical MULTI-WORD frame phrases is a new copy. Two sites are declared, with reasons.
// ============================================================================================
{
  const declBody = (n) => {
    const at = SRC.indexOf('const ' + n + ' = '); if (at < 0) return '';
    let d = 0;
    for (let i = at; i < SRC.length; i++) {
      const ch = SRC[i];
      if (ch === '(' || ch === '[' || ch === '{') d++;
      else if (ch === ')' || ch === ']' || ch === '}') d--;
      else if (ch === ';' && d === 0) return SRC.slice(at, i + 1);
    }
    return '';
  };
  const litOf = (n) => {
    const code = declBody(n).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    return [...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join('');
  };
  const phrases = [...new Set((litOf('REQUEST_FRAME_ADDRESSED') + '|' + litOf('REQUEST_FRAME_ALTERNATION')
    + '|' + litOf('REQUEST_FRAME_DELIBERATIVE')).split('|'))]
    .map((t) => t.replace(/\(\?:[^)]*\)\??/g, '').replace(/[\\^$*+?.()|[\]{}]/g, '').trim().toLowerCase())
    .filter((t) => t.includes(' ') && t.length >= 5);
  // the lines the canonical declarations occupy
  const canonLines = new Set();
  for (const n of ['REQUEST_FRAME_ADDRESSED', 'REQUEST_FRAME_ALTERNATION', 'REQUEST_FRAME_DELIBERATIVE',
    'REQUEST_FRAME_ALTERNATION_INTENT']) {
    const b = declBody(n); if (!b) continue;
    const start = SRC.slice(0, SRC.indexOf(b)).split('\n').length;
    for (let k = 0; k < b.split('\n').length; k++) canonLines.add(start + k);
  }
  // DECLARED non-frame sites, each with the reason it is not a request-frame copy:
  //   commandReadLead        — "should i|should we" as READ LEADS. Redundant with the tier split
  //                            (deliberative frames are not in the executor alternation at all),
  //                            reinforcing rather than contradicting it.
  //   hypotheticalRequest    — chooses the WORDING of a receipt reason; gates nothing.
  //   READ_SHAPE             — carries "can you tell|could you tell" as READ leads. That is the
  //                            ADDRESSED group crossed with REQUEST_FRAME_READ_VERB, i.e. the same
  //                            two canonical pieces QUESTION_SUPPRESSING_FRAME already composes, so
  //                            it is a convergence CANDIDATE (classified ACCIDENTAL OVERLAP by
  //                            verifier #66) rather than a live duplicate: it detects reads, it does
  //                            not decide whether a sentence is a request.
  const ALLOWED = ['const commandReadLead =', 'const hypotheticalRequest =', 'const READ_SHAPE ='];
  const lines = SRC.split('\n');
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    if (canonLines.has(i + 1)) continue;
    const L = lines[i];
    if (/^\s*\/\//.test(L)) continue;
    if (ALLOWED.some((a) => L.includes(a))) continue;
    if (!/[/]\^?\\s\*|new RegExp\(/.test(L) && !L.includes('/^')) continue;
    const low = L.toLowerCase();
    const hit = phrases.filter((p) => low.includes(p));
    if (hit.length >= 2) offenders.push({ line: i + 1, hit, text: L.trim().slice(0, 160) });
  }
  check('CONTRACT', 'V66-D4 no NEW private re-spelling of the request-frame vocabulary (class guard, not a substring pin)',
    offenders.length === 0, JSON.stringify(offenders, null, 1));
}

// ============================================================================================
// 5. CONTRACT — OTHER_MUTATION_FIELDS is exactly MUTATION_ARRAY_FIELDS minus the four company
//    lifecycle fields. Two hand-maintained arrays, 91% identical by the mechanical scan; today
//    they agree exactly, and this pins that they cannot drift.
// ============================================================================================
{
  const arrOf = (n) => {
    const at = SRC.indexOf('const ' + n + ' = [');
    return JSON.parse('[' + SRC.slice(at + ('const ' + n + ' = [').length, SRC.indexOf('];', at)).replace(/'/g, '"') + ']');
  };
  const A = arrOf('MUTATION_ARRAY_FIELDS'), O = arrOf('OTHER_MUTATION_FIELDS');
  const extra = O.filter((f) => !A.includes(f));
  const missing = A.filter((f) => !O.includes(f));
  check('CONTRACT', 'OTHER_MUTATION_FIELDS carries nothing MUTATION_ARRAY_FIELDS does not',
    extra.length === 0, JSON.stringify(extra));
  check('CONTRACT', 'the only difference is the four company-lifecycle fields',
    JSON.stringify(missing.slice().sort()) === JSON.stringify(['archiveCompanyIds', 'archiveCompanyNames', 'restoreCompanyIds', 'restoreCompanyNames']),
    JSON.stringify(missing));
}

// ============================================================================================
// 6. DEFECT V66-D7 — AUTHORIZED IS NOT COMPLETED, for every deterministic path.
//    index.ts:6942 covers only `deterministic-confirmation`; `deterministic-clarification` and
//    `deterministic-disambiguation` are receipt-EXEMPT with no equivalent net, so "Confirmed —
//    <the clarification question>." ships with zero execution evidence and zero lifecycle report.
//    Reachable for the channel/approval fields, whose ids are filtered against the context window
//    and which produce no lifecycleReport when the id is outside it.
// ============================================================================================
{
  const rcStart = SRC.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const rcAnchor = SRC.indexOf('executionEvidence: claimExecutionEvidence,', rcStart);
  const W = withPatternsAboveWindow(SRC, stripTS(SRC.slice(rcStart, SRC.indexOf('};', rcAnchor) + 2)));
  const receiptFn = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model',
    'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno', 'companyNameById',
    'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic',
    'deterministicPrefix', 'runtimeLabels', W + '\n; return result.summary;');
  const run = (model, command, summary) => {
    globalThis.command = command; globalThis.lifecycleReports = []; globalThis.factLines = [];
    globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v66' };
    return receiptFn({ claims: null, summary, pendingAction: null }, [],
      { companies: [] }, model, false, false, { env: { get: () => undefined } },
      new Map(), new Map(), new Map(), new Map(), false, '', new Map());
  };
  const FAB = 'Confirmed — Delete the ACME purchase approval.';
  for (const model of ['deterministic-clarification', 'deterministic-disambiguation']) {
    const out = String(run(model, 'yes', FAB) || '');
    check('DEFECT', 'V66-D7 ' + model + ' with zero evidence does not ship an authorisation as an outcome',
      out !== FAB, 'shipped verbatim: ' + JSON.stringify(out));
  }
  const conf = String(run('deterministic-confirmation', 'yes', FAB) || '');
  check('CONTRACT', 'deterministic-confirmation keeps its AUTHORIZED-IS-NOT-COMPLETED net',
    conf !== FAB, JSON.stringify(conf));
}

// ============================================================================================
// 7. CONTRACT — the context budget. Minimum safe context survives the hardest trim byte-identically,
//    the estimator's self-measurement gap stays bounded, and a trimmed collection stays truthful.
//    Non-vacuous: killed by "TRIM_ORDER protected-key guard removed" and by "truncated forced false".
// ============================================================================================
{
  const envFn = (() => { const a = SRC.indexOf('function envPositiveInt('); return stripTS(SRC.slice(a, SRC.indexOf('\n}', a) + 2)); })();
  const BLOCK = stripTS(sliceBetween('  const packBudget = Math.max(2000,',
    '  contextBudget.overBudget = contextBudget.estimatedTokens > packBudget;'));
  const runBudget = new Function('command', 'pack', 'collections', 'Deno',
    envFn + '\n' + BLOCK + '\n; return { contextBudget, pack, collections };');
  const UUID = (i) => 'aaaaaaaa-0000-4000-8000-' + String(i).padStart(12, '0');
  const LONG = 'Nomin Holding Group International Trading and Manufacturing Company Limited';
  const rows = (n) => Array.from({ length: n }, (_, i) => ({
    id: UUID(i), name: LONG + ' #' + i, title: LONG + ' #' + i, full_name: LONG + ' #' + i,
    status: 'active', updated_at: '2026-09-01T00:00:00Z', company_id: UUID(0),
  }));
  const collections = {}; const pack = {
    continuity: { totalPriorTurns: 200 }, namedTargets: { companies: rows(5) },
    pendingAction: { kind: 'bulk_confirmation', summary: 'Archive ACME' },
    recentlyResolvedEntities: { companies: [UUID(1)] }, recentlyDeletedEntities: {},
    activeChannelId: UUID(9), counts: {}, collections,
    currentTurn: { turn: 201, command: 'archive Nomin Holding' },
  };
  for (const k of ['memories', 'archivedTasks', 'archivedCompanies', 'companies', 'people', 'tasks',
    'goals', 'projects', 'documents', 'leads', 'departments', 'approvals', 'channels', 'agents',
    'products', 'inventory', 'proposals', 'productSpecs', 'engineeringDrawings', 'aiProviders',
    'mcpConnectors', 'financialReports', 'companyRelationships', 'personAssignments', 'factoryWorkOrders']) {
    pack[k] = rows(60); collections[k] = { shown: 60, total: 600, truncated: true };
  }
  pack.conversationHistory = Array.from({ length: 200 }, (_, i) => ({ turn: i + 1, command: 'turn ' + i, summary: LONG }));
  collections.conversationHistory = { shown: 200, total: 200, truncated: false };
  const beforeMin = JSON.stringify(['currentTurn', 'continuity', 'counts', 'pendingAction',
    'recentlyResolvedEntities', 'recentlyDeletedEntities', 'activeChannelId', 'namedTargets'].map((k) => pack[k]));
  const r = runBudget('archive Nomin Holding', pack, collections, { env: { get: () => undefined } });
  const afterMin = JSON.stringify(['currentTurn', 'continuity', 'counts', 'pendingAction',
    'recentlyResolvedEntities', 'recentlyDeletedEntities', 'activeChannelId', 'namedTargets'].map((k) => r.pack[k]));
  check('CONTRACT', 'the minimum safe context survives the hardest trim byte-identically', beforeMin === afterMin);
  check('CONTRACT', 'the current command is never trimmed',
    r.pack.currentTurn.command === 'archive Nomin Holding');
  check('CONTRACT', 'the pack fits the budget after trimming', r.contextBudget.estimatedTokens <= r.contextBudget.budget,
    r.contextBudget.estimatedTokens + ' vs ' + r.contextBudget.budget);
  const actual = Math.ceil(JSON.stringify({ command: 'archive Nomin Holding', contextPack: r.pack }).length / 4);
  const delta = actual - r.contextBudget.estimatedTokens;
  check('CONTRACT', 'the estimator understates the serialized pack by at most 3 tokens (it measures itself)',
    delta >= 0 && delta <= 3, 'delta ' + delta);
  check('CONTRACT', 'a deliberate margin below the hard cap remains (>= 300 tokens)',
    (r.contextBudget.budget + 600) - r.contextBudget.estimatedTokens >= 300,
    'headroom vs hardMax ' + ((r.contextBudget.budget + 600) - r.contextBudget.estimatedTokens));
  let untruthful = 0;
  for (const t of r.contextBudget.trimmed) {
    const env = collections[t.split(' ')[0]];
    if (!env || env.truncated !== true) untruthful++;
    if (env && env.total !== null && env.total <= env.shown) untruthful++;
  }
  check('CONTRACT', 'every trimmed collection still reports truncated:true with a real or unknown total',
    untruthful === 0, String(untruthful));
  check('CONTRACT', 'history keeps the NEWEST turns',
    r.pack.conversationHistory.length === 0
    || r.pack.conversationHistory[r.pack.conversationHistory.length - 1].turn === 200);
}

// ============================================================================================
// 8. CONTRACT — every mutation/vacuity sweep declares a target FLOOR EQUAL TO the number of
//    mutants it builds. A floor that can be ratcheted down silently is not a floor: v57's proof
//    lost a mutant this round (5 -> 4) and its floor was lowered to match, with the safety
//    contract still green (V66-D2).
// ============================================================================================
{
  const TOOLS = ['vacuity_sweep.mjs', 'vacuity_sweep2.mjs', 'mutation_proof_v60_v61.mjs',
    'vacuity_sweep_extended.mjs', 'v56_mutation_proof.mjs', 'v57_mutation_proof.mjs', 'v58_mutation_proof.mjs'];
  for (const t of TOOLS) {
    const p = join(ROOT, 'qa/verification/scratch/p1', t);
    if (!existsSync(p)) { check('CONTRACT', 'sweep tool present: ' + t, false); continue; }
    const s = readFileSync(p, 'utf8');
    const floors = [...s.matchAll(/(?:mutants|MUTANTS)\.length\s*<\s*(\d+)/g)].map((m) => Number(m[1]));
    check('CONTRACT', t + ': declares a positive mutation-target floor', floors.length > 0 && floors.every((f) => f > 0),
      JSON.stringify(floors));
    // V66-D3: mutation_sweep_safety_contract.mjs accepts ANY `process.exit(1)` anywhere in the file
    // as proof of "exits non-zero on a survivor". Both vacuity sweeps contain one — for the sha
    // check — and exit 0 with survivors. The exit condition must MENTION the survivor count.
    const exitLines = s.split('\n').filter((l) => /process\.exit\(\s*[12]\s*\)/.test(l) || /process\.exit\(\s*surviv/i.test(l));
    // Accepted forms: an exit line that mentions the survivor list, or the equivalent
    // "everything must have been killed" comparison (killed !== MUTANTS.length).
    const survivorGated = exitLines.some((l) => /surviv/i.test(l) || /noApply/.test(l)
      || /killed\s*!==?\s*(?:MUTANTS|mutants)\.length/.test(l));
    check('DEFECT', 'V66-D3 ' + t + ': the non-zero exit is gated on the SURVIVOR COUNT, not only on a sha mismatch',
      survivorGated, 'exit lines: ' + JSON.stringify(exitLines.map((l) => l.trim().slice(0, 120))));
  }
}

// ============================================================================================
// 9. CONTRACT — bytes.
// ============================================================================================
check('CONTRACT', 'index.ts is CRLF-pure (0 bare LF)', !/(?<!\r)\n/.test(RAW));
check('CONTRACT', 'index.ts imports nothing from _shared (the deploy surface is index.ts alone)',
  !/from ['"][^'"]*_shared/.test(SRC));

// ---------------------------------------------------------------- result
console.log('\nv66_regression_additions: ' + pass + ' passed, '
  + (contractFails.length + defectFails.length) + ' failed'
  + '  (CONTRACT failures: ' + contractFails.length + ', DEFECT failures: ' + defectFails.length + ')');
if (contractFails.length) { console.log('\nCONTRACT FAILURES:'); for (const f of contractFails) console.log('  - ' + f); }
if (defectFails.length) { console.log('\nDEFECT FAILURES (this round\'s findings — they must pass after the fix):'); for (const f of defectFails) console.log('  - ' + f); }
process.exit(contractFails.length + defectFails.length ? 1 : 0);
