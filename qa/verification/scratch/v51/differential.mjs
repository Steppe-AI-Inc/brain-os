// VERIFIER #51 — four-quadrant differential, deployed v92 vs candidate, MY corpus, MY harness.
// Usage: node differential.mjs [--empty] [--structured] [--grounded] [--verbose]
//   --empty      inject an EMPTY entity pack (the battery's structural default) instead of each row's names
//   --structured evaluate the STRUCTURED consumer (rawClaims !== null) instead of the legacy one
//   --grounded   model a GROUNDED turn (something real executed this turn) — v92's FUTURE/PAST arms are off there
// Rows carrying pa=true are always evaluated as pendingAction turns.
import { CORPUS, TRUTHFUL, FABRICATIONS } from './corpus.mjs';
import { candArm, v92Arm, candLegacyBelt, candStructuredBelt } from './harness.mjs';

const A = process.argv.slice(2);
const MODE = A.includes('--empty') ? 'empty' : 'populated';
const STRUCTURED = A.includes('--structured');
const GROUNDED = A.includes('--grounded');
const VERBOSE = A.includes('--verbose');
const sections = new Map();
const TR = [], RESCUE = [], FR = [], GAIN = [], BOTH_SHIP = [], BOTH_DESTROY_T = [], STRUCT_DIFF = [];
let TT_pp = 0, FF_dd = 0;
for (const r of CORPUS) {
  const names = MODE === 'empty' ? [] : (r.names || []);
  const opts = { names, pendingAction: !!r.pa, grounded: GROUNDED, structured: STRUCTURED };
  const c = candArm(r.text, opts);
  const v = v92Arm(r.text, { pendingAction: !!r.pa, grounded: GROUNDED });
  if (!GROUNDED && candLegacyBelt(r.text, names, { pendingAction: !!r.pa }) !== candStructuredBelt(r.text, names, { pendingAction: !!r.pa })) STRUCT_DIFF.push(r);
  const cD = c !== null, vD = v !== null;
  const rec = { ...r, v92: v, cand: c };
  if (!sections.has(r.section)) sections.set(r.section, { n: 0, tr: 0, fr: 0, rescue: 0, gain: 0, bothShip: 0, bothDestroyT: 0, bothKeepT: 0, bothDestroyF: 0 });
  const s = sections.get(r.section); s.n++;
  if (r.label === 'T') {
    if (!vD && !cD) { TT_pp++; s.bothKeepT++; }
    else if (vD && cD) { BOTH_DESTROY_T.push(rec); s.bothDestroyT++; }
    else if (!vD && cD) { TR.push(rec); s.tr++; }
    else { RESCUE.push(rec); s.rescue++; }
  } else {
    if (vD && cD) { FF_dd++; s.bothDestroyF++; }
    else if (!vD && !cD) { BOTH_SHIP.push(rec); s.bothShip++; }
    else if (vD && !cD) { FR.push(rec); s.fr++; }
    else { GAIN.push(rec); s.gain++; }
  }
}
console.log(`=== VERIFIER #51 DIFFERENTIAL — pack: ${MODE} — consumer: ${STRUCTURED ? 'STRUCTURED (rawClaims !== null)' : 'legacy'} — turn: ${GROUNDED ? 'GROUNDED' : 'ungrounded'} — rows ${CORPUS.length} (T ${TRUTHFUL.length} / F ${FABRICATIONS.length}) ===`);
console.log('TRUTHFUL   both keep: ' + TT_pp + ' | both destroy (parity): ' + BOTH_DESTROY_T.length + ' | RESCUE: ' + RESCUE.length + ' | *** TRUTH REGRESSION: ' + TR.length + ' ***');
console.log('FABRICATED both destroy: ' + FF_dd + ' | GAIN: ' + GAIN.length + ' | both ship: ' + BOTH_SHIP.length + ' | *** FABRICATION REGRESSION: ' + FR.length + ' ***');
const show = (title, list, f) => { if (!list.length) return; console.log('\n--- ' + title + ' (' + list.length + ') ---'); for (const r of list) console.log('  [' + r.id + '] ' + f(r) + '  ' + JSON.stringify(r.text.length > 170 ? '…' + r.text.slice(-130) : r.text)); };
show('TRUTH REGRESSIONS (candidate destroys, v92 preserves)', TR, (r) => 'cand=' + r.cand + (r.pa ? ' [pendingAction]' : '') + (r.note ? ' note=' + r.note : ''));
show('FABRICATION REGRESSIONS (v92 corrects, candidate ships)', FR, (r) => 'v92=' + r.v92 + (r.note ? ' note=' + r.note : ''));
show('BOTH SHIP (informational)', BOTH_SHIP, (r) => (r.pa ? '[pendingAction] ' : '') + (r.note || ''));
show('TRUTH both destroy (shared cost, informational)', BOTH_DESTROY_T, (r) => 'v92=' + r.v92 + ' cand=' + r.cand);
show('STRUCTURED consumer disagrees with legacy consumer', STRUCT_DIFF, (r) => r.label);
if (VERBOSE) { show('RESCUES', RESCUE, (r) => 'v92=' + r.v92); show('GAINS', GAIN, (r) => 'cand=' + r.cand); }
console.log('\n--- per section: n / TR / FR / rescue / gain / bothShip / T-bothDestroy / T-bothKeep / F-bothDestroy ---');
for (const [k, v] of [...sections.entries()].sort()) console.log('  ' + k.padEnd(11) + ' n=' + String(v.n).padStart(4) + ' TR=' + String(v.tr).padStart(3) + ' FR=' + String(v.fr).padStart(3) + ' rescue=' + String(v.rescue).padStart(3) + ' gain=' + String(v.gain).padStart(3) + ' bothShip=' + String(v.bothShip).padStart(3) + ' TbothDestroy=' + String(v.bothDestroyT).padStart(3) + ' TbothKeep=' + String(v.bothKeepT).padStart(3) + ' FbothDestroy=' + String(v.bothDestroyF).padStart(3));
const fail = TR.length > 0 || FR.length > 0 || STRUCT_DIFF.length > 0;
console.log('\nRESULT: ' + (fail ? 'DIFFERENTIAL NOT CLEAN' : 'DIFFERENTIAL CLEAN'));
process.exitCode = fail ? 1 : 0;
