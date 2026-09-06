// VERIFIER #41 — E2E arm check with a real actionType on each option (probe5's options
// carried none, so `field` was always undefined and the arm check was vacuous — recorded
// here rather than quietly dropped).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDecide } from '../../lib/belt_extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const V92 = path.join(HERE, 'v92.lf.ts');
const dC = buildDecide(CAND);
let dV = null;
try { dV = buildDecide(V92); } catch (e) { console.log('NOTE: v92 decide() not buildable (' + e.message + ') — v92 comparison for the matcher is in probe5; this file measures the candidate only.'); }
const OPTS = [
  { id: 'c1', label: 'ACME Holdings', entityType: 'company', actionType: 'archive' },
  { id: 'c2', label: 'ACME Group', entityType: 'company', actionType: 'archive' },
  { id: 'c3', label: 'No Limits Inc', entityType: 'company', actionType: 'archive' },
];
const CASES = [
  ['acme holdings', 'MUST ARM c1 (ordinary selection still frictionless)'],
  ['no limits inc', 'MUST ARM c3 (negator-token NAME still selectable)'],
  ['option 1', 'MUST ARM c1 (D133 ordinal)'],
  ["don't archive acme holdings", 'MUST NOT ARM (D116)'],
  ['not acme holdings, the other one', 'MUST NOT ARM (D116)'],
  ['exclude acme holdings', 'MUST NOT ARM (D123)'],
  ['acme holdings, no', 'MUST NOT ARM (D123)'],
  ['no option 2', 'MUST NOT ARM (D135)'],
  ['activate acme holdings', 'MUST NOT ARM (D127 contradiction)'],
  ['acme', 'MUST NOT ARM (ambiguous)'],
];
let bad = 0;
for (const [reply, why] of CASES) {
  const c = dC(reply, OPTS), v = dV ? dV(reply, OPTS) : { armed: 'n/a' };
  const mustArm = why.startsWith('MUST ARM');
  const ok = mustArm ? !!c.armed : !c.armed;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(reply).padEnd(34)} cand.armed=${String(c.armed).padEnd(18)} v92.armed=${String(v.armed).padEnd(18)} ${why}`);
  if (c.summary) console.log(`         cand.summary=${JSON.stringify(c.summary)}`);
}
console.log(`\n  E2E arm check: ${CASES.length - bad}/${CASES.length} correct on the candidate`);
