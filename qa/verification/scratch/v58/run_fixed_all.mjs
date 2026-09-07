// VERIFIER #58 — run every SEM_INDEX_SRC-honouring battery suite + my suites + TDZ + CRLF against the FIXED bytes.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = resolve(HERE, '../../../..');
const FIXED = resolve(HERE, 'index.fixed.ts');
const fixedBytes = readFileSync(FIXED);
console.log('index.fixed.ts sha256', createHash('sha256').update(fixedBytes).digest('hex'), 'bytes', fixedBytes.length, 'bare LF', (fixedBytes.toString('utf8').match(/(?<!\r)\n/g) || []).length);
const SUITES = readdirSync(resolve(ROOT, 'qa/scenarios-runner')).filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && readFileSync(resolve(ROOT, 'qa/scenarios-runner', f), 'utf8').includes('SEM_INDEX_SRC')).map((f) => ['qa/scenarios-runner/' + f, resolve(ROOT, 'qa/scenarios-runner', f)]);
const MINE = ['v58_receipt_matrix.mjs', 'v58_intent_attack.mjs', 'v58_lifecycle_attack.mjs', 'v58_machinery.mjs', 'v58_nonimperative_sizing.mjs', 'task_restore_trace.mjs', 'v58_belt_vs_v92.mjs'].map((f) => ['v58/' + f, resolve(HERE, f)]);
const GEN = ['lifecycle_harness.mjs', 'question_probe.mjs', 'intent_corpus.mjs', 'contract_harness.mjs'].map((f) => ['p1/v56_corpora/' + f, resolve(ROOT, 'qa/verification/scratch/p1/v56_corpora', f)]);
const out = [];
for (const [label, f] of [...SUITES, ...MINE, ...GEN]) {
  const r = spawnSync(process.execPath, [f], { cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: FIXED }, encoding: 'utf8', timeout: 600000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const tail = text.trim().split('\n').filter((l) => /passed|failed|pass|fail|EXEC|FN-ship|FP-replace|founder reads|restore task/.test(l)).slice(-3).join(' | ').replace(/\s+/g, ' ').slice(0, 300);
  out.push({ label, exit: r.status, tail });
  console.log(`exit=${r.status}  ${label}  :: ${tail}`);
}
const tdz = spawnSync(process.execPath, [resolve(HERE, 'tdz_scan.mjs'), FIXED], { encoding: 'utf8' });
console.log('TDZ on fixed:', tdz.stdout.split('\n').slice(2, 4).join(' | '));
writeFileSync(resolve(HERE, 'fixed_all.json'), JSON.stringify(out, null, 1));
