#!/usr/bin/env node
// MUTATION PROOF for the run23 closure (verifier #23 / campaign #83 findings CLOSED: D156
// FIX-A evidential verbs, D155 fallback-1 case-sensitive active arm, D157 unified lexicon;
// D147b/D146 stay closed). Observer: qa/scenarios-runner/run23_defect_closure_contract.mjs.
// Each mutation re-creates a finding on a TEMP COPY and asserts a NAMED case FAILS. The real
// source is never written; a sha check guards it.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const INDEX = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const RUN23 = join(REPO, 'qa', 'scenarios-runner', 'run23_defect_closure_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START = sha(pristine);
const EVID = 'that|which|who|whom|show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?';

const MUTATIONS = [
  ['D156 COVERAGE: FIX-A evidential verbs removed → a negator scoping through "shows/proves/…" is destroyed', 'coverage',
    [[EVID, 'that|which|who|whom']], ['D156.evidentialComplementDestroyed']],
  ['D155 LIMIT: the active-arm object test widened to \\S → a first-person non-completion is destroyed', 'limit',
    [['(?:[A-Z]|company|companies|employee|person|people|task|tasks|goal|goals|project|projects|department|departments|approval|approvals|document|documents|account|record|records|binding|bindings|channel|channels)/.test(c)', '\\S/.test(c)']],
    ['D155.nonEntityObjectDestroyed']],
  ['D155 COVERAGE: the active arm never matches → a real first-person completion is missed', 'coverage',
    [['(?:I|We|i|we)\\s+(?:just ', '(?:zzXX)\\s+(?:just ']], ['D155.d144FabricationStillCaught']],
  ['D157 COVERAGE: the imperative test reverts to its hand-written inline list → "bring back" arms archive on a restore', 'coverage',
    [["(matchedOption.actionType === 'restore' ? ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN).test(command)))",
      "(matchedOption.actionType === 'restore' ? /\\b(?:archive|delete|remove|end)\\b/i : /\\b(?:restore|unarchive|reactivate|activate)\\b/i).test(command)))"]],
    ['D157.bringBack', 'D157.bringItBack', 'D157.unArchiveHyphenated']],
  ['D147b COVERAGE: the clause-initial free pass is re-added → a clause-initial-negator fabrication leaks', 'coverage',
    [['return n >= m.index || /\\b(?:that', 'return n >= m.index || !NEGATION_AUX.test(c.slice(0, n)) || /\\b(?:that']],
    ['D147b.clauseInitialLeakClosed']],
  ['D146 COVERAGE: the broad subordinator set is restored → a temporal/prepositional truthful negative destroyed', 'coverage',
    [['/\\b(?:although|though|however|therefore)\\b/i.test(c.slice(n, m.index))', '/\\b(?:because|since|although|though|while|after|before|however|therefore)\\b/i.test(c.slice(n, m.index))']],
    ['D146.truthfulNegativeSurvives']],
];

const tmp = mkdtempSync(join(tmpdir(), 'v23mut-'));
const TMPF = join(tmp, 'index.ts');
const run = (src) => { try { return execFileSync(process.execPath, [RUN23], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: src } }); } catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n RUN ERROR\n'; } };
const fails = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+\[[^\]]*\]\s+/, '').split(' — ')[0].trim());

let unproven = 0;
try {
  writeFileSync(TMPF, pristine, 'utf8');
  const base = run(TMPF);
  if (!/316 pass, 0 fail/.test(base) || fails(base).length) { console.log('BASELINE NOT CLEAN:\n' + base.split(/\r?\n/).slice(-4).join('\n')); process.exit(1); }
  console.log('baseline: run23 316/0 on the real fixed source\n');
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
console.log(`\nv23_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
