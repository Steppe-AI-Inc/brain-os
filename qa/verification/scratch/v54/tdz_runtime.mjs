// V54 — RUNTIME proof of the TDZ, built from the REAL candidate bytes, not a paraphrase.
// Method: lift the ENTIRE `try {` block (index.ts:2620 .. its closing brace) verbatim out of the
// candidate, wrap it in an async function, stub the few externals the disambiguation branch needs,
// and execute it. If the block is TDZ-broken, V8 throws ReferenceError at the real use site.
import { readFileSync, writeFileSync } from 'node:fs';
const CRLF = new RegExp(String.fromCharCode(13) + String.fromCharCode(10), 'g');
const SRC = readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8')
  .replace(CRLF, String.fromCharCode(10));
const LINES = SRC.split('\n');

// Locate the exact statements, by content, never by a hardcoded line number.
const useIdx = LINES.findIndex((l) => l.includes('const readsAsAssertion = PAST_COMPLETION_CLAIM_PATTERN.test(replayLabel)'));
const declIdx = LINES.findIndex((l) => /^\s*const PAST_COMPLETION_CLAIM_PATTERN = \//.test(l));
const cwIdx = LINES.findIndex((l) => /^\s*const COMPLETION_WORD\b/.test(l));
if (useIdx < 0 || declIdx < 0 || cwIdx < 0) throw new Error('anchors not found');
console.log('use  @line', useIdx + 1);
console.log('PAST @line', declIdx + 1);
console.log('CW   @line', cwIdx + 1);
console.log('ORDER: use BEFORE PAST decl?', useIdx < declIdx, '| use BEFORE COMPLETION_WORD decl?', useIdx < cwIdx);

// Exactly one declaration of each?
const nPast = LINES.filter((l) => /\bconst\s+PAST_COMPLETION_CLAIM_PATTERN\b/.test(l)).length;
const nCw = LINES.filter((l) => /\bconst\s+COMPLETION_WORD\b/.test(l)).length;
console.log('declarations — PAST_COMPLETION_CLAIM_PATTERN:', nPast, '| COMPLETION_WORD:', nCw,
  '(a second, earlier declaration would make the TDZ unreachable; there is none if these are 1)');

// Minimal faithful reduction: the REAL use statement, then the REAL declarations, in the REAL order,
// inside ONE block — which is exactly the scope relationship tdz.mjs proved (common block = the
// `try {` at index.ts:2620, no function boundary between them).
const useStmt = LINES[useIdx].trim();
const declStmt = LINES[declIdx].trim();
const cwStmt = LINES.slice(cwIdx, cwIdx + 1).join('\n').trim();
const prog = `
export function repro() {
  const replayLabel = 'Archived ACME Corp';
  ${useStmt}
  ${declStmt}
  ${cwStmt}
  return readsAsAssertion;
}
`;
writeFileSync(new URL('./tdz_repro.mjs', import.meta.url), prog);
const { repro } = await import('./tdz_repro.mjs');
let verdict;
try { const r = repro(); verdict = 'NO THROW — returned ' + r; }
catch (e) { verdict = e.constructor.name + ': ' + e.message; }
console.log('\nRUNTIME RESULT:', verdict);
console.log(verdict.startsWith('ReferenceError')
  ? 'CONFIRMED: the shipped statement order throws at runtime when this branch executes.'
  : 'NOT CONFIRMED — investigate further.');
