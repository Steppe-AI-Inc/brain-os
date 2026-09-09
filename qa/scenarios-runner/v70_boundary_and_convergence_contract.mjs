#!/usr/bin/env node
// VERIFIER #70 / campaign #130 — REGRESSION ADDITIONS for candidate 31979e8be62ed3d7c2bae2f5fa1bc8edea9cdf7b.
//
// Every row is tagged CONTRACT (a property that HOLDS on 31979e8 and must never regress) or
// DEFECT (a property that DOES NOT hold on 31979e8 — V70-D1..D6 — and must hold after the fix).
// ANY failure exits non-zero. The source under test is SEM_INDEX_SRC, else the repo copy resolved by
// walking up from this file, so the suite is correct from ANY cwd and from ANY directory it is promoted to.
//
// The windows are SLICED FROM THE REAL index.ts and EXECUTED. Nothing here re-implements product logic:
// a re-implementation can agree with a harness while disagreeing with production, which is the failure
// class this campaign exists to prevent (ledger #61/D2, #63/D10, #63/D12, #64/D19).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
function repoRoot() {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v70: repo root not found from ' + HERE);
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

// ══════════════════════════════════════════════════════════════════════════════════════════
// THE FINAL-CLAIM PIPELINE (the real window)
// ══════════════════════════════════════════════════════════════════════════════════════════
function structuredBlock() {
  const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found — update this suite, do not skip it');
  const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found — update this suite');
  const slice = withPatternsAboveWindow(src, stripTS(src.slice(start, src.indexOf('};', anchor) + 2)));
  for (const must of ['requestedIntent', 'IMPERATIVE_OBJECT', 'isHeadlineObject', 'turnVerdict'])
    if (!slice.includes(must)) throw new Error('pipeline window missing ' + must + ' — it would measure a fragment');
  return slice;
}
const pipe = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  structuredBlock() + '\n; return { summary: result.summary, verdict: result.turnVerdict, requestedIntent };');
const DENO = { env: { get: () => undefined } };
const mk = () => new Map();
function turn(command, summary, opts = {}) {
  globalThis.command = command;
  globalThis.factLines = opts.factLines || [];
  globalThis.lifecycleReports = opts.lifecycleReports || [];
  globalThis.organizationGraphCheck = null;
  globalThis.workOrder = { id: 'wo-v70' };
  globalThis.knownEntityNames = opts.knownEntityNames || new Set();
  return pipe({ claims: opts.claims === undefined ? null : opts.claims, summary,
                pendingAction: opts.pendingAction || null, questions: opts.questions },
              opts.evidence || [], {}, 'gpt', !!opts.grounded, false, DENO,
              mk(), mk(), mk(), mk(), false, '', mk());
}
const RECEIPT = /No change was made —/;
// EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE — a window that stopped deriving intent would make every
// DEFECT row "pass" by making every command invisible. Assert both directions before measuring anything.
{
  if (turn('archive work order WO-1', 'Done — archived.').summary === 'Done — archived.') {
    console.error('SELFTEST FAIL: the pipeline window no longer corrects a known fabrication'); process.exit(2);
  }
  if (turn('what companies are archived?', 'ACME was archived in June.').summary !== 'ACME was archived in June.') {
    console.error('SELFTEST FAIL: the pipeline window rewrites a plain read'); process.exit(2);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// V70-D1 — THE NEGATION GATE (Codex finding A) MUST NOT OVER-FIRE
// A negation applies to the CLAUSE it governs. index.ts:3474-3477 states exactly this contract in the
// candidate's own words; the clause splitter at index.ts:3484 does not split on a SENTENCE BOUNDARY or on
// a contrastive conjunction, so a mixed turn is swallowed whole and the founder's archive never runs.
// ══════════════════════════════════════════════════════════════════════════════════════════
function negationGate() {
  const start = src.indexOf('const requestIsNegated = (() => {');
  const ifIdx = src.indexOf('if (requestIsNegated && result', start);
  if (start < 0 || ifIdx < 0) throw new Error('negation gate not found — update this suite');
  let depth = 0, end = -1;
  for (let k = src.indexOf('{', ifIdx); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  const slice = stripTS(src.slice(start, end)).replace(/await /g, '');
  return new Function('command', 'result', `
    const supabase = { from: () => ({ insert: () => ({ catch: () => {} }) }) };
    const profile = { id: 'p', role: 'founder' }; const workOrderId = 'wo';
    ${slice}
    return { negated: requestIsNegated, stripped: negatedRequestStrippedFields };`);
}
const negGate = negationGate();
const negatedOf = (cmd, fields) => negGate(cmd, JSON.parse(JSON.stringify(fields)));

// PREDICATE (CONTRACT — these hold today and must keep holding)
for (const [cmd, fields] of [
  ['do not archive ACME', { archiveCompanyNames: ['ACME'] }],
  ["don't archive ACME", { archiveCompanyNames: ['ACME'] }],
  ['dont archive ACME', { archiveCompanyNames: ['ACME'] }],
  ['never delete the Sales department', { archiveCompanyIds: ['x'] }],
  ['no need to restore Beta', { restoreCompanyNames: ['Beta'] }],
  ['please do not assign task QA-1 to Bob', { tasks: [{ t: 1 }] }],
  ['do not delete the channel', { deleteChannelIds: ['c'] }],
  ['do not approve that request', { deleteApprovalIds: ['a'] }],
  ['do not activate the openai provider', { activateAiProviderId: 'ai-1' }],
  ['we should not archive ACME yet', { archiveCompanyNames: ['ACME'] }],
  ['I do not want you to archive ACME', { archiveCompanyNames: ['ACME'] }],
]) {
  const r = negatedOf(cmd, fields);
  check('CONTRACT', `A/predicate: a negated request is refused and its fields stripped — "${cmd}"`,
    r.negated === true && r.stripped.length > 0, JSON.stringify(r));
}
// APPLIED (CONTRACT): the guard is the predicate, not a constant, and the strip really empties the field.
{
  const r = negatedOf('do not archive ACME', { archiveCompanyNames: ['ACME'], deleteTaskIds: ['t1'], activateAiProviderId: 'p1' });
  check('CONTRACT', 'A/applied: EVERY mutating field is stripped, arrays, ids and the scalar alike',
    r.stripped.includes('archiveCompanyNames') && r.stripped.includes('deleteTaskIds') && r.stripped.includes('activateAiProviderId'),
    JSON.stringify(r.stripped));
}
// OVER-FIRE (DEFECT V70-D1): a mixed turn must still execute its un-negated imperative clause.
for (const [cmd, why] of [
  ['archive ACME but do not delete it', 'contrastive "but" with no comma'],
  ['Archive ACME. Do not delete it.', 'two SENTENCES — the splitter never splits on a full stop'],
  ['archive ACME rather than delete Beta', '"rather than" is a contrast, not a refusal of the archive'],
  ['create a report without the update', '"without the update" is a modifier, not a refusal'],
]) {
  const r = negatedOf(cmd, { archiveCompanyNames: ['ACME'], createDocuments: [{ d: 1 }] });
  check('DEFECT', `V70-D1 the negation gate must NOT swallow a mixed turn — ${why}: "${cmd}"`,
    r.negated === false, `requestIsNegated=${r.negated}, stripped=${JSON.stringify(r.stripped)} — the founder's own imperative was refused`);
}
// The mixed-turn shapes that DO work today must not regress while D1 is fixed.
for (const cmd of ['archive ACME, but do not delete it', 'archive ACME and do not delete it',
  'archive ACME; do not delete it', 'archive ACME - do not delete it', 'archive ACME']) {
  check('CONTRACT', `A/no-over-fire (already correct): "${cmd}"`, negatedOf(cmd, { archiveCompanyNames: ['ACME'] }).negated === false);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// V70-D2 — THE HEADLINE VETO MUST NOT DEPEND ON A PREPOSITIONAL PHRASE
// index.ts:6252-6260 defines a headline as "a phrase that opens with NO determiner, carries a
// prepositional phrase, and NAMES NOTHING". The SAME headline with the prepositional phrase removed is
// still a headline — but isHeadlineObject (6287) requires the PP, so the shorter form is read as an
// imperative with a referring object and its TRUTHFUL answer is deleted by the receipt.
// ══════════════════════════════════════════════════════════════════════════════════════════
const HEADLINES = [
  ['Post mortem report', 'The post mortem report was created after the outage.'],
  ['Order status report', 'The order status report was created last week.'],
  ['Transfer pricing report', 'The transfer pricing report was completed in June.'],
  ['Transfer pricing note', 'The transfer pricing note was created in June.'],
  ['Order status record', 'The order status record was created in May.'],
];
for (const [cmd, ans] of HEADLINES) {
  check('DEFECT', `V70-D2 a PP-less headline keeps its truthful answer — "${cmd}"`,
    String(turn(cmd, ans).summary) === ans,
    `rewritten to: ${String(turn(cmd, ans).summary).slice(0, 100)}`);
  // the SAME phrase WITH a prepositional phrase already survives; that asymmetry is the proof
  check('CONTRACT', `V70-D2 control: the same headline WITH a prepositional phrase survives — "${cmd} for the board"`,
    String(turn(cmd + ' for the board', ans).summary) === ans);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// V70-D3 — THE OBJECT BOUNDARY HOLE
// NAMED_TARGET_AFTER_ENTITY_SRC (6174) requires [A-Z0-9] AFTER the entity noun, and the count-based
// head-region alternative (6201) allows at most ONE modifier. Their intersection — two or more modifiers,
// no determiner, a LOWERCASE target — derives NOTHING, and the fabrication ships. Separately,
// ENTITY_NOUN_ALTERNATION carries only the space-separated spelling of each compound noun.
// ══════════════════════════════════════════════════════════════════════════════════════════
for (const cmd of [
  'archive old duplicate work order wo-1',
  'archive old stale duplicate work order wo-1',
  'archive old duplicate business unit beta',
  'archive old stale duplicate business unit beta',
  'archive work-order WO-1',
  'archive workorder WO-1',
]) {
  check('DEFECT', `V70-D3 a fabrication on this mutation request must not ship — "${cmd}"`,
    RECEIPT.test(String(turn(cmd, 'Done — archived.').summary)),
    `shipped: ${String(turn(cmd, 'Done — archived.').summary)}`);
}
// The shapes the #67/#68/#69 closures DID fix must not regress.
for (const cmd of ['archive work order WO-1', 'archive the old work order WO-1',
  'archive old duplicate work order WO-1', 'archive business unit Beta', 'archive company ACME']) {
  check('CONTRACT', `V70-D3 control: this shape already refers and must keep referring — "${cmd}"`,
    RECEIPT.test(String(turn(cmd, 'Done — archived.').summary)));
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// V70-D4 — ESCAPE DEPTH IN A CONSTRUCTED REGEX (the SIXTH silent-corruption instance)
// A regex built from a STRING must double-escape every class. index.ts:7307 writes (?:\w+\s+){0,3}
// single-escaped inside a single-quoted string, so at runtime it is (?:w+s+){0,3} — a pattern that can
// only ever match ZERO repetitions. The "up to three intervening words" clause is dead.
// This row is a WHOLE-FILE SCAN, so it catches the seventh instance too, wherever it lands.
// ══════════════════════════════════════════════════════════════════════════════════════════
{
  const SILENT = new Set('wWsSdDbBpPAZkceghijlmoqyz'.split(''));
  const findings = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '`') { let j = i + 1; while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '`') { j++; break; } j++; } i = j; continue; }
    // REGEX LITERALS are skipped verbatim: a quote inside a character class (/['’]/ is everywhere here)
    // read as a string opening produced 18 false suspects on this instrument's first run.
    if (c === '/') {
      let p = i - 1; while (p >= 0 && (src[p] === ' ' || src[p] === '\t')) p--;
      const prev = p >= 0 ? src[p] : ''; const pw = src.slice(Math.max(0, p - 7), p + 1);
      if (prev === '' || '=(,[!&|?:;{}\n+'.includes(prev) || /\b(return|typeof|case|of|do|test|exec)$/.test(pw)) {
        let j = i + 1, cls = false, ok = false;
        while (j < src.length) { const ch = src[j];
          if (ch === '\\') { j += 2; continue; } if (ch === '[') { cls = true; j++; continue; }
          if (ch === ']') { cls = false; j++; continue; } if (ch === '/' && !cls) { j++; ok = true; break; }
          if (ch === '\n') break; j++; }
        if (ok) { while (j < src.length && /[a-z]/i.test(src[j])) j++; i = j; continue; }
      }
    }
    if (c === "'" || c === '"') {
      const q = c; let j = i + 1; let bad = false;
      while (j < src.length) {
        if (src[j] === '\\') { if (SILENT.has(src[j + 1])) bad = true; j += 2; continue; }
        if (src[j] === q) { j++; break; }
        if (src[j] === '\n') break;
        j++;
      }
      if (bad) {
        const ln = src.slice(0, i).split('\n').length;
        const stmt = src.split('\n')[ln - 1] || '';
        if (/RegExp\s*\(/.test(stmt)) findings.push(ln);
      }
      i = j; continue;
    }
    i++;
  }
  check('DEFECT', 'V70-D4 no constructed regex loses a character class to a single backslash',
    findings.length === 0,
    'single-escaped regex classes inside a RegExp-constructing string literal at line(s): ' + findings.join(', ')
    + ' — the class becomes a literal letter, silently, and the clause it guards can never fire');
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// V70-D5 — ONE DEFINITION OF "THIS REQUEST WAS NEGATED"
// index.ts:1780-1784 says three spellings were converged onto REQUEST_NEGATED_ALTERNATION. Two of the
// three still hand-spell their own negator vocabulary and the three disagree.
// ══════════════════════════════════════════════════════════════════════════════════════════
{
  const lineOf = (needle) => src.split('\n').findIndex((l) => l.includes(needle)) + 1;
  const negLine = src.split('\n')[lineOf('const commandNegatedLead =') - 1] || '';
  const recLine = src.split('\n')[lineOf('const negatedRequest =') - 1] || '';
  check('DEFECT', 'V70-D5 commandNegatedLead derives its negator vocabulary from REQUEST_NEGATED_ALTERNATION',
    negLine.includes('REQUEST_NEGATED_ALTERNATION'),
    'the executor still hand-spells the negators; "dont", "no need to", "not going to" and "without" are in the canonical list and not in this one');
  check('DEFECT', 'V70-D5 the receipt\'s negatedRequest derives its negator vocabulary from REQUEST_NEGATED_ALTERNATION',
    recLine.includes('REQUEST_NEGATED_ALTERNATION'),
    'the receipt still hand-spells the negators, so a negated turn can get "I could not resolve which company you meant" instead of "you asked me not to"');
  check('CONTRACT', 'V70-D5 the negation GATE does derive from the one definition',
    (src.split('\n')[lineOf('const negated = new RegExp(') - 1] || '').includes('REQUEST_NEGATED_ALTERNATION'));
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// V70-D6 — ONE DEFINITION OF A CLAUSE SPLIT
// Three spellings of "split this turn into clauses", drifted three ways: the negation gate splits on
// "and" and not "so"; the executor splits on "so" and not "and"; the intent tier splits on both.
// ══════════════════════════════════════════════════════════════════════════════════════════
{
  const splitters = [...src.matchAll(/\.split\((\/\[,;\][^)]*?)\)/g)].map((m) => m[1]);
  const uniq = [...new Set(splitters)];
  check('DEFECT', 'V70-D6 the turn is split into clauses by ONE definition, not three',
    uniq.length <= 1,
    uniq.length + ' distinct clause-splitting regexes:\n         ' + uniq.join('\n         '));
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT — the properties that HOLD on 31979e8 and must never regress
// ══════════════════════════════════════════════════════════════════════════════════════════
// C1 the never-silent receipt, over a matrix built here rather than reused
{
  const CMDS = ['rename ACME to ACME Robotics', 'approve the purchase approval PA-1', 'delete task QA-1',
    'archive company ACME', 'assign task QA-1 to Bob', 'set the manager of Alice to Bob', 'restore company Beta',
    'yes', 'option 2', 'archive the business unit Beta', 'revoke access for Bob', 'promote Bob to manager'];
  const FABS = ['Done — ACME archived.', 'ACME has been archived.', 'Archived successfully.', 'I have deleted the task.',
    'Confirmed — Archived ACME.'];
  const VARIANTS = [{ claims: null }, { claims: [] }, { claims: [{ type: 'state', text: 'ACME is archived' }] },
    { claims: null, questions: ['Should I also archive its projects?'],
      pendingAction: { actionType: 'archive_company', question: 'Archive the projects too?', options: [{ id: 'x', label: 'ACME' }] } }];
  let n = 0, shipped = 0;
  for (const c of CMDS) for (const f of FABS) for (const v of VARIANTS) { n++; if (!RECEIPT.test(String(turn(c, f, v).summary))) shipped++; }
  check('CONTRACT', `C1 ${n} fabricated completions on mutation-intent requests all end in the deterministic receipt`,
    shipped === 0, shipped + ' shipped');
}
// C2 truthful reads survive verbatim
{
  const READS = [['what companies are archived?', 'ACME was archived in June.'],
    ['remind me what happened to ACME', 'ACME was archived in June and restored in July.'],
    ['is ACME archived?', 'Yes — ACME has been archived since June.'],
    ['list the people in Sales', 'Bob and Carol are in Sales.'],
    ['make a list of the archived companies', 'ACME and Beta were archived.'],
    ['set out the plan for the quarter', 'The plan was created in June and approved in July.'],
    ['add up the archived companies', 'Three companies were archived.'],
    ['why was WO-1 closed?', 'It was closed because every task completed.'],
    ['walk me through the org', 'ACME owns Beta; Beta was archived in June.'],
    ['explain the archiving policy', 'Archiving a company ends its active work and preserves history.']];
  let n = 0, bad = 0;
  for (const [c, a] of READS) for (const v of [{ claims: null }, { claims: [] }, { claims: [{ type: 'state', text: 'x' }] }]) {
    n++; if (String(turn(c, a, v).summary) !== a) bad++;
  }
  check('CONTRACT', `C2 ${n} truthful READ answers survive verbatim`, bad === 0, bad + ' rewritten');
}
// C3 a VERIFIED envelope renders the truthful claim; an UNVERIFIED or DENIED one never supports it
{
  const ev = (ok, err) => [{ operation: 'archive_company', entity_type: 'company',
    entity_id: '00000000-0000-4000-8000-000000000001', postconditionPassed: ok, verified: ok, error: err, request_id: 'wo-v70' }];
  let bad = 0;
  for (let i = 0; i < 20; i++) {
    if (RECEIPT.test(String(turn('archive company ACME', 'ACME has been archived.',
      { evidence: ev(true, null), grounded: true, lifecycleReports: ['ACME: archived'] }).summary))) bad++;
  }
  check('CONTRACT', 'C3 a verified envelope on the claimed id renders the truthful claim (20 turns)', bad === 0, bad + ' wrongly receipted');
  let leaked = 0;
  for (let i = 0; i < 20; i++) {
    if (!RECEIPT.test(String(turn('archive company ACME', 'ACME has been archived.', { evidence: ev(false, null) }).summary))) leaked++;
    if (!RECEIPT.test(String(turn('archive company ACME', 'ACME has been archived.', { evidence: ev(false, 'permission denied') }).summary))) leaked++;
  }
  check('CONTRACT', 'C3 an executed-but-unverified or denied envelope never supports the claim (40 turns)', leaked === 0, leaked + ' let the claim through');
}
// C4 CODEX B stays refuted, in both directions
for (const [cmd, ans, mustReceipt] of [
  ['can you archive ACME?', 'Done — ACME archived.', true],
  ['could you please delete task QA-1?', 'Deleted.', true],
  ['should we archive ACME?', 'ACME has been archived.', true],
  ['what companies are archived?', 'ACME has been archived.', false],
  ['what happened last month?', 'ACME was archived on 3 June and Beta was restored on 9 June.', false],
]) {
  check('CONTRACT', `C4 Codex B: "${cmd}" ${mustReceipt ? 'is a request' : 'is a read that survives'}`,
    RECEIPT.test(String(turn(cmd, ans).summary)) === mustReceipt);
}
// C5 CODEX C — the persistence outcome is classified, never collapsed
{
  for (const k of ['EXECUTION_SUCCEEDED_PERSISTENCE_FAILED', 'READ_SUCCEEDED_PERSISTENCE_FAILED',
    'EXECUTION_SUCCEEDED_AND_PERSISTED', 'READ_SUCCEEDED_AND_PERSISTED'])
    check('CONTRACT', 'C5 Codex C: persistence outcome ' + k + ' is a named classification', src.includes(k));
  check('CONTRACT', 'C5 Codex C: the final persist READS its own error rather than discarding it',
    /const finalPersistFailed = !!\(finalPersist && finalPersist\.error\);/.test(src));
  check('CONTRACT', 'C5 Codex C: the founder-visible payload carries the outcome, so `done` never means durable on its own',
    /send\(\{ type: 'done', persistenceOutcome, persistenceFailed: finalPersistFailed/.test(src));
}
// C6 CODEX D — no envelope takes its total from the shown window; a trim keeps truncated true
{
  check('CONTRACT', 'C6 Codex D: a trimmed envelope with an unknown total reports truncated:true, never an invented total',
    /env\.truncated = env\.total === null \? true : env\.total > keep;/.test(src));
  check('CONTRACT', 'C6 Codex D: the hard-floor passes recompute the envelope too',
    /envHard\.truncated = envHard\.total === null \? true : envHard\.total > thisFloor;/.test(src));
}
// C7 CODEX E — the prepared person-assignment migration cannot reach production through THIS deployment
{
  check('CONTRACT', 'C7 Codex E: the prepared policy change is in supabase/drafts/, outside the migration path',
    existsSync(join(ROOT, 'supabase/drafts/202609090001_person_assignment_scope_authorization.sql'))
    && !existsSync(join(ROOT, 'supabase/migrations/202609090001_person_assignment_scope_authorization.sql')));
}
// C8 the deploy surface is exactly index.ts — supabase/functions/_shared/* is NOT imported
{
  check('CONTRACT', 'C8 index.ts imports nothing from supabase/functions/_shared (the deploy surface is one file)',
    !/from\s+['"][^'"]*_shared\//.test(src));
}
// C9 the request budget: the pack measurer and the preflight measurer are the SAME shape
{
  check('CONTRACT', 'C9 packTokens() and the serve() preflight both measure JSON.stringify({command, contextPack})',
    /const packTokens = \(\) => Math\.ceil\(JSON\.stringify\(\{ command, contextPack: pack \}\)\.length \/ 4\);/.test(src)
    && /tokenEstimate = estimateTokens\(\{ command, contextPack \}\);/.test(src));
  check('CONTRACT', 'C9 estimateRequestTokens measures the request AS SERIALIZED (pretty-printed) plus the system prompt',
    /const body = JSON\.stringify\(payload, null, 2\)/.test(src) && /SYSTEM_PROMPT_TOKENS \+ Math\.ceil\(body\.length \/ 4\)/.test(src));
  check('CONTRACT', 'C9 both providers serialize the payload the estimator measures',
    (src.match(/JSON\.stringify\(contextForModel, null, 2\)/g) || []).length === 2);
  check('CONTRACT', 'C9 every MINIMUM_SAFE_CONTEXT key is protected by ASSERTION, not merely by omission from TRIM_ORDER',
    /if \(MINIMUM_SAFE_CONTEXT\.includes\(key\)\) throw new Error\('TRIM_ORDER names a minimum-safe-context key/.test(src)
    && /!== minimumSafeBefore/.test(src));
}
// C10 embedTexts is byte-identical to deployed v92, so this candidate neither creates nor worsens the
// open embeddings outage — and the outage stays NAMED.
{
  const V92 = join(ROOT, 'qa/verification/scratch/v92/index.v92.ts');
  if (existsSync(V92)) {
    const v = readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');
    const body = (s) => { const a = s.indexOf('async function embedTexts('); return a < 0 ? null : s.slice(a, s.indexOf('\n}', a) + 2); };
    check('CONTRACT', 'C10 embedTexts is byte-identical to deployed v92', body(src) !== null && body(src) === body(v));
  } else check('CONTRACT', 'C10 the v92 reference corpus is present', false, 'missing ' + V92);
  check('CONTRACT', 'C10 the open embeddings outage is still NAMED, not silently carried',
    existsSync(join(ROOT, 'qa/AI_LLM_PROVIDER_RELIABILITY_2026-09-08.md'))
    && existsSync(join(ROOT, 'qa/work-orders/AI_PROVIDER_RELIABILITY.md')));
}
// C11 index.ts is CRLF-pure (0 bare LF), the invariant sem-ai-command/index.ts carries
{
  let crlf = 0, bareLF = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i] === '\n') { if (i > 0 && raw[i - 1] === '\r') crlf++; else bareLF++; }
  check('CONTRACT', 'C11 index.ts is CRLF-pure', bareLF === 0, `crlf=${crlf} bareLF=${bareLF}`);
}
// C12 the participle vocabulary is ONE concept; today it is spelled four times and disagrees about 8 of 24
// words. This row MEASURES the drift and pins its size so it cannot silently grow (ledger #141).
{
  const lines = src.split('\n');
  const RX = /\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|declined|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|confirmed|added|done)\b/g;
  const four = ['PAST_COMPLETION_CLAIM_PATTERN', 'COMPLETION_WORD', 'COMPLETION_VERB', 'CONFIRMED_COMPLETION'];
  const P = {};
  for (const n of four) {
    const at = lines.findIndex((l) => l.includes('const ' + n + ' ='));
    if (at < 0) { P[n] = []; continue; }
    let buf = ''; for (let i = at; i < lines.length; i++) { buf += lines[i] + '\n'; if (/;\s*$/.test(lines[i])) break; }
    P[n] = [...new Set([...buf.matchAll(RX)].map((m) => m[1]))];
  }
  const u = [...new Set(Object.values(P).flat())];
  const disagree = u.filter((w) => four.filter((n) => P[n].includes(w)).length !== 4);
  check('CONTRACT', `C12 the participle-vocabulary drift is ${disagree.length} of ${u.length} words and has not grown`,
    disagree.length <= 8 && u.length >= 24, 'disagreements: ' + disagree.join(','));
}

console.log(`\nv70_regression_additions: ${pass} passed, ${failures.length} failed`);
console.log('index.ts under test: ' + SRC);
if (failures.length) { console.log('\nFAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
