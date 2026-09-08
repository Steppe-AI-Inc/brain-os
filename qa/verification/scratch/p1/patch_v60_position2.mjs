// Two defects in the position gate itself, both caught by the existing corpora.
//
// A. "the store will reopen Monday" still read as a mutation request. Not the tier I gated: the
//    PROPER-NOUN OBJECT tier matched "reopen Monday", because a capitalised weekday looks exactly like a
//    capitalised entity name. A date is never the object of a lifecycle verb — it is when, not what.
//
// B. "do not archive Alpha" lost its intent when the "verb anywhere" tier became position-gated, because
//    the head token is "do". A negated request IS a request: the founder asked about archiving Alpha, and
//    the product owes a "you asked me not to" receipt, never a fabricated "Alpha archived." (v59 D2d/C5d).
//    Negation belongs in the head prefix, not outside the lexicon.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- A: a date is not an entity object.
must(`        const lexiconObject = (MUTATION_VERB_WITH_OBJECT.test(commandText) || MUTATION_VERB_PROPER_OBJECT.test(commandText))`,
`        // A capitalised weekday or month is a TIME, not an entity: "the store will reopen Monday" is a
        // statement about the world, and the proper-noun object tier used to read it as a lifecycle request.
        const TEMPORAL_PROPER_OBJECT = /\\b(?:reopen|open|clos(?:e|ing)|end(?:ing)?|start(?:ing)?|resum(?:e|ing)|paus(?:e|ing)|finish(?:ing)?)\\s+(?:on\\s+|next\\s+|this\\s+|last\\s+)?(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day|\\b(?:reopen|open|end(?:ing)?|start(?:ing)?|resum(?:e|ing))\\s+(?:on\\s+|in\\s+|next\\s+|this\\s+|last\\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\\b/;
        const properObjectIsTemporal = MUTATION_VERB_PROPER_OBJECT.test(commandText)
          && !MUTATION_VERB_WITH_OBJECT.test(commandText)
          && TEMPORAL_PROPER_OBJECT.test(commandText);
        const lexiconObject = ((MUTATION_VERB_WITH_OBJECT.test(commandText) || MUTATION_VERB_PROPER_OBJECT.test(commandText)) && !properObjectIsTemporal)`, 'temporal object');

// ---- B: a negated imperative is still an imperative.
must(`        const alwaysHeadRe = alwaysEnglishBase`,
`        // "do not archive Alpha" / "don't archive Alpha" / "never archive Alpha": the verb still sits in
        // imperative position, behind a negation. The request carried intent — the executor must fail
        // closed and the receipt must say the founder asked for it NOT to happen (v59 D2d/C5d).
        const NEGATED_IMPERATIVE_HEAD = /^\\s*(?:(?:do\\s*n[o']?t|don[’']t|do not|never|no need to|no longer|please do not|please don[’']t|stop)\\s+)+/i;
        const commandForHead = commandForRead.replace(NEGATED_IMPERATIVE_HEAD, '');
        const lastClauseForHead = lastClauseForRead.replace(REQUEST_FRAME_PREFIX, '').replace(NEGATED_IMPERATIVE_HEAD, '');
        const alwaysHeadRe = alwaysEnglishBase`, 'negated head');

must(`        const alwaysInImperativePosition = !!alwaysHeadRe
          && (alwaysHeadRe.test(commandForRead)
            || (commandClausesForRead.length > 1 && alwaysHeadRe.test(lastClauseForRead.replace(REQUEST_FRAME_PREFIX, ''))));`,
`        const alwaysInImperativePosition = !!alwaysHeadRe
          && (alwaysHeadRe.test(commandForHead)
            || (commandClausesForRead.length > 1 && alwaysHeadRe.test(lastClauseForHead)));`, 'always head uses negation-stripped');

must(`        const imperativeSource = MUTATION_IMPERATIVE_HEAD.test(commandForRead)
          ? commandForRead
          : (commandClausesForRead.length > 1 && MUTATION_IMPERATIVE_HEAD.test(lastClauseForRead) ? lastClauseForRead : null);`,
`        const imperativeSource = MUTATION_IMPERATIVE_HEAD.test(commandForHead)
          ? commandForHead
          : (commandClausesForRead.length > 1 && MUTATION_IMPERATIVE_HEAD.test(lastClauseForHead) ? lastClauseForHead : null);`, 'imperative source uses negation-stripped');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
