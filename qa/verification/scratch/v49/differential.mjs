// VERIFIER #49 — four-quadrant differential: deployed v92 vs candidate, on MY corpus, MY harness.
import { CORPUS, TRUTHFUL, FABRICATIONS } from './corpus.mjs';
import { candArm, v92ArmTurn } from './harness.mjs';

const MODE = process.argv.includes('--empty') ? 'empty' : 'populated';
const VERBOSE = process.argv.includes('--verbose');

const sections = new Map();
const TR = [], RESCUE = [], FR = [], GAIN = [], BOTH_SHIP = [];
let TT_pp = 0, TT_dd = 0, FF_dd = 0;

for (const r of CORPUS) {
  const names = MODE === 'empty' ? [] : (r.names || []);
  const c = candArm(r.text, { names, pendingAction: !!r.pa });
  const v = v92ArmTurn(r.text, { pendingAction: !!r.pa });
  const cD = c !== null, vD = v !== null;
  const rec = { ...r, v92: v, cand: c };
  if (!sections.has(r.section)) sections.set(r.section, { n: 0, tr: 0, fr: 0, rescue: 0, gain: 0, bothShip: 0 });
  const s = sections.get(r.section); s.n++;
  if (r.label === 'T') {
    if (!vD && !cD) TT_pp++;
    else if (vD && cD) TT_dd++;
    else if (!vD && cD) { TR.push(rec); s.tr++; }
    else { RESCUE.push(rec); s.rescue++; }
  } else {
    if (vD && cD) FF_dd++;
    else if (!vD && !cD) { BOTH_SHIP.push(rec); s.bothShip++; }
    else if (vD && !cD) { FR.push(rec); s.fr++; }
    else { GAIN.push(rec); s.gain++; }
  }
}

console.log(`=== VERIFIER #49 DIFFERENTIAL — pack: ${MODE} — rows ${CORPUS.length} (T ${TRUTHFUL.length} / F ${FABRICATIONS.length}) ===`);
console.log('TRUTHFUL   v92 keeps & cand keeps: ' + TT_pp + ' | both destroy (parity): ' + TT_dd + ' | RESCUE: ' + RESCUE.length + ' | *** TRUTH REGRESSION: ' + TR.length + ' ***');
console.log('FABRICATED both destroy: ' + FF_dd + ' | GAIN: ' + GAIN.length + ' | both ship: ' + BOTH_SHIP.length + ' | *** FABRICATION REGRESSION: ' + FR.length + ' ***');
const show = (title, list, f) => { if (!list.length) return; console.log('\n--- ' + title + ' ---'); for (const r of list) console.log('  [' + r.id + '] ' + f(r) + '  ' + JSON.stringify(r.text)); };
show('TRUTH REGRESSIONS (candidate destroys, v92 preserves)', TR, (r) => 'cand=' + r.cand + (r.pa ? ' [pendingAction turn]' : ''));
show('FABRICATION REGRESSIONS (v92 corrects, candidate ships)', FR, (r) => 'v92=' + r.v92);
show('BOTH SHIP (informational)', BOTH_SHIP, (r) => (r.pa ? '[pendingAction turn]' : ''));
if (VERBOSE) show('RESCUES', RESCUE, (r) => 'v92=' + r.v92);
if (VERBOSE) show('GAINS', GAIN, (r) => 'cand=' + r.cand);
console.log('\n--- per section: n / TR / FR / rescue / gain / bothShip ---');
for (const [k, v] of [...sections.entries()].sort()) console.log('  ' + k.padEnd(8) + ' n=' + String(v.n).padStart(4) + ' TR=' + v.tr + ' FR=' + v.fr + ' rescue=' + v.rescue + ' gain=' + v.gain + ' bothShip=' + v.bothShip);
const fail = TR.length > 0 || FR.length > 0;
console.log('\nRESULT: ' + (fail ? 'DIFFERENTIAL NOT CLEAN' : 'DIFFERENTIAL CLEAN'));
process.exitCode = fail ? 1 : 0;
