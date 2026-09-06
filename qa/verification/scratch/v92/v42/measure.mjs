// V42 — four-quadrant measurement of MY corpus against deployed v92 and the candidate,
// reported per section AND split into proper-name vs lowercase-object halves.
import { differential } from './lib.mjs';
import { TRUTHFUL, FABRICATIONS } from './corpus.mjs';
const src = process.argv[2] || undefined;
const d = differential(src);

const bySection = new Map();
const tally = (sec, k) => { if (!bySection.has(sec)) bySection.set(sec, { n: 0, reg: 0, resc: 0, shared: 0, clean: 0, rows: [] }); const s = bySection.get(sec); s.n++; s[k]++; return s; };

let TR = 0, FR = 0, RESC = 0, EXTRA = 0;
const trRows = [], frRows = [];
for (const { section, text } of TRUTHFUL) {
  const v = d.v92Destroys(text), c = d.candDestroys(text);
  if (!v && c) { TR++; trRows.push([section, text]); tally(section, 'reg').rows.push(text); }
  else if (v && !c) { RESC++; tally(section, 'resc'); }
  else if (v && c) tally(section, 'shared');
  else tally(section, 'clean');
}
for (const { section, text } of FABRICATIONS) {
  const v = d.v92Destroys(text), c = d.candDestroys(text);
  if (v && !c) { FR++; frRows.push([section, text]); tally(section, 'reg').rows.push(text); }
  else if (!v && c) { EXTRA++; tally(section, 'resc'); }
  else if (v && c) tally(section, 'shared');
  else tally(section, 'clean');
}
console.log('CORPUS: ' + TRUTHFUL.length + ' truthful negatives, ' + FABRICATIONS.length + ' fabrications');
console.log('\nQUADRANTS (whole-gate: FUTURE_PROMISE + past-completion gate, ungrounded LLM turn)');
console.log('  Q1 truthful, both preserve                 : ' + TRUTHFUL.filter((r) => !d.v92Destroys(r.text) && !d.candDestroys(r.text)).length);
console.log('  Q2 truthful, v92 destroys / cand preserves : ' + RESC + '   (candidate improvement)');
console.log('  Q3 truthful, both destroy                  : ' + TRUTHFUL.filter((r) => d.v92Destroys(r.text) && d.candDestroys(r.text)).length + '   (shared cost, NOT a regression)');
console.log('  Q4 truthful, v92 preserves / cand destroys : ' + TR + '   <<< TRUTH REGRESSION, must be 0');
console.log('  Q5 fabrication, both catch                 : ' + FABRICATIONS.filter((r) => d.v92Destroys(r.text) && d.candDestroys(r.text)).length);
console.log('  Q6 fabrication, only candidate catches     : ' + EXTRA + '   (candidate improvement)');
console.log('  Q7 fabrication, both miss                  : ' + FABRICATIONS.filter((r) => !d.v92Destroys(r.text) && !d.candDestroys(r.text)).length + '   (shared gap, NOT a regression)');
console.log('  Q8 fabrication, v92 catches / cand misses  : ' + FR + '   <<< FABRICATION REGRESSION, must be 0');

console.log('\nPER SECTION');
for (const [sec, s] of [...bySection.entries()].sort()) {
  console.log(`  ${sec.padEnd(24)} n=${String(s.n).padStart(4)}  regressions=${String(s.reg).padStart(4)}  improved=${String(s.resc).padStart(4)}  shared=${String(s.shared).padStart(4)}  clean=${String(s.clean).padStart(4)}`);
}
console.log('\nPROPER-NAME vs LOWERCASE halves (STEP 3d rule — never a blended number)');
for (const [label, pred] of [['proper-name', (s) => /\.name$/.test(s)], ['lowercase', (s) => /\.lower$/.test(s)]]) {
  const rows = TRUTHFUL.filter((r) => pred(r.section));
  const reg = rows.filter((r) => !d.v92Destroys(r.text) && d.candDestroys(r.text)).length;
  console.log(`  ${label.padEnd(12)} truthful n=${rows.length}  regressions=${reg}`);
}

if (trRows.length) { console.log('\nTRUTH REGRESSIONS (' + trRows.length + '):'); for (const [s, x] of trRows.slice(0, 60)) console.log('  !! [' + s + '] ' + x); }
if (frRows.length) { console.log('\nFABRICATION REGRESSIONS (' + frRows.length + '):'); for (const [s, x] of frRows.slice(0, 60)) console.log('  !! [' + s + '] ' + x); }
console.log('\nRESULT: ' + ((TR === 0 && FR === 0) ? 'CLEAN' : 'NOT DEPLOYABLE — ' + TR + ' truth regressions, ' + FR + ' fabrication regressions'));
