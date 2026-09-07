// VERIFIER #52 — matchDisambiguationOption differential, candidate vs v92, on my own >= 25 shapes.
import * as H from './harness.mjs';
const cand = H.matcherFor(H.SRC);
const v92 = H.matcherFor(H.V92);
const OPTS = [
  { id: 'c1', label: 'Khan Bank', entityType: 'company', actionType: 'archive' },
  { id: 'c2', label: 'Khan Bank Leasing', entityType: 'company', actionType: 'archive' },
  { id: 'c3', label: 'Advanced Closed Systems', entityType: 'company', actionType: 'archive' },
];
const OPTS2 = [
  { id: 'p1', label: 'Bold Munkhbat', entityType: 'person', actionType: 'end_employment' },
  { id: 'p2', label: 'Bold Munkhbat (Erdenet)', entityType: 'person', actionType: 'end_employment' },
];
const SHAPES = [
  ['Khan Bank', OPTS, 'c1', 'exact label'],
  ['khan bank', OPTS, 'c1', 'lowercase exact'],
  ['“Khan Bank”', OPTS, 'c1', 'quoted label'],
  ['Khan Bank Leasing', OPTS, 'c2', 'longer exact label'],
  ['option 2', OPTS, 'c2', 'ordinal option N'],
  ['#3', OPTS, 'c3', 'ordinal #N'],
  ['2', OPTS, 'c2', 'bare number'],
  ['the second one', OPTS, 'c2', 'ordinal word'],
  ['the first', OPTS, 'c1', 'ordinal word short'],
  ['number 3', OPTS, 'c3', 'number N'],
  ['not the second one', OPTS, null, 'negated ordinal must dead-end'],
  ['neither', OPTS, null, 'neither must dead-end'],
  ['none of them', OPTS, null, 'none must dead-end'],
  ['not Khan Bank', OPTS, null, 'negated name must dead-end'],
  ['Khan Bank, not the leasing one', OPTS, 'c1', 'name + exclusion of the other'],
  ['archive Khan Bank', OPTS, 'c1', 'verb + name'],
  ['restore Khan Bank', OPTS, null, 'opposite-family verb should dead-end (contradiction handled elsewhere)'],
  ['Khan Bank and Khan Bank Leasing', OPTS, null, 'two names — ambiguous, must dead-end'],
  ['yes', OPTS, null, 'bare yes is not a selection'],
  ['the bank', OPTS, null, 'generic noun, no bind'],
  ['Advanced Closed Systems', OPTS, 'c3', 'assertion-shaped real name'],
  ['advanced closed systems', OPTS, 'c3', 'assertion-shaped real name lowercase'],
  ['the one in Erdenet', OPTS2, 'p2', 'parenthetical qualifier'],
  ['Bold Munkhbat', OPTS2, 'p1', 'exact person label with a longer sibling'],
  ['bold', OPTS2, null, 'first-name fragment shared by both — ambiguous'],
  ['option 1', OPTS2, 'p1', 'ordinal on person options'],
  ['first one, the plain Bold Munkhbat', OPTS2, 'p1', 'ordinal + name agree'],
  ['second — no wait, the first', OPTS2, null, 'self-correction naming two ordinals must dead-end'],
  ['Khan Bank was archived', OPTS, 'c1', 'assertion containing the label (matcher binds; truth handled elsewhere)'],
  ['delete option 2', OPTS, 'c2', 'verb + ordinal'],
];
let same = 0, differ = 0, asIntended = 0;
const lines = [];
for (const [cmd, opts, expect, desc] of SHAPES) {
  const c = cand(cmd, opts), v = v92(cmd, opts);
  const cid = c ? c.id : null, vid = v ? v.id : null;
  if (cid === vid) same++; else differ++;
  const ok = cid === expect; if (ok) asIntended++;
  lines.push(`${ok ? 'OK  ' : 'DIFF'} ${cid === vid ? 'parity ' : 'DELTA  '} cmd=${JSON.stringify(cmd).padEnd(44)} cand=${String(cid).padEnd(5)} v92=${String(vid).padEnd(5)} expect=${String(expect).padEnd(5)} — ${desc}`);
}
console.log(lines.join('\n'));
console.log(`\nshapes=${SHAPES.length} candidate-as-intended=${asIntended} parity-with-v92=${same} delta=${differ}`);
