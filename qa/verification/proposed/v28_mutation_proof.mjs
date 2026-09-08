#!/usr/bin/env node
// MUTATION PROOF for the run28 closure (verifier #28 / campaign #88): D163 FIX-H hedging-lexicon
// anchor (the one closure this candidate holds; FIX-I was REVERTED, D164/D166 are documented
// residuals) and the evidential same-segment arm (FIX-D/FIX-F, still load-bearing). Observer:
// qa/scenarios-runner/run28_defect_closure_contract.mjs. Real source never written; sha guarded.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const INDEX = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const RUN28 = join(REPO, 'qa', 'scenarios-runner', 'run28_defect_closure_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START = sha(pristine);
const HEDGE = '(?:(?:not|never|also|already|just|now|still|well|very|quite|really|truly|indeed|perhaps|possibly|probably|conceivably|previously|recently|actually|certainly|definitely|surely|maybe|in|fact|and|or|by|then|somehow|otherwise)\\s+){0,3}';
const EVID_VERBS = 'show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?';

const MUTATIONS = [
  ['D163 COVERAGE: FIX-H reverted to the arbitrary [a-z]+ window → modal + subject + perfect passive swallows a completion', 'coverage',
    [[HEDGE, '(?:[a-z]+\\s+){0,2}?']], ['D163.oneTokenName', 'D163.digitInName']],
  ['D156/FIX-F COVERAGE: the evidential verb group broken → a same-segment (negated-NP) evidential negative is destroyed', 'coverage',
    [['\\b(?:' + EVID_VERBS + ')\\b/i.test((c.slice', '\\b(?:zzNEVERMATCH)\\b/i.test((c.slice']],
    ['D164.keep.noLogHoweverShows', 'D164.keep']],
];

const tmp = mkdtempSync(join(tmpdir(), 'v28mut-'));
const TMPF = join(tmp, 'index.ts');
const run = (src) => { try { return execFileSync(process.execPath, [RUN28], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: src } }); } catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n RUN ERROR\n'; } };
const fails = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+\[[^\]]*\]\s+/, '').split(/\s::|["—]/)[0].trim());

let unproven = 0;
try {
  writeFileSync(TMPF, pristine, 'utf8');
  const base = run(TMPF);
  if (!/110 pass(?:ed)?, 0 fail/.test(base) || fails(base).length) { console.log('BASELINE NOT CLEAN:\n' + base.split(/\r?\n/).slice(-4).join('\n')); process.exit(1); }
  console.log('baseline: run28 110/0 on the real fixed source\n');
  for (const [label, kind, edits, expect] of MUTATIONS) {
    let text = pristine, ok = true;
    for (const [find, repl] of edits) { const n = text.split(find).length - 1; if (n !== 1) { console.log(`UNPROVEN  ${label}\n          stale anchor (${n}x): ${find.slice(0, 56)}`); ok = false; break; } text = text.split(find).join(repl); }
    if (!ok) { unproven++; continue; }
    writeFileSync(TMPF, text, 'utf8');
    const got = fails(run(TMPF));
    const caught = expect.filter((id) => got.some((g) => g.startsWith(id)));
    if (caught.length === 0) { console.log(`UNPROVEN  ${label}\n          expected ${expect.join('/')} to FAIL; failures: ${got.slice(0, 5).join(' | ') || '(none)'}`); unproven++; }
    else console.log(`PROVEN    [${kind}] ${label}\n          reopened → ${caught.join(', ')}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (sha(readFileSync(INDEX, 'utf8')) !== START) { console.log('*** REAL SOURCE MODIFIED'); process.exit(2); }
  console.log('\nreal index.ts untouched (sha ' + START.slice(0, 12) + '…)');
}
console.log(`\nv28_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
