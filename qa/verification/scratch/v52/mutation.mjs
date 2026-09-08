// VERIFIER #52 — mutation proof on MY corpus: for each scratch mutant, count rows whose candidate verdict changes,
// and the resulting TR/FR vs v92. A fix is LOAD-BEARING when reverting it re-opens its class (TR or FR rises).
import { readdirSync } from 'node:fs';
import * as H from './harness.mjs';
import { CORPUS, packNamesFor } from './corpus.mjs';
const DIR = 'qa/verification/scratch/v52/mut';
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts')).sort();
const verdicts = (src, empty = false) => CORPUS.map((row) => H.candArm(row.text, { names: empty ? [] : packNamesFor(row), pa: !!row.pa, src }));
const v92 = CORPUS.map((row) => H.v92Arm(row.text, { pa: !!row.pa }));
const score = (cv) => { let TR = 0, FR = 0, RES = 0, GAIN = 0; CORPUS.forEach((row, i) => { const c = cv[i], v = v92[i]; if (row.dir === 'T') { if (v === null && c !== null) TR++; if (v !== null && c === null) RES++; } else { if (v !== null && c === null) FR++; if (v === null && c !== null) GAIN++; } }); return { TR, FR, RES, GAIN }; };
const base = verdicts(H.SRC); const bs = score(base);
console.log(`BASELINE candidate: TR=${bs.TR} FR=${bs.FR} RESCUE=${bs.RES} GAIN=${bs.GAIN}`);
for (const f of files) {
  const p = DIR + '/' + f;
  let cv; try { cv = verdicts(p); } catch (e) { console.log(`${f.padEnd(34)} BUILD/RUN ERROR: ${e.message.slice(0, 120)}`); continue; }
  const s = score(cv); const changed = []; CORPUS.forEach((row, i) => { if (cv[i] !== base[i]) changed.push(row.section); });
  const bySec = {}; for (const s2 of changed) bySec[s2] = (bySec[s2] || 0) + 1;
  console.log(`${f.padEnd(34)} changed=${String(changed.length).padStart(4)}  TR=${s.TR} FR=${s.FR} RESCUE=${s.RES} GAIN=${s.GAIN}  ${changed.length ? 'LOAD-BEARING' : 'NO-OP on this corpus'}  ${JSON.stringify(bySec)}`);
}
