// V47-D3 PREPARED FIX (NOT applied — index.ts must stay byte-identical in this worktree).
// Writes a patched copy to qa/verification/scratch/v47/index.ordfix.ts.
//
// DEFECT. matchDisambiguationOption's ordinal path takes the FIRST ordinal reference and then
// computes `rest` by GLOBALLY stripping every ordinal token. A reply naming TWO options —
// "option 1, option 2", "number 1 number 2", "#1 #2" — therefore reads as "ordinal-only" and
// binds the FIRST option, arming archiveCompanyIds with the wrong company and no LLM in the
// loop. Deployed v92 has no ordinal path and dead-ends safely. Same severity class as
// run14/D106 ("Every earlier defect in this family could only DEAD-END; this one archives the
// wrong company").
//
// FIX. Collect EVERY ordinal reference. More than one distinct ordinal is a genuinely ambiguous
// reply: dead-end to the LLM, exactly as D136's `ambiguousWithAName` already does. Fail closed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const IDX = path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const src = fs.readFileSync(IDX, 'utf8');
const NL = src.includes('\r\n') ? '\r\n' : '\n';
const L = (a) => a.join(NL);

const A = '  if (ordN >= 1) {';
const B = '    if (rest.every((w) => ORD_FILLER.has(w))) {';
if (src.indexOf(A) < 0 || src.indexOf(B) < 0) throw new Error('v47: ordinal-path anchors not found');
if (src.split(A).length !== 2 || src.split(B).length !== 2) throw new Error('v47: ordinal-path anchors not unique');

const A2 = L([
  '  // V47-D3 (P1): the ordinal reference above is the FIRST one, and `rest` below strips EVERY',
  '  // ordinal token globally — so "option 1, option 2" read as ordinal-ONLY and bound option 1,',
  '  // arming a destructive field for a reply that names two options. Deployed v92 has no ordinal',
  '  // path and dead-ends. Collect every ordinal reference; more than one distinct ordinal is',
  '  // ambiguous and dead-ends to the LLM, exactly as D136 already does. Fail closed.',
  // NOTE: no `<number>` type argument. The QA harnesses strip TypeScript with regexes that do',
  // not understand generic type arguments, and `new Set<number>()` takes NINE suites to a',
  // SyntaxError — measured, not assumed. An inferred Set is identical at runtime.',
  '  const ordAll = new Set();',
  '  for (const m of normalizedCommand.matchAll(/\\b(?:option|number)\\s*#?(\\d+)\\b/g)) ordAll.add(parseInt(m[1], 10));',
  '  for (const m of normalizedCommand.matchAll(/(?:^|\\s)#\\s*(\\d+)\\b/g)) ordAll.add(parseInt(m[1], 10));',
  '  if (/^\\s*\\d+\\s*$/.test(normalizedCommand)) ordAll.add(parseInt(normalizedCommand.trim(), 10));',
  '  for (let oi = 0; oi < ORDINAL_WORDS.length; oi++) {',
  '    if (new RegExp(\'\\\\b\' + ORDINAL_WORDS[oi] + \'\\\\b\').test(normalizedCommand)) ordAll.add(oi + 1);',
  '  }',
  '  if (ordN >= 1) {',
]);
const B2 = '    if (rest.every((w) => ORD_FILLER.has(w)) && ordAll.size <= 1) {';

const out = src.replace(A, A2).replace(B, B2);
if (out === src) throw new Error('v47: patch was a no-op');
const dst = path.join(HERE, 'index.ordfix.ts');
fs.writeFileSync(dst, out);
console.log('wrote', dst, '(' + out.length + ' bytes; source ' + src.length + ')');
console.log('source index.ts unchanged on disk:', fs.readFileSync(IDX, 'utf8') === src);
