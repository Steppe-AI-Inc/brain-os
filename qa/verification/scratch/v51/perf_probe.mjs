// VERIFIER #51 — growth of readsAsCompletion on ONE unsplittable clause carrying skipped negators (the recorded
// "cubic growth e≈2.97" open item), and on ordinary punctuated prose. Reports ms and the doubling exponent.
import { buildGate } from '../../lib/belt_extract.mjs';
import { CAND_PATH } from './harness.mjs';
const g = buildGate(CAND_PATH, (c) => c, ['Erdenet Copper Works']);
const time = (s, reps = 3) => { let best = Infinity; for (let i = 0; i < reps; i++) { const t0 = performance.now(); g.readsAsCompletion(s); best = Math.min(best, performance.now() - t0); } return best; };
const unit = 'No Limits Inc and Nothing Bundt Cakes and Never Summer Industries with no pending items ';
console.log('shape A: one clause, skipped negators, ends with a completion');
let prev = null;
for (const kb of [1, 2, 4, 8, 16]) {
  const s = unit.repeat(Math.ceil((kb * 1024) / unit.length)).slice(0, kb * 1024) + ' was archived';
  const ms = time(s); const e = prev ? Math.log2(ms / prev) : null; prev = ms;
  console.log(`  ${String(kb).padStart(2)} KB: ${ms.toFixed(2).padStart(8)} ms${e !== null ? '  doubling exponent ' + e.toFixed(2) : ''}`);
}
console.log('shape B: ordinary punctuated prose with completion vocabulary');
prev = null;
const unitB = 'Erdenet Copper Works is active. The task was reviewed, nothing was archived. Bold Munkhbat remains employed. ';
for (const kb of [1, 2, 4, 8, 16, 32]) {
  const s = unitB.repeat(Math.ceil((kb * 1024) / unitB.length)).slice(0, kb * 1024);
  const ms = time(s); const e = prev ? Math.log2(ms / prev) : null; prev = ms;
  console.log(`  ${String(kb).padStart(2)} KB: ${ms.toFixed(2).padStart(8)} ms${e !== null ? '  doubling exponent ' + e.toFixed(2) : ''}`);
}
