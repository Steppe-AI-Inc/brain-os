#!/usr/bin/env node
// MUTATION PROOF for the run21 closure (verifier #21 / campaign #81 findings that this
// iteration CLOSES: D139 narrowed R-ZR2, D142/D148 imperative-form, D146 linker overreach,
// D149 run15 pin). Observer: qa/scenarios-runner/run21_defect_closure_contract.mjs (the
// promoted closure contract). Each mutation re-creates a finding on a TEMP COPY of index.ts
// and asserts a NAMED case FAILS — coverage mutations reopen a closed DEFECT, limit
// mutations break a CONTRACT. The real source is never written; a sha check guards it.
// (D141 and D144's active arm are DOCUMENTED RESIDUALS this iteration, not closures, so
// they carry no coverage mutation — run21 pins them at their current behaviour instead.)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const INDEX = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const RUN21 = join(REPO, 'qa', 'scenarios-runner', 'run21_defect_closure_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START = sha(pristine);

const LINKER_COORD = '/(?:^|\\s)[a-z][^\\s]*\\s+(?:and|but)\\s/.test(c.slice(n, m.index))';
const LINKER_SUBORD = '/\\b(?:although|though|however|therefore)\\b/i.test(c.slice(n, m.index))';
const IMPER = "(matchedOption.actionType === 'restore' ? /\\b(?:archive|delete|remove|end)\\b/i : /\\b(?:restore|unarchive|reactivate|activate)\\b/i).test(command)";

const MUTATIONS = [
  ['D139 COVERAGE: R-ZR2 linker always-present → zero-relativizer truthful negatives destroyed', 'coverage',
    [[LINKER_COORD, 'true']], ['D139.closed.zeroRelativizer']],
  ['D139/D146 LIMIT: R-ZR2 linker always-absent → a genuinely clause-linked fabrication is missed', 'limit',
    [[LINKER_COORD, 'false'], [LINKER_SUBORD, 'false']], ['D146.limit.realLinkedFabricationCaught']],
  ['D146 COVERAGE: the broad subordinator set is restored → a temporal/prepositional truthful negative is destroyed', 'coverage',
    [['/\\b(?:although|though|however|therefore)\\b/i', '/\\b(?:because|since|although|though|while|after|before|however|therefore)\\b/i']],
    ['D146.linkerOverreach']],
  ['D148 COVERAGE: the imperative opposite-verb test is neutralised → "restore it" arms the opposite field', 'coverage',
    [[IMPER, 'false']], ['D148.archivePendingVerbLabel', 'D148.restorePendingVerbLabel']],
  ['D142 LIMIT: the imperative test is widened to the -ed stem → a real participial NAME becomes unselectable', 'limit',
    [['/\\b(?:restore|unarchive|reactivate|activate)\\b/i', '/restor/i']], ['D138.nameStillSelectable']],
  ['D149 COVERAGE: a negator is re-added to NEGATED_CLAUSE without updating run15 → run15 pin breaks again', 'coverage',
    [['not|never|no|nothing|none|', 'not|never|no|nobody|nothing|none|']], ['D149.run15PinStillMatchesTheProduct']],
];

const tmp = mkdtempSync(join(tmpdir(), 'v21mut-'));
const TMPF = join(tmp, 'index.ts');
const run = (src) => { try { return execFileSync(process.execPath, [RUN21], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: src } }); } catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n RUN ERROR\n'; } };
const fails = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+\[[^\]]*\]\s+/, '').split(' — ')[0].trim());

let unproven = 0;
try {
  writeFileSync(TMPF, pristine, 'utf8');
  const base = run(TMPF);
  if (!/136 pass, 0 fail/.test(base) || fails(base).length) { console.log('BASELINE NOT CLEAN:\n' + base.split(/\r?\n/).slice(-4).join('\n')); process.exit(1); }
  console.log('baseline: run21 136/0 on the real fixed source\n');
  for (const [label, kind, edits, expect] of MUTATIONS) {
    let text = pristine, ok = true;
    for (const [find, repl] of edits) { const n = text.split(find).length - 1; if (n !== 1) { console.log(`UNPROVEN  ${label}\n          stale anchor (${n}x): ${find.slice(0, 56)}`); ok = false; break; } text = text.split(find).join(repl); }
    if (!ok) { unproven++; continue; }
    writeFileSync(TMPF, text, 'utf8');
    const got = fails(run(TMPF));
    const caught = expect.filter((id) => got.some((g) => g.startsWith(id)));
    if (caught.length === 0) { console.log(`UNPROVEN  ${label}\n          expected ${expect.join('/')} to FAIL; failures: ${got.slice(0, 5).join(' | ') || '(none)'}`); unproven++; }
    else console.log(`PROVEN    [${kind}] ${label}\n          reopened → ${got.filter((g) => expect.some((e) => g.startsWith(e))).slice(0, 3).join(', ')}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (sha(readFileSync(INDEX, 'utf8')) !== START) { console.log('*** REAL SOURCE MODIFIED'); process.exit(2); }
  console.log('\nreal index.ts untouched (sha ' + START.slice(0, 12) + '…)');
}
console.log(`\nv21_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
