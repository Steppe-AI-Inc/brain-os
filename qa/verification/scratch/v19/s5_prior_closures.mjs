// SCENARIO 5 — no prior closure reopened, re-derived independently (not by trusting the
// committed suites). Drives the REAL gate for the D119/D124/D126 option gate and the REAL
// belt for D112/D117/D118, and re-states which contracts hold vs which CLASSES hold.
import { buildGate } from './gate.mjs';
import { loadBelt, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';
const src = loadFile(fileURLToPath(INDEX_PATH));
const gate = buildGate(src);
const belt = loadBelt(src).readsAsCompletion;
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';

const run = (options, contextPack) => {
  const r = gate({
    summary: 'Which one did you mean?', command: 'archive acme', grounded: false,
    pendingAction: { kind: 'disambiguation', question: 'Which one did you mean?', options },
    contextPack: contextPack || {},
  });
  return r;
};
const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
const PACK = { companies: [{ id: A, name: 'ACME Holdings' }, { id: B, name: 'Beta Corp' }] };

console.log('=== D119/D124/D126 option gate, driven through the REAL gate slice ===');
const cases = [
  ['both canonical, real labels', [opt(A, 'ACME Holdings'), opt(B, 'Beta Corp')], PACK],
  ['assertion label + canonical id', [opt(A, 'Now removing ACME.'), opt(B, 'Beta Corp')], PACK],
  ['unresolvable id', [opt('33333333-3333-3333-3333-333333333333', 'Ghost Co')], PACK],
  ['prototype entityType', [opt(A, 'ACME Holdings', 'constructor'), opt(B, 'Beta Corp')], PACK],
  ['prototype entityType __proto__', [opt(A, 'ACME Holdings', '__proto__')], PACK],
  ['prototype actionType', [opt(A, 'ACME Holdings', 'company', 'constructor'), opt(B, 'Beta Corp')], PACK],
  ['employee alias', [opt(A, 'Bob Smith', 'employee')], { people: [{ id: A, full_name: 'Bob Smith' }] }],
];
for (const [name, options, pack] of cases) {
  let r;
  try { r = run(options, pack); } catch (e) { console.log('  ' + name.padEnd(32) + 'THREW ' + e.message); continue; }
  const pa = r.summary;
  console.log('  ' + name.padEnd(32) + 'summary=' + JSON.stringify(String(pa)).slice(0, 110));
}

console.log('\n=== D112 / D117 / D118 — the committed CONTRACT strings, re-run independently ===');
const contracts = [
  [false, 'Confirmed — the company is not archived.', 'D112/D117'],
  [false, 'Confirmed — you have 3 archived companies.', 'D112/D117'],
  [false, 'Confirmed — the archived list is empty.', 'D112'],
  [true, 'Confirmed — Archived ACME.', 'D117 base shape'],
  [true, 'ACME has been archived.', 'D118'],
  [true, 'The company was restored successfully.', 'D118'],
  [true, 'The task has been completed.', 'D118'],
  [false, 'no company was archived', 'D118 truthful negative'],
  [true, 'Confirmed — Archived ACME. No further action needed.', 'D117 — later-sentence negator must NOT disarm'],
];
let bad = 0;
for (const [exp, s, tag] of contracts) {
  const got = belt(s);
  if (got !== exp) bad++;
  console.log('  ' + (got === exp ? 'HOLDS ' : 'BROKEN') + ' [' + tag + '] ' + JSON.stringify(s) + ' -> ' + got);
}
console.log('  contracts broken: ' + bad);

console.log('\n=== the same CLASS, one clause further out (what no committed case observes) ===');
for (const s of ['Confirmed — I checked, nothing was archived.',
  'Confirmed — the company exists, but it is not archived.',
  'Confirmed — I counted them, you have 3 archived companies.',
  'Confirmed — the list loaded, the archived list is empty.'])
  console.log('  ' + (belt(s) ? 'DESTROYED' : 'survives ') + ' ' + JSON.stringify(s));
