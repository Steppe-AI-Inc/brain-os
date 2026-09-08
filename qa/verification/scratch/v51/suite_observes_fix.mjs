// VERIFIER #51 — do the REWRITTEN contracts (v49 C3, v50 C4/C5/C11) actually observe the option-(1) term? Build a
// scratch copy of index.ts with the legacy consumer's `!result.pendingAction &&` removed (and, separately, the
// structured consumer's), run the suites against it via SEM_INDEX_SRC, and require them to go RED. Also: does
// run15 break LOUDLY on a local const inside readsAsCompletion's .map() callback (the V47-D6 hazard), and does
// CONTRACT 5 (narrowed to top-level declarations) still fail for the reason it exists (a NEW top-level const)?
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const CAND = 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(CAND, 'utf8');
mkdirSync('qa/verification/scratch/v51/mut', { recursive: true });
const once = (t, from, to, n) => { const k = t.split(from).length - 1; if (k !== 1) throw new Error(n + ' applies ' + k + ' times'); return t.split(from).join(to); };
const variants = {
  legacyTermDropped: once(src, "&& !groundedOutcomeThisTurn && !claimsFutureActionWithNoPlan\r\n          && !result.pendingAction && readsAsCompletion", "&& !groundedOutcomeThisTurn && !claimsFutureActionWithNoPlan\r\n          && readsAsCompletion", 'legacy'),
  structuredTermDropped: once(src, "const unaccountedCompletionProse = !hasSupportedMutationClaim\r\n          && !result.pendingAction && readsAsCompletion", "const unaccountedCompletionProse = !hasSupportedMutationClaim\r\n          && readsAsCompletion", 'structured'),
  localConstInMap: once(src, ".map((c) => c.replace(/\\([^()]*\\)/g, (p0) => ' '.repeat(p0.length))", ".map((c) => { const __probe = 1; return c; }).map((c) => c.replace(/\\([^()]*\\)/g, (p0) => ' '.repeat(p0.length))", 'localConst'),
  newTopLevelConst: once(src, "        const NEGATION_AUX = /", "        const V51_PROBE_CONST = /x/;\r\n        const NEGATION_AUX = /", 'topLevel'),
};
const run = (suite, file) => { const r = spawnSync(process.execPath, [suite], { encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: file }, maxBuffer: 1 << 26, timeout: 300000 }); const out = (r.stdout || '') + (r.stderr || ''); const fails = out.split('\n').filter((l) => /^\s*(FAIL|not ok|✗)/i.test(l)).map((l) => l.trim().slice(0, 150)); return { exit: r.status, fails, tail: out.trim().split('\n').slice(-1)[0].slice(0, 200) }; };
for (const [name, text] of Object.entries(variants)) {
  const file = 'qa/verification/scratch/v51/mut/index.' + name + '.ts'; writeFileSync(file, text);
  console.log('\n=== mutant: ' + name + ' ===');
  const suites = name.startsWith('legacy') || name.startsWith('structured')
    ? ['qa/verification/proposed/v50_regression_additions.mjs', 'qa/verification/proposed/v49_regression_additions.mjs', 'qa/scenarios-runner/run8_defect_closure_contract.mjs']
    : ['qa/scenarios-runner/run15_defect_closure_contract.mjs', 'qa/scenarios-runner/v92_open_regression_contract.mjs'];
  for (const s of suites) { const r = run(s, file); console.log('  ' + s.split('/').pop().padEnd(44) + ' exit=' + r.exit + '  ' + r.tail); for (const f of r.fails.slice(0, 4)) console.log('       ' + f); }
}
// control: the unmodified candidate through the same env path
console.log('\n=== control: unmodified candidate via SEM_INDEX_SRC ===');
for (const s of ['qa/verification/proposed/v50_regression_additions.mjs', 'qa/verification/proposed/v49_regression_additions.mjs', 'qa/scenarios-runner/run15_defect_closure_contract.mjs', 'qa/scenarios-runner/v92_open_regression_contract.mjs']) { const r = run(s, CAND); console.log('  ' + s.split('/').pop().padEnd(44) + ' exit=' + r.exit + '  ' + r.tail); }
