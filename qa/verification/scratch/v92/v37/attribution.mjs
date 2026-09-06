// Which earlier SHA introduced each class? Builds the belt from git blobs; SHAs whose layout my harness cannot build are reported as such.
import { execFileSync } from 'node:child_process';
import { makeGate, makeV92, lf } from './v37_harness.mjs';
const v = makeV92();
const SHAS = ['4476c92', '6774b52', '0f96ff9', 'f64b280', '395c438'];
const rows = ['No company, however, is being archived.', 'No entry, however, shows FuelMetrix is being archived.',
  'Since nothing was, per Trade-book.ai, archived, CLIX GPS is still active.', 'No issue the customer raised was, per Trade-book.ai, archived.',
  'No problem the team flagged was (after the long review that found nothing wrong at all) archived.',
  'No smoking signs for the depot was completed.', 'No errors ACME was archived.', 'Not a single task moved - Bob Smith was removed.'];
console.log('v92:'.padEnd(10) + rows.map((s) => (v.fires(s) ? 'X' : '.')).join(' '));
for (const sha of SHAS) {
  let text; try { text = lf(execFileSync('git', ['show', sha + ':supabase/functions/sem-ai-command/index.ts'], { maxBuffer: 1 << 26 }).toString()); } catch (e) { console.log(sha, 'no blob'); continue; }
  try { const g = makeGate(text); console.log(sha.padEnd(10) + rows.map((s) => (g.fires(s) ? 'X' : '.')).join(' ')); } catch (e) { console.log(sha.padEnd(10) + 'harness cannot build: ' + e.message.slice(0, 80)); }
}
console.log('columns:'); rows.forEach((s, i) => console.log('  ' + (i + 1) + ' ' + s));
