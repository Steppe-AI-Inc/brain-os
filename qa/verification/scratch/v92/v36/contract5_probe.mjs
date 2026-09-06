// v36: is v92_open_regression_contract's narrowed CONTRACT 5 still able to fail for the reason it exists?
// Build two scratch mutants of the candidate: (a) a new TOP-LEVEL const in the belt block, (b) a new LOCAL
// inside completionIsNegated, both REFERENCED so a dropped declaration breaks the belt. Run the
// extractor-based suites on each and report.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..', '..');
const SRC = join(repo, 'supabase/functions/sem-ai-command/index.ts');
const base = readFileSync(SRC, 'utf8');
const NL = base.includes('\r\n') ? '\r\n' : '\n';
const top = base.replace('        const readsAsCompletion = (s) => REFERENCELESS_CONFIRMATION.test(s)', '        const nxTop = REFERENCELESS_CONFIRMATION;' + NL + '        const readsAsCompletion = (s) => nxTop.test(s)');
const local = base.replace('          let n = -1;', '          let n = -1;' + NL + '          const nyLocal = NEGATED_CLAUSE.source;' + NL + '          if (!nyLocal) return false;');
if (top === base || local === base) { console.log('anchor missing'); process.exit(1); }
const dir = join(here, 'c5'); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'top.ts'), top); writeFileSync(join(dir, 'local.ts'), local);
const SUITES = ['run14_defect_closure_contract.mjs', 'run15_defect_closure_contract.mjs', 'run16_defect_closure_contract.mjs', 'run17_defect_closure_contract.mjs', 'run18_defect_closure_contract.mjs', 'run19_defect_closure_contract.mjs', 'run28_defect_closure_contract.mjs', 'v92_open_regression_contract.mjs', 'v92_parity_contract.mjs', 'structured_claim_laundering_contract.mjs'];
for (const [label, p] of [['TOP-LEVEL referenced const', join(dir, 'top.ts')], ['LOCAL referenced const', join(dir, 'local.ts')]]) {
  let bad = 0; const fails = [];
  for (const s of SUITES) {
    const r = spawnSync(process.execPath, [join(repo, 'qa/scenarios-runner', s)], { cwd: repo, encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: p }, maxBuffer: 1 << 26 });
    if (r.status !== 0) { bad++; fails.push(s); }
  }
  console.log(`${label}: ${SUITES.length - bad}/${SUITES.length} suites green; failing: ${fails.join(', ') || 'none'}`);
}
