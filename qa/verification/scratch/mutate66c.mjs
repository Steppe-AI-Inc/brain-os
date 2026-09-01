import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const SRC = 'supabase/functions/sem-ai-command/index.ts';
const original = readFileSync(SRC);
const H = createHash('sha256').update(original).digest('hex');
const text = original.toString('utf8');
const SUITE = 'qa/scenarios-runner/structured_claim_laundering_contract.mjs';
const MUTS = [
  ['legacy fallback no longer suppressed by claims', "const legacyProseFallback = !rawClaims", "const legacyProseFallback = true"],
  ['legacy fallback disabled entirely', "const legacyProseFallback = !rawClaims", "const legacyProseFallback = false"],
  ['action matching removed', "if (action && !actions.has(action)) return { verdict: 'unsupported', reason: 'executed ' + [...actions].join('/') + ' on this resource, not ' + action };", ""],
  ['exact-id matching removed', "const key = resourceType + '|' + resourceId;", "const key = resourceType + '|' + 'ANY';"],
  ['postcondition requirement removed', "if (!e.postconditionPassed) continue;", ""],
  ['absent canonical row -> supported', "if (!row) return { verdict: 'unknown', reason: 'resource not present in this turn’s canonical read' };", "if (!row) return { verdict: 'supported', reason: 'x' };"],
  ['unrecognised claim type -> supported', "return { verdict: 'unknown', reason: 'unrecognised claim type: ' + (type || '(none)') };", "return { verdict: 'supported', reason: 'x' };"],
  ['envelope.summary decoupled', "summary: result.summary,", "summary: 'DECOUPLED',"],
  ['non-object claims not skipped', "if (!claim || typeof claim !== 'object') continue;", "if (false) continue;"],
  ['rejected verdicts not routed', "else if (outcome.verdict === 'unsupported' || outcome.verdict === 'contradicted') rejectedClaims.push(row);", "else if (false) rejectedClaims.push(row);"],
];
for (const [name, from, to] of MUTS) {
  const n = text.split(from).length - 1;
  if (n !== 1) { console.log('SKIP       ' + name + ' (occurrences=' + n + ')'); continue; }
  writeFileSync(SRC, text.replace(from, to));
  let det = false, d = '';
  try { execSync('node ' + SUITE, { stdio: 'pipe' }); }
  catch (e) { det = true; const o = (e.stdout||Buffer.from('')).toString(); d = (o.match(/DRIFT [^\n]+/g)||['(threw)']).slice(0,2).join(' ; '); }
  writeFileSync(SRC, original);
  if (createHash('sha256').update(readFileSync(SRC)).digest('hex') !== H) { console.error('FATAL restore'); process.exit(2); }
  console.log((det ? 'DETECTED   ' : 'UNDETECTED ') + name + (d ? '  <- ' + d.slice(0,100) : ''));
}
console.log('index.ts sha256 restored: ' + createHash('sha256').update(readFileSync(SRC)).digest('hex'));
