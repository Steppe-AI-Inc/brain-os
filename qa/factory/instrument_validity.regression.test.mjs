#!/usr/bin/env node
// QA_CHECK_SUBJECT_WIDER_THAN_INVARIANT — the named failure class, with a row per principle.
//
// THE FAMILY. A QA check claims to test one specific structure or state, but its scan observes a WIDER
// subject and therefore accepts or rejects on unrelated text. It has now appeared five times in one week,
// every time in an instrument and never in the product:
//
//   V86-C10b  read the letter of a `\n` ESCAPE SEQUENCE as an identifier named `n`, and would have blocked
//             a candidate that closes four defects and restores Codex A.
//   my fix    for it built the regex source `\.` — an ESCAPED DOT — so it stripped periods, left the escape
//             alone, and looked applied while changing nothing.
//   V87-H3    hardcoded a list of defect ids and demanded each stay forgiven, so CLOSING a defect failed it.
//   its       presence test then matched the id inside a COMMENT explaining a prefix hazard.
//   my re-pin deleted a RANGE that crossed an object boundary, removing a `const` declaration; `node --check`
//             passed and I reported "syntax ok" as though that were evidence.
//
// SIX PRINCIPLES, each with a row that FAILS on a fixture exhibiting the defect. A principle without a
// failing fixture is a slogan.
import { validateInstrument } from '../../scripts/factory-runner/validate-instrument.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);
let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? NL + '       ' + detail : '')); }
};

const dir = mkdtempSync(join(tmpdir(), 'qaiv-'));
const write = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };
const parses = (p) => {
  try { execFileSync(process.execPath, ['--check', p], { encoding: 'utf8', timeout: 60000 }); return true; }
  catch { return false; }
};

try {
  // ── E. EXECUTABLE_QA_INSTRUMENT_MUST_BE_EXECUTED ───────────────────────────────────────────────────
  //
  // The exact shape of my own defect: a file that PARSES and throws a ReferenceError when run.
  const missingSymbol = write('missing-symbol.mjs', [
    'const TABLE = { a: 1 };',
    '// The declaration below was removed by a range edit. This file parses perfectly.',
    'console.log(Object.keys(EXPECTED_FAILING_ROWS).length + " pass");',
  ].join(NL));

  check('E1 the broken instrument PARSES — so `node --check` alone would have accepted it', parses(missingSymbol),
    'if this row is red the fixture is not reproducing the defect, and every row below means nothing');

  const v = validateInstrument(missingSymbol, { minRows: 1 });
  check('E2 EXECUTABLE_QA_INSTRUMENT_MUST_BE_EXECUTED: validation REJECTS a file that parses but throws'
    + ' a missing-reference error at runtime',
    v.ok === false && v.results.some((r) => r.level === 2 && !r.ok),
    JSON.stringify(v.results.map((r) => r.level + ':' + (r.ok ? 'ok' : 'FAIL'))));

  check('E3 ...and it says WHICH level failed, so "it is broken" is not the whole report',
    v.results.filter((r) => !r.ok).every((r) => typeof r.name === 'string' && r.name.length > 20),
    JSON.stringify(v.results.filter((r) => !r.ok).map((r) => r.level)));

  // A healthy instrument must still pass, or the validator is just a rejecter.
  const healthy = write('healthy.mjs', [
    'let n = 0;',
    'for (const row of [1, 2, 3]) { if (row > 0) n++; }',
    'console.log(n + " pass, 0 fail");',
  ].join(NL));
  const hv = validateInstrument(healthy, { minRows: 3 });
  check('E4 a HEALTHY instrument passes all six levels, so the validator is not merely a rejecter',
    hv.ok === true, JSON.stringify(hv.results.map((r) => r.level + ':' + (r.ok ? 'ok' : 'FAIL'))));

  // ── Non-vacuity: a suite that asserts nothing exits 0 exactly like one that asserts everything. ────
  const vacuous = write('vacuous.mjs', ['console.log("0 pass, 0 fail");'].join(NL));
  const vv = validateInstrument(vacuous, { minRows: 1 });
  check('E5 NON-VACUOUS: an instrument that asserted NOTHING is rejected even though it exits 0',
    vv.ok === false && vv.results.some((r) => r.level === 5 && !r.ok),
    JSON.stringify(vv.results.map((r) => r.level + ':' + (r.ok ? 'ok' : 'FAIL'))));

  // ── Negative control: the level that separates an instrument from a formality. ────────────────────
  const alwaysPasses = write('always.mjs', ['console.log("5 pass, 0 fail");'].join(NL));
  const av = validateInstrument(alwaysPasses, {
    minRows: 1,
    // Break the thing the instrument claims to measure. It still passes, because it measures nothing.
    negativeControl: (t) => t.replace('5 pass', '5 pass'),
  });
  check('E6 NEGATIVE CONTROL: an instrument that passes on a deliberately broken input is rejected',
    av.ok === false && av.results.some((r) => r.level === 6 && !r.ok),
    JSON.stringify(av.results.map((r) => r.level + ':' + (r.ok ? 'ok' : 'FAIL'))));

  // ── A. COMMENTS_ARE_NOT_STATE ─────────────────────────────────────────────────────────────────────
  const stripComments = (t) => t.split(NL).filter((l) => !/^\s*\/\//.test(l)).join(NL);
  const tableWithComment = [
    "const T = {",
    "  // 'V86-D2codexA' is named here only to explain a prefix hazard.",
    "  'other.mjs': ['V99-D1 something (0 of 3)'],",
    '};',
  ].join(NL);
  check('A COMMENTS_ARE_NOT_STATE: a row id named only in a comment is not an active entry',
    /V86-D2codexA/.test(tableWithComment) && !/V86-D2codexA/.test(stripComments(tableWithComment)),
    'the raw text contains the id and the code does not — a scan that reads the raw text calls a CLOSED'
    + ' defect forgiven');

  // ── B. STRING_CONTENT_IS_NOT_IDENTIFIER_REFERENCE ────────────────────────────────────────────────
  const withEscape = "const end = src.indexOf('" + BS + "n};', at);";
  const bare = new RegExp('(?<![' + BS + 'w$])n(?![' + BS + 'w$])');
  const escapesStripped = withEscape.replace(new RegExp(BS + BS + '.', 'g'), ' ');
  check('B STRING_CONTENT_IS_NOT_IDENTIFIER_REFERENCE: the letter of an escape sequence is not an identifier',
    bare.test(withEscape) === true && bare.test(escapesStripped) === false,
    'raw matches a bare `n` (' + bare.test(withEscape) + '), escape-stripped does not ('
    + bare.test(escapesStripped) + ') — this is V86-C10b exactly');

  // ── C. EXPECTED_FAILING_ROWS_MUST_BE_DERIVED ─────────────────────────────────────────────────────
  const remembered = ['V86-D2codexA', 'V86-D3', 'V85-D1'];
  const tableNow = "{ 'x.mjs': ['V85-D1 a thing (0 of 4)'] }";
  const derived = remembered.filter((id) => new RegExp("'" + id + BS + 'b').test(tableNow));
  check('C EXPECTED_FAILING_ROWS_MUST_BE_DERIVED: an expectation read from the table survives a defect'
    + ' being CLOSED; a remembered list does not',
    remembered.length === 3 && derived.length === 1 && derived[0] === 'V85-D1',
    'remembered ' + JSON.stringify(remembered) + ' vs derived ' + JSON.stringify(derived)
    + ' — V87-H3 demanded the two closed ids stay forgiven');

  // ── F. EDIT_SCOPE_MUST_NOT_CROSS_STRUCTURAL_BOUNDARY ─────────────────────────────────────────────
  const objA = ["const A = {", "  'k': 'v',", '};'].join(NL);
  const objB = ["const B = {", "  'k2': 'v2',", '};'].join(NL);
  const doc = objA + NL + objB;
  // A range delete from the last key of A "to the next key" reaches into B and takes A's brace with it.
  const from = doc.indexOf("  'k': 'v',");
  const to = doc.indexOf("  'k2': 'v2',");
  const rangeDeleted = doc.slice(0, from) + doc.slice(to);
  const boundary = doc.indexOf('};');
  const lineWise = doc.split(NL).filter((l) => !l.includes("'k': 'v',")).join(NL);
  check('F EDIT_SCOPE_MUST_NOT_CROSS_STRUCTURAL_BOUNDARY: a range delete removes the closing brace and a'
    + ' declaration; a line-wise delete does not',
    !/const B = \{/.test(rangeDeleted.slice(0, boundary + 40)) || !rangeDeleted.includes('const B = {')
      ? !rangeDeleted.includes('};' + NL + 'const B = {') && lineWise.includes('const B = {')
        && lineWise.includes('};')
      : false,
    'range-deleted: ' + JSON.stringify(rangeDeleted) + ' | line-wise keeps both objects intact');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('');
console.log('instrument_validity.regression.test: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('');
console.log('QA_CHECK_SUBJECT_WIDER_THAN_INVARIANT is now a named class with a fixture per principle.');
console.log('SYNTAX VALID != INSTRUMENT VALID, and `node --check` is level 1 of six.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
