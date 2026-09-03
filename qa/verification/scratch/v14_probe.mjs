import { build, ACME, ID2, ID3, M } from './v14_lib.mjs';
const { run, matchFn, replayFn } = build();

const Q = (q) => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).questions[0] ?? null;
const corrected = (s) => run({ summary: s }).corrected === true;
const label = (l, ctxName, id = ACME) => run({ summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: l, id, entityType: 'company' }] },
  context: ctxName ? { companies: [{ id: ACME, name: ctxName }] } : {} }).envelope?.pendingAction?.options?.[0]?.label;
const labels = (opts, context = {}, names = {}) => run({ summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: opts }, context, names })
  .envelope?.pendingAction?.options?.map((o) => o.label);

console.log('--- smoke: harness executes the real slice ---');
console.log('Q("Which archived company did you mean?") =', JSON.stringify(Q('Which archived company did you mean?')));
console.log('Q("I archived ACME ok?") =', JSON.stringify(Q('I archived ACME ok?')));
console.log('corrected("Confirmed — Restored Bob Smith.") =', corrected('Confirmed — Restored Bob Smith.'));
console.log('corrected("Confirmed — the company (option 1).") =', corrected('Confirmed — the company (option 1).'));
console.log('label("Restored Bob Smith","ACME Holdings") =', JSON.stringify(label('Restored Bob Smith', 'ACME Holdings')));
console.log('label("Closed Loop Systems","Closed Loop Systems") =', JSON.stringify(label('Closed Loop Systems', 'Closed Loop Systems')));
console.log('replay("Restored Bob Smith") =', JSON.stringify(replayFn({ label: 'Restored Bob Smith' })));
console.log('replay("ACME Holdings") =', JSON.stringify(replayFn({ label: 'ACME Holdings' })));

console.log('\n--- D102 MIS-BINDING PROBE (substring + apostrophe) ---');
const probes = [
  ['smiths bakery', [{ label: 'Smith', id: ACME, entityType: 'company' }, { label: "Smith's Bakery", id: ID2, entityType: 'company' }]],
  ['founders fund', [{ label: 'Fund', id: ACME, entityType: 'company' }, { label: "Founders' Fund", id: ID2, entityType: 'company' }]],
  ['founders fund', [{ label: 'Founders Fund', id: ACME, entityType: 'company' }, { label: "Founders' Fund", id: ID2, entityType: 'company' }]],
  ['acme holdings', [{ label: 'Acme', id: ACME, entityType: 'company' }, { label: 'Acme Holdings', id: ID2, entityType: 'company' }]],
  ["smith's bakery", [{ label: 'Smith', id: ACME, entityType: 'company' }, { label: "Smith's Bakery", id: ID2, entityType: 'company' }]],
];
for (const [cmd, opts] of probes) {
  const r = matchFn(cmd, opts);
  console.log(`cmd=${JSON.stringify(cmd)} -> ${r ? r.label + ' / ' + r.id.slice(0, 8) : 'null'}`);
}
