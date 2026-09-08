#!/usr/bin/env node
// MUTATION PROOF for the run22 closure (verifier #22 / campaign #82 findings CLOSED this
// iteration: D150 label-gate, D151 lexicon + clause-initial free-pass removal, D152 active
// arm; D146 stays closed). Observer: qa/scenarios-runner/run22_defect_closure_contract.mjs.
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
const RUN22 = join(REPO, 'qa', 'scenarios-runner', 'run22_defect_closure_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START = sha(pristine);

const IMPER = "(matchedOption.actionType === 'restore' ? /\\b(?:archive|delete|remove|end)\\b/i : /\\b(?:restore|unarchive|reactivate|activate)\\b/i).test(command)";
const ACTIVE_ARM = '|(?:^|\\bconfirmed\\s*[—–-]\\s*)(?:and\\s+|but\\s+|so\\s+|then\\s+)?(?:i|we)\\s+(?:just\\s+|already\\s+|also\\s+|now\\s+|recently\\s+|successfully\\s+|have\\s+|had\\s+)*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\\s+\\S';

const MUTATIONS = [
  ['D150 LIMIT: the label-bareness gate always true → a real base-form-verb NAME becomes unselectable', 'limit',
    [["RESTORE_VERB_PATTERN).source, 'ig'), ' ').trim().length === 0", "RESTORE_VERB_PATTERN).source, 'ig'), ' ').trim().length >= 0"]],
    ['D150.archivePending.baseFormName', 'D150.restorePending.baseFormName']],
  ['D148 COVERAGE: the imperative opposite-verb test is neutralised → "restore it" arms the opposite field', 'coverage',
    [[IMPER, 'false']], ['D148.archivePending.oppositeCommand', 'D148.restorePending.oppositeCommand']],
  ['D151 COVERAGE: the negator lexicon reverts → nobody/neither/nor/few/hardly truthful negatives destroyed', 'coverage',
    [['not|never|no|nobody|nothing|none|nowhere|neither|nor|few|hardly|', 'not|never|no|nothing|none|']],
    ['D151.excludedNegatorTruthfulNegative']],
  ['D147b COVERAGE: the clause-initial free pass is re-added → a clause-initial-negator fabrication is missed', 'coverage',
    [['whom)\\b/i.test(c.slice(n, m.index))\n            || !(', 'whom)\\b/i.test(c.slice(n, m.index)) || !NEGATION_AUX.test(c.slice(0, n))\n            || !(']],
    ['D147b.clauseInitialNegatorFreePass']],
  ['D152 COVERAGE: the active-voice arm is removed → a first-person active completion is missed', 'coverage',
    [[ACTIVE_ARM, '']], ['D152.activeVoiceCompletionUncaught']],
  ['D146 COVERAGE: the broad subordinator set is restored → a temporal/prepositional truthful negative destroyed', 'coverage',
    [['/\\b(?:although|though|however|therefore)\\b/i.test(c.slice(n, m.index))', '/\\b(?:because|since|although|though|while|after|before|however|therefore)\\b/i.test(c.slice(n, m.index))']],
    ['D146.truthfulNegativeSurvives']],
];

const tmp = mkdtempSync(join(tmpdir(), 'v22mut-'));
const TMPF = join(tmp, 'index.ts');
const run = (src) => { try { return execFileSync(process.execPath, [RUN22], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: src } }); } catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n RUN ERROR\n'; } };
const fails = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+\[[^\]]*\]\s+/, '').split(' — ')[0].trim());

let unproven = 0;
try {
  writeFileSync(TMPF, pristine, 'utf8');
  const base = run(TMPF);
  if (!/242 pass, 0 fail/.test(base) || fails(base).length) { console.log('BASELINE NOT CLEAN:\n' + base.split(/\r?\n/).slice(-4).join('\n')); process.exit(1); }
  console.log('baseline: run22 242/0 on the real fixed source\n');
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
console.log(`\nv22_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
