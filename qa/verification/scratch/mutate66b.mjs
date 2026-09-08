import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const SRC = 'supabase/functions/sem-ai-command/index.ts';
const original = readFileSync(SRC);
const ORIG_HASH = createHash('sha256').update(original).digest('hex');
const text = original.toString('utf8');
const MUTS = [
  ['M7  envelope.summary decoupled from result.summary', "summary: result.summary,", "summary: 'DECOUPLED',"],
  ['M8  legacy fallback no longer suppressed by claims', "const legacyProseFallback = !rawClaims", "const legacyProseFallback = true"],
  ['M9  legacy fallback disabled entirely', "const legacyProseFallback = !rawClaims", "const legacyProseFallback = false"],
  ['M25 evidence recorder: restore gate removed', "if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'restore', id, true);", "recordExecution('company', 'restore', id, true);"],
  ['M26 recordExecution accepts empty/undefined ids', "if (typeof id === 'string' && id.length > 0) claimExecutionEvidence.push", "if (true) claimExecutionEvidence.push"],
  ['M27 questions dropped from the corrected summary render', "result.summary = [...supportedLines, ...rejectedLines, ...envelopeQuestions, promptWithOptions]", "result.summary = [...supportedLines, ...rejectedLines]"],
];
const results = [];
for (const [name, from, to] of MUTS) {
  const n = text.split(from).length - 1;
  if (n !== 1) { results.push([name, 'SKIP', 'occurrences=' + n]); continue; }
  writeFileSync(SRC, text.replace(from, to));
  let detected = false, detail = '';
  try { execSync('node qa/scenarios-runner/structured_claim_verification.mjs', { stdio: 'pipe' }); }
  catch (e) { detected = true; const out = (e.stdout||Buffer.from('')).toString()+(e.stderr||Buffer.from('')).toString(); detail = (out.match(/FAIL [^\n]+/g)||['(threw)']).slice(0,2).join(' ; '); }
  writeFileSync(SRC, original);
  if (createHash('sha256').update(readFileSync(SRC)).digest('hex') !== ORIG_HASH) { console.error('FATAL restore ' + name); process.exit(2); }
  results.push([name, detected ? 'DETECTED' : 'UNDETECTED', detail]);
}
for (const [n,s,d] of results) console.log(s.padEnd(11)+n+(d?'   <- '+d.slice(0,110):''));
console.log('\nUNDETECTED: '+results.filter(r=>r[1]==='UNDETECTED').length+' / SKIP '+results.filter(r=>r[1]==='SKIP').length);
console.log('index.ts sha256 restored: '+createHash('sha256').update(readFileSync(SRC)).digest('hex'));
