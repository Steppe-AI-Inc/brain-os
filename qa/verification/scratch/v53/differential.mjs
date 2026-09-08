// VERIFIER #53 — four-quadrant differential, candidate vs deployed v92 (my download), on my corpus (or #52's with --corpus v52).
// Usage: node differential.mjs [--empty] [--structured] [--src <index.ts>] [--corpus v52]   (writes .log/.json into v53/)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './harness.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const EMPTY = args.includes('--empty');
const STRUCTURED = args.includes('--structured');
const srcIdx = args.indexOf('--src'); const SRC = srcIdx >= 0 ? args[srcIdx + 1] : H.SRC;
const cIdx = args.indexOf('--corpus'); const CNAME = cIdx >= 0 ? args[cIdx + 1] : 'v53';
const { CORPUS, packNamesFor } = await import(CNAME === 'v52' ? '../v52/corpus.mjs' : './corpus.mjs');
const tag = CNAME + '_' + (srcIdx >= 0 ? 'mut_' + SRC.split(/[\\/]/).pop().replace(/\.ts$/, '') : 'cand') + (EMPTY ? '_empty' : '_populated') + (STRUCTURED ? '_structured' : '');
const bySection = new Map(); const rowsOut = [];
const bump = (sec, k) => { if (!bySection.has(sec)) bySection.set(sec, { T_bothKeep: 0, T_bothDestroy: 0, T_RESCUE: 0, T_REGRESSION: 0, F_bothDestroy: 0, F_GAIN: 0, F_bothShip: 0, F_REGRESSION: 0, n: 0 }); const o = bySection.get(sec); o[k]++; o.n++; };
for (const row of CORPUS) {
  const names = EMPTY ? [] : packNamesFor(row);
  const c = H.candArm(row.text, { names, pa: !!row.pa, structured: STRUCTURED, src: SRC });
  const v = H.v92Arm(row.text, { pa: !!row.pa });
  let q;
  if (row.dir === 'T') q = (v === null ? (c === null ? 'T_bothKeep' : 'T_REGRESSION') : (c === null ? 'T_RESCUE' : 'T_bothDestroy'));
  else q = (v !== null ? (c !== null ? 'F_bothDestroy' : 'F_REGRESSION') : (c !== null ? 'F_GAIN' : 'F_bothShip'));
  bump(row.section, q);
  rowsOut.push({ section: row.section, dir: row.dir, q, cand: c, v92: v, text: row.text.length > 200 ? row.text.slice(0, 60) + '…[' + row.text.length + ' chars]…' + row.text.slice(-90) : row.text });
}
let out = `# v53 differential ${tag}\ncandidate=${SRC} sha256=${H.sha256(SRC)}\nv92=${H.V92} sha256=${H.sha256(H.V92)}\nrows=${CORPUS.length} (T=${CORPUS.filter((r) => r.dir === 'T').length}, F=${CORPUS.filter((r) => r.dir === 'F').length})\n\n`;
out += 'section        n   T:bothKeep bothDestroy RESCUE REGRESSION | F:bothDestroy GAIN bothShip REGRESSION\n';
const tot = { T_bothKeep: 0, T_bothDestroy: 0, T_RESCUE: 0, T_REGRESSION: 0, F_bothDestroy: 0, F_GAIN: 0, F_bothShip: 0, F_REGRESSION: 0, n: 0 };
for (const [sec, o] of [...bySection.entries()].sort()) { for (const k of Object.keys(tot)) tot[k] += o[k]; out += `${sec.padEnd(12)} ${String(o.n).padStart(4)}   ${String(o.T_bothKeep).padStart(8)} ${String(o.T_bothDestroy).padStart(11)} ${String(o.T_RESCUE).padStart(6)} ${String(o.T_REGRESSION).padStart(10)} | ${String(o.F_bothDestroy).padStart(11)} ${String(o.F_GAIN).padStart(4)} ${String(o.F_bothShip).padStart(8)} ${String(o.F_REGRESSION).padStart(10)}\n`; }
out += `${'TOTAL'.padEnd(12)} ${String(tot.n).padStart(4)}   ${String(tot.T_bothKeep).padStart(8)} ${String(tot.T_bothDestroy).padStart(11)} ${String(tot.T_RESCUE).padStart(6)} ${String(tot.T_REGRESSION).padStart(10)} | ${String(tot.F_bothDestroy).padStart(11)} ${String(tot.F_GAIN).padStart(4)} ${String(tot.F_bothShip).padStart(8)} ${String(tot.F_REGRESSION).padStart(10)}\n\n`;
const list = (q, title, cap = 400) => { const r = rowsOut.filter((x) => x.q === q); out += `## ${title} (${r.length})\n`; for (const x of r.slice(0, cap)) out += `  [${x.section}] cand=${x.cand} v92=${x.v92} :: ${x.text}\n`; out += '\n'; };
list('T_REGRESSION', 'TRUTH REGRESSIONS — v92 preserves, candidate destroys');
list('F_REGRESSION', 'FABRICATION REGRESSIONS — v92 corrects, candidate ships');
list('F_bothShip', 'both ship (parity, for the record)');
list('T_bothDestroy', 'both destroy (shared cost, for the record)', 120);
console.log(out);
writeFileSync(join(HERE, `differential_${tag}.log`), out);
writeFileSync(join(HERE, `differential_${tag}.json`), JSON.stringify({ tag, tot, bySection: Object.fromEntries(bySection), rows: rowsOut }, null, 1));
