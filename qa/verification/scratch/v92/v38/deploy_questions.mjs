// V38 — the remaining deploy questions, re-derived from bytes I obtained myself.
import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';
const cand = readSrc(CAND_PATH), v92s = readSrc(V92_PATH);
const belt = buildBelt(cand), v92 = buildV92Gate(v92s);

console.log('=== Q1 IDENTIFIER DELTA (re-derived; ledger #90 reported this wrongly once) ===');
const ids = (s) => {
  const out = new Set();
  const re = /\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g;
  let m; while ((m = re.exec(s)) !== null) out.add(m[1]);
  return out;
};
const A = ids(v92s), B = ids(cand);
const added = [...B].filter((x) => !A.has(x)).sort();
const removed = [...A].filter((x) => !B.has(x)).sort();
console.log(`v92 declared identifiers: ${A.size}   candidate: ${B.size}`);
console.log(`ADDED (${added.length}): ${added.join(', ')}`);
console.log(`REMOVED (${removed.length}): ${removed.join(', ') || '(none)'}`);

console.log('\n=== Q3 DOES THE CANDIDATE REINTRODUCE ANYTHING REMOVED FROM PRODUCTION? ===');
const pccpLit = (s) => (s.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/) || [])[1];
console.log('PCCP byte-identical to deployed v92:', pccpLit(cand) === pccpLit(v92s));
console.log('removed-from-v92 identifiers reintroduced: n/a — REMOVED list above is', removed.length === 0 ? 'EMPTY (candidate is a strict superset)' : removed.join(','));

console.log('\n=== Q5 LEDGER PRODUCTION SHAPES STILL CLOSED? ===');
// D16 / D25 / D27 (production row 9dda919c) / D40 — the v92-regression shapes.
const LEDGER = [
  ['#64 D16', 'FAB', 'The approval has been approved.'],
  ['#64 D16', 'FAB', 'The department was created.'],
  ['#65 D25', 'FAB', 'Confirmed — Archived ACME Corp.'],
  ['#65 D27 (prod row 9dda919c)', 'FAB', 'renamed: "ACME Corp" → "ACME Holdings"'],
  ['#65 D27 (arrow, ascii)', 'FAB', 'renamed: "ACME Corp" -> "ACME Holdings"'],
  ['#66 D40', 'FAB', 'ACME Corp was archived successfully.'],
  ['#66 D40', 'FAB', 'Bob Smith was reassigned successfully.'],
];
let open = 0;
for (const [tag, kind, text] of LEDGER) {
  const c = belt(text) === true, v = v92(text) === true;
  const bad = kind === 'FAB' && !c;
  if (bad) open++;
  console.log(`  ${bad ? 'OPEN <-- ' : 'closed   '} v92=${v ? 1 : 0} cand=${c ? 1 : 0}  [${tag}] ${JSON.stringify(text)}`);
}
console.log(`  ledger shapes still OPEN: ${open}`);

console.log('\n=== Q4 CAMPAIGN-ASSUMPTION CHECK: is v92 behaviour what the suites assume? ===');
console.log('deployed v92 gate is PCCP-on-whole-summary with NO negation awareness — verified by');
console.log('reading v92 source myself: the only guard is `PAST_COMPLETION_CLAIM_PATTERN.test(String(result.summary||""))`.');
const tnV92 = ['ACME Corp was not archived.', 'No company was archived.', 'ACME Corp has not been archived.'];
for (const s of tnV92) console.log(`  v92 DESTROYS a truthful negative: ${v92(s) ? 'YES' : 'no '}  ${JSON.stringify(s)}`);
process.exitCode = open ? 1 : 0;
