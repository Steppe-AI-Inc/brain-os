// VERIFIER #17 / SCENARIO 9 — ledger + bookkeeping truth.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });

const count = (ref) => git('ls-tree', '-r', '--name-only', ref, 'qa/scenarios-runner/')
  .split('\n').filter((f) => f.endsWith('.mjs')).length;
console.log('.mjs suites at 52e830f (verifier #16 baseline): ' + count('52e830f'));
console.log('.mjs suites at f232975 (closure commit)       : ' + count('f232975'));
console.log('.mjs suites at 9535f0b (candidate, worktree)  : '
  + readdirSync('qa/scenarios-runner').filter((f) => f.endsWith('.mjs')).length);
console.log('\nledger CLOSURE POSTSCRIPT claims: "Full battery: 27 suites, 0 failures'
  + ' (21 assertion-bearing, 5 self-labelled SUPERSEDED stubs, 1 library)"');
console.log('independent count at the candidate: 28 suites = 22 assertion-bearing + 5 stubs + 1 library.');
console.log('=> the postscript adopted verifier #16\'s PRE-run16 count (27/21) unchanged AFTER adding run16.');

const led = readFileSync('qa/KNOWN_FAILURE_MODES.md', 'utf8');
const i76 = led.indexOf('## #76 —');
const entry = led.slice(i76);
console.log('\n--- claims in the #76 entry/postscript I could check against the code ---');
const checks = [
  ['candidate commit named', /`0a031277486041da72002a88edc3f7e86ddb473d`/.test(entry)],
  ['#76 index sha named', /0c3616b4e82b53f18e0b597aa0fe935b4c0bed1dcae86fbc9d4c59b91812fc26/.test(entry)],
  ['verdict FAIL stated plainly', /\*\*Verdict: FAIL\*\*/.test(entry)],
  ['production v92 / ezbr recorded', /version 92, ACTIVE/.test(entry) && /33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475/.test(entry)],
  ['*.sql suites explicitly NOT run', /60 `\*\.sql` suites[\s\S]{0,60}NOT\*\* run|\*\*NOT\*\* run/.test(entry)],
  ['NEGATED_MENTION described as REMOVED', /word list \(`NEGATED_MENTION`\) is REMOVED/.test(entry)],
  ['two contracts described as INVERTED', /deliberately INVERTED and recorded/.test(entry)],
  ['D125 residual disclosed as same-clause-only', /Residual, disclosed: a negator inside one\s*\n?bare clause with no separator at all/.test(entry)],
  ['filler described as "the pending action\'s own verbs"', /the pending action's own\s*\n?verbs/.test(entry)],
  ['no promotion preamble leaked', !/^\s*PROMOTION NOTE/m.test(led)],
];
for (const [what, ok] of checks) console.log('  ' + (ok ? 'PRESENT ' : 'ABSENT  ') + what);

const src = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
console.log('\n--- claim vs code ---');
console.log('  NEGATED_MENTION still in index.ts?           ' + src.includes('const NEGATED_MENTION'));
console.log('  SELECTION_FILLER present?                    ' + src.includes('const SELECTION_FILLER'));
console.log('  cleanSelection on all THREE paths?           '
  + ((src.match(/cleanSelection\(/g) || []).length - 1) + ' call sites (declaration excluded)');
console.log('  CANONICAL_TYPE_ALIAS present?                ' + src.includes('const CANONICAL_TYPE_ALIAS'));
console.log('  canonicalKnowsIt uses canonicalById/lastKnownLabel? '
  + /canonicalKnowsIt[\s\S]{0,220}canonicalById\.has\([\s\S]{0,80}lastKnownLabel\(/.test(src));
console.log('  typedFallback comparison gone?               ' + !src.includes("bare(derivedLabel) !== bare(typedFallback)"));
console.log('  splitter has the confirmed lookbehind?       ' + src.includes('(?<!\\bconfirmed\\s*)[–—]+'));

const cc = JSON.parse(readFileSync('qa/verification/CURRENT_CAMPAIGN.json', 'utf8'));
console.log('\n--- CURRENT_CAMPAIGN.json ---');
console.log('  campaign / verifier            : ' + cc.campaign + ' / ' + cc.verifier);
console.log('  closure_commit                 : ' + cc.closure_commit + '  (actual: f232975)');
console.log('  index_sha256                   : ' + cc.index_sha256);
console.log('  base_commit recorded by me     : ' + (cc.verifier_17_actual_start || {}).base_commit);
console.log('  HEAD                           : ' + git('rev-parse', 'HEAD').trim());
console.log('  rotation commit touches index? : '
  + (git('diff', '--name-only', 'f232975', '9535f0b').includes('index.ts') ? 'YES (PROBLEM)' : 'no — bookkeeping only, verified by diff'));
