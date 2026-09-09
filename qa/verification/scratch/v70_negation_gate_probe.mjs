// VERIFIER #70 — executes the REAL negation gate (Codex finding A) sliced from index.ts.
// Three properties are measured separately: PREDICATE, APPLIED, OVER-FIRE.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || path.resolve(here, '../../../supabase/functions/sem-ai-command/index.ts');
const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

// Slice from `const requestIsNegated` through the end of the `if (requestIsNegated ...)` block.
const start = src.indexOf('const requestIsNegated = (() => {');
if (start < 0) throw new Error('negation gate not found');
const ifIdx = src.indexOf('if (requestIsNegated && result', start);
if (ifIdx < 0) throw new Error('negation gate application not found');
let depth = 0, end = -1;
for (let k = src.indexOf('{', ifIdx); k < src.length; k++) {
  if (src[k] === '{') depth++;
  else if (src[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
}
const slice = stripTS(src.slice(start, end));

const harness = `
return (function(command, result){
  const supabase = { from: () => ({ insert: () => ({ catch: () => {} }) }) };
  const profile = { id: 'p', role: 'founder' };
  const workOrderId = 'wo';
  ${slice.replace(/await /g, '')}
  return { requestIsNegated, stripped: negatedRequestStrippedFields, result };
});`;
const run = new Function(harness)();

const CASES = [
  // [command, model reply fields, expected requestIsNegated, why]
  ['do not archive ACME', { archiveCompanyNames: ['ACME'] }, true, 'PREDICATE: plain leading negation'],
  ["don't archive ACME", { archiveCompanyNames: ['ACME'] }, true, 'PREDICATE: contraction'],
  ['dont archive ACME', { archiveCompanyNames: ['ACME'] }, true, 'PREDICATE: no apostrophe'],
  ['never delete the Sales department', { archiveCompanyIds: ['x'] }, true, 'PREDICATE: never'],
  ['no need to restore Beta', { restoreCompanyNames: ['Beta'] }, true, 'PREDICATE: no need to'],
  ['please do not assign task QA-1 to Bob', { tasks: [{ t: 1 }] }, true, 'PREDICATE: assignment'],
  ['do not delete the channel', { deleteChannelIds: ['c'] }, true, 'PREDICATE: deletion'],
  ['do not approve that request', { deleteApprovalIds: ['a'] }, true, 'PREDICATE: approvals'],
  ['do not activate the openai provider', { activateAiProviderId: 'ai-1' }, true, 'PREDICATE: provider activation (scalar)'],
  ['we should not archive ACME yet', { archiveCompanyNames: ['ACME'] }, true, 'PREDICATE: should not + adverb'],
  ['I do not want you to archive ACME', { archiveCompanyNames: ['ACME'] }, true, 'PREDICATE: negation mid-sentence, 3 words'],
  // OVER-FIRE probes
  ['archive ACME, but do not delete it', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: mixed turn WITH comma must still archive'],
  ['archive ACME but do not delete it', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: mixed turn WITHOUT comma must still archive'],
  ['archive ACME and do not delete it', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: mixed turn with "and"'],
  ['archive ACME rather than delete Beta', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: "rather than" is a contrast, the archive was requested'],
  ['archive ACME instead of deleting it', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: "instead of" contrast'],
  ['restore Beta without any delay', { restoreCompanyNames: ['Beta'] }, false, 'OVER-FIRE: "without" as an adverbial'],
  ['create a report without the update', { createDocuments: [{ d: 1 }] }, false, 'OVER-FIRE: "without the update" is not a refusal'],
  ['archive ACME; do not delete it', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: semicolon'],
  ['Archive ACME. Do not delete it.', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: sentence boundary (period)'],
  ['archive ACME - do not delete it', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: hyphen separator'],
  ['stop the clock and archive ACME', { archiveCompanyNames: ['ACME'] }, false, 'OVER-FIRE: "stop" as a verb'],
  ['archive ACME', { archiveCompanyNames: ['ACME'] }, false, 'CONTROL: plain request'],
];

let pass = 0, fail = 0;
const failures = [];
for (const [cmd, fields, expect, why] of CASES) {
  const r = run(cmd, JSON.parse(JSON.stringify(fields)));
  const ok = r.requestIsNegated === expect;
  if (ok) pass++; else { fail++; failures.push({ cmd, why, expect, got: r.requestIsNegated, stripped: r.stripped }); }
  console.log(`${ok ? 'OK  ' : 'FAIL'}  negated=${String(r.requestIsNegated).padEnd(5)} stripped=[${r.stripped.join(',')}]  ${why}\n        "${cmd}"`);
}
console.log(`\nnegation gate probe: ${pass} passed, ${fail} failed`);
for (const f of failures) console.log(`   FAILED  "${f.cmd}"  expected ${f.expect}, got ${f.got}  (${f.why})`);
