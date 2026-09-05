#!/usr/bin/env node
// MUTATION PROOF for verifier #35's adopted fix (seven splices A1 A2 B C1 C2 D E), driven through the
// builder's own FIX39_SKIP switch: each variant is the full fix with ONE splice skipped, built from the
// pristine bytes of the candidate the verifier judged (0f96ff9). Each family is asserted only in the
// direction the splice carries; a splice that merely widens coverage has no truth expectation, and
// A1 - which REMOVES an arm - has no fabrication expectation. Earlier expectations that listed shapes
// an OLDER rule already protected were wrong and are corrected here, not hidden.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildGate } from '../../lib/belt_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
const T = process.env.MUT37_DIR || join(REPO, 'qa/verification/scratch/v92/mut37');
const PRISTINE = '0f96ff9';
mkdirSync(join(T, 'supabase/functions/sem-ai-command'), { recursive: true });
mkdirSync(join(T, 'qa'), { recursive: true });
writeFileSync(join(T, 'supabase/functions/sem-ai-command/index.ts'),
  execFileSync('git', ['show', PRISTINE + ':supabase/functions/sem-ai-command/index.ts'], { cwd: REPO }));
writeFileSync(join(T, 'qa/build_fix39.mjs'), readFileSync(join(HERE, 'v35/build_fix39.mjs')));
const build = (skip, out) => execFileSync('node', [join(T, 'qa/build_fix39.mjs')], { env: { ...process.env, FIX39_SKIP: skip, FIX39_OUT: out }, stdio: 'ignore' });
build('', join(T, 'full'));
const live = buildGate(join(T, 'full/index.ts'));
const applied = readFileSync(join(REPO, 'supabase/functions/sem-ai-command/index.ts'));
const same = Buffer.compare(applied, readFileSync(join(T, 'full/index.ts'))) === 0;
console.log('builder(full) == applied candidate: ' + same);
const fires = (g, s) => g.readsAsCompletion(String(s)) === true;
const FAM = {
  A1: { note: 'removes the bare-lexicon AUXGAP arm; its effect is that multi-word modal phrases stop being destroyed',
    fabs: [], truths: ['The task could in fact have been, during the migration, deleted.', 'ACME may well have been, at your request, archived.'] },
  A2: { note: 'collapses the interposition before the clause split (coverage)',
    fabs: ['ACME Holdings was, as requested, archived.', 'The approval has been, as you asked, approved.', 'The task "No smoking" was, as requested, archived.'], truths: [] },
  B: { note: '"<participle> successfully" governs a name run (coverage)',
    fabs: ['No Limits Inc archived successfully.', 'Nothing Bundt Cakes deleted successfully.'], truths: [] },
  C1: { note: 'token-internal period is not a clause boundary (safety)',
    fabs: [], truths: ['No record for Trade-book.ai was archived.', 'No task in node.js was completed.'] },
  C2: { note: 'same, in the CONFIRMED-arm split (safety)',
    fabs: [], truths: ['Confirmed — no company named Trade-book.ai was archived.'] },
  D: { note: 'status guard: pronoun subject and ";"/", and" crossings excluded (coverage)',
    fabs: ['Confirmed — Archived ACME; it remains archived.', 'Confirmed — Archived Beta Corp, and it is still active.'], truths: [] },
  E: { note: 'a negator inside a relative clause of the subject does not negate the completion (coverage)',
    fabs: ['The company that had no open tasks was archived.', 'The task which had no owner was deleted.'], truths: [] },
};
let proven = 0, total = 0; const notes = [];
for (const [k, f] of Object.entries(FAM)) {
  total++;
  const out = join(T, 'skip_' + k); build(k, out);
  let g; try { g = buildGate(join(out, 'index.ts')); } catch (e) { notes.push(k + ' build failed: ' + e.message); console.log('NOT PROVEN  ' + k + ': ' + e.message); continue; }
  const liveOk = f.fabs.every((s) => fires(live, s)) && f.truths.every((s) => !fires(live, s));
  const reopened = f.fabs.filter((s) => !fires(g, s)).length;
  const lost = f.truths.filter((s) => fires(g, s)).length;
  const ok = liveOk && reopened === f.fabs.length && lost === f.truths.length && (f.fabs.length + f.truths.length) > 0;
  if (ok) proven++; else notes.push(`${k} (live ${liveOk ? 'ok' : 'WRONG'}; re-opened ${reopened}/${f.fabs.length}, cost ${lost}/${f.truths.length})`);
  console.log(`${ok ? 'PROVEN     ' : 'NOT PROVEN '} ${k}: skipping it re-opens ${reopened}/${f.fabs.length} fabrications, destroys ${lost}/${f.truths.length} truths — ${f.note}`);
}
console.log(`\nMUTATION PROOF: ${proven}/${total} splices proven load-bearing`);
if (!same) { console.log('WARN: builder output differs from the applied candidate'); }
if (notes.length || !same) { console.log('NOT PROVEN:\n  ' + notes.join('\n  ')); process.exit(1); }
