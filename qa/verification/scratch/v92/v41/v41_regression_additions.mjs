#!/usr/bin/env node
// VERIFIER #41 (campaign #101) — permanent regression additions.
//
// SELF-CONTAINED ON PURPOSE. It carries its own source extractor rather than importing any
// prior verifier's or the implementing session's harness: the whole point of an independent
// gate is that it does not inherit the assumptions of the thing it measures. It locates
// index.ts from SEM_INDEX_SRC, or from a path derived from import.meta.url, so it is correct
// from ANY cwd (ledger V30-F2). ANY failure exits nonzero.
//
// WHAT IT PINS
//   V41-D1 (P1, DEPLOY BLOCKER on 884567a) — the leading-gerund arm destroys a truthful
//     DESCRIPTIVE sentence whose OBJECT IS A PROPER NAME. Deployed v92 has no gerund arm at
//     all and preserves every one of them. 1,100 of 1,320 generated truthful sentences were
//     destroyed on 884567a; 0 of 660 with a generic lowercase object (the half #40 closed).
//   V41-D2 (P1, DEPLOY BLOCKER on 884567a) — the "Confirmed — <Participle> …" arm destroys a
//     truthful negative whose object is a DETERMINER NEGATOR ("Confirmed — Archived no
//     records."). The X-guard lists no/nothing/none inside a NEGATIVE lookahead, so those are
//     exactly the words that do NOT get its protection, and the arm's negation check runs on
//     the text up to the END of the matched participle, so an object negator is outside the
//     checked span by construction. v92 preserves all four.
//   V41-D3 (P3, REPORT-ONLY, shared with v92) — the gerund arm's finite-verb guard carries /i,
//     so a NAME word that is also a verb ("Erdenet Copper Works", "… Shows", "… Costs") reads
//     as a finite verb and an in-progress fabrication about that company is missed. v92 misses
//     it too, so it is not a deploy blocker; it is pinned so it cannot be forgotten.
//   V41-C1..C6 — CONTRACTs that must hold on the candidate AND after any fix: the four
//     quadrants against deployed v92, the negator-token-NAME section in both directions, the
//     disambiguation matcher, no belt guard that case-folds its own [A-Z] test, and the
//     non-vacuity of that sweep.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------
// LOCATE THE PRODUCT (cwd-independent)
// ---------------------------------------------------------------------------------------
const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRepoFile(rel) {
  let d = HERE;
  for (let i = 0; i < 8; i++) {
    const p = path.join(d, rel);
    try { readFileSync(p); return p; } catch { /* keep walking up */ }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('could not locate ' + rel + ' from ' + HERE + ' — refusing to run against a guessed path');
}
const INDEX = process.env.SEM_INDEX_SRC
  ? path.resolve(process.env.SEM_INDEX_SRC)
  : findRepoFile('supabase/functions/sem-ai-command/index.ts');
const SRC = readFileSync(INDEX, 'utf8');

// ---------------------------------------------------------------------------------------
// MY OWN EXTRACTOR — a small state machine that understands comments, strings and REGEX
// LITERALS, so a `;` or a brace inside a regex never terminates a declaration.
// ---------------------------------------------------------------------------------------
const PREV_ALLOWS_REGEX = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
function scanStatement(src, start) {
  let i = start, depth = 0, prev = '';
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
      i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev))) {
      let j = i + 1, inClass = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        else if (src[j] === '\n') break;
        j++;
      }
      j++;
      while (j < src.length && /[gimsuyvd]/.test(src[j])) j++;
      i = j; prev = '/'; continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return i + 1;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  throw new Error('unterminated statement — refusing to report on a slice that is not the product');
}
function extractConst(src, name) {
  const m = new RegExp('(^|\\n)\\s*const\\s+' + name + '\\b').exec(src);
  if (!m) return null;
  const s = src.indexOf('const', m.index);
  return src.slice(s, scanStatement(src, s));
}
const detype = (code) => code
  // annotated declarations: `const x: Foo<Bar> = ` -> `const x = ` (a type expression never contains '=')
  .replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =')
  // function signatures: parameter annotations + return type
  .replace(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/:\s*[^,)]+/g, '') + ') {')
  .replace(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/:\s*[^,)]+/g, '') + ') {')
  // arrow functions in assignment position, then callback arrows
  .replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_m, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>')
  .replace(/=\s*\(([^)]*)\)\s*=>/g, (_m, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>')
  .replace(/\(([A-Za-z_$][\w$]*\s*:\s*[^),]+(?:,\s*[A-Za-z_$][\w$]*\s*:\s*[^),]+)*)\)\s*=>/g,
    (_m, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') =>')
  .replace(/(\w)!\./g, '$1.');

const GATE_NAMES = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX',
  'completionIsNegated', 'readsAsCompletion'];
function buildGate(src) {
  const parts = [], present = [];
  for (const n of GATE_NAMES) {
    const c = extractConst(src, n);
    if (c === null) { if (n === 'NEGATION_AUX' || n === 'COMPLETION_VERB') continue; throw new Error('belt const missing: ' + n); }
    parts.push(detype(c)); present.push(n);
  }
  const exported = present.filter((n) => n !== 'PROGRESS_VERBS');
  return new Function('const knownEntityNames = new Set();\n' + parts.join('\n') + '\nreturn { ' + exported.join(', ') + ' };')();
}
function buildMatcher(src) {
  const m = /(^|\n)function\s+matchDisambiguationOption\s*\(/.exec(src);
  if (!m) throw new Error('matchDisambiguationOption not found');
  const s = src.indexOf('function', m.index);
  let i = src.indexOf('{', s), depth = 0, end = -1, prev = '';
  for (let k = i; k < src.length; k++) {
    const two = src.slice(k, k + 2);
    if (two === '//') { const nl = src.indexOf('\n', k); k = nl < 0 ? src.length : nl; continue; }
    const c = src[k];
    if (c === '"' || c === "'" || c === '`') { let j = k + 1; while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; } k = j; continue; }
    if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev))) {
      let j = k + 1, cl = false;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cl = true; else if (src[j] === ']') cl = false; else if (src[j] === '/' && !cl) break; else if (src[j] === '\n') break; j++; }
      j++; while (j < src.length && /[gimsuyvd]/.test(src[j])) j++;
      k = j - 1; prev = '/'; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
    if (!/\s/.test(c)) prev = c;
  }
  if (end < 0) throw new Error('unbalanced matcher body');
  return new Function(detype(src.slice(s, end)) + '\nreturn matchDisambiguationOption;')();
}

// DEPLOYED v92's gate, verbatim. The candidate carries it byte-identically as
// PAST_COMPLETION_CLAIM_PATTERN, which is itself asserted below — so the v92 column of every
// quadrant is derived from the product, never from a copy this file could drift from.
const V92_LITERAL = extractConst(SRC, 'PAST_COMPLETION_CLAIM_PATTERN');
if (!V92_LITERAL) throw new Error('PAST_COMPLETION_CLAIM_PATTERN missing — the v92 reference gate is gone');
const V92_RE = new Function('return ' + V92_LITERAL.replace(/^const\s+\w+\s*=\s*/, '').replace(/;\s*$/, ''))();
const V92_EXPECTED_SOURCE = "(?<!may )(?<!might )(?<!could )(?<!can )\\b(has been|have been|was|were)\\b[^.]{0,30}\\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|reassigned|completed|archived|restored|moved|ended|added|granted|confirmed)\\b|\\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|completed|archived|restored)\\s+successfully\\b|\\brenamed:\\s*.+(→|->)";

const gate = buildGate(SRC);
const R = (s) => gate.readsAsCompletion(String(s)) === true;
const V = (s) => V92_RE.test(String(s));

// ---------------------------------------------------------------------------------------
let pass = 0; const failures = []; const notes = [];
// REPORT-ONLY. Verifier #40's lesson: a line that is red every round stops being read as a
// failure and becomes furniture. A finding that is genuinely NOT a deploy blocker (deployed
// v92 has the same behaviour) is therefore reported LOUDLY but does not fail the gate — and
// it is paired with a CONTRACT that fails the moment it stops being shared with v92.
function note(name, fn) {
  let holds = false, err = '';
  try { holds = fn() === true; } catch (e) { err = ' THREW ' + e.message; }
  const line = `${holds ? 'still open' : 'CLOSED'} — ${name}${err}`;
  notes.push(line);
  console.log(`note  [REPORT] ${line}`);
}
function check(kind, name, ok, detail) {
  let good = false, err = '';
  try { good = ok() === true; } catch (e) { err = ' THREW ' + e.message; }
  if (good) { pass++; console.log(`ok    [${kind}] ${name}`); }
  else { failures.push(`[${kind}] ${name}${err}${detail ? ' :: ' + detail : ''}`); console.log(`FAIL  [${kind}] ${name}${err}`); }
}

// ── CONTRACT 0: the v92 reference gate is the real one, byte-identical.
check('CONTRACT', 'V41-C0 the deployed-v92 gate is still present byte-identical (the whole differential rests on it)',
  () => V92_RE.source === V92_EXPECTED_SOURCE && V92_RE.flags === 'i');

// ── DEFECT V41-D1 — gerund arm, PROPER-NAME object.
const GERUNDS = ['Archiving', 'Deleting', 'Removing', 'Restoring', 'Assigning', 'Reassigning', 'Updating',
  'Creating', 'Moving', 'Renaming', 'Closing', 'Clearing', 'Granting', 'Declining', 'Approving', 'Rejecting',
  'Completing', 'Activating', 'Deactivating', 'Adding', 'Sending', 'Ending'];
const NAMES = ['ACME Holdings', 'Bob Smith', 'CLIX GPS', 'Sarah Chen', 'Erdenet Copper Works', 'IQParking'];
const PREDICATES = ['triggers an offboarding checklist.', 'throws a permission error.', 'revokes access immediately.',
  'generates a notification.', 'reorders the board.', 'queues it for delivery.', 'resets the view.',
  'consumes one seat on your plan.', 'gives every manager a heads-up.', 'returns it to the previous step.'];
const D1_TRUTH = [];
for (const g of GERUNDS) for (const n of NAMES) for (const p of PREDICATES) D1_TRUTH.push(`${g} ${n} ${p}`);
check('CONTRACT', 'V41-D1 corpus valid: deployed v92 preserves every one of these ' + D1_TRUTH.length + ' truthful sentences',
  () => D1_TRUTH.every((s) => V(s) === false));
{
  const destroyed = D1_TRUTH.filter(R);
  check('DEFECT', 'V41-D1 (P1): a gerund-initial DESCRIPTIVE sentence with a PROPER-NAME object is not destroyed — v92 preserves all ' + D1_TRUTH.length,
    () => destroyed.length === 0, destroyed.length + ' destroyed, e.g. ' + JSON.stringify(destroyed.slice(0, 3)));
}
// CONTROL: the half verifier #40 closed must stay closed — this is what proves D1 is the
// PROPER-NAME half specifically, not a re-opening of #39/#40's original class.
{
  const generic = [];
  for (const g of GERUNDS) for (const o of ['a company', 'a person', 'the company']) for (const p of PREDICATES) generic.push(`${g} ${o} ${p}`);
  check('CONTRACT', 'V41-C1 CONTROL: the generic-lowercase-object half (#39/#40) stays closed (' + generic.length + ' sentences)',
    () => generic.every((s) => R(s) === false));
}
// COVERAGE: the arm must still fire on a real in-progress fabrication, or D1 would be
// "fixable" by deleting the arm — which is not a fix.
check('CONTRACT', 'V41-C2 COVERAGE: a real in-progress fabrication is still caught (the arm is not simply disabled)',
  () => ['Archiving ACME Holdings now.', 'Archiving ACME Holdings as we speak.', "I'm now archiving ACME Holdings.",
    'Now removing ACME Holdings.', 'Working on archiving ACME Holdings.', 'Executing the plan to reassign CLIX GPS.',
    'ACME Holdings is being archived.', 'Let me archive ACME Holdings.'].every(R));

// ── DEFECT V41-D2 — CONFIRMED arm, determiner-negator object.
const D2 = ['Confirmed — Archived no records.', 'Confirmed — Archived nothing.',
  'Confirmed — Deleted none of them.', 'Confirmed — Removed no one.'];
check('CONTRACT', 'V41-D2 corpus valid: deployed v92 preserves all four', () => D2.every((s) => V(s) === false));
{
  const destroyed = D2.filter(R);
  check('DEFECT', 'V41-D2 (P1): "Confirmed — <Participle> <determiner negator>" is a truthful negative and must survive',
    () => destroyed.length === 0, JSON.stringify(destroyed));
}
check('CONTRACT', 'V41-C3 COVERAGE: the paired CONFIRMED fabrications stay caught (case is the discriminator, and it must keep working)',
  () => ['Confirmed — Archived ACME Holdings.', 'Confirmed - Archived ACME.', 'Confirmed — Restored Bob Smith.',
    'Confirmed — as requested, Restored Bob Smith.', 'Confirmed — Archived No Limits Inc.',
    'Confirmed — Deleted Nothing Bundt Cakes.', 'Confirmed — the company (option 1).'].every(R));
check('CONTRACT', 'V41-C3b the truthful CONFIRMED reports index.ts itself calls TRUE still survive',
  () => ['Confirmed — No Business Unit archived.', 'Confirmed — Archived Media Group is still active.',
    'Confirmed — Closed Loop Systems remains open.', 'Confirmed — Archive ACME Holdings?',
    'Confirmed — you selected “ACME Holdings”.', 'Confirmed — the company you asked about is in Ulaanbaatar.',
    'Confirmed — Archived no longer applies to this workspace.'].every((s) => R(s) === false));

// ── DEFECT V41-D3 (report-only, shared with v92): /i case-folds the finite-verb guard, so a
//    NAME word that is also a verb reads as a verb.
{
  const shapes = ['Archiving Erdenet Copper Works now.', 'Deleting Ulaanbaatar Metal Works now.',
    'Removing Northern Iron Works now.'];
  // The CONTRACT is what keeps this honest: the moment deployed v92 would catch one of these
  // and the candidate would not, it stops being shared and becomes a deploy blocker — and
  // THIS line fails, loudly, instead of the note staying quietly red forever.
  check('CONTRACT', 'V41-C-D3 the D3 class is genuinely SHARED with deployed v92 (if v92 ever catches one and we do not, it is a BLOCKER, not a note)',
    () => shapes.every((s) => V(s) === false || R(s) === true));
  note('V41-D3 (P3): a company whose NAME ends in a verb word ("… Copper Works") is read as a finite verb by the '
    + 'gerund guard\'s /i alternation, so an in-progress fabrication about it is missed. Deployed v92 misses it too. '
    + 'Direction if it is ever closed: drop the /i and case the gerund alternation explicitly — under /i no [A-Z] '
    + 'test can work. Still missed: ' + JSON.stringify(shapes.filter((s) => !R(s))),
  () => shapes.some((s) => !R(s)));
}

// ── CONTRACT 4: the required NEGATOR-TOKEN-NAME section, BOTH DIRECTIONS.
{
  const NEG = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
    'Nothing But Nets Foundation', 'No Frills Ltd', 'Nowhere Man Records', 'Not Just Coffee',
    'Few Good Men LLC', 'Hardly Normal Pty', 'No Fear Motors', 'Neither Shore Trading'];
  const fabs = NEG.flatMap((n) => [`${n} was archived successfully.`, `${n} has been archived.`, `${n} was renamed.`, `I archived ${n}.`]);
  const truths = NEG.flatMap((n) => [`${n} was not archived.`, `No company named ${n} was archived.`,
    `${n} has not been archived.`, `Nothing was changed for ${n}.`, `There is no record that ${n} was archived.`]);
  const titles = ['Pending review', 'Awaiting approval', 'No Objection Letter'];
  check('CONTRACT', 'V41-C4a negator-token NAMES: every fabrication is caught (' + fabs.length + ')',
    () => fabs.every(R), JSON.stringify(fabs.filter((s) => !R(s)).slice(0, 5)));
  check('CONTRACT', 'V41-C4b negator-token NAMES: every truthful negative about the SAME name survives (' + truths.length + ')',
    () => truths.every((s) => R(s) === false), JSON.stringify(truths.filter(R).slice(0, 5)));
  check('CONTRACT', 'V41-C4c negator-token TITLES: fabrications caught, truthful negatives survive',
    () => titles.every((t) => R(`The document titled "${t}" has been archived.`) === true
      && R(`The document titled "${t}" was not archived.`) === false
      && R(`No document titled "${t}" was archived.`) === false));
  // The dash-before-a-CAPITAL class the implementing session REFUSED to close by casing.
  check('CONTRACT', 'V41-C4d a dash before a CAPITAL is not a clause boundary — these truthful negatives survive',
    () => ['No company named Ulaanbaatar — North Depot was archived.', 'No unit at Erdenet — Copper Works was archived.',
      'No company named Gobi — Energy LLC was archived.'].every((s) => R(s) === false));
  check('CONTRACT', 'V41-C4e and the paired dash fabrications are still caught LEXICALLY',
    () => ['Ulaanbaatar — North Depot was archived.', 'Erdenet — Copper Works has been deleted.',
      'Not a single task moved — Bob Smith was removed.'].every(R));
}

// ── CONTRACT 5: the production shapes deployed v92 corrects must never ship (#64 D16,
//    #65 D25/D27 production row 9dda919c, #66 D40, BUG-002's own reproductions).
{
  const PROD = ['Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
    'The company has been archived.', 'The approval has been approved.', 'The task has been deleted.',
    'The approval has been declined.', 'The task has been reassigned.', 'The employee has been removed.',
    'The person has been updated.', 'The approval has been approved and the company was archived successfully.',
    'The approval was not rejected, and it has been approved.', 'The approval was not rejected – it has been approved.',
    'The approval was not rejected—it has been approved.', 'The approval was not rejected: it has been approved.',
    'No company matched that name so the company has been archived.',
    'I could not confirm the owner yet the employee was created.',
    'The status is not draft (the goal has been archived).',
    'The approval has been approved\n\nWould you like me to notify the team?',
    'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?',
    'The task has been completed, right?', 'The company was archived successfully.',
    'Bob Smith was reassigned to the new team.', 'The project has been renamed.'];
  check('CONTRACT', 'V41-C5a corpus valid: deployed v92 corrects every one of these ' + PROD.length + ' production shapes',
    () => PROD.every(V));
  check('CONTRACT', 'V41-C5b no production shape v92 corrects is shipped by the candidate (fabrication regression == 0)',
    () => PROD.every(R), JSON.stringify(PROD.filter((s) => !R(s))));
}

// ── CONTRACT 6: no belt guard case-folds its own [A-Z] test (#40's own near-miss, made
//    permanent), plus the sweep's non-vacuity.
function caseFoldFindings(text) {
  const t = text.replace(/\r\n/g, '\n');
  const s = t.indexOf('const LEGACY_PAST_COMPLETION'), e = t.indexOf('const legacyProseFallback');
  if (s < 0 || e <= s) throw new Error('belt block not found — update this harness, do not let it pass');
  const blk = t.slice(s, e).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const out = [];
  const re = /new RegExp\(/g; let m;
  while ((m = re.exec(blk)) !== null) {
    let d = 1, j = m.index + m[0].length, inStr = '';
    while (j < blk.length && d > 0) {
      const c = blk[j];
      if (inStr) { if (c === '\\') { j += 2; continue; } if (c === inStr) inStr = ''; j++; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; j++; continue; }
      if (c === '(') d++; else if (c === ')') d--;
      j++;
    }
    const args = blk.slice(m.index + m[0].length, j - 1);
    const fm = args.match(/,\s*['"]([gimsuyvd]*)['"]\s*$/);
    if (fm && fm[1].includes('i') && /\[A-Z\]/.test(args.slice(0, fm.index))) out.push(args.slice(0, 90));
  }
  // regex literals
  const lit = /\/((?:\\.|\[(?:\\.|[^\]])*\]|[^/\n\\])+)\/([gimsuyvd]*)/g;
  while ((m = lit.exec(blk)) !== null) if (m[2].includes('i') && /\[A-Z\]/.test(m[1])) out.push('/' + m[1].slice(0, 80) + '/' + m[2]);
  return out;
}
check('CONTRACT', 'V41-C6 no belt guard carries /i over an explicit [A-Z] test (a case-folded [A-Z] guard is silently inert)',
  () => caseFoldFindings(SRC).length === 0, JSON.stringify(caseFoldFindings(SRC).slice(0, 3)));
check('CONTRACT', 'V41-C6b COVERAGE: the sweep really detects one when it exists (non-vacuous)',
  () => caseFoldFindings(SRC.replace('const NEGATION_AUX = /', 'const ZZTEST = new RegExp("^[A-Z]x", "i");\n        const NEGATION_AUX = /')).length === 1);

// ── CONTRACT 7: the disambiguation matcher — ordinary selection stays frictionless, every
//    exclusion dead-ends, and a negator-token NAME is still selectable.
{
  const match = buildMatcher(SRC);
  const O = [{ id: 'c1', label: 'ACME Holdings', entityType: 'company', actionType: 'archive' },
    { id: 'c2', label: 'ACME Group', entityType: 'company', actionType: 'archive' },
    { id: 'c3', label: 'No Limits Inc', entityType: 'company', actionType: 'archive' }];
  const O2 = [{ id: 'o1', label: 'Option 2 Ltd', entityType: 'company', actionType: 'archive' },
    { id: 'o2', label: 'Beta Corp', entityType: 'company', actionType: 'archive' }];
  const SHAPES = [['acme holdings', O, 'c1'], ['ACME Holdings', O, 'c1'], ['yes, acme holdings', O, 'c1'],
    ['archive acme holdings', O, 'c1'], ['“ACME Holdings”', O, 'c1'], ['option 1', O, 'c1'], ['#2', O, 'c2'],
    ['2', O, 'c2'], ['the second one', O, 'c2'], ['number 3', O, 'c3'], ['option 9', O, null],
    ['no option 2', O, null], ["don't archive acme holdings", O, null], ['not acme holdings, the other one', O, null],
    ['anything except acme holdings', O, null], ['exclude acme holdings', O, null], ['cancel acme holdings', O, null],
    ['besides acme holdings', O, null], ['acme holdings? no, the group one', O, null], ['acme holdings, no', O, null],
    ['activate acme holdings', O, null], ['reject acme holdings', O, null], ['archive acme holdings tasks', O, null],
    ['acme 2', O, null], ['no limits inc', O, 'c3'], ['yes, no limits inc', O, 'c3'],
    ["don't archive no limits inc", O, null], ['option 2', O2, null], ['beta corp', O2, 'o2'],
    ['acme', O, null], ['', O, null], ['   ', O, null]];
  const bad = SHAPES.filter(([r, o, want]) => { const m = match(r, o); return (m ? m.id : null) !== want; });
  check('CONTRACT', 'V41-C7 all ' + SHAPES.length + ' disambiguation shapes resolve as specified (frictionless selection, fail-closed exclusion)',
    () => bad.length === 0, JSON.stringify(bad.map(([r]) => r)));
  check('CONTRACT', 'V41-C7b no disambiguation reply or replay summary reads as a completion claim',
    () => SHAPES.map(([r]) => r).concat(['Confirmed — you selected “ACME Holdings”.',
      'Confirmed — proceeding with the option you selected.']).every((s) => R(s) === false));
}

// ── CONTRACT 8: the belt still does the job it exists for at all (anti-vacuity).
check('CONTRACT', 'V41-C8 NON-VACUOUS: the belt fires on an obvious fabrication and spares an obvious truthful negative',
  () => R('The company was archived successfully.') === true && R('No company was archived.') === false);

console.log(`\n${pass} passed, ${failures.length} failed, ${notes.length} report-only note(s)`);
if (failures.length) {
  console.log('\nRED — candidate is NOT fit to deploy over v92 (a DEFECT line here is a truthful answer v92\n' +
    'preserves and the candidate destroys, or a fabrication v92 corrects and the candidate ships):');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
