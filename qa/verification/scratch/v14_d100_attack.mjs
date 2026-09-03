import { build, ACME, ID2, ID3 } from './v14_lib.mjs';
const { run } = build();

// options -> rendered labels, with full control over the canonical read AND the
// lifecycle/runtime name maps displayName also consults.
const render = (opts, context = {}, names = {}) => run({ summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: opts }, context, names })
  .envelope?.pendingAction?.options?.map((o) => o.label);
const O = (label, id = ACME) => ({ label, id, entityType: 'company', actionType: 'archive' });
const CTX = (rows) => ({ companies: rows });

const T = [];
const t = (name, fn) => T.push([name, fn]);

// 1. fabricated label matching a canonical name belonging to a DIFFERENT id
t('1. label matches ANOTHER id\'s canonical name', () => {
  const r = render([O('Restored Bob Smith', ACME), O('Beta', ID2)],
    CTX([{ id: ACME, name: 'ACME Holdings' }, { id: ID2, name: 'Restored Bob Smith' }]));
  return { got: r, leaked: r[0] === 'Restored Bob Smith' };
});

// 2. id absent from the canonical read entirely
t('2. id ABSENT from the canonical read', () => {
  const r = render([O('Completed Migration', ID3)], CTX([{ id: ACME, name: 'ACME Holdings' }]));
  return { got: r, leaked: r[0] === 'Completed Migration' };
});

// 3. empty canonical read
t('3. EMPTY canonical read', () => {
  const r = render([O('Restored Three Companies', ACME)], {});
  return { got: r, leaked: r[0] === 'Restored Three Companies' };
});

// 4. canonical name that is itself completion-shaped (the legitimate case)
t('4. canonical name IS completion-shaped (must survive)', () => {
  const r = render([O('Closed Loop Systems', ACME)], CTX([{ id: ACME, name: 'Closed Loop Systems' }]));
  return { got: r, ok: r[0] === 'Closed Loop Systems' };
});

// 5. case variants
t('5. case variant of the canonical name', () => {
  const r = render([O('closed loop SYSTEMS', ACME)], CTX([{ id: ACME, name: 'Closed Loop Systems' }]));
  return { got: r, note: 'bare() lowercases, so a case variant corroborates and ships the MODEL casing' };
});

// 6. whitespace variants (bare() does NOT collapse internal whitespace; labelKey does)
t('6. internal double-space variant', () => {
  const r = render([O('Closed  Loop  Systems', ACME)], CTX([{ id: ACME, name: 'Closed Loop Systems' }]));
  return { got: r, note: 'safe direction if it falls back to the canonical name' };
});

// 7. unicode confusable (Cyrillic С in "Сlosed") — bypasses COMPLETION_WORD entirely
t('7. unicode confusable defeats COMPLETION_WORD, so no corroboration runs', () => {
  const r = render([O('Сlosed Loop Systems', ACME), O('Рestored Bob Smith', ID2)],
    CTX([{ id: ACME, name: 'ACME Holdings' }, { id: ID2, name: 'Beta Co' }]));
  return { got: r, leaked: r[0] !== 'ACME Holdings' || r[1] !== 'Beta Co' };
});

// 8. completion vocabulary OUTSIDE COMPLETION_WORD's list — no corroboration runs
t('8. out-of-vocabulary completion words bypass corroboration', () => {
  const r = render([O('Terminated Bob Smith', ACME), O('Wiped All Data', ID2), O('Revoked Access', ID3)],
    CTX([{ id: ACME, name: 'ACME Holdings' }, { id: ID2, name: 'Beta Co' }, { id: ID3, name: 'Gamma Co' }]));
  return { got: r, leaked: r.some((l, i) => l === ['Terminated Bob Smith', 'Wiped All Data', 'Revoked Access'][i]) };
});

// 9. THE BIG ONE — displayName falls back to lastKnownLabel, which reads runtimeLabels,
//    a MODEL-AUTHORED map (labels captured from result.* request fields at write sites).
//    If corroboration can be satisfied by that, "the DATABASE agrees" is not what is tested.
t('9. corroboration satisfied by the MODEL-WRITABLE runtime label map (no DB row at all)', () => {
  const r = render([O('Restored Bob Smith', ID3)], {}, { runtime: { ['company|' + ID3]: 'Restored Bob Smith' } });
  return { got: r, leaked: r[0] === 'Restored Bob Smith' };
});
t('9b. corroboration satisfied by companyNameById (lifecycle map, not this turn\'s canonical read)', () => {
  const r = render([O('Completed Migration', ID3)], {}, { companies: { [ID3]: 'Completed Migration' } });
  return { got: r, leaked: r[0] === 'Completed Migration' };
});

// 10. entityType lies: the label corroborates under a DIFFERENT type bucket
t('10. entityType mismatch (option says company, canonical row is a task)', () => {
  const r = run({ summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?',
    options: [{ label: 'Completed Migration', id: ACME, entityType: 'company', actionType: 'archive' }] },
    context: { tasks: [{ id: ACME, title: 'Completed Migration' }] } })
    .envelope?.pendingAction?.options?.map((o) => o.label);
  return { got: r, leaked: r[0] === 'Completed Migration' };
});

// 11. quote-wrapping: bare() strips quotes on BOTH sides
t('11. model wraps its fabricated label in quotes', () => {
  const r = render([O('“Restored Bob Smith”', ACME)], CTX([{ id: ACME, name: 'ACME Holdings' }]));
  return { got: r, leaked: /Restored Bob Smith/.test(r[0]) };
});

// 12. trailing punctuation stripped by safeOptionLabel before corroboration
t('12. canonical name + trailing period', () => {
  const r = render([O('Closed Loop Systems.', ACME)], CTX([{ id: ACME, name: 'Closed Loop Systems' }]));
  return { got: r, ok: r[0] === 'Closed Loop Systems' };
});

for (const [name, fn] of T) {
  let out; try { out = fn(); } catch (e) { out = { THREW: e.message }; }
  const flag = out.leaked === true ? 'LEAK ' : (out.ok === false ? 'BROKE' : '     ');
  console.log(`${flag} ${name}\n        -> ${JSON.stringify(out.got)}${out.note ? '\n        note: ' + out.note : ''}`);
}
