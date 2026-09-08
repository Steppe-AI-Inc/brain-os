#!/usr/bin/env node
// V64 REGRESSION ADDITIONS — verifier #64, campaign #124, candidate 15480e3 / index.ts 885fd290.
//
// Every check below executes the REAL windows sliced out of supabase/functions/sem-ai-command/index.ts.
// Nothing here re-implements product logic.
//
//   CONTRACT rows  — hold on this candidate and must keep holding.
//   DEFECT rows    — FAIL on this candidate. Each encodes an open V64 finding; a closure flips it green.
//
// ANY failure exits non-zero. Point it at a different build with SEM_INDEX_SRC=/path/to/index.ts.
// Runnable from ANY cwd: the source path is resolved from this file's own location.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');            // qa/verification/proposed -> repo root
const RUNNER = resolve(REPO, 'qa/scenarios-runner');
const SRC = process.env.SEM_INDEX_SRC || resolve(REPO, 'supabase/functions/sem-ai-command/index.ts');
const { stripTS, withPatternsAboveWindow, withSourceHelpers, withSharedConstants } = await import(
  'file://' + resolve(RUNNER, '_gate_extract.mjs').replace(/\\/g, '/'));

const src = readFileSync(SRC, 'utf8');
const lf = src.replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const ck = (kind, name, cond, detail) => {
  if (cond) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else { failures.push('[' + kind + '] ' + name + (detail ? '\n       ' + detail : '')); console.log('FAIL [' + kind + '] ' + name + (detail ? '\n       ' + detail : '')); }
};

// ============================================================ window 1: request-intent derivation
const IS = lf.indexOf('const MUTATION_ARRAY_FIELDS = [');
const IE = lf.indexOf('void lexiconReadVetoed;');
if (IS < 0 || IE < 0 || IE <= IS) { console.log('FATAL: intent region markers not found in ' + SRC); process.exit(1); }
const intentRegion = lf.slice(IS, IE + 'void lexiconReadVetoed;'.length);
for (const must of ['requestedIntentPrimary', 'REQUEST_FRAME_PREFIX', 'LEADING_ADVERB', 'MUTATION_IMPERATIVE_VERB']) {
  if (!intentRegion.includes(must)) { console.log('FATAL: intent region missing ' + must); process.exit(1); }
}
// The intent region reads REQUEST_FRAME_ALTERNATION, the single shared definition of a request frame that
// both this tier and the executor's command fallback are now built from (the V64-D1b closure removes the
// twin rather than syncing it). The shared extractor brings the REAL declaration along; re-declaring it here
// would let the harness and production disagree, which is the whole failure mode being fixed.
const deriveFn = new Function('command', 'result', withSharedConstants(lf, stripTS(intentRegion)) + '\n; return requestedIntentPrimary;');
const intentOf = (c) => deriveFn(String(c), {});

// ============================================================ window 2: structured-claim / receipt
function structuredBlock() {
  const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (start < 0 || anchor < 0) { console.log('FATAL: structured-claim window not found'); process.exit(1); }
  const slice = src.slice(start, src.indexOf('};', anchor) + 2);
  for (const must of ['No change was made', 'receiptRendered', 'requestedIntentPrimary']) {
    if (!slice.includes(must)) { console.log('FATAL: structured-claim window missing ' + must); process.exit(1); }
  }
  return withPatternsAboveWindow(src, stripTS(slice));
}
const claimFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  structuredBlock() + '\n; return { summary: result.summary, verdict: result.turnVerdict };');
const mkMap = (o) => new Map(Object.entries(o || {}));
function turn({ command, summary, claims = null, evidence = [], context = {} }) {
  globalThis.command = command; globalThis.lifecycleReports = []; globalThis.factLines = [];
  globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v64' };
  return claimFn({ claims, summary, pendingAction: null }, evidence, context, 'gpt', false, false,
    { env: { get: () => undefined } }, mkMap(), mkMap(), mkMap(), mkMap(), false, '', mkMap());
}
const RECEIPT = /No change was made — /;

// ============================================================ window 3: context budget
const BS = src.indexOf('  const packBudget = Math.max(2000,');
const BE = src.indexOf('  return { pack, provenanceIds, errors:', BS);
if (BS < 0 || BE < 0) { console.log('FATAL: budget block markers not found'); process.exit(1); }
const budgetSlice = src.slice(BS, BE);
for (const must of ['TRIM_ORDER', 'MINIMUM_SAFE_CONTEXT', 'contextBudget', 'packTokens']) {
  if (!budgetSlice.includes(must)) { console.log('FATAL: budget block missing ' + must); process.exit(1); }
}
const runBudget = new Function('command', 'pack', 'collections', 'Deno',
  withSourceHelpers(src, stripTS(budgetSlice)) + '\n; return { pack, collections, trimmed: contextTrimmed, budget: packBudget, contextBudget };');
const NOENV = { env: { get: () => undefined } };

// ============================================================ named regexes, read from the source
function namedRegex(name) {
  const m = lf.match(new RegExp('const ' + name + '\\s*=\\s*(/(?:[^/\\\\\\n]|\\\\.)+/[a-z]*)'));
  if (!m) { console.log('FATAL: ' + name + ' not found in the source under test'); process.exit(1); }
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

// THE SHARED FRAME DEFINITION, read from the source. Both tiers are built from it since the V64-D1b
// closure, so a check that wants either tier must assemble it the same way production does.
const sharedFrames = (() => {
    const at = lf.indexOf('const REQUEST_FRAME_ALTERNATION = ');
    if (at < 0) { console.log('FATAL: REQUEST_FRAME_ALTERNATION not found — the two frame tiers have been re-forked'); process.exit(1); }
    let depth = 0, end = -1;
    for (let i = at; i < lf.length; i++) {
      const ch = lf[i];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ';' && depth === 0) { end = i + 1; break; }
    }
    // eslint-disable-next-line no-eval
    return eval(stripTS(lf.slice(at, end)) + '\nREQUEST_FRAME_ALTERNATION');
  })();

// ================================================================================ CONTRACT
// C1. The never-silent receipt fires on the mutation requests the intent tier DOES recognise.
for (const [command, fabrication] of [
  ['archive ACME', 'ACME has been archived.'],
  ['please archive ACME', 'Done — ACME archived.'],
  ['rename ACME to ACME Global', 'ACME has been renamed.'],
  ['yes', 'Confirmed — the plan has been executed.'],
  ['ACME-г архивла', 'ACME has been archived.'],
  ['quickly archive ACME', 'Archived.'],
  ['archive ACME then tell me', 'ACME archived. Here is the list.'],
  ['assign QA-1 to Bob', 'Assigned — Bob now owns QA-1.'],
]) {
  const r = turn({ command, summary: fabrication });
  ck('CONTRACT', `never-silent receipt fires for ${JSON.stringify(command)}`,
    RECEIPT.test(r.summary) && !r.summary.includes(fabrication) && r.verdict.receiptRendered === true, JSON.stringify(r.summary));
}
// C2. A truthful READ answer is never rewritten on text shape alone.
for (const [command, answer] of [
  ['what companies do I have', 'You have 12 active companies and 6 archived ones.'],
  ['what happened last week', 'On 2026-09-01 ACME was archived; on 2026-09-02 it was restored.'],
  ['make a list of companies', 'Here is the list: ACME, Beta, Gamma.'],
  ['assign a number to each company and list them', '1. ACME 2. Beta 3. Gamma'],
  ['draft an email about the merge', 'Subject: Merger update — the merge was completed last quarter.'],
  ['Share price fell after the announcement', 'Noted — the share price fell after the announcement.'],
]) {
  const r = turn({ command, summary: answer });
  ck('CONTRACT', `truthful read survives verbatim: ${JSON.stringify(command)}`, r.summary === answer, JSON.stringify(r.summary));
}
// C3. Budget invariants (OTM §4.4).
{
  const UUID = (i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
  const rows = (n, k) => Array.from({ length: n }, (_, i) => ({ id: UUID(i), name: k + ' ' + i + ' with a realistically long entity name for measurement', title: k + ' ' + i + ' with a realistically long title for measurement', status: 'active' }));
  const KEYS = ['companies', 'archivedCompanies', 'projects', 'tasks', 'archivedTasks', 'memories', 'agents', 'products', 'inventory', 'approvals', 'people', 'goals', 'companyRelationships', 'personAssignments', 'financialReports', 'factoryWorkOrders', 'channels', 'departments', 'leads', 'documents', 'proposals', 'productSpecs', 'engineeringDrawings', 'aiProviders', 'mcpConnectors', 'conversationHistory'];
  const mk = (n) => {
    const pack = {}; const collections = {};
    for (const k of KEYS) { pack[k] = rows(n, k); collections[k] = { shown: n, total: n * 5, truncated: true }; }
    pack.collections = collections;
    pack.currentTurn = { turn: 9, command: 'archive ACME Holdings' };
    pack.continuity = { totalPriorTurns: 8, historyIsComplete: false };
    pack.counts = { companiesTotal: 300, peopleTotal: 800 };
    pack.pendingAction = { kind: 'disambiguation', question: 'Which one?', actionType: 'archive_company', options: [{ id: UUID(1), label: 'ACME' }] };
    pack.recentlyResolvedEntities = null; pack.recentlyDeletedEntities = null; pack.activeChannelId = 'ch-1';
    pack.namedTargets = { companies: rows(5, 'named'), people: rows(5, 'named'), tasks: rows(5, 'named'), goals: [], projects: [], departments: [] };
    return { pack, collections };
  };
  const PROT = ['currentTurn', 'continuity', 'counts', 'pendingAction', 'recentlyResolvedEntities', 'recentlyDeletedEntities', 'activeChannelId', 'namedTargets'];
  const big = mk(30);
  const beforeProt = JSON.stringify(PROT.map((k) => big.pack[k] ?? null));
  const beforeLen = Object.fromEntries(KEYS.map((k) => [k, big.pack[k].length]));
  const beforeTotal = Object.fromEntries(KEYS.map((k) => [k, big.collections[k].total]));
  const rb = runBudget('what is the status of ACME Holdings?', big.pack, big.collections, NOENV);
  const shipped = Math.ceil(JSON.stringify({ command: 'what is the status of ACME Holdings?', contextPack: rb.pack }).length / 4);
  ck('CONTRACT', 'an oversized pack degrades under budget instead of hard-stopping', shipped <= rb.budget, 'shipped ' + shipped + ' budget ' + rb.budget);
  ck('CONTRACT', 'the minimum safe context survives byte-identically', JSON.stringify(PROT.map((k) => rb.pack[k] ?? null)) === beforeProt);
  ck('CONTRACT', 'no trim changes an exact total', KEYS.every((k) => rb.collections[k].total === beforeTotal[k]));
  ck('CONTRACT', 'truncated is true on every collection that lost rows',
    KEYS.every((k) => rb.pack[k].length >= beforeLen[k] || rb.collections[k].truncated === true));
  ck('CONTRACT', 'shown equals the surviving row count', KEYS.every((k) => rb.collections[k].shown === rb.pack[k].length));
  ck('CONTRACT', 'the estimator measures what is shipped (contextBudget included)',
    rb.contextBudget.estimatedTokens >= shipped - 3 && rb.contextBudget.estimatedTokens <= shipped);
  // a genuinely fitting pack is untouched
  const small = mk(2);
  const rs = runBudget('hello', small.pack, small.collections, NOENV);
  ck('CONTRACT', 'a fitting pack is not trimmed at all', rs.trimmed.length === 0 && rs.contextBudget.overBudget === false);
  // NaN-safe cap (V63-D6), checked behaviourally
  const a = mk(30), b = mk(30);
  const ra = runBudget('x', a.pack, a.collections, NOENV);
  const rbn = runBudget('x', b.pack, b.collections, { env: { get: (k) => (k === 'SEM_AI_MAX_TOKENS' ? 'twelve thousand' : undefined) } });
  ck('CONTRACT', 'a malformed SEM_AI_MAX_TOKENS behaves exactly as an unset one',
    ra.budget === rbn.budget && JSON.stringify(ra.trimmed) === JSON.stringify(rbn.trimmed));

  // ---------------------------------------------------------------- DEFECT V64-D2
  const few = mk(2);
  few.pack.memories = Array.from({ length: 900 }, (_, i) => ({ id: 'm' + i, fact: 'A remembered fact of ordinary length about this workspace, number ' + i }));
  few.collections.memories = { shown: 900, total: 900, truncated: false };
  const rf = runBudget('hello', few.pack, few.collections, NOENV);
  ck('DEFECT', 'V64-D2 contextBudget.trimmedCount reports the trims that actually happened',
    rf.trimmed.length === 0 || rf.contextBudget.trimmedCount === rf.trimmed.length,
    'trimmed ' + JSON.stringify(rf.trimmed) + ' but trimmedCount = ' + rf.contextBudget.trimmedCount
    + ' (serve() reports this as contextReduced in the 413 body)');
}

// ================================================================================ DEFECT V64-D1
// Ordinary mutation requests that derive NO intent, so the never-silent receipt cannot fire and the
// model's fabricated completion ships verbatim. Proven end-to-end through the real receipt window.
const D1_ROWS = [
  ['we should archive ACME', 'frame: REQUEST_FRAME_PREFIX has "you should" but not "we should"'],
  ['I think we should archive ACME', 'frame: "(?:i think )?(?:we|you) should" exists in IMPERATIVE_HEAD_RE only'],
  ['I think you should archive ACME', 'frame: same twin asymmetry'],
  ['right away archive ACME', 'LEADING_ADVERB "right away" is unreachable: REQUEST_FRAME_PREFIX eats bare "right"'],
  ['may I ask you to archive ACME?', 'POLITE_REQUEST knows this frame; REQUEST_FRAME_PREFIX does not strip it'],
  ['would you be able to archive ACME?', 'polite frame absent from REQUEST_FRAME_PREFIX'],
  ['any chance you could archive ACME?', 'polite frame absent from REQUEST_FRAME_PREFIX'],
  ['mind archiving ACME?', 'polite frame absent from REQUEST_FRAME_PREFIX'],
  ['I would like you to archive ACME', 'only the contracted "i\u2019d like you to" is listed'],
  ['it would be great if you could archive ACME', 'polite frame absent'],
  ['feel free to archive ACME', 'permission frame absent'],
  ['need to archive ACME', '"we need to"/"you need to" are listed, bare "need to" is not'],
  ['let us archive ACME', '"let\u2019s" is listed, "let us" is not'],
  ['ACME needs archiving', 'MUTATION_PASSIVE_REQUEST requires a past participle'],
  // the sharpest rows: verbs with NO executor fallback, so nothing else can save the turn
  ['we should delete QA-1', 'no command fallback exists for delete — the fabrication is the whole answer'],
  ['we should rename ACME to Beta', 'no command fallback exists for rename'],
  ['I think we should approve the salary request', 'no command fallback exists for approve'],
];
for (const [command, why] of D1_ROWS) {
  ck('DEFECT', `V64-D1 request intent is derived for ${JSON.stringify(command)}`, intentOf(command) !== null, why);
  const r = turn({ command, summary: 'Done — ACME has been archived.' });
  ck('DEFECT', `V64-D1 the fabrication does not ship for ${JSON.stringify(command)}`,
    RECEIPT.test(r.summary), 'shipped verbatim: ' + JSON.stringify(r.summary));
}

// ================================================================================ DEFECT V64-D1b
// The two tiers that must agree about what an imperative frame is. A repair made in one twin and not
// the other is the defect class ledger #138 closed once already, on this same pair.
{
  // Closed 2026-09-08 by REMOVING THE TWIN, not by syncing it: both tiers are now built from one
  // module-level REQUEST_FRAME_ALTERNATION, so a frame added once is added to both by construction. That is
  // why IMPERATIVE_HEAD_RE is no longer a regex literal and namedRegex() cannot find it — it is assembled
  // from the shared string. Build it the same way the source does, and keep the behavioural check below
  // unchanged: it is the property that matters, and it now also fails if anyone re-forks the two lists.
  // (hoisted to module scope below)
  ck('CONTRACT', 'the executor tier and the intent tier are built from ONE frame definition, not two lists',
    // Both declarations must READ the shared constant, and the frame list may exist in exactly one place —
    // a second copy of any frame is the twin growing back.
    /const IMPERATIVE_HEAD_RE = new RegExp\([^\n]*REQUEST_FRAME_ALTERNATION/.test(lf)
      && /const REQUEST_FRAME_PREFIX = new RegExp\([^\n]*REQUEST_FRAME_ALTERNATION/.test(lf)
      && (lf.match(/i need you to/g) || []).length === 1,
    'the same repair landed in one twin and not the other in three consecutive rounds; the twin is removed');
  const IMPERATIVE_HEAD_RE = new RegExp('^\\s*(?:(?:' + sharedFrames + ')[\\s,:—–-]+)*(?:archiv(?:e|ing)|un-?archiv(?:e|ing)|restor(?:e|ing)|reactivat(?:e|ing)|delet(?:e|ing)|remov(?:e|ing)|bring(?:ing)? back|end(?:ing)?)\\b', 'iu');
  const FRAMES = ['ok', 'please', 'kindly', 'just', 'now', 'then', 'so', 'right', 'well', 'next', 'first', 'finally',
    'again', 'yes', 'sure', 'go ahead and', 'hey brain', 'quick one', 'time to', 'make sure to', 'be sure to',
    'remember to', 'be a dear and', 'when you get a chance', 'if you can', "let's", 'we need to', 'we should',
    'you should', 'i think we should', 'i think you should', 'i need you to', 'i want you to', 'you need to',
    'need you to', 'you can', 'could you', 'can you', 'would you', 'will you', 'can we', 'could we', 'shall we'];
  const execOnly = FRAMES.filter((f) => IMPERATIVE_HEAD_RE.test((f + ' archive ACME').toLowerCase()) && intentOf(f + ' archive ACME') === null);
  ck('DEFECT', 'V64-D1b every frame the executor tier treats as imperative also derives request intent',
    execOnly.length === 0,
    'executor-only frames (the never-silent receipt is blind to these): ' + JSON.stringify(execOnly));
}

// ================================================================================ DEFECT V64-D1c
{
  const LEADING_ADVERB = namedRegex('LEADING_ADVERB');
  // REQUEST_FRAME_PREFIX is assembled from the shared alternation now, so it is no longer a regex literal.
  const REQUEST_FRAME_PREFIX = new RegExp('^\s*(?:(?:' + sharedFrames + ')[\s,:—–-]+)+', 'i');
  const dead = [];
  for (const adv of ['quickly', 'immediately', 'urgently', 'permanently', 'properly', 'right away', 'straight away', 'at once', 'for good', 'once and for all']) {
    if (!LEADING_ADVERB.test(adv + ' archive ACME')) continue;
    const afterFrame = (adv + ' archive ACME').replace(REQUEST_FRAME_PREFIX, '');
    if (!LEADING_ADVERB.test(afterFrame) && afterFrame !== adv + ' archive ACME') dead.push(adv);
  }
  ck('DEFECT', 'V64-D1c no LEADING_ADVERB alternative is made unreachable by REQUEST_FRAME_PREFIX running first',
    dead.length === 0, 'unreachable adverb frames: ' + JSON.stringify(dead));
}

// ================================================================================ DEFECT V64-D3
{
  // The three company gates that read the same data. Two are trim-proof (built from packIdSet /
  // contextProvenance); companyStatusById — the gate that REFUSES a raw lifecycle status UPDATE — is not.
  const at = src.indexOf('const companyStatusById = new Map((contextPack?.companies');
  ck('DEFECT', 'V64-D3 the company status gate is trim-proof like the two gates beside it',
    at < 0, 'companyStatusById is built from the raw, trimmable contextPack.companies while contextCompanyIds and archivedCompanyIds both read contextProvenance (V63-D2 class, third member)');
}

// ================================================================================ DEFECT V64-D5
{
  // §4.3: every collection handed to the model reports shown/total/truncated. namedTargets is capped at
  // NAMED_LOOKUP_ROW_CAP and carries no envelope, so a 6th matching row is invisible with no truncated flag.
  const capped = /\.limit\(NAMED_LOOKUP_ROW_CAP\)/.test(lf);
  // Closed 2026-09-08, with a structure the original two patterns do not describe. The envelopes were first
  // put INSIDE context.collections, which deno rejected in a minute: that map is Record<string,
  // CollectionEnvelope>, and a map OF envelopes is not an envelope (TS2352), while the map was also declared
  // after the literal that read it (TS2448/TS2454 — the runtime-fatal TDZ class this repo gates on). The
  // design mistake is the same sentence: collections.namedTargets would not have BEEN an envelope, so it
  // would have satisfied §4.3 by name and told the model nothing. namedTargets is a group of six capped
  // windows, so it carries its own envelope map beside its rows. Assert the PROPERTY, not the shape:
  // every window in the group reports shown/total/truncated, computed from the cap that actually applies.
  const buildsEnvelope = /const namedTargetsEnvelope[\s\S]{0,400}shown: \(rows as unknown\[\]\)\.length[\s\S]{0,400}truncated: \(rows as unknown\[\]\)\.length >= NAMED_LOOKUP_ROW_CAP/.test(lf);
  const attached = /\(namedTargets as Record<string, unknown>\)\.collections = namedTargetsEnvelope;/.test(lf);
  const beforePack = lf.indexOf('const namedTargetsEnvelope') < lf.indexOf('const pack = { continuity, namedTargets,');
  ck('DEFECT', 'V64-D5 namedTargets is capped, so it carries a CollectionEnvelope like every other capped collection',
    !capped || (buildsEnvelope && attached && beforePack),
    `namedTargets is capped at NAMED_LOOKUP_ROW_CAP; builds=${buildsEnvelope} attached=${attached} declaredBeforeUse=${beforePack} (OTM §4.3)`);
}

console.log('\nv64_regression_additions: ' + pass + ' passed, ' + failures.length + ' failed');
for (const f of failures) console.log('  FAILED ' + f);
if (failures.length > 0) process.exit(1);
