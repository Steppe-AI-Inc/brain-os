// VERIFIER #41 — INDEPENDENT MUTATION PROOF of the five run31 fixes + verifier #40's arms.
// A fix is LOAD-BEARING iff reverting it changes a verdict on MY OWN corpus in the
// direction the fix claims to buy. A revert that changes nothing is a NO-OP guard (the
// vacuous-guard class this ledger has recorded repeatedly).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate } from '../../lib/belt_extract.mjs';
import { allTruthful, allFabrications } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const v92src = readFileSync(path.join(HERE, 'v92.lf.ts'), 'utf8');
const PCCP = new Function('return ' + v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();

const base = buildGate(CAND);
const T = allTruthful(), F = allFabrications();

function subst(find, repl) {
  return (code) => {
    if (!code.includes(find)) throw new Error('MUTATION ANCHOR MISSING (harness is lying about the product): ' + find.slice(0, 90));
    return code.split(find).join(repl);
  };
}

const MUTS = [
  ['M1 nameInternal (run31 fix 1)',
    subst('const nameInternal = capLead && subjectRun && !/\\bnor\\b/.test(c);', 'const nameInternal = false;')],
  ['M2 titleHead (run31 fix 2)',
    subst("const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0])", 'const titleHead = false && /^(?:Pending|Awaiting)$/.test(mm[0])')],
  ['M3 ppInternal (run31 fix 3)',
    subst("const ppInternal = /\\b(?:with|without|since|despite|after|before|besides|regarding|about|following|given|amid|notwithstanding|barring|excepting)\\s+$/i.test(c.slice(0, mm.index))",
      'const ppInternal = false && /x/.test(c.slice(0, mm.index))')],
  ['M4 widened reassurance-idiom strip (run31 fix 4)',
    subst('no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely',
      'zzzz_never_matches_zzzz')],
  ['M5 R-AUXGAP whole-summary arm (run31 fix 5)',
    subst('(\\\\b(?:was|were|has been|have been)\\\\b)', '(\\\\bZZZNOMATCHZZZ\\\\b)')],
  ['M6 #40 gerund STRUCTURAL guard (finite-verb arm)',
    subst('&& !/^\\s*(?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|processing|executing|working)\\b',
      '&& !/^ZZZNOMATCHZZZ\\b')],
  ['M7 #40 CONFIRMED determiner-vs-adverbial arm',
    subst('(?:no longer|not|never)\\b', '(?:ZZZNOMATCHZZZ)\\b')],
  ['M8 #40 first-person attributive-noun exclusion',
    subst('(?![ \\t]+(?!(?:from|to|for|in|on|at|by|with|and|or|but|so|because|as|per|via|after|before|since|yesterday|today|now|just|already|successfully|earlier|then|too|also|instead)\\b)[a-z])',
      '')],
  ['M9 arm-1 contracted-modal exclusion',
    subst("|\\b(?:could|would|should|wo)n['’]?t\\b", '|\\bZZZNOMATCHZZZ\\b')],
];

function verdictSet(gate) {
  return {
    t: T.map(([, s]) => gate.readsAsCompletion(s) === true),
    f: F.map(([, s]) => gate.readsAsCompletion(s) === true),
  };
}
const baseV = verdictSet(base);
let noops = 0;
for (const [name, mut] of MUTS) {
  let gate;
  try { gate = buildGate(CAND, mut); } catch (e) { console.log(`${name}\n   BUILD FAILED: ${e.message}`); continue; }
  const v = verdictSet(gate);
  const truthNewlyDestroyed = [], truthNewlySaved = [], fabNewlyMissed = [], fabNewlyCaught = [];
  T.forEach(([tag, s], i) => {
    if (v.t[i] && !baseV.t[i]) truthNewlyDestroyed.push([tag, s]);
    if (!v.t[i] && baseV.t[i]) truthNewlySaved.push([tag, s]);
  });
  F.forEach(([tag, s], i) => {
    if (!v.f[i] && baseV.f[i]) fabNewlyMissed.push([tag, s]);
    if (v.f[i] && !baseV.f[i]) fabNewlyCaught.push([tag, s]);
  });
  const delta = truthNewlyDestroyed.length + truthNewlySaved.length + fabNewlyMissed.length + fabNewlyCaught.length;
  const loadBearing = delta > 0;
  if (!loadBearing) noops++;
  console.log(`${name}\n   revert delta on MY corpus: ${loadBearing ? 'LOAD-BEARING' : '*** NO-OP (nothing on my corpus observes this fix) ***'}`
    + `  truth+destroyed=${truthNewlyDestroyed.length} truth+saved=${truthNewlySaved.length} fab+missed=${fabNewlyMissed.length} fab+caught=${fabNewlyCaught.length}`);
  for (const [tag, s] of [...truthNewlyDestroyed.slice(0, 3), ...fabNewlyMissed.slice(0, 3), ...fabNewlyCaught.slice(0, 3), ...truthNewlySaved.slice(0, 3)]) {
    console.log(`      e.g. [${tag}] ${JSON.stringify(s)}`);
  }
}
console.log(`\nMUTATIONS: ${MUTS.length} applied, ${noops} NO-OP on my corpus`);
