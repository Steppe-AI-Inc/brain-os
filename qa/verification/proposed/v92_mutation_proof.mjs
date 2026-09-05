#!/usr/bin/env node
// MUTATION PROOF for the v92-DIFFERENTIAL closure: each of the eight source changes that took the
// candidate from 12 fabrication-regressions-vs-v92 to 0 is reverted on a TEMP COPY, and the permanent
// parity suite (qa/scenarios-runner/v92_parity_contract.mjs) must report the regression again.
// Real source never written; sha guarded.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const INDEX = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const SUITE = join(REPO, 'qa', 'scenarios-runner', 'v92_parity_contract.mjs');
const pristine = readFileSync(INDEX, 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const START = sha(pristine);
const FAB0 = 'belt.fabRegression==0';
const MUTATIONS = [
  ['D27 rename-arrow arm removed → production row 9dda919c ships again', [["|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))", '']], [FAB0, 'belt.productionShapes.D27-prod']],
  ['R-IDIOM idiom-prefix strip removed → "No problem — X was archived" ships', [[".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem)\\s*[—–-]\\s+/i, '')", '']], [FAB0]],
  ['hyphen-attached negator exclusion removed → "nothing-to-report company was archived" ships', [['(?<!-)\\b(?:not|never|no|nobody', '\\b(?:not|never|no|nobody'], [")\\b(?!-)/i;", ")\\b/i;"]], [FAB0]],
  ['so/yet/because linker-with-no-negator rule removed → "There were no blockers so X was archived" ships', [["\n              || (c.slice(n, m.index).split(/\\b(?:so|yet|because)\\s+/i).length > 1 && !NEGATED_CLAUSE.test(c.slice(n, m.index).split(/\\b(?:so|yet|because)\\s+/i).pop() ?? ''))", '']], [FAB0]],
  ['parenthetical handling removed → "X (no longer active) was archived" ships', [[".map((c) => c.replace(/\\([^()]*\\)/g, ' ').trim()).concat((String(s).match(/\\([^()]*\\)/g) || []).map((p) => p.slice(1, -1).trim()))", '.map((c) => c.trim())']], [FAB0]],
  ['tight em/en-dash boundary removed → "not rejected—it has been approved" ships', [['|[—–](?=(?!(?:was|were|is|are|has|have|had|been|being|not)\\b)[a-z])', '']], [FAB0, 'belt.productionShapes.D16-prod']],
  ['relativizer last-segment refinement removed → "matched that name so the company has been archived" ships', [["/\\b(?:that|which|who|whom)\\b/i.test(c.slice(n, m.index).split(/\\b(?:so|yet|because)\\s+/i).pop() ?? '')", "/\\b(?:that|which|who|whom)\\b/i.test(c.slice(n, m.index))"]], [FAB0]],
  ['so/yet/because dropped from the evidential last-segment split → "could not confirm the owner yet the employee was created" ships', [["|therefore|so|yet|because)\\b/i).pop() ?? '')", "|therefore)\\b/i).pop() ?? '')"]], [FAB0]],
];
const tmp = mkdtempSync(join(tmpdir(), 'v92mut-')); const TMPF = join(tmp, 'index.ts');
const run = (src) => { try { return execFileSync(process.execPath, [SUITE], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SEM_INDEX_SRC: src } }); } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); } };
const fails = (out) => out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.replace(/^FAIL\s+/, '').split(' — ')[0].trim());
let unproven = 0;
try {
  writeFileSync(TMPF, pristine, 'utf8');
  const base = run(TMPF);
  if (fails(base).length) { console.log('BASELINE NOT CLEAN:\n' + fails(base).join('\n')); process.exit(1); }
  console.log('baseline: v92_parity_contract green on the real source\n');
  for (const [label, edits, expect] of MUTATIONS) {
    let text = pristine, ok = true;
    for (const [find, repl] of edits) { const n = text.split(find).length - 1; if (n !== 1) { console.log(`UNPROVEN  ${label}\n          stale anchor (${n}x): ${find.slice(0, 60)}`); ok = false; break; } text = text.split(find).join(repl); }
    if (!ok) { unproven++; continue; }
    writeFileSync(TMPF, text, 'utf8');
    const got = fails(run(TMPF));
    const caught = expect.filter((id) => got.some((g) => g.startsWith(id)));
    if (caught.length === 0) { console.log(`UNPROVEN  ${label}\n          expected ${expect.join('/')} to FAIL; failures: ${got.slice(0, 4).join(' | ') || '(none)'}`); unproven++; }
    else console.log(`PROVEN    ${label}\n          reopened → ${caught.join(', ')}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (sha(readFileSync(INDEX, 'utf8')) !== START) { console.log('*** REAL SOURCE MODIFIED'); process.exit(2); }
  console.log('\nreal index.ts untouched (sha ' + START.slice(0, 12) + '…)');
}
console.log(`\nv92_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven ? 1 : 0);
