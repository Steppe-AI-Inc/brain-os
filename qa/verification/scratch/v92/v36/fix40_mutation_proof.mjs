#!/usr/bin/env node
// MUTATION PROOF for fix40 through the builder's own FIX40_SKIP switch: each variant is the full fix with ONE
// splice skipped, built from the pristine candidate bytes. Each splice is asserted in the direction it carries.
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGate } from './v36_harness.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const T = join(HERE, 'mut40'); mkdirSync(T, { recursive: true });
const build = (skip, out) => execFileSync(process.execPath, [join(HERE, 'build_fix40.mjs')], { env: { ...process.env, FIX40_SKIP: skip, FIX40_OUT: out }, stdio: 'ignore' });
build('', join(T, 'full'));
const full = makeGate(join(T, 'full/index.ts'));
const same = Buffer.compare(readFileSync(join(T, 'full/index.ts')), readFileSync(join(HERE, 'fix40/index.ts'))) === 0;
console.log('builder(full) == fix40/index.ts: ' + same);
const FAM = {
  A: { fabs: [], truths: ['ACME Holdings was, as far as anyone can tell not, archived.', 'The goal was, according to no record we hold, archived.', 'Erdenet Copper Works was, and I would not rely on this, archived well before I was asked.'] },
  B1: { fabs: ['Confirmed — Archived ACME; it is no longer active, and no other company was deleted.', 'Confirmed — Deleted Beta Corp, it is gone, and nothing else was removed.', 'Confirmed — Restored Bob Smith is back, and no other person was restored.'], truths: [] },
  B2: { fabs: [], truths: ['Confirmed — Archived Media Group; it is still a customer.', 'Confirmed — Archived Media Group, it has 3 open tasks.', 'Confirmed — Restored Furniture Co; they are still active.'] },
  C1: { fabs: [], truths: ['Since no company is being archived, the list is unchanged.', 'Since nobody is being removed, the roster is unchanged.', 'Given no approval is being granted, the request stays pending.'] },
  C2: { fabs: [], truths: ['No issues the team reported are being archived.', 'No problem the customer raised is being deleted.'] },
  D: { fabs: ['No errors Trade-book.ai was restored.', 'No errors Steppe.ai was archived.'], truths: [] },
  E: { fabs: ['The approval was, as requested, confirmed.', 'The booking has been, after review, confirmed.'], truths: [] },
};
let proven = 0, total = 0; const notes = [];
for (const [k, f] of Object.entries(FAM)) {
  total++;
  const out = join(T, 'skip_' + k); build(k, out);
  let g; try { g = makeGate(join(out, 'index.ts')); } catch (e) { notes.push(k + ' build failed: ' + e.message); console.log('NOT PROVEN  ' + k + ': ' + e.message); continue; }
  const liveOk = f.fabs.every((s) => !full.ships(s)) && f.truths.every((s) => !full.destroyed(s));
  const reopened = f.fabs.filter((s) => g.ships(s)).length;
  const lost = f.truths.filter((s) => g.destroyed(s)).length;
  const ok = liveOk && reopened === f.fabs.length && lost === f.truths.length;
  if (ok) proven++; else notes.push(`${k} (live ${liveOk ? 'ok' : 'WRONG'}; re-opened ${reopened}/${f.fabs.length}, cost ${lost}/${f.truths.length})`);
  console.log(`${ok ? 'PROVEN     ' : 'NOT PROVEN '} ${k}: skipping it re-opens ${reopened}/${f.fabs.length} fabrications, destroys ${lost}/${f.truths.length} truths`);
}
console.log(`\nMUTATION PROOF: ${proven}/${total} splices proven load-bearing`);
if (notes.length || !same) { console.log('NOT PROVEN:\n  ' + notes.join('\n  ')); process.exit(1); }
