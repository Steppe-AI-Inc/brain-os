#!/usr/bin/env node
// MUTATION PROOF for the run20 closure (verifier #20 / campaign #80: D139, D142, D141, D144).
// Observer: qa/scenarios-runner/run20_defect_closure_contract.mjs (the promoted regression,
// 102 CONTRACT/DEFECT assertions over the REAL shipped predicates). Each mutation re-creates
// a reviewer finding on a TEMP COPY of index.ts and asserts a NAMED case FAILS — coverage
// mutations reopen a DEFECT case, limit mutations break a CONTRACT case (proving the fix is
// not over-broad). The real source is never written; a sha check guards it at the end.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const INDEX = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const RUN20 = join(REPO, 'qa', 'scenarios-runner', 'run20_defect_closure_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START_SHA = sha(pristine);

// [label, kind, [ [find, replace], ... ], expectFailIds]
const MUTATIONS = [
  ['D139 COVERAGE: R9b linker always-present → zero-relativizer truthful negatives destroyed again (run18 behaviour)',
    'coverage',
    [['/(?:^|\\s)[a-z][^\\s]*\\s+(?:and|but|or|so|yet)\\s/.test(c.slice(n, m.index))', 'true']],
    ['D139.zeroRelativizer']],
  ['D139 LIMIT: R9b 4th disjunct always disarms → a trailing/coordinated fabrication is missed',
    'limit',
    [['/(?:^|\\s)[a-z][^\\s]*\\s+(?:and|but|or|so|yet)\\s/.test(c.slice(n, m.index))', 'false'],
     ['/\\b(?:because|since|although|though|while|after|before|however|therefore)\\b/i.test(c.slice(n, m.index))', 'false']],
    ['D139.limit.trailingNegatorStillCaught']],
  ['D142 COVERAGE: the label dead-end never fires → a company named "Restore" absorbs the command and arms the opposite field',
    'coverage',
    [["(matchedOption.actionType === 'restore' || matchedOption.actionType === 'archive')", 'false']],
    ['D142.labelIsVerb']],
  ['D142 LIMIT: the label dead-end drops its empty-remainder test → a real name CONTAINING a verb becomes unselectable',
    'limit',
    [["matchedOption.label.replace(new RegExp((matchedOption.actionType === 'restore' ? ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN).source, 'ig'), ' ').trim().length === 0", 'true']],
    ['D142.limit.d138NameStillSelectable']],
  ['D141 COVERAGE: the negator lexicon reverts → nobody/neither/nowhere/nor/few/hardly truthful negatives destroyed',
    'coverage',
    [['not|never|no|nobody|nothing|none|nowhere|neither|nor|few|hardly|', 'not|never|no|nothing|none|']],
    ['D141.negatorLexicon']],
  ['D144 COVERAGE: the active-voice arm is removed → "X is archived, and I also deleted Y" is missed',
    'coverage',
    [['|\\b(?:i|we|they)\\s+(?:just\\s+|already\\s+|then\\s+|also\\s+|now\\s+|recently\\s+|successfully\\s+)*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\\s+\\S', '']],
    ['D144']],
];

const tmp = mkdtempSync(join(tmpdir(), 'v20mut-'));
const TMPF = join(tmp, 'index.ts');
const runRun20 = (srcPath) => {
  try { return execFileSync(process.execPath, [RUN20], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: srcPath } }); }
  catch (e) { return String(e.stdout || '') + String(e.stderr || '') + '\n  RUN ERROR\n'; }
};
const failedIds = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+\[[^\]]*\]\s+/, '').split(' — ')[0].trim());

let unproven = 0;
try {
  // baseline: the real source passes run20 clean
  writeFileSync(TMPF, pristine, 'utf8');
  const base = runRun20(TMPF);
  const baseFails = failedIds(base);
  if (!/102 passed, 0 failed/.test(base) || baseFails.length) {
    console.log('BASELINE NOT CLEAN:\n' + base.split(/\r?\n/).slice(-6).join('\n')); process.exit(1);
  }
  console.log('baseline: run20 102/0 on the real fixed source\n');

  for (const [label, kind, edits, expect] of MUTATIONS) {
    let text = pristine, ok = true;
    for (const [find, repl] of edits) {
      const n = text.split(find).length - 1;
      if (n !== 1) { console.log(`UNPROVEN  ${label}\n          stale anchor (${n}x): ${find.slice(0, 60)}`); ok = false; break; }
      text = text.split(find).join(repl);
    }
    if (!ok) { unproven++; continue; }
    writeFileSync(TMPF, text, 'utf8');
    const got = failedIds(runRun20(TMPF));
    const caught = expect.filter((id) => got.some((g) => g.startsWith(id)));
    if (caught.length === 0) {
      console.log(`UNPROVEN  ${label}\n          expected a ${expect.join('/')} case to FAIL; failures: ${got.slice(0, 6).join(' | ') || '(none)'}`); unproven++;
    } else {
      console.log(`PROVEN    [${kind}] ${label}\n          reopened → FAIL: ${got.filter((g) => expect.some((e) => g.startsWith(e))).slice(0, 4).join(', ')}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (sha(readFileSync(INDEX, 'utf8')) !== START_SHA) { console.log('*** REAL SOURCE MODIFIED — ABORT'); process.exit(2); }
  console.log('\nreal index.ts untouched (sha ' + START_SHA.slice(0, 12) + '…)');
}
console.log(`\nv20_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
