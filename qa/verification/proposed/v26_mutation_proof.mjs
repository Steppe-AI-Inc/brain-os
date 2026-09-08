#!/usr/bin/env node
// MUTATION PROOF for the run26 closure (verifier #26 / campaign #86: D162a FIX-G unanchored
// bare-`be` removed; D162b FIX-F name-safe evidential split; D160/D156/D161 stay closed).
// Observer: qa/scenarios-runner/run26_defect_closure_contract.mjs. Each mutation re-creates a
// finding on a TEMP COPY and asserts a NAMED case FAILS. Real source never written; sha guarded.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const INDEX = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const RUN26 = join(REPO, 'qa', 'scenarios-runner', 'run26_defect_closure_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START = sha(pristine);
// the exact argument the shipped evidential test runs on (FIX-D subordinator split + FIX-F
// name-safe coordinator split, leading pop null-safe for deno)
const ARG = "(c.slice(n, m.index).split(/\\b(?:although|though|however|therefore)\\b/i).pop() ?? '').split(/(?:^|\\s)[a-z][^\\s]*\\s+(?:and|but)\\s/).pop() ?? ''";
const EVID_TEST = " || /\\b(?:show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?)\\b/i.test(" + ARG + ")";

const MUTATIONS = [
  ['D162a COVERAGE: the unanchored bare-`be` alternative is re-added → copular modal swallows a real completion', 'coverage',
    [['(?:have been|has been|had been)\\b/i.test(c)', '(?:have been|has been|had been|be)\\b/i.test(c)']],
    ['D162a.copularModalSwallowsCompletion']],
  ['D162b COVERAGE: FIX-F reverted to the name-blind split → an `and` inside a real NAME defeats the evidential test', 'coverage',
    [[ARG, "c.slice(n, m.index).split(/\\s(?:and|but)\\s|\\b(?:although|though|however|therefore)\\b/i).pop() ?? ''"]],
    ['D162b.nameInternalLinkerDefeatsEvidential']],
  ['D160 COVERAGE: the last-segment split removed → an evidential pushed out by a linker disarms on the whole span', 'coverage',
    [[ARG, 'c.slice(n, m.index)']], ['D160.linkerPushesEvidentialOut']],
  ['D156 COVERAGE: the evidential disjunct removed → a same-segment evidential-complement negative is destroyed', 'coverage',
    [[EVID_TEST, '']], ['D156.sameSegmentEvidentialSurvives']],
  ['D161 COVERAGE: the modal-hedge guard neutralised → a modal hedge is destroyed', 'coverage',
    [["!/\\b(?:may|might|could|can|would|should)\\s+(?:[a-z]+\\s+){0,2}?(?:have been|has been|had been)\\b/i.test(c)", 'true']],
    ['D161.hedgeSurvives']],
];

const tmp = mkdtempSync(join(tmpdir(), 'v26mut-'));
const TMPF = join(tmp, 'index.ts');
const run = (src) => { try { return execFileSync(process.execPath, [RUN26], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: src } }); } catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n RUN ERROR\n'; } };
const fails = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+\[[^\]]*\]\s+/, '').split(/["—]/)[0].trim().replace(/\.$/, ''));

let unproven = 0;
try {
  writeFileSync(TMPF, pristine, 'utf8');
  const base = run(TMPF);
  if (!/145 pass(?:ed)?, 0 fail/.test(base) || fails(base).length) { console.log('BASELINE NOT CLEAN:\n' + base.split(/\r?\n/).slice(-4).join('\n')); process.exit(1); }
  console.log('baseline: run26 145/0 on the real fixed source\n');
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
console.log(`\nv26_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
