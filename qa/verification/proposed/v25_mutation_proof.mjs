#!/usr/bin/env node
// MUTATION PROOF for the run25 closure (verifier #25 / campaign #85: D160/D160b FIX-D position-
// based evidential test; D161 FIX-E modal-hedge guard; D156/D157/D155 stay closed). Observer:
// qa/scenarios-runner/run25_defect_closure_contract.mjs. Each mutation re-creates a finding on a
// TEMP COPY and asserts a NAMED case FAILS. Real source never written; sha guarded.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const INDEX = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const RUN25 = join(REPO, 'qa', 'scenarios-runner', 'run25_defect_closure_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START = sha(pristine);
const LASTSEG = ".split(/\\s(?:and|but)\\s|\\b(?:although|though|however|therefore)\\b/i).pop() ?? '')";
const EVID_DISJ = " || /\\b(?:show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?)\\b/i.test(c.slice(n, m.index)" + LASTSEG;
const FIXE = "            && !/\\b(?:may|might|could|can|would|should)\\s+(?:[a-z]+\\s+){0,2}?(?:have been|has been|had been|be)\\b/i.test(c)\n";

const MUTATIONS = [
  ['D160/D160b COVERAGE: FIX-D reverted to a whole-span evidential test → adverb-separated & intransitive evidentials disarm', 'coverage',
    [[LASTSEG, ')']], ['D160.adverbDefeatsFixedLengthLookbehind', 'D160b.intransitiveActiveEvidential']],
  ['D156 COVERAGE: the evidential disjunct is removed → an active-complement evidential negative is destroyed', 'coverage',
    [[EVID_DISJ, '']], ['D156.activeEvidentialSurvives']],
  ['D161 COVERAGE: FIX-E modal-hedge guard neutralised → a modal hedge is destroyed', 'coverage',
    [["!/\\b(?:may|might|could|can|would|should)\\s+(?:[a-z]+\\s+){0,2}?(?:have been|has been|had been|be)\\b/i.test(c)", 'true']],
    ['D161.adverbDefeatsModalLookbehind']],
  ['D155 COVERAGE: the active-arm object test widened to \\S → a first-person non-completion is destroyed', 'coverage',
    [['(?:[A-Z]|company|companies|employee|person|people|task|tasks|goal|goals|project|projects|department|departments|approval|approvals|document|documents|account|record|records|binding|bindings|channel|channels)/.test(c)', '\\S/.test(c)']],
    ['D155.truthfulFirstPersonSurvives']],
];

const tmp = mkdtempSync(join(tmpdir(), 'v25mut-'));
const TMPF = join(tmp, 'index.ts');
const run = (src) => { try { return execFileSync(process.execPath, [RUN25], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: src } }); } catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n RUN ERROR\n'; } };
const fails = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+\[[^\]]*\]\s+/, '').split(/["—]/)[0].trim().replace(/\.$/, ''));

let unproven = 0;
try {
  writeFileSync(TMPF, pristine, 'utf8');
  const base = run(TMPF);
  if (!/440 passed, 0 failed/.test(base) || fails(base).length) { console.log('BASELINE NOT CLEAN:\n' + base.split(/\r?\n/).slice(-4).join('\n')); process.exit(1); }
  console.log('baseline: run25 440/0 on the real fixed source\n');
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
console.log(`\nv25_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
