// VERIFIER #17 / SCENARIO 0 — attack the clean-selection rule in BOTH directions.
// (a) mis-bind hunting: exclusions/redirections built ONLY from SELECTION_FILLER + label.
// (b) over-refusal hunting: a realistic corpus of legitimate naming replies.
// Three-way: candidate 9535f0b vs 52e830f vs d724d8c.
import { readSrc, buildMatcher, buildMatcherAny, opt } from './v17b_lib.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC_NOW = readSrc();
const SRC_52 = readFileSync('qa/verification/scratch/v17b_idx_52e830f.ts', 'utf8');
const SRC_D7 = readFileSync('qa/verification/scratch/v17b_idx_d724d8c.ts', 'utf8');
const NOW = buildMatcher(SRC_NOW);
const V52 = buildMatcherAny(SRC_52);
const VD7 = buildMatcherAny(SRC_D7);

// Enumerate the filler set straight from the product source (no hand copy).
const fillerSrc = SRC_NOW.slice(SRC_NOW.indexOf('const SELECTION_FILLER'), SRC_NOW.indexOf('const cleanSelection'));
const FILLER = fillerSrc.match(/'([^']*)'/g).map((s) => s.slice(1, -1)).join('').split(' ').filter(Boolean);
console.log('SELECTION_FILLER enumerated from source: ' + FILLER.length + ' words');
console.log(FILLER.join(' '));
console.log('');

const TWO = [opt('c1', 'Acme'), opt('c2', 'Beta Corp')];
const HOLD = [opt('c1', 'Acme'), opt('c2', 'Acme Holdings')];
const bid = (fn, reply, options) => { const r = fn(reply, options); return r ? r.id : null; };

const rows = [];
const probe = (group, reply, options, note = '') => {
  rows.push({ group, reply, note,
    now: bid(NOW, reply, options), v52: bid(V52, reply, options), d7: bid(VD7, reply, options) });
};

// ---------------------------------------------------------------------------------
// (a) MIS-BIND HUNT — every exclusion/redirection I can build from filler + the label
// ---------------------------------------------------------------------------------
// a1. single filler word placed before/after the label, exhaustively.
for (const w of FILLER) {
  probe('a1.fillerPrefix', `${w} acme`, TWO);
  probe('a1.fillerSuffix', `acme ${w}`, TWO);
}
// a2. two-filler frames that read as an EXCLUSION or a REDIRECTION in English.
for (const r of ['reject acme', 'reject acme please', 'rename acme', 'update acme', 'assign acme',
  'reassign acme', 'approve acme', 'deactivate acme', 'activate acme', 'restore acme',
  'delete acme', 'remove acme', 'end acme', 'close acme', 'archive acme',
  'acme reject', 'reject the acme one', 'i reject acme']) {
  probe('a2.crossVerbRedirect', r, TWO);
}
// a3. entity-noun TARGET FLIP: the reply names a DIFFERENT thing belonging to the option.
for (const r of ['archive acme tasks', 'acme tasks', 'acme people', 'acme employees',
  'archive acme employees', 'end acme people', 'acme goals', 'acme project',
  'acme department', 'delete acme tasks', 'the acme department', 'acme person']) {
  probe('a3.entityNounTargetFlip', r, TWO);
}
// a4. an option whose LABEL is itself made of filler words.
const FILLERNAMED = [opt('c1', 'The One'), opt('c2', 'Acme')];
const GOAHEAD = [opt('c1', 'Go Ahead Ltd'), opt('c2', 'Acme')];
for (const r of ['the one', 'that one', 'this one', 'yes the one', 'ok', 'the one please']) probe('a4.fillerLabel.TheOne', r, FILLERNAMED);
for (const r of ['go ahead', 'go ahead ltd', 'yes go ahead', 'go ahead please']) probe('a4.fillerLabel.GoAhead', r, GOAHEAD);
// a5. unicode / case / digit variants of filler.
for (const r of ['YES ACME', 'Yes, Archive ACME', 'ACME', 'acme option 1', 'option 1 acme',
  'acme number 1', 'acme 1', '1 acme', 'acme #1', 'acme (option 1)',
  'yeѕ acme', 'ｙes acme', 'acme, thats the one', "acme, that's the one", "it's acme",
  'acme — yes', 'acme…', 'acme!!!', '  acme  ', 'ACME yes']) probe('a5.variants', r, TWO);
// a6. idiomatic exclusions built as close to filler-only as English allows.
for (const r of ['the one that is not acme', 'anything but acme', 'not acme', 'no acme',
  'acme is not it', 'acme, no', 'acme? no', 'exclude acme', 'skip acme', 'leave acme',
  'keep acme', 'spare acme', 'all but acme', 'everything except acme',
  'other than acme', 'instead of acme', 'rather than acme', 'acme is wrong',
  'wrong, acme', 'definitely not acme', 'acme is the one i do not want']) probe('a6.exclusions', r, TWO);
// a7. two-option mentions / self-correction.
for (const r of ['acme? no, the holdings one', 'acme holdings not acme', 'acme not acme holdings',
  'acme holdings', 'the holdings one', 'acme holdings please', 'archive acme holdings']) probe('a7.overlap', r, HOLD);

// ---------------------------------------------------------------------------------
// (b) OVER-REFUSAL — a realistic corpus of legitimate NAMING replies (>= 30)
// ---------------------------------------------------------------------------------
const LEGIT = [
  'acme', 'Acme', 'ACME', 'acme.', 'acme!', '"acme"', 'the acme one', 'acme one',
  'yes acme', 'yes, acme', 'yes, archive acme', 'archive acme', 'archive acme please',
  'ok acme', 'okay, acme', 'sure, acme', 'please archive acme', 'acme please',
  'acme, that one', 'that one, acme', 'acme is the one', 'i mean acme', 'i meant acme',
  'we mean acme', 'i want acme', 'select acme', 'pick acme', 'choose acme', 'use acme',
  'go ahead with acme', 'proceed with acme', 'do acme', 'confirm acme', 'confirmed, acme',
  'correct, acme', 'right, acme', 'exactly, acme', 'thanks, acme', 'yep acme', 'yup, acme',
  'acme, thanks', 'acme thank you', 'the acme company', 'the company acme', 'acme company',
  'acme, the company', 'archive the acme company', 'yes archive the acme company please',
  // realistic but slightly richer phrasings a founder actually types
  "acme, that's it", "it's acme", "acme's the one", 'acme (the first one)', 'acme - yes',
  'acme — the first', 'first one, acme', 'option 1, acme', 'acme #1', 'the 1st one, acme',
  'yes please archive acme now', 'acme now', 'acme today', 'acme asap', 'just acme',
  'only acme', 'acme for sure', 'definitely acme', 'obviously acme', 'acme obviously',
  'lets do acme', "let's do acme", 'go with acme', 'acme works', 'acme is fine',
  'yes to acme', 'acme yes', 'acme ok', 'acme, go ahead', 'go ahead, acme',
];
for (const r of LEGIT) probe('b.legitimate', r, TWO);

// ---------------------------------------------------------------------------------
writeFileSync('qa/verification/scratch/v17b_s0_result.json', JSON.stringify(rows, null, 1));

const g = (name) => rows.filter((r) => r.group.startsWith(name));
const fmt = (r) => `${JSON.stringify(r.reply).padEnd(38)} now=${String(r.now).padEnd(5)} 52e830f=${String(r.v52).padEnd(5)} d724d8c=${String(r.d7)}`;

console.log('=== (a) MIS-BINDS: replies that BIND under the candidate but read as exclusion/redirection ===');
const misbind = rows.filter((r) => (r.group.startsWith('a2') || r.group.startsWith('a3') || r.group.startsWith('a6')) && r.now !== null);
for (const r of misbind) console.log('  MISBIND ' + fmt(r));
console.log('  count = ' + misbind.length + ' (of ' + rows.filter((r) => r.group.startsWith('a2') || r.group.startsWith('a3') || r.group.startsWith('a6')).length + ')');

console.log('\n=== (a) any reply that binds NOW but dead-ended on 52e830f (would be a LOOSENING) ===');
const loosened = rows.filter((r) => r.now !== null && r.v52 === null);
console.log(loosened.length ? loosened.map(fmt).join('\n') : '  NONE — the new rule is strictly no looser than 52e830f on this corpus');

console.log('\n=== (a) binds NOW but dead-ended on d724d8c ===');
const loosened7 = rows.filter((r) => r.now !== null && r.d7 === null);
console.log(loosened7.length ? loosened7.map(fmt).join('\n') : '  NONE');

console.log('\n=== a1 single-filler frames that BIND (the full allowlist surface) ===');
const a1bind = g('a1').filter((r) => r.now !== null);
console.log('  bound: ' + a1bind.length + ' / ' + g('a1').length);
console.log('  filler words that bind as a PREFIX verb: ' + g('a1.fillerPrefix').filter((r) => r.now).map((r) => r.reply.split(' ')[0]).join(' '));

console.log('\n=== (b) OVER-REFUSAL on legitimate naming replies ===');
const legit = g('b.legitimate');
const nowBind = legit.filter((r) => r.now === 'c1').length;
const d7Bind = legit.filter((r) => r.d7 === 'c1').length;
const v52Bind = legit.filter((r) => r.v52 === 'c1').length;
console.log(`  corpus size ${legit.length}: candidate binds ${nowBind}, 52e830f binds ${v52Bind}, d724d8c binds ${d7Bind}`);
const lost = legit.filter((r) => r.now === null && r.d7 === 'c1');
console.log('  LOST vs d724d8c (' + lost.length + '):');
for (const r of lost) console.log('    ' + fmt(r));
const lost52 = legit.filter((r) => r.now === null && r.v52 === 'c1');
console.log('  LOST vs 52e830f (' + lost52.length + '):');
for (const r of lost52) console.log('    ' + fmt(r));

console.log('\n=== a4/a5/a7 detail ===');
for (const r of [...g('a4'), ...g('a5'), ...g('a7')]) console.log('  ' + r.group.padEnd(24) + fmt(r));
