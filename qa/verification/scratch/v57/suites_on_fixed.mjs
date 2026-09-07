// VERIFIER #57 — run every battery suite that honours SEM_INDEX_SRC against the prepared-fix copy, plus #56's generators.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const FIXED = resolve(ROOT, 'qa/verification/scratch/v57/index.fixed.ts');
const DIR = resolve(ROOT, 'qa/scenarios-runner');
const suites = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && /SEM_INDEX_SRC/.test(readFileSync(resolve(DIR, f), 'utf8'))).sort();
const extra = ['qa/verification/scratch/p1/v56_corpora/intent_corpus.mjs', 'qa/verification/scratch/p1/v56_corpora/question_probe.mjs', 'qa/verification/scratch/p1/v56_corpora/contract_harness.mjs', 'qa/verification/scratch/p1/v56_corpora/lifecycle_harness.mjs', 'qa/verification/scratch/v57/v57_precedence.mjs', 'qa/verification/scratch/v57/v57_misc.mjs'];
const out = [];
for (const f of [...suites.map((s) => 'qa/scenarios-runner/' + s), ...extra]) {
  const r = spawnSync(process.execPath, [resolve(ROOT, f)], { cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, SEM_INDEX_SRC: FIXED } });
  const text = (r.stdout || '') + (r.stderr || '');
  const tail = text.trim().split('\n').filter((l) => /passed|failed|pass|fail|FN corpus|FP corpus|question_probe|control/.test(l)).slice(-3).join(' | ').slice(0, 240);
  out.push({ file: f, exit: r.status, tail });
  console.log(`${String(r.status).padStart(3)}  ${f}  ${tail}`);
}
console.log(JSON.stringify({ total: out.length, exit0: out.filter((o) => o.exit === 0).length, nonzero: out.filter((o) => o.exit !== 0).map((o) => o.file) }));
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/suites_on_fixed.json'), JSON.stringify(out, null, 1));
