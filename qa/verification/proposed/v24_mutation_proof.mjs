#!/usr/bin/env node
// MUTATION PROOF for the run24 closure (verifier #24 / campaign #84: D158 FIX-C passive-
// evidential gate; D156/D155/D157 stay closed). Observer:
// qa/scenarios-runner/run24_defect_closure_contract.mjs. Each mutation re-creates a finding
// on a TEMP COPY and asserts a NAMED case FAILS. Real source never written; sha guarded.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const INDEX = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const RUN24 = join(REPO, 'qa', 'scenarios-runner', 'run24_defect_closure_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START = sha(pristine);
const LB = '(?<!was )(?<!were )(?<!is )(?<!are )(?<!am )(?<!be )(?<!been )(?<!being )(?<!has )(?<!have )(?<!had )';
const EVID = 'show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?';

const MUTATIONS = [
  ['D158 COVERAGE: FIX-C lookbehinds removed (back to FIX-A) → a PASSIVE evidential disarms and the fabrication ships', 'coverage',
    [[`(?:that|which|who|whom)\\b|${LB}\\b(?:${EVID})\\b`, `(?:that|which|who|whom|${EVID})\\b`]],
    ['D158.passiveEvidentialDisarms']],
  ['D156 COVERAGE: the evidential verbs are removed entirely → an evidential-complement truthful negative is destroyed', 'coverage',
    [[`(?:that|which|who|whom)\\b|${LB}\\b(?:${EVID})\\b`, '(?:that|which|who|whom)\\b']],
    ['D156.activeEvidentialSurvives']],
  ['D155 COVERAGE: the active-arm object test widened to \\S → a first-person non-completion is destroyed', 'coverage',
    [['(?:[A-Z]|company|companies|employee|person|people|task|tasks|goal|goals|project|projects|department|departments|approval|approvals|document|documents|account|record|records|binding|bindings|channel|channels)/.test(c)', '\\S/.test(c)']],
    ['D155.truthfulFirstPersonSurvives']],
  ['D157 COVERAGE: the imperative test reverts to its hand-written inline list → "bring back" arms archive on a restore', 'coverage',
    [["(matchedOption.actionType === 'restore' ? ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN).test(command)))",
      "(matchedOption.actionType === 'restore' ? /\\b(?:archive|delete|remove|end)\\b/i : /\\b(?:restore|unarchive|reactivate|activate)\\b/i).test(command)))"]],
    ['D157.bringBack', 'D157.bringItBack']],
];

const tmp = mkdtempSync(join(tmpdir(), 'v24mut-'));
const TMPF = join(tmp, 'index.ts');
const run = (src) => { try { return execFileSync(process.execPath, [RUN24], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: src } }); } catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n RUN ERROR\n'; } };
const fails = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+\[[^\]]*\]\s+/, '').split(/["—]/)[0].trim().replace(/\.$/, ''));

let unproven = 0;
try {
  writeFileSync(TMPF, pristine, 'utf8');
  const base = run(TMPF);
  if (!/207 passed, 0 failed/.test(base) || fails(base).length) { console.log('BASELINE NOT CLEAN:\n' + base.split(/\r?\n/).slice(-4).join('\n')); process.exit(1); }
  console.log('baseline: run24 207/0 on the real fixed source\n');
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
console.log(`\nv24_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
