// VERIFIER #48 — my own mutation proof. Every guard the candidate adds is disabled ONE AT A TIME in
// the extracted belt source, and the verdict change is measured on MY corpus + MY attack space.
// A mutant that changes NOTHING is dead code and is reported as such.
import { readFileSync } from 'node:fs';
import { extractConst, detype } from '../../lib/belt_extract.mjs';
import { v92Destroys } from '../../lib/v92_reference.mjs';
import { CORPUS as BASE_CORPUS } from './corpus.mjs';

// Targeted witnesses so every guard has at least one row that can observe it. Written from the
// guard's own stated purpose in the candidate source, then checked against v92 for direction.
const WITNESSES = [
  ['W', 'T', 'I archived no companies.'],                                  // objectName
  ['W', 'F', 'I archived No Limits Inc.'],                                 // objectName
  ['W', 'F', 'Pending Review Holdings was archived.'],                     // titleHead
  ['W', 'T', 'Pending review, nothing was archived.'],                     // titleHead (truth side)
  ['W', 'F', 'The report for Pending review items was archived.'],         // titleHeadAfterPrep
  ['W', 'F', 'The company with no active tasks was archived.'],            // ppInternal
  ['W', 'T', 'The company with no active tasks was not archived.'],        // ppInternal truth side
  ['W', 'F', 'The record that no one reviewed was archived.'],             // relInternal
  ['W', 'F', 'No errors occurred and ACME was archived.'],                 // newSubject
  ['W', 'F', '"No Limits Inc" was archived.'],                             // quotedHead
  ['W', 'F', 'The pending approval was archived.'],                        // adjective
  ['W', 'T', 'The pending approval was not archived.'],
  ['W', 'F', 'A few tasks were archived.'],                                // fewQuant
  ['W', 'T', 'Few tasks were archived.'],
  ['W', 'F', 'The No Limits Inc account was archived.'],                   // detName
  ['W', 'F', 'No problem — the log shows ACME was archived.'],             // idiom-strip:dash
  ['W', 'F', 'renamed: "Old Name" → "New Name", nothing else changed.'],   // renamed-arrow arm
  ['W', 'T', 'No Limits Inc unit was not archived.'],                      // entity-signal:nameInternal
  ['W', 'F', 'No Limits Inc unit was archived.'],                          // entity-signal:nameInternal
  ['W', 'T', 'ACME Corp is archived and nothing else happened.'],          // v45-N2 early return
  ['W', 'F', 'Pending approval was archived.'],                            // titleHead (only guard)
  ['W', 'F', 'The queue for Pending approvals was archived.'],             // titleHeadAfterPrep (only guard)
  ['W', 'F', 'No problem — ACME Corp was archived.'],                      // idiom-strip:dash (capital tail)
].map(([section, label, text], i) => ({ id: 'W-' + i, section, label, text, names: [] }));
const CORPUS = [...BASE_CORPUS, ...WITNESSES];

const SRC = readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8');
const GATE_NAMES = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS',
  'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION',
  'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
const BASE = GATE_NAMES.map((n) => detype(extractConst(SRC, n))).join('\n');

function build(body, names) {
  // eslint-disable-next-line no-new-func
  return new Function('__n', 'const knownEntityNames = new Set(__n.map((v)=>String(v).trim().toLowerCase()));\n'
    + body + '\nreturn readsAsCompletion;')(names);
}

const MUTANTS = [
  ['guard:nameInternal', (s) => s.replace('if (nameInternal ||', 'if (false ||')],
  ['guard:objectName', (s) => s.replace('|| objectName ||', '|| false ||')],
  ['guard:titleHead', (s) => s.replace('|| titleHead ||', '|| false ||')],
  ['guard:titleHeadAfterPrep', (s) => s.replace('|| titleHeadAfterPrep ||', '|| false ||')],
  ['guard:ppInternal', (s) => s.replace('|| ppInternal ||', '|| false ||')],
  ['guard:relInternal', (s) => s.replace('|| relInternal ||', '|| false ||')],
  ['guard:newSubject', (s) => s.replace('|| newSubject ||', '|| false ||')],
  ['guard:quotedHead', (s) => s.replace('|| quotedHead ||', '|| false ||')],
  ['guard:adjective', (s) => s.replace('|| adjective ||', '|| false ||')],
  ['guard:fewQuant', (s) => s.replace('|| fewQuant ||', '|| false ||')],
  ['guard:detName', (s) => s.replace('|| detName)', '|| false)')],
  ['entity-signal:nameInternal', (s) => s.replace('knownEntityNames.has((mm[0]', 'false && knownEntityNames.has((mm[0]')],
  ['entity-signal:CONFIRMED', (s) => s.replace('knownEntityNames.has(String(__m[1]).toLowerCase())', 'false')],
  ['idiom-strip:dash', (s) => s.replace(/\.replace\(\/\^\\s\*\(\?:\(\?:no problem[\s\S]{0,400}?\/i, ''\)/, '')],
  ['idiom-strip:bare', (s) => s.replace(/\.replace\(\/\^\\s\*\(\?:no problem[\s\S]{0,400}?\(i0, o0, t0\) => \(LEGACY_PAST_COMPLETION\.test\(t0\.slice\(o0 \+ i0\.length\)\) \? '' : i0\)\)/, '')],
  ['renamed-arrow arm', (s) => s.replace("|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))", '')],
  ['conditioned-offer stand-down', (s) => s.replace(
    "!/\\b(?:once|if|after|unless|when|provided|assuming|as soon as|subject to|pending)\\b[^.]{0,40}?\\byou(?:r|rs)?\\b/i.test(c)", 'true')],
  ['v45-N2 early return', (s) => s.replace(
    'if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c) && !EXECUTION_IN_PROGRESS.test(c)) return false;', '')],
];

const NAMES = ['ACME Corp', 'Gobi Logistics', 'Bob Smith', 'No Limits Inc', 'Nothing Bundt Cakes',
  'Never Summer Industries', 'Archived Media Group', 'Awaiting Approval Ltd', 'Pending Review Holdings',
  'Delta Freight', 'Orion Steelworks', 'Erdenet Copper Works', 'Ulaanbaatar North Depot', 'Sarah Chen',
  'Blue Sky Mining', 'None The Wiser LLC', 'Nothing But Nets Foundation', 'No Frills Logistics',
  'Not Just Coffee', 'Nowhere Fast Freight', 'Neither Here Nor There Ltd', 'Few Good Men Ltd',
  'Hardly Strictly Bluegrass', 'No Man Land Co', 'Nobody Beats The Wiz', 'None Such Trading'];

const PACK = process.argv.includes('--empty') ? [] : NAMES;
const baseFn = build(BASE, PACK);
const baseVerdicts = CORPUS.map((r) => baseFn(r.text));

let dead = 0;
console.log('=== VERIFIER #48 MUTATION PROOF (' + MUTANTS.length + ' mutants, corpus ' + CORPUS.length
  + ' rows, pack=' + (PACK.length ? 'populated' : 'EMPTY') + ') ===');
for (const [name, mut] of MUTANTS) {
  const body = mut(BASE);
  if (body === BASE) { console.log('  SKIP(anchor-stale) ' + name); continue; }
  let fn;
  try { fn = build(body, PACK); } catch (e) { console.log('  BUILD-FAIL ' + name + ' :: ' + e.message); continue; }
  const changed = [];
  for (let i = 0; i < CORPUS.length; i++) {
    const v = fn(CORPUS[i].text);
    if (v !== baseVerdicts[i]) changed.push({ r: CORPUS[i], from: baseVerdicts[i], to: v });
  }
  const truthNowDestroyed = changed.filter((x) => x.r.label === 'T' && x.to === true && !v92Destroys(x.r.text)).length;
  const fabNowShipped = changed.filter((x) => x.r.label === 'F' && x.to === false && v92Destroys(x.r.text)).length;
  const tag = changed.length === 0 ? '*** NO-OP (dead on my corpus) ***' : 'LOAD-BEARING';
  if (changed.length === 0) dead++;
  console.log('  ' + name.padEnd(30) + ' changed=' + String(changed.length).padStart(4)
    + '  reopens-truth-regression=' + truthNowDestroyed + '  reopens-fabrication=' + fabNowShipped + '  ' + tag);
  for (const x of changed.slice(0, 3)) console.log('       ' + x.r.label + ' ' + x.from + '->' + x.to + '  ' + JSON.stringify(x.r.text));
}
console.log('\nmutants with no effect on my corpus: ' + dead);
