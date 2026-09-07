// V54 — mutation proof, round 3: MARGINAL contribution of each sub-fix, measured on the family
// that fix exists for, with the anchor asserted before the measurement is trusted.
import { gate } from './harness.mjs';
const NEG = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'No Frills Logistics', 'Not Just Bikes Media', 'Neither Here Nor There Ltd',
  'Nobody Studios', 'Pending Review Holdings', 'Awaiting Approval Partners', 'No Errors Software'];
const PLAIN = ['ACME Corp', 'Khan Bank', 'Trade and Development Bank', 'Bob Smith'];
const NAMES = [...NEG, ...PLAIN];
const V = ['archived', 'deleted', 'removed', 'restored', 'renamed'];

const FAM = {
  NEG_NAME_FAB: [],   // fabrications about a negator-initial name — must be CAUGHT
  NEG_NAME_TRUTH: [], // truthful negatives about the same names — must SURVIVE
  IDIOM_FAB: [],      // reassurance idiom + a real completion — must be CAUGHT
  IDIOM_TRUTH: [],    // reassurance idiom + a denial — must SURVIVE
  AUXGAP_FAB: [],     // aux/participle split by an adverbial — must be CAUGHT
  AUXGAP_TRUTH: [],   // same shape but genuinely negated — must SURVIVE
  PREP_TRUTH: [],     // negator after a preposition — must SURVIVE
};
for (const n of NEG) for (const v of V) {
  FAM.NEG_NAME_FAB.push(`${n} was ${v}.`, `${n} has been ${v}.`, `Confirmed — Archived ${n}.`, `Done — ${n} was ${v}.`);
  FAM.NEG_NAME_TRUTH.push(`${n} was not ${v}.`, `${n} has not been ${v}.`, `No company named ${n} was ${v}.`);
}
for (const n of [...NEG.slice(0, 4), ...PLAIN]) for (const v of V) {
  FAM.IDIOM_FAB.push(`No problem — ${n} was ${v}.`, `No worries, ${n} has been ${v}.`, `Not a problem — I ${v} ${n}.`);
  FAM.IDIOM_TRUTH.push(`No problem — ${n} was not ${v}.`, `No worries, nothing was ${v}.`);
  FAM.AUXGAP_FAB.push(`${n} was, as requested, ${v}.`, `${n} has, at your instruction, been ${v}.`, `${n} was — finally — ${v}.`);
  FAM.AUXGAP_TRUTH.push(`${n} was not, despite the request, ${v}.`, `${n} has not, as of this turn, been ${v}.`);
  FAM.PREP_TRUTH.push(`With no approval, ${n} was not ${v}.`, `Since no confirmation arrived, ${n} was not ${v}.`,
    `Despite no objection, ${n} was not ${v}.`, `Amid no changes, ${n} was not ${v}.`);
}

function mut(label, fn, mustContain) {
  return { label, mustContain, fn };
}
const MUTS = [
  mut('BASELINE', (s) => s, null),
  mut('-nameInternal', (s) => s.replace('const nameInternal = ', 'const nameInternal = false && '), 'const nameInternal = '),
  mut('-titleHead', (s) => s.replace('const titleHead = ', 'const titleHead = false && '), 'const titleHead = '),
  mut('-ppInternal', (s) => s.replace('const ppInternal = ', 'const ppInternal = false && '), 'const ppInternal = '),
  mut('-namePrefixHit(16->0)', (s) => s.replace('__k < 16', '__k < 0'), '__k < 16'),
  mut('-R2(16->8)', (s) => s.replace('__k < 16', '__k < 8'), '__k < 16'),
  mut('-D1 prefix search', (s) => s.replace(/\|\| \(\(__t\) => __t\.split[\s\S]*?\)\)\(c\.slice\(\(__f\.index \?\? 0\) \+ __f\[0\]\.length - String\(__f\[1\]\)\.length\)\)/, ''), '(__t) => __t.split'),
  mut('-idiom strip', (s) => s.replace(/\.replace\(\/\^\\s\*\(\?:\(\?:no problem\|no worries[\s\S]*?\/i, ''\)/, ''), 'no problem|no worries'),
  mut('-R-AUXGAP arm', (s) => s.replace(/String\(s\)\.replace\(new RegExp\('\(\?<!\\\\b\(\?:couldn[\s\S]*?'gi'\), '\$1 '\)/, 'String(s)'), "(?<!\\\\b(?:couldn"),
];

const src0 = gate(NAMES).source;
const header = 'mutation'.padEnd(24) + Object.keys(FAM).map((k) => k.padEnd(16)).join('');
console.log(header);
const baseRow = {};
for (const m of MUTS) {
  if (m.mustContain && !src0.includes(m.mustContain)) { console.log(m.label.padEnd(24) + 'ANCHOR MISSING — mutation would be vacuous'); continue; }
  let G;
  try { G = gate(NAMES, m.fn); } catch (e) { console.log(m.label.padEnd(24) + 'BUILD FAILED: ' + e.message.slice(0, 60)); continue; }
  if (m.label !== 'BASELINE') {
    const s2 = gate(NAMES, m.fn).source;
    if (s2 === src0) { console.log(m.label.padEnd(24) + 'NO SOURCE CHANGE — mutation did not apply'); continue; }
  }
  const cells = [];
  for (const [k, rows] of Object.entries(FAM)) {
    const isFab = k.endsWith('_FAB');
    const wrong = rows.filter((t) => (isFab ? !G.readsAsCompletion(t) : G.readsAsCompletion(t))).length;
    const label = (isFab ? 'shipped ' : 'destroyed ') + wrong + '/' + rows.length;
    if (m.label === 'BASELINE') baseRow[k] = wrong;
    const d = m.label === 'BASELINE' ? '' : (wrong - baseRow[k] === 0 ? ' (=)' : ' (' + (wrong - baseRow[k] > 0 ? '+' : '') + (wrong - baseRow[k]) + ')');
    cells.push((label + d).padEnd(16));
  }
  console.log(m.label.padEnd(24) + cells.join(''));
}
