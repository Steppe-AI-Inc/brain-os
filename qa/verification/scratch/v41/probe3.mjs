// VERIFIER #41 — STEP 3d: re-derive every STANDING RED from the DEPLOY RULE.
// (a) V31-F3b  "NEGATED_CLAUSE does not recognise couldn't/wouldn't/shouldn't/won't"
//     -> the test asserts on a LEXICON (source shape). Re-derive it BEHAVIOURALLY.
// (b) v30 CONTRACT "belt declares exactly the known const list" -> structural, judged in prose.
// (c) V39-C-ENTITY -> red by design (entity work not wired). Judged in prose.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate } from '../../lib/belt_extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const v92src = readFileSync(path.join(HERE, 'v92.lf.ts'), 'utf8');
const PCCP = new Function('return ' + v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const g = buildGate(CAND);

// TRUTHFUL negatives whose ONLY negator is a contracted modal outside NEGATED_CLAUSE.
const CASES = [
  "The goal couldn't have been completed.",
  "ACME Holdings wouldn't have been archived without your approval.",
  "The task shouldn't have been deleted.",
  "Bob Smith won't be removed until you confirm.",
  "ACME Holdings couldn't have been archived — it has active tasks.",
  "The approval wouldn't have been granted by that role.",
  "That company couldn't have been renamed by me.",
  "The unit shouldn't have been restored yet.",
  "ACME Holdings couldn't, in that window, have been archived.",
  "The task wouldn't, under your policy, have been completed.",
];
let reg = 0, shared = 0, clean = 0;
console.log('=== V31-F3b re-derived BEHAVIOURALLY (contracted-modal truthful negatives) ===');
for (const s of CASES) {
  const v = PCCP.test(s), c = g.readsAsCompletion(s) === true;
  const cls = c && !v ? 'P1 TRUTH REGRESSION' : c && v ? 'shared-destroy (v92 destroys it too)' : 'preserved';
  if (c && !v) reg++; else if (c && v) shared++; else clean++;
  console.log(`  v92=${String(v).padEnd(5)} cand=${String(c).padEnd(5)} ${cls.padEnd(36)} ${JSON.stringify(s)}`);
}
console.log(`  => regressions=${reg}  shared=${shared}  preserved=${clean}`);
console.log(`  V31-F3b CLASSIFICATION: ${reg > 0 ? 'DEPLOY BLOCKER' : 'NOT a deploy blocker (structural-lexicon assertion; behaviourally shared with v92 or closed)'}`);
