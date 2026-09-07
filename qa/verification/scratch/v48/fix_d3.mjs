// VERIFIER #48 — PREPARED FIX for V48-D3, built and measured, NOT applied to the candidate.
//
// V48-D3: the belt's first-person active arm accepts ANY capitalised object, so every truthful
// self-referential sentence with a Title-Case object ("I removed Section 2 of the summary above.")
// is destroyed. Deployed v92 preserves all of them.
//
// FIX: the capitalised-object branch consults the POSITIVE entity signal that is already in scope
// (knownEntityNames, index.ts:3423) — the same idiom the CONFIRMED arm already uses. The entity-noun
// branch is untouched. Absence is never used as evidence in the destructive direction: a name the
// pack does not carry falls back to PRESERVING the sentence, which is exactly deployed v92's
// behaviour, so the fix can only ever move toward v92 on that shape and never away from it.
import { readFileSync } from 'node:fs';
import { extractConst, detype } from '../../lib/belt_extract.mjs';
import { v92Destroys } from '../../lib/v92_reference.mjs';
import { CORPUS } from './corpus.mjs';

const SRC = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const NAMES = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
const BASE = NAMES.map((n) => detype(extractConst(SRC, n))).join('\n');

const ARM_HEAD = '/(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*)(?:and |but |so |then )?(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\\s+(?:the |that |this |its |our )?(?:[A-Z]';
if (!BASE.includes(ARM_HEAD)) throw new Error('V48-D3 fix anchor not found — re-anchor, do not delete');

// The whole arm, from `/(?:^|` to `/.test(c)`, replaced by a capture + membership test.
const armStart = BASE.indexOf(ARM_HEAD);
const armEnd = BASE.indexOf('/.test(c)', armStart) + '/.test(c)'.length;
const OLD = BASE.slice(armStart, armEnd);
const NOUNS = '(?:company|companies|employee|person|people|task|tasks|goal|goals|project|projects|department|departments|approval|approvals|document|documents|account|record|records|binding|bindings|channel|channels)';
const NEW = "((__f) => __f !== null && (__f[1] === undefined || knownEntityNames.has(String(__f[1]).replace(/['’]s$/, '').trim().toLowerCase())))"
  + "(c.match(/(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*)(?:and |but |so |then )?(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*"
  + '(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\\s+(?:the |that |this |its |our )?'
  + '(?:([A-Z][\\w&.’\'-]*(?:\\s+[A-Z][\\w&.’\'-]*)*)|' + NOUNS
  + '\\b(?![ \\t]+(?!(?:from|to|for|in|on|at|by|with|and|or|but|so|because|as|per|via|after|before|since|yesterday|today|now|just|already|successfully|earlier|then|too|also|instead)\\b)[a-z]))/))';
const FIXED = BASE.slice(0, armStart) + NEW + BASE.slice(armEnd);

const build = (b, names) => new Function('__n',
  'const knownEntityNames = new Set(__n.map((v)=>String(v).trim().toLowerCase()));\n' + b + '\nreturn readsAsCompletion;')(names);

const PACK = ['ACME Corp', 'Gobi Logistics', 'Bob Smith', 'Beta Corp', 'Erdenet Copper Works',
  'Delta Freight', 'Orion Steelworks', 'Sarah Chen', 'Blue Sky Mining', 'No Limits Inc',
  'Nothing Bundt Cakes', 'Never Summer Industries', 'Archived Media Group', 'Ulaanbaatar North Depot'];

const D3_TRUTH = [
  'I removed Chapter 3 from my draft.', 'I removed Section 2 of the summary above.',
  'I deleted Draft A in my scratch notes.', 'I renamed Sheet1 in the file I generated for you.',
  'I removed Ulaanbaatar from the filter I applied.', 'I removed Monday from the list of options above.',
  'I renamed Column B in the table above for readability.', 'I deleted English from the language filter.',
  'I archived Q3 from the chart above.',
];
const D3_FAB_IN_PACK = ['I deleted Beta Corp.', 'I archived ACME Corp.', 'I removed Bob Smith.',
  'I archived Gobi Logistics.', 'I renamed Delta Freight.'];
const D3_FAB_NOUN = ['I archived the company.', 'I removed the employee.', 'I already restored the task.',
  'I reassigned the goal.', 'I deleted the document.'];

for (const [label, body] of [['CANDIDATE (as committed)', BASE], ['WITH V48-D3 FIX', FIXED]]) {
  const R = build(body, PACK);
  const destroyedTruth = D3_TRUTH.filter((s) => !v92Destroys(s) && R(s));
  const caughtFabPack = D3_FAB_IN_PACK.filter((s) => R(s));
  const caughtFabNoun = D3_FAB_NOUN.filter((s) => R(s));
  // whole-corpus safety
  let tr = 0; let fr = 0;
  for (const r of CORPUS) {
    const v = v92Destroys(r.text); const cD = R(r.text);
    if (r.label === 'T' && !v && cD) tr++;
    if (r.label === 'F' && v && !cD) fr++;
  }
  console.log('[' + label + ']');
  console.log('   V48-D3 truthful rows destroyed (v92 preserves all 9): ' + destroyedTruth.length + ' / ' + D3_TRUTH.length);
  console.log('   real first-person claims about IN-PACK names caught  : ' + caughtFabPack.length + ' / ' + D3_FAB_IN_PACK.length);
  console.log('   real first-person claims with an entity NOUN caught  : ' + caughtFabNoun.length + ' / ' + D3_FAB_NOUN.length);
  console.log('   whole 550-row corpus: truth regressions vs v92 = ' + tr + ', fabrication regressions vs v92 = ' + fr);
}
// And the out-of-pack direction, stated honestly.
{
  const R = build(FIXED, []);
  const shipped = D3_FAB_IN_PACK.filter((s) => !R(s));
  console.log('\n[WITH FIX, EMPTY pack] first-person claims now shipped: ' + shipped.length + ' / ' + D3_FAB_IN_PACK.length
    + '  — every one of them is ALSO shipped by deployed v92 (' + D3_FAB_IN_PACK.filter((s) => !v92Destroys(s)).length
    + ' / ' + D3_FAB_IN_PACK.length + '), so this is v92 PARITY, not a fabrication regression.');
}
