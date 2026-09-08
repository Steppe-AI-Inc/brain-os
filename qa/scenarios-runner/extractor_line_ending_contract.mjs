#!/usr/bin/env node
// EXTRACTOR LINE-ENDING SAFETY — verifier #64, V64-D4.
//
// stripTS normalised only \r\n. A BARE CR is also a JavaScript line terminator, so a full-line comment
// followed by a bare CR swallowed the code after it and the whole line vanished — silently, with no error:
//
//     stripTS('// a comment\r\nconst x = 1;')   ->  'const x = 1;'
//     stripTS('// a comment\rconst x = 1;')     ->  ''            <-- the code is gone
//
// Every behavioural harness in this repo executes windows through stripTS, so the failure mode was "the
// window you meant to execute is quietly not in the window". That is the fail-open class again, this time
// inside the tool the whole battery depends on.
//
// index.ts ALREADY CONTAINS ONE BARE CR (~offset 554,776). It is harmless today because it joins a comment
// line to another comment line — but the CRLF purity gate counts bare LF and never looked for bare CR, so
// nothing would have noticed had it landed one line earlier.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');

let pass = 0; const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
};

// 1. The defect itself, executed. A comment must never eat the code after ANY line terminator.
for (const [label, text] of [
  ['CRLF', '// a comment\r\nconst x = 1;\r\n'],
  ['bare CR', '// a comment\rconst x = 1;\r\n'],
  ['bare LF', '// a comment\nconst x = 1;\n'],
  ['CR CR', '// one\r// two\rconst x = 1;\r\n'],
]) {
  const out = stripTS(text);
  check('a full-line comment does not swallow the code after it (' + label + ')',
    /const x = 1;/.test(out), JSON.stringify(out));
}

// 2. Real windows survive a bare CR anywhere in them.
{
  const withCR = 'const a = 1;\r// note\rconst b = a + 1;\r\nconst c = b;';
  const out = stripTS(withCR);
  check('every statement survives when bare CRs separate them',
    /const a = 1;/.test(out) && /const b = a \+ 1;/.test(out) && /const c = b;/.test(out),
    JSON.stringify(out));
}

// 3. Line-ending purity of the deploy surface, both directions. The existing gate counts bare LF; a bare CR
//    is just as much a line terminator and was never counted.
{
  const raw = readFileSync(SRC, 'utf8');
  const bareLF = (raw.match(/(^|[^\r])\n/g) || []).length;
  const bareCR = (raw.match(/\r(?!\n)/g) || []).length;
  check('index.ts has no bare LF', bareLF === 0, bareLF + ' found');
  // Recorded, not yet enforced: the one bare CR in the source is inside a comment block and harmless, and
  // removing it is a deploy-surface byte change that must wait for a source window rather than be smuggled
  // in beside a harness fix. This row states the real number so it cannot grow unnoticed.
  check('index.ts bare-CR count has not grown beyond the one known occurrence',
    bareCR <= 1, bareCR + ' found; the known one is a comment-to-comment join at ~offset 554776');
  if (bareCR === 1) console.log('     NOTE: 1 known bare CR remains in index.ts, registered for the next source window');
}

console.log(`\nextractor_line_ending_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
