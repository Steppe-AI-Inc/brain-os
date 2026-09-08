// READS_AS_COMPLETION_DECLARATION_CARRIES_NO_LITERAL_SEMICOLON (V48-D7 / V50-C10 / V53-H1, promoted into the battery)
//
// The belt extractors slice `const readsAsCompletion = …` to its FIRST `;`. A literal `;` anywhere inside the
// declaration — a character class like [—–;], a `let`/`for` inside an IIFE — silently truncates what every
// source-extracting suite evaluates. CONTRACT 5 (v92_open_regression_contract) does NOT see this hazard: it
// guards the OTHER extractor failure (a new top-level const dropped from the named list). Until this file the
// only guards for the `;` shape lived in qa/verification/proposed (v48 D7, v50 C10) — outside the battery.
// Verifier #53's first closure draft proved the gap: run15 crashed, V50-C10 went red, CONTRACT 5 stayed green.
//
// Express a semicolon inside the declaration as ; or \x3b; express a hyphen in a class as \x2d.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);

let pass = 0, fail = 0;
const check = (name, ok, why) => { if (ok) { pass++; console.log('ok    ' + name); } else { fail++; console.log('FAIL  ' + name + (why ? ' — ' + why : '')); } };

const start = lines.findIndex((l) => l.includes('const readsAsCompletion = '));
check('readsAsCompletion declaration is present', start >= 0);
let end = start; while (end >= 0 && end < lines.length && !/;\s*$/.test(lines[end])) end++;
check('declaration has a terminating line', end >= 0 && end < lines.length);
const decl = start >= 0 ? lines.slice(start, end + 1).join('\n').replace(/;\s*$/, '') : '';
const semis = (decl.match(/;/g) || []).length;
check('no literal `;` inside the declaration before its terminator', semis === 0, semis + ' found — extractors would truncate here');

// Non-vacuity: the check must be able to see one. Inject a `;` into a copy of the declaration and re-count.
const injected = decl + '[—–;]';
check('the check can see a literal `;` (non-vacuous)', (injected.match(/;/g) || []).length === 1);

console.log('\nreadsAsCompletion_no_literal_semicolon_contract: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
