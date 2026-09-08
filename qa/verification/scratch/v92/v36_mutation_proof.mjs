#!/usr/bin/env node
// MUTATION PROOF for fix39: the AUXGAP context strips three non-negating spans - a quoted span, a
// leading reassurance idiom, a negator-bearing prepositional phrase - before the negator test.
// Reverting the strips must re-open the three fabrications; the two truths must stay preserved either
// way (the sentence-bounded context that protects them is proven by v35's D189_D191 mutation).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';
const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const SRC = process.env.SEM_INDEX_SRC || __ROOT + 'supabase/functions/sem-ai-command/index.ts';
const DIR = __ROOT + 'qa/verification/scratch/v92/mut36';
mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');
const STRIPS = '.replace(/["“‘\'][^"”’\']*["”’\']/g, \' \').replace(/^\\s*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*(?:[—–-]\\s*|\\s+))+/i, \'\').replace(/\\b(?:with|without|despite|after|before|since|given|amid|notwithstanding|barring|excepting|besides|regarding|about|following)\\s+(?:no|nothing|none|not a single)\\s+[^,—–\\x3b]*/gi, \' \')';
const M = { id: 'fix39.auxGapContextStripsNonNegatingSpans',
  fabs: ['The task "No smoking" was, as requested, archived.', 'No problem — ACME Holdings was, as requested, archived.', 'The company with no active tasks was, as requested, archived.'],
  truths: ['With no confirmation from you the goal was not, as requested, archived.', 'None of the records from the last quarter indicate the company had been, at any point, archived.'] };
const live = buildGate(SRC);
const fires = (g, s) => g.readsAsCompletion(String(s)) === true;
const mutated = BASE.replace(STRIPS, '');
if (mutated === BASE) { console.log('NOT PROVEN  ' + M.id + ': strip span not found in source'); process.exit(1); }
const p = DIR + '/fix39.ts'; writeFileSync(p, mutated);
const g = buildGate(p);
const liveOk = M.fabs.every((s) => fires(live, s)) && M.truths.every((s) => !fires(live, s));
const reopened = M.fabs.filter((s) => !fires(g, s)).length;
const truthsIntact = M.truths.filter((s) => !fires(g, s)).length;
const ok = liveOk && reopened === M.fabs.length && truthsIntact === M.truths.length;
console.log((ok ? 'PROVEN     ' : 'NOT PROVEN ') + M.id + ': live ' + (liveOk ? 'ok' : 'WRONG') + '; reverting re-opens ' + reopened + '/' + M.fabs.length + ' fabrications; truths intact under revert ' + truthsIntact + '/' + M.truths.length);
console.log('MUTATION PROOF: ' + (ok ? 1 : 0) + '/1 proven load-bearing');
process.exit(ok ? 0 : 1);
