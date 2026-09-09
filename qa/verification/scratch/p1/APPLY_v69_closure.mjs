// CLOSURE OF VERIFIER #69 (campaign #129) — V69-D1 .. V69-D5.
//
// THE RULING THIS IMPLEMENTS. The head-region integer must not move again: at 0 modifiers (#68) the object
// test was position-free and destroyed 8/8 truthful reads; at 1 modifier (#69) it both blinds real requests
// and still destroys 70/70. A modifier COUNT cannot separate "an object that identifies a thing" from "a
// topic headline", because neither phenomenon is about distance. What separates them is already in the file:
//
//   a REQUEST names its target   "archive old duplicate work order WO-1"   entity noun THEN a target token
//   a HEADLINE does not          "Post mortem report for the project"      entity noun ENDS the phrase
//
// So the entity noun is recognised WHEREVER IT SITS (restoring what #67 proved necessary) but only when a
// TARGET TOKEN follows it. The existing head-region alternative is untouched, so this edit is ADDITIVE to
// what already refers: it can only close the fabrication direction, and the read pins are re-measured to
// prove it did not open the other.
//
// Every regex below is built with String.raw so that no escape is lost through a shell, a heredoc or a
// template literal — the campaign has now lost `\b` and `\s` that way twice in one session (ledger #150).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(what + ': anchor ' + (n === 0 ? 'missing' : 'not unique (' + n + ')'));
  s = s.replace(from, to);
  edits.push(what);
}
// DOUBLE-escaped on purpose. These are written INTO a JavaScript single-quoted string in index.ts, where a
// lone \b is the BACKSPACE character and a lone \s is just the letter s — a regex built from either matches
// nothing anyone intended, silently. The RegExp must receive the two characters backslash-b, so the string
// literal in index.ts must carry two backslashes, so this source must carry four.
const B = String.raw`\\b`, S = String.raw`\\s`, W = String.raw`\\w`, SS = String.raw`\\S`;

// ── V69-D2 + V69-D1(1) — the boundary, derived rather than counted ─────────────────────────────
sub('IMPERATIVE_OBJECT: an entity noun anywhere refers WHEN A TARGET TOKEN FOLLOWS IT',
  `          + '|^(?:\\\\S+\\\\s+){0,1}(?:' + ENTITY_NOUN_ALTERNATION + ')\\\\b'`,
  `          + '|^(?:\\\\S+\\\\s+){0,1}(?:' + ENTITY_NOUN_ALTERNATION + ')\\\\b'
          // THE BOUNDARY, DERIVED RATHER THAN COUNTED (verifier #69, V69-D1/D2). The head region was
          // one modifier deep, so "archive old duplicate work order WO-1" - two modifiers, no determiner -
          // matched no alternative at all and the request was invisible to every tier: 5 of 5 fabrications
          // shipped. Widening the count to two would have re-opened the direction #68 closed, and both
          // settings of that integer have now shipped a P1, so the count-based alternative is REPLACED here,
          // not supplemented: leaving it in place kept "Post mortem report for the project" referring
          // ("post" is a canonical verb, "mortem report" is one modifier and an entity noun) and the receipt
          // went on deleting 70 of 70 truthful answers. The two phenomena differ by something that is not
          // distance:
          //
          //   REQUEST   "... work order WO-1" / "... business unit Beta"   the entity noun NAMES a target
          //   HEADLINE  "Post mortem report for the project"              the entity noun ENDS the phrase
          //
          // A target token is a quoted name, or a token opening with a capital or a digit, and it must
          // FOLLOW the entity noun - which is where a name sits and where a prepositional phrase's object
          // never does. Capitalisation ANYWHERE was tried before and rejected (it made "Close call on the
          // Beta deal today" refer); this is narrower and directional.
          + '|(?:^|\\\\s)(?:' + ENTITY_NOUN_ALTERNATION + ')\\\\s+(?:["\\u201c\\u2018]|[A-Z0-9][\\\\w-]*)'`);

// ── V69-D1(2) — an adjectival participle is not a finite verb ──────────────────────────────────
sub('an adjectival participle before an entity noun is normalised away with it',
  `        const objectRefers = (rest: string) => IMPERATIVE_OBJECT.test(rest)
          && !STATEMENT_FINITE_VERB.test(rest.replace(ENTITY_NOUN_PHRASE, ' '));`,
  `        // objectRefers already blanks entity-noun phrases before looking for a finite verb, so "archive
        // expired work order WO-1" became "expired   WO-1" and "expired" read as a finite verb about the
        // world: the request became a statement and 2 of 2 fabrications shipped (verifier #69, V69-D1). A
        // past participle sitting DIRECTLY BEFORE an entity noun is an adjective modifying it, not the
        // sentence's verb, so it is normalised away WITH the noun it modifies - the same idea as the line
        // below it, one word earlier.
        // WHAT MAY FOLLOW AN IMPERATIVE VERB - one definition, three consumers (MUTATION_IMPERATIVE_VERB,
        // headHasObject, and the object slice). Declared HERE, above every use: these are block-scoped
        // consts, and a const read before its declaration is a TDZ crash rather than a fallback - the same
        // V54-P0-TDZ regression this file already carries a comment about, and it fired on the first run of
        // this very edit when the declaration sat with the verb regex instead.
        const AFTER_IMPERATIVE_VERB = '[${S}:;,\\\\u2014\\\\u2013\\\\u2026-]+';
        const AFTER_IMPERATIVE_VERB_LEAD = new RegExp('^' + AFTER_IMPERATIVE_VERB);
        const ADJECTIVAL_PARTICIPLE_BEFORE_ENTITY = new RegExp(
          '${B}(?:expired|created|changed|closed|started|ended|moved|failed|passed|blocked|returned'
          + '|increased|decreased|continued|stopped|remained|occurred|appeared|agreed|called|flooded'
          + '|dropped|archived|restored|deleted|removed|renamed|assigned|approved|rejected|completed'
          + '|cancelled|canceled)${S}+(?=(?:' + ENTITY_NOUN_ALTERNATION + ')${B})', 'gi');
        // THE HEADLINE SHAPE, in the verifier's own words: "a bare noun phrase whose only extra structure is
        // a prepositional phrase (... for the department, ... on the Beta deal) with no target token at all".
        // Removing the head-region alternative instead of vetoing this shape was measured and was WRONG in
        // the other direction - it also blinded a plain "archive work order", and v61's A1 contract caught
        // it (80 turns). So the head region stays, and the headline is subtracted: an entity noun that
        // TERMINATES a prepositional phrase, with no target token after it, names a topic rather than a
        // target. A trailing time word ("today", "this quarter") is still part of the headline.
        const HEADLINE_OBJECT = new RegExp(
          '${B}(?:for|on|in|about|of|with|regarding|re)${S}+(?:the${S}+|a${S}+|an${S}+|this${S}+|our${S}+|my${S}+)?'
          + '(?:${W}+${S}+){0,2}(?:' + ENTITY_NOUN_ALTERNATION + ')${S}*'
          + '(?:${S}+(?:today|tomorrow|yesterday|now|this${S}+(?:week|month|quarter|year)|last${S}+(?:week|month|quarter|year)))?${S}*$', 'i');
        const objectRefers = (rest: string) => IMPERATIVE_OBJECT.test(rest)
          && !HEADLINE_OBJECT.test(rest)
          && !STATEMENT_FINITE_VERB.test(rest.replace(ADJECTIVAL_PARTICIPLE_BEFORE_ENTITY, ' ').replace(ENTITY_NOUN_PHRASE, ' '));`);

// ── V69-D1(3) — punctuation directly after the verb ────────────────────────────────────────────
sub('MUTATION_IMPERATIVE_VERB: a verb may be followed by punctuation, not only whitespace',
  `        const MUTATION_IMPERATIVE_VERB = new RegExp('^\\\\s*(?:' + MUTATION_VERB_ALTERNATION + ')\\\\b\\\\s+\\\\S', 'i');`,
  `        // "Archive: the work order WO-1" / "archive - the purchase approval A-1". Every alternative here
        // assumed WHITESPACE after the verb, so a colon, semicolon, comma or dash removed the request from
        // the intent tier entirely - 4 of 4 fabrications shipped (verifier #69, V69-D1). Punctuation after
        // an imperative verb is ordinary founder typing, not a different kind of sentence. ONE definition
        // of "what may follow an imperative verb", used by both consumers.
        const MUTATION_IMPERATIVE_VERB = new RegExp('^\\\\s*(?:' + MUTATION_VERB_ALTERNATION + ')\\\\b' + AFTER_IMPERATIVE_VERB + '\\\\S', 'i');`);
sub('headHasObject: the object begins after any punctuation the verb is followed by',
  `          return objectRefers(clause.slice(m[0].length).trim());`,
  `          return objectRefers(clause.slice(m[0].length).replace(AFTER_IMPERATIVE_VERB_LEAD, '').trim());`);

// ── V69-D1(4) — negation in non-leading position ───────────────────────────────────────────────
sub('a negated mutation request is request-side intent wherever the negation sits',
  `        const alwaysHeadRe = alwaysEnglishBase`,
  `        // NEGATION IS NOT ONLY A PREFIX (verifier #69, V69-D1). NEGATED_IMPERATIVE_HEAD is ^-anchored, so
        // "make sure you do not archive ACME" carried a lexicon verb ("make") at the head with a
        // non-referring object, and the negated request was invisible: 25 of 30 shipped - the founder was
        // told the very thing they forbade had been done. That is the worst form of this defect.
        //
        // The fix is not another position rule. A negation followed by a canonical mutation verb IS a
        // mutation request - one whose only correct answer is "no change" - so it is request-side evidence
        // in its own right, wherever it sits, and whether or not an object follows ("ACME: do not restore").
        // The verb list is the ONE canonical definition, never a copy of it.
        const NEGATED_MUTATION_REQUEST = new RegExp(
          '${B}(?:do${S}*n[o\\u2019\\']?t|never|no need to|must not|should not|will not|cannot|ca${W}*n[o\\u2019\\']?t)'
          + '[${S},]+(?:${W}+[${S},]+){0,3}(?:' + MUTATION_VERB_ALTERNATION + ')${B}', 'i');
        const negatedMutationVerb = NEGATED_MUTATION_REQUEST.test(commandText)
          ? ((commandText.match(new RegExp('(?:' + MUTATION_VERB_ALTERNATION + ')${B}', 'i')) || [])[0] || null)
          : null;
        const alwaysHeadRe = alwaysEnglishBase`);
sub('the lexicon tier sees the negated request',
  `        const lexiconAlways = (alwaysInImperativePosition ? alwaysEnglishBase : null) || alwaysOther || alwaysCyrillic || (mnLoanVerb ? mnLoanVerb.toLowerCase() : null) || null;`,
  `        const lexiconAlways = (alwaysInImperativePosition ? alwaysEnglishBase : null) || alwaysOther || alwaysCyrillic || (mnLoanVerb ? mnLoanVerb.toLowerCase() : null) || (negatedMutationVerb ? negatedMutationVerb.toLowerCase() : null) || null;`);

// ── V69-D3/D4 — two reachable copies of the verb list ──────────────────────────────────────────
sub('lastClauseIsMutation derives from the canonical verb list instead of 30 stems',
  `        const lastClauseIsMutation = commandClausesForRead.length > 1 && /^\\s*(?:archiv|un-?archiv|restor|reactivat|delet|remov|renam|retitl|reassign|unassign|approv|reject|declin|activat|deactivat|invit|revok|enabl|disabl|promot|demot|hir|fir|terminat|dismiss|onboard|merg|split|reopen|bring)/i.test(lastClauseForRead) && !/\\?/.test(lastClauseForRead);`,
  `        // Was 30 hand-written stems, containment 0.90 in the canonical 120 - the ninth re-spelling, and a
        // reachable one: "list the companies and suspend ACME" put 90 of 120 canonical verbs out of reach
        // (verifier #69, V69-D3). Derived from the one definition now, matched by STEM so the inflected
        // spellings the old list carried ("archiv", "renam") still hit.
        const MUTATION_VERB_STEM = new RegExp('^\\\\s*(?:' + MUTATION_VERB_ALTERNATION.split('|').map((v) => v.replace(/e$/, '')).join('|') + '|bring)', 'i');
        const lastClauseIsMutation = commandClausesForRead.length > 1 && MUTATION_VERB_STEM.test(lastClauseForRead) && !/\\?/.test(lastClauseForRead);`);
sub('MN_LOAN_VERB derives from the canonical verb list instead of 39 of them',
  `        const MN_LOAN_VERB = /(?:^|\\P{L})(archive|unarchive|restore|reactivate|delete|remove|rename|reassign|unassign|approve|reject|activate|deactivate|invite|revoke|enable|disable|promote|demote|onboard|merge|update|close|complete|cancel|assign|move|transfer|end|create|add|set|import|export|publish|share|upload|send|schedule)\\s+хий\\S*/iu;`,
  `        // 39 verbs, containment 1.00 - 81 canonical verbs were missing, and Mongolian is the ONE language
        // where the founder writes "<English verb> хий", so 80 of 120 verbs shipped a fabrication
        // (verifier #69, V69-D4). One definition, one more consumer.
        const MN_LOAN_VERB = new RegExp('(?:^|\\\\P{L})(' + MUTATION_VERB_ALTERNATION + ')${S}+хий${SS}*', 'iu');`);

// ── V69-D6 — the receipt's own negation test, and the object-verb tier ─────────────────────────
sub('negatedRequest derives its verb list from the one definition',
  `(?:\\w+\\s+){0,3}(?:archive|restore|delete|remove|rename|assign|approve|reject|unarchive|reactivate|end|close|cancel)/i.test(commandText);`,
  `(?:\\w+\\s+){0,3}(?:' + MUTATION_VERB_ALTERNATION + ')${B}', 'i').test(commandText);`);
sub('negatedRequest becomes a constructed RegExp so it can read the canonical list',
  `          const negatedRequest = /^\\s*(?:do not|don['’]t|never|please do not|please don['’]t|stop|without|instead of|rather than|not|no)\\b/i.test(commandText) || /\\b(?:do not|don['’]t|never|not to|no longer|instead of|rather than|should not|shouldn['’]t|must not|mustn['’]t|won['’]t|will not|cannot|can['’]t)\\s+`,
  `          // 13 of the 120 canonical verbs, containment 1.00 - the receipt's REASON test and the intent
          // tier disagreed about what counts as a mutation, so a negated request naming any of the other
          // 107 verbs got the wrong reason sentence (verifier #69, V69-D6). One definition, one more
          // consumer; the NEGATION vocabulary stays its own idea, because that is a different concept.
          const negatedRequest = /^\\s*(?:do not|don['’]t|never|please do not|please don['’]t|stop|without|instead of|rather than|not|no)\\b/i.test(commandText) || new RegExp('${B}(?:do not|don[\\'\\u2019]t|never|not to|no longer|instead of|rather than|should not|shouldn[\\'\\u2019]t|must not|mustn[\\'\\u2019]t|won[\\'\\u2019]t|will not|cannot|can[\\'\\u2019]t)${S}+`);

// ── V69-D5 — the receipt sentence must be English ──────────────────────────────────────────────
sub('the entity singulariser stops producing non-words',
  `            : commandEntityNoun ? commandEntityNoun.replace(/ies$/, 'y').replace(/([^s])s$/, '$1')`,
  `            // "status" -> "statu" and "access" -> "acces": a bare /s$/ strip is wrong for -us, -ss and -is
            // nouns, and it reached the founder as "I could not resolve which statu you meant" (verifier
            // #69, V69-D5). Machine text in a founder-facing sentence is a real defect, not a cosmetic one.
            : commandEntityNoun ? (SINGULAR_IS_ITSELF.test(commandEntityNoun)
                ? commandEntityNoun
                : commandEntityNoun.replace(/ies$/, 'y').replace(/([^s])s$/, '$1'))`);
sub('SINGULAR_IS_ITSELF is declared above the singulariser that reads it',
  `          const commandEntityNoun = ((commandText.match(`,
  `          // The inverse of the irregular plural table further down: a noun that is ALREADY singular and
          // merely ENDS in an s-cluster must never be "singularised" again. Declared here rather than beside
          // that table because the consumer is above it, and a const read before its declaration is a TDZ
          // crash rather than a fallback (V54-P0-TDZ; it fired here on the first run of this edit).
          const SINGULAR_IS_ITSELF = /(?:us|ss|is)$/i;
          const commandEntityNoun = ((commandText.match(`);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
console.log('sha256 ' + createHash('sha256').update(readFileSync(p)).digest('hex'));
