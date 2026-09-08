// V67-D1, last piece — a word inside an entity's NAME is not a verb in that sentence.
//
// With IMPERATIVE_OBJECT reading the one definition, `work order WO-1` is recognised as referring. It was
// still refused, because `objectRefers` also requires `!STATEMENT_FINITE_VERB.test(rest)` and that pattern
// lists `works?` — so the "work" of "work order" read as a finite verb and vetoed the whole object. Same
// for "order" in other phrasings.
//
// The precise repair is NOT to weaken the statement test: "the company works fine" must stay a statement,
// and V61-D7 pins exactly that. What is wrong is testing the entity's NAME for verbs. So the recognised
// entity nouns are removed before the statement shape is judged:
//
//   "work order WO-1"        -> " WO-1"            no finite verb -> refers        (V67-D1 fixed)
//   "the company works fine" -> "the  works fine"  finite verb    -> still a statement (V61-D7 held)
//
// One definition, one more consumer — not a second list of exceptions.
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  if (s.split(from).length - 1 !== 1) throw new Error(what + ': anchor missing or not unique');
  s = s.replace(from, () => to);   // function form: a `$'` in `to` would splice the rest of the file in
  edits.push(what);
}

sub('objectRefers does not read an entity name as a sentence',
  `        const objectRefers = (rest: string) => IMPERATIVE_OBJECT.test(rest) && !STATEMENT_FINITE_VERB.test(rest);`,
  `        // Words that are part of an ENTITY NAME are not verbs in that sentence. STATEMENT_FINITE_VERB
        // lists \`works?\`, so "work order WO-1" was read as a statement and the whole object refused, which
        // is the last piece of verifier #67's P1. The statement shape is judged on what is left AFTER the
        // recognised entity nouns are removed, so "the company works fine" is still a statement (V61-D7)
        // while "work order WO-1" is an object. One definition, one more consumer.
        const ENTITY_NOUN_PHRASE = new RegExp('\\\\b(?:' + ENTITY_NOUN_ALTERNATION + ')\\\\b', 'gi');
        const objectRefers = (rest: string) => IMPERATIVE_OBJECT.test(rest)
          && !STATEMENT_FINITE_VERB.test(rest.replace(ENTITY_NOUN_PHRASE, ' '));`);

// The receipt's entity name: the product has no bare "order" entity — a work order is what "order" refers
// to here — so naming it "work order" is what was actually searched, not an invented specificity.
sub('a bare "order" names the work order it refers to',
  `            : /^(compan|business|organi)/.test(commandEntityNoun) ? 'company'`,
  `            : /^(compan|business|organi)/.test(commandEntityNoun) ? 'company'
            // There is no bare "order" entity in this product; "archive order WO-1" is about a work order,
            // and the receipt should name the type that was actually searched.
            : /^(work order|purchase order|order)$/.test(commandEntityNoun) ? 'work order'`);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
const decl = out.indexOf('const ENTITY_NOUN_ALTERNATION');
if (out.indexOf('const ENTITY_NOUN_PHRASE') < decl) throw new Error('ENTITY_NOUN_PHRASE reads the alternation before it is declared');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
