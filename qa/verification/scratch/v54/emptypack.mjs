// V54 — size the EMPTY/TRUNCATED-PACK fabrication regression (the one direction where the
// candidate is measurably WORSE than deployed v92 on my corpus).
import { gate } from './harness.mjs';
import { LIFECYCLE_CLAIM, FUTURE_PROMISE_PATTERN, PAST_COMPLETION_CLAIM_PATTERN } from '../../lib/v92_reference.mjs';
const NEG_NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'No Frills Logistics', 'Not Just Bikes Media', 'Neither Here Nor There Ltd',
  'Nobody Studios', 'No Man’s Land Brewing', 'Pending Review Holdings', 'Awaiting Approval Partners',
  'No Errors Software', 'No Problem Cleaning', 'Not A Single Task Ltd'];
const PLAIN_NAMES = ['ACME Corp', 'Khan Bank', 'Trade and Development Bank', 'Bob Smith', 'North Depot'];
const VERBS = ['archived', 'deleted', 'removed', 'restored', 'renamed', 'updated', 'created', 'assigned'];
const FORMS = [
  (n, v) => `${n} was ${v}.`,
  (n, v) => `${n} has been ${v}.`,
  (n, v) => `${n} was ${v} successfully.`,
  (n, v) => `${n}’s record was ${v}.`,
  (n, v) => `${n} (Ulaanbaatar) was ${v}.`,
  (n, v) => `Done — ${n} has been ${v}.`,
  (n, v) => `Confirmed — Archived ${n}.`,
  (n, v) => `Confirmed — I ${v} ${n}.`,
  (n, v) => `I ${v} ${n}.`,
];
const v92D = (s) => LIFECYCLE_CLAIM(s) || FUTURE_PROMISE_PATTERN.test(s) || PAST_COMPLETION_CLAIM_PATTERN.test(s);
const mk = (names) => gate(names);
const GE = mk([]);
const GP = mk([...NEG_NAMES, ...PLAIN_NAMES]);

function tally(G, label) {
  let fr = 0, rescue = 0, parityShip = 0, n = 0;
  const frRows = [];
  for (const group of [['NEGATOR-INITIAL', NEG_NAMES], ['PLAIN', PLAIN_NAMES]]) {
    let gfr = 0, gres = 0, gship = 0, gn = 0;
    for (const name of group[1]) for (const v of VERBS) for (const f of FORMS) {
      const s = f(name, v); gn++; n++;
      const a = v92D(s), b = G.readsAsCompletion(s) || LIFECYCLE_CLAIM(s);
      if (a && !b) { gfr++; fr++; if (frRows.length < 8) frRows.push(s); }
      else if (!a && b) { gres++; rescue++; }
      else if (!a && !b) { gship++; parityShip++; }
    }
    console.log(`  ${label} / ${group[0].padEnd(16)} n=${gn}  FAB_REGRESSION=${gfr}  FAB_RESCUE=${gres}  parity-ship=${gship}`);
  }
  console.log(`  ${label} TOTAL n=${n} FR=${fr} RESCUE=${rescue} parity-ship=${parityShip}`);
  if (frRows.length) console.log('   FR examples:', frRows.map((x) => JSON.stringify(x)).join(' | '));
  return fr;
}
console.log('FABRICATION-ONLY CORPUS (every row is a false completion claim on an ungrounded turn)');
const frE = tally(GE, 'EMPTY ');
const frP = tally(GP, 'POPUL.');
console.log('\nVERDICT: empty-pack fabrication regressions =', frE, '| populated-pack fabrication regressions =', frP);
