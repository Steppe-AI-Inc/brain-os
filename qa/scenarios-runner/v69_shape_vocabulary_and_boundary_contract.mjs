#!/usr/bin/env node
// VERIFIER #69 / campaign #129 — REGRESSION ADDITIONS.
//
// Every row is tagged CONTRACT (a property that holds on candidate 0ca756ee and must never regress) or
// DEFECT (a property that DOES NOT hold on 0ca756ee — V69-D1..D6 — and must hold after the fix).
// ANY failure exits non-zero. The source under test is SEM_INDEX_SRC, else the repo copy resolved from
// this file's own location, so the suite is correct from any cwd.
//
// The windows are SLICED FROM THE REAL index.ts and executed. Nothing here re-implements product logic:
// a re-implementation can agree with a harness while disagreeing with production, which is the failure
// this campaign exists to prevent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// PROMOTION ADJUSTMENT (2026-09-09). The verifier wrote this file in qa/verification/proposed/, so both of
// its paths counted three levels up. Promoted into qa/scenarios-runner/ that is one level too many, and the
// failure was an ERR_MODULE_NOT_FOUND naming a directory that has never existed. Walking up to the repo root
// by looking for a file that is actually there makes the suite correct from ANY location — which is what its
// own header already promised — instead of correct at exactly one depth.
function repoRoot() {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v69: repo root not found from ' + HERE);
}
const ROOT = repoRoot();
const { stripTS, withPatternsAboveWindow } = await import('file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));
const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const raw = readFileSync(SRC, 'utf8');
const src = raw.replace(/\r\n?/g, '\n');

let pass = 0; const failures = [];
const check = (kind, name, cond, detail) => {
  if (cond) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else { failures.push('[' + kind + '] ' + name + (detail ? '\n       ' + detail : '')); console.log('FAIL [' + kind + '] ' + name); }
};

// ---------------------------------------------------------------- the real final-claim pipeline
function structuredBlock() {
  const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found — update this suite, do not skip it');
  const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found — update this suite');
  const slice = withPatternsAboveWindow(src, stripTS(src.slice(start, src.indexOf('};', anchor) + 2)));
  for (const must of ['requestedIntent', 'IMPERATIVE_OBJECT', 'claimsPastCompletionWithNoGrounding', 'turnVerdict'])
    if (!slice.includes(must)) throw new Error('pipeline window missing ' + must + ' — it would measure a fragment');
  return slice;
}
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  structuredBlock() + '\n; return { summary: result.summary, verdict: result.turnVerdict, requestedIntent };');
const DENO = { env: { get: () => undefined } };
const mk = () => new Map();
const turnClaim = (command, summary, evidence = []) => {
  // The request-side values production reads from the enclosing handler scope. The COMMAND is the input
  // under test; the rest are the honest empty defaults for a turn in which no executor ran.
  globalThis.command = command;
  globalThis.factLines = [];
  globalThis.lifecycleReports = [];
  globalThis.organizationGraphCheck = null;
  globalThis.workOrder = { id: 'wo-v69' };
  return fn({ claims: null, summary, pendingAction: null, questions: undefined },
    evidence, {}, 'gpt', false, false, DENO, mk(), mk(), mk(), mk(), false, '', mk());
};
// EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE: a self-test before any measurement, so a window that stopped
// deriving intent cannot make every DEFECT row "pass" by making every command invisible.
{
  const control = turnClaim('archive work order WO-1', 'Done — archived.');
  if (control.summary === 'Done — archived.') { console.error('SELFTEST FAIL: the pipeline window no longer corrects a known fabrication'); process.exit(2); }
  const read = turnClaim('what companies are archived?', 'ACME was archived in June.');
  if (read.summary !== 'ACME was archived in June.') { console.error('SELFTEST FAIL: the pipeline window rewrites a plain read'); process.exit(2); }
}
const FAB = 'Done — archived.';
const shipsFabrication = (cmd) => turnClaim(cmd, FAB).summary === FAB;

// ---------------------------------------------------------------- V69-D1  the receipt must see the request
// Every one of these is an ordinary imperative mutation request. A request the receipt tier cannot see is a
// request whose whole answer is the model's own prose (verifier #65/#67/#68, same class, new shapes).
const D1 = {
  'two modifiers, no determiner': ['archive old duplicate work order WO-1', 'delete stale draft purchase approval A-1',
    'archive old stale task QA-1', 'restore last quarter business unit Beta', 'archive dead legacy project Alpha'],
  // STATEMENT_FINITE_VERB lists past participles that are also ordinary ADJECTIVES ("expired"), so an
  // object modified by one is read as a statement about the world and refuses to refer.
  'an adjectival participle as a modifier': ['archive expired work order WO-1', 'archive the old expired work order WO-1'],
  'punctuation directly after the verb': ['Archive: the work order WO-1', 'archive - the work order WO-1',
    'archive; the task QA-1', 'Archive — the purchase approval A-1'],
  'negation in non-leading position': ['make sure you do not archive ACME', 'I said do not promote Bob',
    'never, ever archive ACME', 'ACME: do not restore'],
};
for (const [label, cmds] of Object.entries(D1)) {
  const shipped = cmds.filter(shipsFabrication);
  check('DEFECT', 'V69-D1 ' + label + ': a fabricated completion never reaches the founder',
    shipped.length === 0, shipped.length + ' of ' + cmds.length + ' shipped verbatim: ' + JSON.stringify(shipped));
}
check('CONTRACT', 'V69-D1 control: the one-modifier shapes #67/#68 closed stay closed',
  ['archive work order WO-1', 'archive the old work order WO-1', 'archive engineering task QA-1',
    'delete purchase approval A-1', 'restore business unit Beta'].every((c) => !shipsFabrication(c)),
  'a shape that was closed has re-opened');

// ---------------------------------------------------------------- V69-D2  a truthful READ survives verbatim
// A noun-phrase headline whose head word is spelled like a lexicon verb is not a request. The receipt must
// not delete a truthful answer to it (verifier #68 measured this for zero modifiers; one modifier was not).
const D2_READS = ['Fire drill report for the department', 'Post mortem report for the project',
  'Order status report for the board', 'Issue log report for the team', 'Merge conflict report for the project'];
const D2_ANSWERS = ['Here is what I have: the drill was completed on 3 March and the report was filed the same day.',
  'The department has three open items. Two were closed last week; nothing was changed today.',
  'Nothing has been archived in that area this quarter.'];
{
  const destroyed = [];
  for (const c of D2_READS) for (const a of D2_ANSWERS) if (turnClaim(c, a).summary !== a) destroyed.push(c);
  check('DEFECT', 'V69-D2 a truthful read answer survives a one-modifier noun-phrase headline',
    destroyed.length === 0, destroyed.length + ' of ' + (D2_READS.length * D2_ANSWERS.length) + ' truthful answers replaced by the receipt');
}
check('CONTRACT', 'V69-D2 control: the v68 zero-modifier pins still survive',
  ['Transfer pricing for the business unit', 'Close call on the Beta deal today', 'Share price fell after the announcement',
    'Archive policy needs a review'].every((c) => turnClaim(c, D2_ANSWERS[0]).summary === D2_ANSWERS[0]),
  'a truthful read #68 pinned has started being rewritten');

// ---------------------------------------------------------------- V69-D3 / V69-D4 / V69-D6  one vocabulary
// ONE BUSINESS/GRAMMAR CONCEPT -> ONE CANONICAL DEFINITION -> MULTIPLE CONSUMERS.
// A consumer that answers "is this word a mutation verb?" from its own hand-written list is a re-spelling,
// and the dangerous shape is a PROPER SUBSET: containment 1.0, Jaccard low enough that a symmetric
// similarity ratchet never sees it.
const CANON = new Set(src.match(/const MUTATION_VERB_ALTERNATION = "([^"]+)"/)[1].split('|'));
const memberSets = [];
{
  // named alternations AND inline regex literals — the ratchet in qa/scenarios-runner sees only the first.
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\(\?:([a-z|?:\-\\]{40,})\)|\(([a-z|]{40,})\)/g)) {
      const body = (m[1] || m[2]);
      const members = body.split('|').map((t) => t.replace(/[\\?:()]/g, '').trim()).filter((t) => /^[a-z][a-z-]{2,}$/.test(t));
      if (members.length >= 8) memberSets.push({ line: i + 1, members: new Set(members), text: lines[i].trim().slice(0, 90) });
    }
  }
}
// A copy may be spelled as STEMS ("archiv|restor|delet") rather than whole words. Exact membership misses
// that shape entirely — which is how the multi-clause read tier (V69-D4) kept its own 30-verb list while
// every named-alternation scan reported green. A member counts as canonical if it IS a canonical verb or
// is a prefix of one.
const CANON_ARR = [...CANON];
const isCanonical = (t) => CANON.has(t) || (t.length >= 4 && CANON_ARR.some((v) => v.startsWith(t)));
const containment = (s) => { let n = 0; for (const t of s) if (isCanonical(t)) n++; return n / s.size; };
const copies = memberSets.filter((s) => s.members.size < CANON.size && containment(s.members) >= 0.8);
check('DEFECT', 'V69-D3/D4/D6 no truncated copy of MUTATION_VERB_ALTERNATION survives anywhere in the file',
  copies.length === 0,
  copies.map((c) => 'line ' + c.line + ' — ' + c.members.size + ' of ' + CANON.size + ' verbs, containment '
    + containment(c.members).toFixed(2) + ': ' + c.text).join('\n       '));

// ---------------------------------------------------------------- V69-D5  the receipt reads as English
// Measured through the REAL receipt reason block, because the founder reads the SENTENCE, not the helper:
// the entity is singularised by stripping a trailing "s", so "status" becomes "statu" and "addresses"
// becomes "addresse" in a sentence the founder is shown.
{
  const between = (a, b) => { const s = src.indexOf(a); const e = src.indexOf(b, s); if (s < 0 || e < 0) throw new Error('receipt window missing: ' + a); return src.slice(s, e); };
  const win = between('const verb = /^архивл/i.test', 'const receiptPrefix = ');
  for (const must of ['commandEntityNoun', 'commandEntity', 'pluraliseEntity', 'const reason'])
    if (!win.includes(must)) throw new Error('receipt window missing ' + must);
  const receiptFn = new Function('commandText', 'requestedIntent', 'modelIntent', 'pendingQuestion', 'claimExecutionEvidence',
    'const failed = null; const attempted = false;\n' + stripTS(win) + '\n; return reason;');
  const NOUN_SRC = src.slice(src.indexOf('const ENTITY_NOUN_ALTERNATION = '), src.indexOf(';', src.indexOf('const ENTITY_NOUN_ALTERNATION = ')));
  const nouns = (NOUN_SRC.match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1)).join('').split('|')
    .filter((n) => /^[a-z][a-z ]*$/.test(n));
  if (nouns.length < 20) throw new Error('entity-noun extraction found ' + nouns.length + ' nouns — fix this suite');
  const NON_WORD = /\b(statu|addresse|acces|proces|busines|serie|specie|analysi)\b/;
  const bad = nouns.filter((n) => NON_WORD.test(receiptFn('restore ' + n + ' X-1', { verb: 'restore', field: null }, null, '', [])));
  check('DEFECT', 'V69-D5 the receipt sentence never contains a non-word (status -> "statu", addresses -> "addresse")',
    bad.length === 0, 'machine text for: ' + JSON.stringify(bad.map((n) => receiptFn('restore ' + n + ' X-1', { verb: 'restore', field: null }, null, '', []))));
}

// ---------------------------------------------------------------- CONTRACT rows that hold today
check('CONTRACT', 'the deploy surface is exactly index.ts (no _shared import)',
  !/^import[^\n]*_shared/m.test(src), 'index.ts imports a _shared module — the deploy surface is no longer one file');
check('CONTRACT', 'index.ts is CRLF-pure', (raw.match(/\r\n/g) || []).length > 1000 && !/(?<!\r)\n/.test(raw),
  'bare LF found in a CRLF file');
// V69-D7: the shipped envelope contract checks "total never comes from array length" by inspecting the
// envelope() HELPER only. Five envelopes in context.collections are hand-written objects, and a mutation
// making memories.total or conversationHistory.total equal the WINDOW length survives all 75 suites.
// OPERATING_TRUTH_MODEL §4.3 — "the model never derives a total by counting a window" — is a property of
// EVERY envelope, so it is asserted over every envelope here.
// Tagged CONTRACT because the SOURCE is correct on 0ca756ee; the defect is the shipped contract's blindness.
// Mutation proof: this row kills mutants A9 (memories.total = window) and A4 (conversationHistory.total =
// window), each of which survives ALL 75 shipped suites.
check('CONTRACT', 'V69-D7 no envelope in context.collections takes its total from the shown window', (() => {
  const ci = src.indexOf('const collections = {');
  let depth = 0, end = ci;
  for (let i = src.indexOf('{', ci); i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } } }
  const seg = src.slice(ci, end + 1);
  const handwritten = [...seg.matchAll(/([a-zA-Z]+):\s*\{\s*shown:\s*([^,]+),\s*total:\s*([^,]+),/g)];
  if (handwritten.length < 3) throw new Error('hand-written envelope scan found ' + handwritten.length + ' — fix this suite, do not let it pass on nothing');
  const norm = (s) => s.replace(/\s|\(|\)|\|\|\s*\[\]/g, '');
  const bad = handwritten.filter((m) => norm(m[3]).startsWith(norm(m[2])) || /\.length\s*$/.test(m[3].trim()));
  globalThis.__v69_env_bad = bad.map((m) => m[1] + ': total = ' + m[3].trim());
  return bad.length === 0;
})(), 'total derived from the window: ' + JSON.stringify(globalThis.__v69_env_bad || []));

check('CONTRACT', 'every TRIM_ORDER key carries a collection envelope (a trim can never be silent)', (() => {
  const t = src.indexOf('const TRIM_ORDER');
  const keys = [...src.slice(t, src.indexOf('];', t)).matchAll(/\['([a-zA-Z]+)',/g)].map((m) => m[1]);
  const ci = src.indexOf('const collections = {');
  let depth = 0, end = ci;
  for (let i = src.indexOf('{', ci); i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } } }
  const seg = src.slice(ci, end + 1);
  const env = new Set([...seg.matchAll(/(?:^|[,{\s])([a-zA-Z]+)\s*:/gm)].map((m) => m[1]));
  return keys.length >= 20 && keys.every((k) => env.has(k));
})(), 'a trimmable collection has no envelope, so a trim would drop rows with no truncated flag');

console.log('\nv69_regression_additions: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('\nFAILURES\n  ' + failures.join('\n  ')); process.exit(1); }
