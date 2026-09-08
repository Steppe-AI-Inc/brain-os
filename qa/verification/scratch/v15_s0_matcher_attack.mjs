// VERIFIER #15 — SCENARIO 0 + 5: attack matchDisambiguationOption for WRONG-ENTITY BINDS.
// A dead end (null) is acceptable. Selecting an entity the founder did not name — or
// explicitly EXCLUDED — is a P1, because the call site arms
// fields[archiveCompanyIds] = [matchedOption.id] with no LLM in the loop.

import { readSource, buildMatcher } from './v15_extract.mjs';

const { text } = readSource();
const match = buildMatcher(text);

const C = (label, id, actionType = 'archive') => ({ label, id, entityType: 'company', actionType });

let pass = 0, fail = 0;
const findings = [];

// expect: an id string, or null
function probe(name, command, options, expect, note = '') {
  const got = match(command, options);
  const gotId = got ? got.id : null;
  const ok = gotId === expect;
  if (ok) pass++;
  else { fail++; findings.push({ name, command, expect, gotId, note }); }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      reply=${JSON.stringify(command)}\n      expected=${expect}  got=${gotId}${note ? '\n      ' + note : ''}`);
  return gotId;
}

console.log('=== A. baseline / D106 regression cases ===');
probe('A1 single exact', 'acme', [C('Acme', 'a'), C('Beta', 'b')], 'a');
probe('A2 D106 canonical mis-bind case', 'smiths bakery',
  [C('Smith', 'smith'), C("Smith's Bakery", 'bakery')], 'bakery',
  'the ORIGINAL D106 P1: must NOT return smith');
probe('A3 D106 exact-name case', "archive smith's bakery",
  [C('Smith', 'smith'), C("Smith's Bakery", 'bakery')], 'bakery');
probe('A4 multi-mention dead-ends', 'archive acme, leave acme holdings alone',
  [C('Acme', 'a'), C('Acme Holdings', 'ah')], null,
  'reply names both -> must dead-end');
probe('A5 D102 apostrophe pair, plain typed', 'archive bobs co',
  [C("Bob's Co", 'apos'), C('Bobs Co', 'plain')], 'plain');
probe('A6 D102 apostrophe pair, apostrophe typed', "archive bob's co",
  [C("Bob's Co", 'apos'), C('Bobs Co', 'plain')], 'apos');

console.log('\n=== B. three or more options, nested / overlapping labels ===');
probe('B1 nested, longest wins', 'archive acme holdings',
  [C('Acme', 'a'), C('Acme Holdings', 'ah'), C('Beta', 'b')], 'ah');
probe('B2 nested, short typed', 'archive acme',
  [C('Acme', 'a'), C('Acme Holdings', 'ah'), C('Beta', 'b')], 'a');
probe('B3 triple nest', 'acme holdings group ltd',
  [C('Acme', 'a'), C('Acme Holdings', 'ah'), C('Acme Holdings Group Ltd', 'ahgl')], 'ahgl');
probe('B4 overlapping (not nested) labels', 'archive acme holdings group',
  [C('Acme Holdings', 'ah'), C('Holdings Group', 'hg')], 'hg',
  'OVERLAP: reply is genuinely ambiguous; longest-wins picks Holdings Group');
probe('B5 two of three mentioned', 'archive acme and beta',
  [C('Acme', 'a'), C('Beta', 'b'), C('Gamma', 'g')], null);
probe('B6 all three mentioned', 'acme beta gamma',
  [C('Acme', 'a'), C('Beta', 'b'), C('Gamma', 'g')], null);

console.log('\n=== C. case / whitespace / unicode ===');
probe('C1 case-insensitive', 'ACME HOLDINGS',
  [C('acme holdings', 'ah'), C('Beta', 'b')], 'ah');
probe('C2 collapsed whitespace in reply', 'archive   acme    holdings',
  [C('Acme Holdings', 'ah')], 'ah');
probe('C3 collapsed whitespace in label', 'archive acme holdings',
  [C('Acme   Holdings', 'ah')], 'ah');
probe('C4 curly apostrophe in label, ascii typed', "archive bob's co",
  [C('Bob’s Co', 'curly')], 'curly');
probe('C5 cyrillic confusable label vs ascii reply', 'archive acme',
  [C('Асme', 'cyr'), C('Beta', 'b')], null,
  'confusable must DEAD-END, never bind');
probe('C6 cyrillic reply vs ascii label', 'archive Асme',
  [C('Acme', 'a'), C('Beta', 'b')], null);
probe('C7 nbsp in label', 'archive acme holdings',
  [C('Acme Holdings', 'nb')], 'nb', 'NBSP is \\s in JS, so it normalises');

console.log('\n=== D. option named inside a longer phrase ===');
probe('D1 name inside longer sentence', 'yes please go ahead and archive acme holdings for me',
  [C('Acme Holdings', 'ah'), C('Beta', 'b')], 'ah');
probe('D2 name as substring of an unrelated word', 'archive acmex corp',
  [C('Acme', 'a')], 'a',
  'SUBSTRING-OF-A-WORD: "acmex" contains "acme" — binds on a word this is not');

console.log('\n=== E. NEGATION (the attack the brief demands) ===');
const negOpts3 = [C('Acme', 'a'), C('Acme Holdings', 'ah'), C('Beta', 'b')];
probe('E1 "not acme, the other one"', 'not acme, the other one', negOpts3, null,
  'founder EXCLUDES acme; binding it archives the excluded company');
probe('E2 "anything except acme holdings"', 'anything except acme holdings',
  [C('Acme Holdings', 'ah'), C('Beta', 'b')], null);
probe('E3 "don\'t archive acme"', "don't archive acme",
  [C('Acme', 'a'), C('Beta', 'b')], null);
probe('E4 "no, not beta"', 'no, not beta',
  [C('Acme', 'a'), C('Beta', 'b')], null);
probe('E5 "neither acme nor beta"', 'neither acme nor beta',
  [C('Acme', 'a'), C('Beta', 'b')], null,
  'both named -> dead-ends for the RIGHT reason (multi-mention), not because negation was seen');
probe('E6 negation in the tied raw branch', "not bob's co",
  [C("Bob's Co", 'apos'), C('Bobs Co', 'plain')], null);
probe('E7 "everything but acme"', 'everything but acme',
  [C('Acme', 'a'), C('Beta', 'b')], null);
probe('E8 "acme is wrong, i meant beta"', 'acme is wrong, i meant beta',
  [C('Acme', 'a'), C('Beta', 'b')], null,
  'names both -> dead-ends by the residual guard');

console.log('\n=== F. residual-mention guard evasion attempts ===');
probe('F1 winner removal also removes the loser (nested) — correct bind', 'acme holdings',
  [C('Acme', 'a'), C('Acme Holdings', 'ah')], 'ah');
probe('F2 loser mentioned twice, once inside winner', 'acme, i mean acme holdings',
  [C('Acme', 'a'), C('Acme Holdings', 'ah')], null,
  'residual "acme" survives -> must dead-end');
probe('F3 tie at max length, both raw-present', 'archive acme co and beta co',
  [C('Acme Co', 'ac'), C('Beta Co', 'bc')], null);
probe('F4 tie at max length, only one raw-present', 'archive acme co and beta co',
  [C('Acme Co', 'ac'), C('Beta Co', 'bc'), C('Gamma Co', 'gc')], null);
probe('F5 duplicate distinct entities, identical name', 'archive acme',
  [C('Acme', 'id1'), C('Acme', 'id2')], null,
  'two real companies both called Acme must dead-end, never coin-flip');
probe('F6 same name, one quoted by the F5 formatter', 'archive acme',
  [C('“Acme”', 'quoted'), C('Acme', 'plain')], 'plain',
  'CONTRIVED: quote-only difference resolves via the raw tie-break');
probe('F7 empty label ignored', 'archive acme',
  [C('', 'empty'), C('Acme', 'a')], 'a');
probe('F8 whitespace-only label ignored', 'archive acme',
  [C('   ', 'ws'), C('Acme', 'a')], 'a');
probe('F9 malformed option (no id) ignored', 'archive acme',
  [{ label: 'Acme', entityType: 'company' }, C('Acme Holdings', 'ah')], null,
  'unusable option is filtered, so only Acme Holdings could match — it is not mentioned');

console.log('\n=== G. the residual guard vs a THREE-way partial overlap ===');
probe('G1 winner removal leaves a THIRD option mentioned', 'archive acme holdings and beta',
  [C('Acme', 'a'), C('Acme Holdings', 'ah'), C('Beta', 'b')], null);
probe('G2 winner + shorter non-overlapping loser', 'archive beta then acme holdings',
  [C('Acme Holdings', 'ah'), C('Beta', 'b')], null);

console.log(`\n=== TOTALS: ${pass} pass, ${fail} fail ===`);
if (findings.length) {
  console.log('\n--- DIVERGENCES FROM MY EXPECTATION (each judged in the report) ---');
  for (const f of findings) {
    console.log(`  ${f.name}: reply=${JSON.stringify(f.command)} expected=${f.expect} got=${f.gotId}`);
    if (f.note) console.log(`      ${f.note}`);
  }
}
