// VERIFIER #39 — run the COMMITTED battery against the PREPARED FIX.
// Only 15 of 34 suites honour SEM_INDEX_SRC, so the patched source must sit at the real
// path for the run. The original is restored in a `finally` and its sha256 re-asserted;
// the run aborts if the working tree is not clean for index.ts beforehand.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSrc, CAND_PATH } from './belt39.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const INDEX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const EXPECT = 'ae4c598c5390c691ef9b575981eaf7c120d9117792d64b55bba40706842f4ac9';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const original = readFileSync(INDEX);
if (sha(original) !== EXPECT) { console.log('ABORT — index.ts sha256 is not the candidate: ' + sha(original)); process.exit(1); }
console.log('index.ts sha256 before: ' + sha(original) + '  ✓');

// rebuild the same patch as v39_prepared_fix.mjs, but on the CRLF-preserving raw text
const raw = original.toString('utf8');
const GN = String.raw`/^\s*(?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|processing|executing|working)\b(?:(?!\b(?:I|we)\b)[^.]){0,90}?\s(?:is|are|was|were|isn|aren|requires?|needs?|takes?|keeps?|ends|leaves?|means?|happens?|stays?|remains?|gets?|becomes?|costs?|involves?|depends?|applies|allows?|lets?|makes?|does|do|notifies|switches|drops?|hides?|shows?|works?|can|cannot|will|would|should|must|archives|deletes|creates|updates|removes|assigns|restores|renames|closes|clears|sends|adds|reopens|preserves|affects)\b/i`;
const TP = String.raw`/(?:^|\s)(?!(?:I|We|i|we)\b)(?:[A-Z][\w&.’'-]*(?:\s+[A-Z][\w&.’'-]*){0,3}|(?:[Tt]he|[Oo]ur|[Yy]our|[Tt]heir)\s+[a-z][\w-]*(?:\s+[a-z][\w-]*){0,2})\s+(?:is|are|was|were)\s+(?:now\s+|currently\s+|just\s+)?(?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|working\s+on|processing|executing)\b/`;
let patched = raw.replace('EXECUTION_IN_PROGRESS.test(c)', '(EXECUTION_IN_PROGRESS.test(c) && !' + GN + '.test(c) && !' + TP + '.test(c))');
const OLD2 = "(?=(?:[Ii]s|[Aa]re|[Ww]as|[Ww]ere|[Hh]as|[Hh]ave|[Hh]ad|[Ii]sn|[Aa]ren|[Ww]asn|[Ww]eren|[Hh]asn|[Hh]aven)\\b)";
if (!patched.includes(OLD2)) { console.log('ABORT — EDIT2 site not found'); process.exit(1); }
patched = patched.replace(OLD2, "(?=(?:[Ii]s|[Aa]re|[Ii]sn|[Aa]ren)\\b)");
const anchor = 'const readsAsCompletion = (s) => String(s).split(/(?<=[.!?])\\s+/).some((q) =>';
const i3 = patched.indexOf(anchor);
const marker = ' || REFERENCELESS_CONFIRMATION.test(s)';
if (i3 < 0) { console.log('ABORT — EDIT3 site not found'); process.exit(1); }
patched = patched.slice(0, i3) + 'const readsAsCompletion = (s) => [String(s), String(s).replace(/[?!]/g, \' \')].some((__s) => __s.split(/(?<=[.!?])\\s+/).some((q) =>' + patched.slice(i3 + anchor.length);
const j3 = patched.indexOf(marker, i3);
patched = patched.slice(0, j3) + ')' + patched.slice(j3);
mkdirSync(resolve(HERE, 'fix'), { recursive: true });
writeFileSync(resolve(HERE, 'fix/index.fixed.ts'), patched);

const OUT = resolve(HERE, 'fix/battery'); mkdirSync(OUT, { recursive: true });
try {
  writeFileSync(INDEX, patched);
  const { readdirSync } = await import('node:fs');
  const DIR = resolve(ROOT, 'qa/scenarios-runner');
  const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== '_gate_extract.mjs').sort();
  const GATES = ['qa/verification/scratch/v92/v32_regression_additions.mjs','qa/verification/scratch/v92/v33_regression_additions.mjs','qa/verification/scratch/v92/v34/v34_regression_additions.mjs','qa/verification/scratch/v92/v35/v35_regression_additions.mjs','qa/verification/scratch/v92/v36/v36_regression_additions.mjs','qa/verification/scratch/v92/v37/v37_regression_additions.mjs','qa/verification/scratch/v92/v38/v38_regression_additions.mjs','qa/verification/scratch/v92/v30_open_regressions_probe.mjs','qa/verification/proposed/v39_regression_additions.mjs'];
  for (const g of GATES) { const rr = spawnSync(process.execPath,[resolve(ROOT,g)],{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024}); writeFileSync(resolve(OUT, g.split('/').pop()+'.log'), (rr.stdout||'')+(rr.stderr||'')); const ln=(rr.stdout||'').split(String.fromCharCode(10)).filter(l=>/passed,|pass,/.test(l)).pop()||''; console.log('GATE ' + (rr.status===0?'PASS':'FAIL') + '  ' + g.split('/').pop().padEnd(34) + ln.trim().slice(0,80)); }
  let pass = 0; const failed = [];
  for (const f of files) {
    const r = spawnSync(process.execPath, [resolve(DIR, f)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(resolve(OUT, f.replace(/\.mjs$/, '.log')), (r.stdout || '') + (r.stderr || ''));
    if (r.status === 0) pass++; else { failed.push(f + ' rc=' + r.status); console.log('FAIL  ' + f); }
  }
  console.log('\nBATTERY ON PREPARED FIX: ' + pass + ' passed, ' + failed.length + ' failed (of ' + files.length + ')');
  if (failed.length) console.log('FAILED: ' + failed.join(', '));
} finally {
  writeFileSync(INDEX, original);
  const after = sha(readFileSync(INDEX));
  console.log('\nindex.ts sha256 after restore: ' + after + (after === EXPECT ? '  ✓ byte-identical' : '  ✗ MISMATCH — RESTORE FAILED'));
  console.log('git status index.ts: ' + (execSync('git status --porcelain supabase/functions/sem-ai-command/index.ts', { cwd: ROOT }).toString().trim() || '(clean)'));
}
