// VERIFIER #50 — four-quadrant differential: deployed v92 vs candidate, MY corpus, MY harness.
// Also checks that the STRUCTURED consumer (unaccountedCompletionProse) agrees with the legacy one on
// every row (the two carry the same strip; a disagreement would be a consumer-level defect).
import { CORPUS, TRUTHFUL, FABRICATIONS } from './corpus.mjs';
import { candArm, v92Arm, candLegacyBelt, candStructuredBelt } from './harness.mjs';

const MODE = process.argv.includes('--empty') ? 'empty' : 'populated';
const VERBOSE = process.argv.includes('--verbose');
const sections = new Map();
const TR = [], RESCUE = [], FR = [], GAIN = [], BOTH_SHIP = [], STRUCT_DIFF = [];
let TT_pp = 0, TT_dd = 0, FF_dd = 0;
for (const r of CORPUS) {
  const names = MODE === 'empty' ? [] : (r.names || []);
  const c = candArm(r.text, { names, pendingAction: !!r.pa });
  const v = v92Arm(r.text, { pendingAction: !!r.pa });
  if (candLegacyBelt(r.text, names, !!r.pa) !== candStructuredBelt(r.text, names, !!r.pa)) STRUCT_DIFF.push(r);
  const cD = c !== null, vD = v !== null;
  const rec = { ...r, v92: v, cand: c };
  if (!sections.has(r.section)) sections.set(r.section, { n: 0, tr: 0, fr: 0, rescue: 0, gain: 0, bothShip: 0, bothDestroyT: 0 });
  const s = sections.get(r.section); s.n++;
  if (r.label === 'T') {
    if (!vD && !cD) TT_pp++;
    else if (vD && cD) { TT_dd++; s.bothDestroyT++; }
    else if (!vD && cD) { TR.push(rec); s.tr++; }
    else { RESCUE.push(rec); s.rescue++; }
  } else {
    if (vD && cD) FF_dd++;
    else if (!vD && !cD) { BOTH_SHIP.push(rec); s.bothShip++; }
    else if (vD && !cD) { FR.push(rec); s.fr++; }
    else { GAIN.push(rec); s.gain++; }
  }
}
console.log(`=== VERIFIER #50 DIFFERENTIAL — pack: ${MODE} — rows ${CORPUS.length} (T ${TRUTHFUL.length} / F ${FABRICATIONS.length}) ===`);
console.log('TRUTHFUL   both keep: ' + TT_pp + ' | both destroy (parity): ' + TT_dd + ' | RESCUE: ' + RESCUE.length + ' | *** TRUTH REGRESSION: ' + TR.length + ' ***');
console.log('FABRICATED both destroy: ' + FF_dd + ' | GAIN: ' + GAIN.length + ' | both ship: ' + BOTH_SHIP.length + ' | *** FABRICATION REGRESSION: ' + FR.length + ' ***');
const show = (title, list, f) => { if (!list.length) return; console.log('\n--- ' + title + ' (' + list.length + ') ---'); for (const r of list) console.log('  [' + r.id + '] ' + f(r) + '  ' + JSON.stringify(r.text.length > 160 ? '…' + r.text.slice(-120) : r.text)); };
show('TRUTH REGRESSIONS (candidate destroys, v92 preserves)', TR, (r) => 'cand=' + r.cand + (r.pa ? ' [pendingAction turn]' : '') + (r.note ? ' note=' + r.note : ''));
show('FABRICATION REGRESSIONS (v92 corrects, candidate ships)', FR, (r) => 'v92=' + r.v92 + (r.note ? ' note=' + r.note : ''));
show('BOTH SHIP (informational)', BOTH_SHIP, (r) => (r.pa ? '[pendingAction turn] ' : '') + (r.note || ''));
show('TRUTH both destroy (shared cost, informational)', CORPUS.filter((r) => r.label === 'T' && v92Arm(r.text, { pendingAction: !!r.pa }) && candArm(r.text, { names: MODE === 'empty' ? [] : r.names, pendingAction: !!r.pa })), (r) => 'v92=' + v92Arm(r.text, { pendingAction: !!r.pa }));
show('STRUCTURED consumer disagrees with legacy consumer', STRUCT_DIFF, (r) => r.label);
if (VERBOSE) { show('RESCUES', RESCUE, (r) => 'v92=' + r.v92); show('GAINS', GAIN, (r) => 'cand=' + r.cand); }
console.log('\n--- per section: n / TR / FR / rescue / gain / bothShip / T-bothDestroy ---');
for (const [k, v] of [...sections.entries()].sort()) console.log('  ' + k.padEnd(13) + ' n=' + String(v.n).padStart(4) + ' TR=' + v.tr + ' FR=' + v.fr + ' rescue=' + v.rescue + ' gain=' + v.gain + ' bothShip=' + v.bothShip + ' TbothDestroy=' + v.bothDestroyT);
const fail = TR.length > 0 || FR.length > 0 || STRUCT_DIFF.length > 0;
console.log('\nRESULT: ' + (fail ? 'DIFFERENTIAL NOT CLEAN' : 'DIFFERENTIAL CLEAN'));
process.exitCode = fail ? 1 : 0;
