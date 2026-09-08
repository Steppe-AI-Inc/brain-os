// Build the V38 prepared fix WITHOUT shell escaping (a -e one-liner silently ate a
// backslash and produced a fix that only LOOKED sentence-local — caught in review).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(HERE, 'index.fixed2.ts');

const ANCHOR = 'const readsAsCompletion = (s) => REFERENCELESS_CONFIRMATION.test(s)';
// sentence splitter: a real \s+ after sentence punctuation
const SPLIT = String.raw`/(?<=[.!?])\s+/`;
const HEDGE = String.raw`/\b(?:may|might|could|can|would|should)\b(?:\s+\w+){0,4}\s+(?:have|has|had)\s+been\b|\b(?:could|would|should|wo)n['’]?t\b/i`;
const BACKSTOP = `String(s).split(${SPLIT}).some((q) => LEGACY_PAST_COMPLETION.test(q) && !NEGATED_CLAUSE.test(q) && !${HEDGE}.test(q))`;
const REPL = `const readsAsCompletion = (s) => ${BACKSTOP} || REFERENCELESS_CONFIRMATION.test(s)`;

const src = readFileSync(REAL, 'utf8');
if (!src.includes(ANCHOR)) throw new Error('anchor missing');
const out = src.split(ANCHOR).join(REPL);
writeFileSync(OUT, out);

// self-checks that the escaping actually survived
const i = out.indexOf('const readsAsCompletion = ');
const stmt = out.slice(i, out.indexOf(';\r\n', i) + 1);
console.log('written:', OUT);
console.log('statement length:', stmt.length, ' run14 headroom vs 4000:', 4000 - stmt.length);
console.log('contains real \\s+ splitter :', out.includes(String.raw`split(/(?<=[.!?])\s+/)`));
console.log('contains forbidden D177 literal:', out.includes('!NEGATED_CLAUSE.test(String(s))'));
// prove the splitter actually splits
const probe = 'ACME was archived. Nothing else was touched.';
console.log('splitter yields', probe.split(/(?<=[.!?])\s+/).length, 'sentences (must be 2)');
writeFileSync(resolve(HERE, '../../proposed/v38_prepared_fix.patch'),
  'V38-FIX-1 — v92 parity backstop (sentence-local).\n' +
  'File: supabase/functions/sem-ai-command/index.ts\n\n' +
  'REPLACE the literal:\n  ' + ANCHOR + '\n\nWITH:\n  ' + REPL + '\n\n' +
  '(the remainder of the readsAsCompletion expression is unchanged)\n\n' +
  'Rebuild/verify with: node qa/verification/scratch/v38/build_fix.mjs\n');
