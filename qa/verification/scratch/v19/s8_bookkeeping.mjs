// SCENARIO 8 — LEDGER + BOOKKEEPING TRUTH: every claim in the #78 entry, its closure
// postscript and the in-source comments, checked against the code and the filesystem.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadBelt, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';
const src = loadFile(fileURLToPath(INDEX_PATH));
const belt = loadBelt(src).readsAsCompletion;
const led = fs.readFileSync('qa/KNOWN_FAILURE_MODES.md', 'utf8');
const seg = led.slice(led.indexOf('## #78 —'));
const camp = JSON.parse(fs.readFileSync('qa/verification/CURRENT_CAMPAIGN.json', 'utf8'));
const say = (verdict, claim, detail) => console.log(verdict.padEnd(9) + claim + (detail ? '\n          ' + detail : ''));

console.log('=== claims in the closure postscript ===');
const mjs = fs.readdirSync('qa/scenarios-runner').filter((f) => f.endsWith('.mjs'));
say(mjs.length === 29 ? 'TRUE' : 'FALSE', '"Full battery: 29 suites, 0 failures"',
  'filesystem at the candidate: ' + mjs.length + ' .mjs files (1 library + 5 SUPERSEDED stubs + 24 assertion-bearing). Third consecutive generation of the same PRE-CHANGE count (the same commit added run18_defect_closure_contract.mjs).');

const run18 = fs.readFileSync('qa/scenarios-runner/run18_defect_closure_contract.mjs', 'utf8');
// Counted from the suite's OWN OUTPUT (cases are emitted from loops as well as literal
// C(...) call sites, so counting call sites in the source undercounts).
const out18 = execFileSync(process.execPath, ['qa/scenarios-runner/run18_defect_closure_contract.mjs'], { encoding: 'utf8' });
const cases = (out18.match(/^OK\b/gm) || []).length;
const fails18 = (out18.match(/^FAIL\b/gm) || []).length;
say(cases === 56 && fails18 === 0 ? 'TRUE' : 'CHECK', '"All 56 of verifier #18\'s cases pass on the fixed source, promoted as run18_..."',
  'the promoted suite emits ' + cases + ' OK and ' + fails18 + ' FAIL on the candidate.');

say('TRUE', '"D132 ... All three now fail closed via hasOwnProperty"',
  'independently re-derived end to end in s4: 9 prototype keys x actionType/entityType/both, plus via the ordinal path — no throw, no field, no mutation armed.');
say('TRUE', '"D133 ... an ordinal reference selects it when in range; acme 2 and another option number still dead-end"',
  'independently re-derived in s4 across 1/2/3-option and numbered-fallback lists.');
say('PARTLY-FALSE', '"D131 ... Nine of the verifier\'s fabrications survive ... proven that no regex separates the two"',
  's1c: an alternative rule catches 5 of the 9 with 0 of the 9 paired real names destroyed and 0 new false positives on a 61-case truthful-negative corpus. The residual is real; "irreducible/proven" is not.');

console.log('\n=== claims made by the in-source comments ===');
const dashSplit = /String\(s\)\.split\(\/\[\.!\?,\\x3b\\n\]\+\|:\\s\/\)/.test(src.replace(/\r\n/g, '\n'));
say(dashSplit ? 'FALSE' : 'CHECK', 'index.ts:5507 "Boundaries: ... a SPACED dash, and a colon FOLLOWED BY SPACE"',
  'the shipped splitter is /[.!?,\\x3b\\n]+|:\\s/ — there is NO dash alternative. Its own example is contradicted by the code: '
  + '"No problem — ACME was archived." -> readsAsCompletion=' + belt('No problem — ACME was archived.')
  + ' (the comment says it "no longer shields the fabrication"), while "Nothing failed: ACME was archived." -> ' + belt('Nothing failed: ACME was archived.') + '.');
say('PARTLY-FALSE', 'index.ts:5490 "Present-tense is/are archived is a STATE ... deliberately excluded"',
  'excluded from COMPLETION_VERB (the negation reference) only. EXECUTION_IN_PROGRESS still matches bare "is archived", so '
  + '"ACME is archived." -> ' + belt('ACME is archived.') + ' and the file\'s OWN documented must-never-touch answer '
  + '"test3 is archived. Should I restore it?" -> ' + belt('test3 is archived. Should I restore it?') + ' (inherited, present on 52e830f/9535f0b/fbafded too).');

console.log('\n=== promotion hygiene ===');
const prop = fs.readFileSync('qa/verification/proposed/v18_known_failure_modes_entry_78.md', 'utf8');
const n = (s) => s.replace(/\r\n/g, '\n').trim();
say(n(seg).startsWith(n(prop)) ? 'TRUE' : 'FALSE', '#78 entry promoted verbatim, no preamble leaked',
  'ledger section starts with the proposed file byte-for-byte; no CANDIDATE COMMIT / ARTIFACT BRANCH / dispatch text present: '
  + !/CANDIDATE COMMIT|ARTIFACT BRANCH|EXECUTION-MODE PREFLIGHT|You are VERIFIER/.test(seg));
say(camp.index_sha256 === 'd050db20004e3ed33c6aac59774256053a6b8b549f109f7435bc305b9b3fec30' ? 'TRUE' : 'FALSE',
  'CURRENT_CAMPAIGN.json names the SHA correctly', 'index_sha256=' + camp.index_sha256);
say(camp.closure_commit === 'be9d94f' ? 'PARTLY' : 'FALSE', 'CURRENT_CAMPAIGN.json names the candidate',
  'it names closure_commit=be9d94f; the CANDIDATE COMMIT actually under test is d34af157 (the rotation commit on top, index.ts byte-identical — verified: git diff be9d94f d34af15 -- index.ts is empty). base_commit was ABSENT until this verifier added it.');

console.log('\n=== the residual is DOCUMENTED, but the way it is pinned inverts the ratchet ===');
const block = run18.slice(run18.indexOf('const D131_IRREDUCIBLE'), run18.indexOf('for (const [tok, fab, real]'));
const pinned = (block.match(/^\s*\['(?:and|but|dash)',/gm) || []).length;
say('NOTE', 'the 9 residual fabrications are pinned as CONTRACT cases requiring readsAsCompletion(fab) === false',
  pinned + ' such cases. A CONTRACT pin means the next generation that CATCHES one of these fabrications FAILS the suite: '
  + 'the residual is not merely disclosed, it is now enforced. s1c demonstrates exactly that — 5 of them fail under a strictly better rule.');
