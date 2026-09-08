// VERIFIER #41 — deploy questions Q3 (reintroduction), Q4 (baseline drift), Q6 (rollback),
// Q7 (deploy surface), re-derived from bytes.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const text = readFileSync(CAND, 'utf8');
const v92 = readFileSync(path.join(HERE, 'v92.lf.ts'), 'utf8');

console.log('=== Q3: does the candidate REINTRODUCE anything production/earlier rounds removed? ===');
const REMOVED = [
  ['D3 short-circuit `&& !result.pendingAction` on the past-completion gate', /claimsPastCompletionWithNoGrounding[\s\S]{0,400}?!result\.pendingAction/],
  ['run16/D123 NEGATED_MENTION word list (blocklist replaced by an allowlist)', /const NEGATED_MENTION\b/],
  ['run17 COMPLETION_VOCAB (superseded by COMPLETION_PARTICIPLE/COMPLETION_VERB)', /const COMPLETION_VOCAB\b/],
  ['run18/D131 "without" as a NEGATOR inside NEGATED_CLAUSE', /const NEGATED_CLAUSE[^;]*\bwithout\b/],
  ['run15/D117 whole-span negation LOOKAHEAD inside a belt regex', /\(\?![^)]*\[\^\]\*/],
  ['inline regex modifier group (?i:) / (?-i:) — unverified in the Deno Edge runtime', /\(\?-?[ims]+:/],
  ['a private copy of the pattern list in the second drift arm (D100)', /const unaccountedCompletionProse =[\s\S]{0,400}?PAST_COMPLETION_CLAIM_PATTERN/],
  ['plain indexed access in resolveClarificationField (run18/D132 prototype-key hazard)', /return CLARIFICATION_ENTITY_ACTION_FIELD\[entityType\]\?\.\[actionType\];/],
];
let reintro = 0;
for (const [what, re] of REMOVED) {
  const hit = re.test(text);
  if (hit) reintro++;
  console.log(`  ${hit ? '*** REINTRODUCED ***' : 'absent (ok)          '} ${what}`);
}
console.log(`  => Q3: ${reintro} reintroductions`);

console.log('\n=== Q4: do the DEPLOY gates compare against LIVE v92, or against 4476c92? ===');
const gates = ['qa/scenarios-runner/v92_open_regression_contract.mjs', 'qa/scenarios-runner/v92_parity_contract.mjs'];
const V92_PCCP = (v92.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/) || [])[1];
for (const gpath of gates) {
  const g = readFileSync(path.join(REPO, gpath), 'utf8');
  const has4476 = /4476c92/.test(g);
  const hasV92Literal = V92_PCCP && g.includes(V92_PCCP.slice(0, 80));
  const readsV92File = /index\.v92\.ts|v92\.lf\.ts|c9dfab5b/.test(g);
  console.log(`  ${gpath}`);
  console.log(`     mentions 4476c92 baseline: ${has4476}   pins the LIVE v92 PCCP literal: ${!!hasV92Literal}   reads a v92 source copy: ${readsV92File}`);
}
// The one assumption that matters: is the v92 gate the candidate pins byte-identical to LIVE v92's?
const candPCCP = (text.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/) || [])[1];
console.log(`  candidate's own PAST_COMPLETION_CLAIM_PATTERN === deployed v92's: ${candPCCP === V92_PCCP}`);
console.log(`  candidate's LEGACY_PAST_COMPLETION === deployed v92's PCCP:       ${(text.match(/const LEGACY_PAST_COMPLETION = (\/.*\/i);/) || [])[1] === V92_PCCP}`);

console.log('\n=== Q6: rollback target ===');
const gitV92 = execSync('git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts', { cwd: REPO, maxBuffer: 1 << 28 });
console.log(`  git c9dfab5bd43346bad501ab44d7bfbc5211e90ed5 exists, index.ts sha256 = ${createHash('sha256').update(gitV92).digest('hex')}`);
console.log(`  expected                                                          = 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`);
console.log(`  line endings of the rollback bytes: ${/\r\n/.test(gitV92.toString()) ? 'CRLF' : 'LF (matches how v92 was deployed from CI)'}`);

console.log('\n=== Q7: deploy surface ===');
const surface = execSync('git diff --numstat c9dfab5bd433 884567acb771e13a0235c80dd519424c74aaa9ed -- supabase/', { cwd: REPO }).toString().trim();
console.log('  git diff --numstat c9dfab5b..884567a -- supabase/ :');
console.log('  ' + (surface || '(no changes)').split('\n').join('\n  '));
console.log(`  candidate index.ts sha256 = ${createHash('sha256').update(readFileSync(CAND)).digest('hex')}`);
